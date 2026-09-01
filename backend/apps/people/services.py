from bson import ObjectId

from apps.shared.errors import AppError
from apps.shared.validation import is_object_id

from . import repository


def search(query, limit, excluded_id):
    return repository.search(query, limit, excluded_id)


def list_profiles(ids):
    return repository.list_profiles(ids)


def find_profile_by_id(profile_id):
    return repository.find_profile_by_id(profile_id)


def find_existing(ids):
    return repository.find_by_ids(ids)


def is_identifier(value):
    return isinstance(value, ObjectId) or is_object_id(value)


def get_selected(ids):
    if any(not is_identifier(value) for value in ids):
        raise AppError(400, "INVALID_PERSON_ID", "Every participant identifier must be valid.")

    people = repository.find_by_ids(ids)

    if len(people) != len(ids):
        raise AppError(404, "PEOPLE_NOT_FOUND", "One or more selected people no longer exist.")

    by_id = {str(person["_id"]): person for person in people}

    return [by_id[str(value)] for value in ids]
