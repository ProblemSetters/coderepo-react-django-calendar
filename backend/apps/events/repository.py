import re

from bson import ObjectId
from pymongo import ReturnDocument

from apps.shared.documents import now_utc
from apps.shared.mongo import collection, to_dict

from .constants import MAX_SEARCH_RESULTS, REPEATING_FREQUENCIES
from .models import AttendeeResponse, Event, Recurrence, RecurrenceResponseOverride

SORT_ORDER = ["start_at", "title"]
RECURRENCE_FIELDS = {
    "frequency": "frequency",
    "interval": "interval",
    "daysOfWeek": "days_of_week",
    "monthlyMode": "monthly_mode",
    "endType": "end_type",
    "count": "count",
    "until": "until",
    "timeZone": "time_zone",
}
EVENT_FIELDS = {
    "calendarId": "calendar_id",
    "title": "title",
    "type": "type",
    "description": "description",
    "location": "location",
    "organizer": "organizer",
    "participants": "participants",
    "participantIds": "participant_ids",
    "startAt": "start_at",
    "endAt": "end_at",
    "allDay": "all_day",
    "color": "color",
}


def contains(value):
    return {"$regex": re.escape(value), "$options": "i"}


def repeating_in_range(from_moment, to_moment):
    return {
        "recurrence.frequency": {"$in": REPEATING_FREQUENCIES},
        "startAt": {"$lt": to_moment},
        "$or": [{"recurrence.endType": {"$ne": "until"}}, {"recurrence.until": {"$gte": from_moment}}],
    }


def overlapping_in_range(from_moment, to_moment):
    return [
        {"startAt": {"$lt": to_moment}, "endAt": {"$gt": from_moment}},
        repeating_in_range(from_moment, to_moment),
    ]


def visibility_scope(calendar_ids, profile_id):
    identifiers = [ObjectId(value) for value in calendar_ids]

    if profile_id:
        branches = [{"calendarId": {"$in": identifiers}}] if identifiers else []

        return {"$or": [*branches, {"participantIds": ObjectId(profile_id)}]}

    return {"calendarId": {"$in": identifiers}} if identifiers else {}


def find_many(conditions, limit=None):
    query = Event.objects(__raw__=conditions).order_by(*SORT_ORDER)

    if limit:
        query = query.limit(limit)

    return list(query.as_pymongo())


def find_in_range(from_moment, to_moment, calendar_ids, profile_id):
    conditions = {
        "$and": [{"$or": overlapping_in_range(from_moment, to_moment)}],
        **visibility_scope(calendar_ids, profile_id),
    }

    return find_many(conditions)


def find_by_id(event_id):
    return Event.objects(__raw__={"_id": ObjectId(event_id)}).as_pymongo().first()


def search_filters(query):
    filters = []

    if query.get("what"):
        filters.append(
            {
                "$or": [
                    {"title": contains(query["what"])},
                    {"description": contains(query["what"])},
                    {"location": contains(query["what"])},
                    {"participants": contains(query["what"])},
                ]
            }
        )

    if query.get("who"):
        filters.append({"$or": [{"organizer": contains(query["who"])}, {"participants": contains(query["who"])}]})

    if query.get("where"):
        filters.append({"location": contains(query["where"])})

    if query.get("exclude"):
        filters.append(
            {
                "$nor": [
                    {"title": contains(query["exclude"])},
                    {"description": contains(query["exclude"])},
                    {"location": contains(query["exclude"])},
                    {"organizer": contains(query["exclude"])},
                    {"participants": contains(query["exclude"])},
                ]
            }
        )

    if query.get("from") or query.get("to"):
        filters.append({"$or": search_range(query)})

    return filters


def search_range(query):
    normal = {}
    recurring = {"recurrence.frequency": {"$in": REPEATING_FREQUENCIES}}

    if query.get("from"):
        normal["endAt"] = {"$gt": query["from"]}
        recurring["$or"] = [{"recurrence.endType": {"$ne": "until"}}, {"recurrence.until": {"$gte": query["from"]}}]

    if query.get("to"):
        normal["startAt"] = {"$lt": query["to"]}
        recurring["startAt"] = {"$lt": query["to"]}

    return [normal, recurring]


