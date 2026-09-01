import re

from bson import ObjectId
from pymongo import ReturnDocument

from apps.shared.documents import now_utc
from apps.shared.mongo import collection, to_dict

from .models import Calendar

FIELD_NAMES = {
    "ownerId": "owner_id",
    "name": "name",
    "color": "color",
    "defaultColor": "default_color",
    "description": "description",
    "timeZone": "time_zone",
    "visible": "visible",
    "isPrimary": "is_primary",
}
SORT_ORDER = ["-is_primary", "name"]


def owner_filter(owner_id):
    return {"ownerId": ObjectId(owner_id)} if owner_id else {}


def find_many(conditions):
    return list(Calendar.objects(__raw__=conditions).order_by(*SORT_ORDER).as_pymongo())


def list_calendars(owner_id):
    return find_many(owner_filter(owner_id))


def find_by_id(calendar_id, owner_id=None):
    return Calendar.objects(__raw__={"_id": ObjectId(calendar_id), **owner_filter(owner_id)}).as_pymongo().first()


def find_owned_ids(ids, owner_id):
    conditions = {**owner_filter(owner_id), "_id": {"$in": [ObjectId(value) for value in ids]}}

    return list(collection(Calendar).find(conditions, {"_id": 1}))


def find_owners(ids):
    conditions = {"_id": {"$in": [ObjectId(value) for value in ids]}}

    return list(collection(Calendar).find(conditions, {"_id": 1, "ownerId": 1}))


def find_by_name(name, excluded_id, owner_id):
    conditions = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, **owner_filter(owner_id)}

    if excluded_id:
        conditions["_id"] = {"$ne": ObjectId(excluded_id)}

    return collection(Calendar).find_one(conditions)


def create(values):
    document = Calendar(**{FIELD_NAMES[key]: value for key, value in values.items()})

    return to_dict(document.save())


def update(calendar_id, values):
    return collection(Calendar).find_one_and_update(
        {"_id": ObjectId(calendar_id)},
        {"$set": {**values, "updatedAt": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )


def display_only(calendar_id, owner_id):
    scope = owner_filter(owner_id)
    identifier = ObjectId(calendar_id)
    moment = now_utc()

    collection(Calendar).update_many(
        {**scope, "_id": {"$ne": identifier}, "visible": True},
        {"$set": {"visible": False, "updatedAt": moment}},
    )
    collection(Calendar).update_one({**scope, "_id": identifier}, {"$set": {"visible": True, "updatedAt": moment}})

    return find_many(scope)


def remove(calendar_id, owner_id):
    return collection(Calendar).find_one_and_delete({"_id": ObjectId(calendar_id), **owner_filter(owner_id)})
