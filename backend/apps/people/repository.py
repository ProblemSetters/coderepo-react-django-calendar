import re

from bson import ObjectId

from .models import Person

PRIVATE_FIELDS = ["busy_blocks"]


def contains(value):
    return {"$regex": re.escape(value), "$options": "i"}


def search(query, limit, excluded_id):
    conditions = {}

    if query:
        conditions["$or"] = [{"name": contains(query)}, {"email": contains(query)}]

    if excluded_id:
        conditions["_id"] = {"$ne": ObjectId(excluded_id)}

    return list(
        Person.objects(__raw__=conditions).exclude(*PRIVATE_FIELDS).order_by("name", "email").limit(limit).as_pymongo()
    )


def find_by_ids(ids):
    return list(Person.objects(__raw__={"_id": {"$in": [ObjectId(value) for value in ids]}}).as_pymongo())


def find_profile_by_id(profile_id):
    return Person.objects(__raw__={"_id": ObjectId(profile_id), "isProfile": True}).exclude(*PRIVATE_FIELDS).as_pymongo().first()


def list_profiles(ids):
    conditions = {"isProfile": True}

    if ids is not None:
        conditions["_id"] = {"$in": [ObjectId(value) for value in ids]}

    return list(
        Person.objects(__raw__=conditions).exclude(*PRIVATE_FIELDS).order_by("sort_order", "name").as_pymongo()
    )
