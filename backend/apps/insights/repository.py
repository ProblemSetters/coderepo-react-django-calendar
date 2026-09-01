from bson import ObjectId

from apps.calendars.models import Calendar
from apps.events.constants import REPEATING_FREQUENCIES
from apps.events.models import Event
from apps.shared.mongo import collection


def owned_calendar_ids(calendar_ids, owner_id):
    owned = [str(row["_id"]) for row in collection(Calendar).find({"ownerId": ObjectId(owner_id)}, {"_id": 1})]

    if not calendar_ids:
        return owned

    return [value for value in calendar_ids if str(value) in owned]


def scoped_ids(calendar_ids, owner_id):
    return owned_calendar_ids(calendar_ids, owner_id) if owner_id else calendar_ids


def find_events(from_moment, to_moment, calendar_ids, owner_id):
    scoped = scoped_ids(calendar_ids, owner_id)
    conditions = {
        "$or": [
            {"startAt": {"$lt": to_moment}, "endAt": {"$gt": from_moment}},
            {
                "recurrence.frequency": {"$in": REPEATING_FREQUENCIES},
                "startAt": {"$lt": to_moment},
                "$or": [
                    {"recurrence.endType": {"$ne": "until"}},
                    {"recurrence.until": {"$gte": from_moment}},
                ],
            },
        ]
    }

    if owner_id or scoped:
        conditions["calendarId"] = {"$in": [ObjectId(value) for value in scoped]}

    return list(Event.objects(__raw__=conditions).order_by("start_at").as_pymongo())


def find_calendars(calendar_ids, owner_id):
    scoped = scoped_ids(calendar_ids, owner_id)
    conditions = {"_id": {"$in": [ObjectId(value) for value in scoped]}} if owner_id or scoped else {}

    return list(Calendar.objects(__raw__=conditions).as_pymongo())
