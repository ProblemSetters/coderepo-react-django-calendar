from bson import ObjectId

from apps.calendars.models import Calendar
from apps.events.constants import REPEATING_FREQUENCIES
from apps.events.models import Event
from apps.shared.mongo import collection

BUSY_PROJECTION = {
    "title": 1,
    "description": 1,
    "location": 1,
    "organizer": 1,
    "participants": 1,
    "participantIds": 1,
    "attendeeResponses": 1,
    "recurrenceResponseOverrides": 1,
    "recurrence": 1,
    "startAt": 1,
    "endAt": 1,
    "allDay": 1,
    "type": 1,
    "color": 1,
    "calendarId": 1,
}


def in_range(from_moment, to_moment):
    return [
        {"startAt": {"$lt": to_moment}, "endAt": {"$gt": from_moment}},
        {
            "recurrence.frequency": {"$in": REPEATING_FREQUENCIES},
            "startAt": {"$lt": to_moment},
            "$or": [{"recurrence.endType": {"$ne": "until"}}, {"recurrence.until": {"$gte": from_moment}}],
        },
    ]


def find_busy(conditions):
    return list(collection(Event).find(conditions, BUSY_PROJECTION).sort("startAt", 1))


def owner_busy(from_moment, to_moment, profile_id):
    calendar_ids = []

    if profile_id:
        calendar_ids = [
            row["_id"] for row in collection(Calendar).find({"ownerId": ObjectId(profile_id)}, {"_id": 1})
        ]

    conditions = {
        "$and": [{"$or": in_range(from_moment, to_moment)}],
        "type": {"$ne": "workingLocation"},
        "$or": [{"allDay": False}, {"type": "outOfOffice"}],
    }

    if profile_id:
        conditions["calendarId"] = {"$in": calendar_ids}

    return find_busy(conditions)


def participant_busy(participant_ids, from_moment, to_moment):
    owners = [ObjectId(value) for value in participant_ids]
    calendars = list(collection(Calendar).find({"ownerId": {"$in": owners}}, {"_id": 1, "ownerId": 1}))
    calendar_ids = [calendar["_id"] for calendar in calendars]
    owner_by_calendar = {str(calendar["_id"]): calendar["ownerId"] for calendar in calendars}
    conditions = {
        "$and": [
            {"$or": [{"participantIds": {"$in": owners}}, {"calendarId": {"$in": calendar_ids}}]},
            {"$or": [{"allDay": False}, {"type": "outOfOffice"}]},
            {"$or": in_range(from_moment, to_moment)},
        ],
        "type": {"$ne": "workingLocation"},
    }

    return [
        {**event, "ownerId": owner_by_calendar.get(str(event["calendarId"]))} for event in find_busy(conditions)
    ]