def search(query, profile_id):
    filters = search_filters(query)
    conditions = {**visibility_scope(query["calendarIds"], profile_id)}

    if filters:
        conditions["$and"] = filters

    return find_many(conditions, MAX_SEARCH_RESULTS)


def count_by_calendar_id(calendar_id):
    return Event.objects(calendar_id=ObjectId(calendar_id)).count()


def build_recurrence(values):
    return Recurrence(**{RECURRENCE_FIELDS[key]: value for key, value in values.items() if key in RECURRENCE_FIELDS})


def build_attendee_response(values):
    return AttendeeResponse(
        person_id=values["personId"], status=values["status"], responded_at=values.get("respondedAt")
    )


def build_override(values):
    return RecurrenceResponseOverride(
        person_id=values["personId"],
        occurrence_start_at=values["occurrenceStartAt"],
        scope=values["scope"],
        status=values["status"],
        responded_at=values["respondedAt"],
    )


def build_event(values):
    fields = {EVENT_FIELDS[key]: value for key, value in values.items() if key in EVENT_FIELDS}
    fields["attendee_responses"] = [build_attendee_response(row) for row in values.get("attendeeResponses", [])]
    fields["recurrence_response_overrides"] = [build_override(row) for row in values.get("recurrenceResponseOverrides", [])]

    if values.get("recurrence"):
        fields["recurrence"] = build_recurrence(values["recurrence"])

    return Event(**fields)


def create(values):
    return to_dict(build_event(values).save())


def update(event_id, values):
    return collection(Event).find_one_and_update(
        {"_id": ObjectId(event_id)},
        {"$set": {**values, "updatedAt": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )


def add_response(event_id, person_id, status, responded_at):
    return collection(Event).find_one_and_update(
        {"_id": ObjectId(event_id), "participantIds": person_id, "attendeeResponses.personId": {"$ne": person_id}},
        {
            "$push": {"attendeeResponses": {"personId": person_id, "status": status, "respondedAt": responded_at}},
            "$set": {"updatedAt": now_utc()},
        },
        return_document=ReturnDocument.AFTER,
    )


def respond_all(event_id, person_id, status, responded_at):
    merged = {
        "$map": {
            "input": "$attendeeResponses",
            "as": "response",
            "in": {
                "$cond": [
                    {"$eq": ["$$response.personId", person_id]},
                    {"$mergeObjects": ["$$response", {"status": status, "respondedAt": responded_at}]},
                    "$$response",
                ]
            },
        }
    }
    kept = {
        "$filter": {
            "input": "$recurrenceResponseOverrides",
            "as": "override",
            "cond": {"$ne": ["$$override.personId", person_id]},
        }
    }

    return collection(Event).find_one_and_update(
        {"_id": ObjectId(event_id), "participantIds": person_id, "attendeeResponses.personId": person_id},
        [{"$set": {"attendeeResponses": merged, "recurrenceResponseOverrides": kept, "updatedAt": now_utc()}}],
        return_document=ReturnDocument.AFTER,
    )


def respond_occurrence(event_id, person_id, scope, occurrence_start_at, status, responded_at):
    kept = {
        "$filter": {
            "input": "$recurrenceResponseOverrides",
            "as": "override",
            "cond": {
                "$not": [
                    {
                        "$and": [
                            {"$eq": ["$$override.personId", person_id]},
                            {"$eq": ["$$override.scope", scope]},
                            {"$eq": ["$$override.occurrenceStartAt", occurrence_start_at]},
                        ]
                    }
                ]
            },
        }
    }
    added = [
        {
            "personId": person_id,
            "scope": scope,
            "occurrenceStartAt": occurrence_start_at,
            "status": status,
            "respondedAt": responded_at,
        }
    ]

    return collection(Event).find_one_and_update(
        {"_id": ObjectId(event_id), "participantIds": person_id},
        [
            {
                "$set": {
                    "recurrenceResponseOverrides": {"$concatArrays": [kept, added]},
                    "updatedAt": now_utc(),
                }
            }
        ],
        return_document=ReturnDocument.AFTER,
    )


def remove(event_id):
    return collection(Event).find_one_and_delete({"_id": ObjectId(event_id)})
