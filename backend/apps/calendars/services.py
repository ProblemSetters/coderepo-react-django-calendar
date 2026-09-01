from mongoengine.errors import NotUniqueError

from apps.events import repository as event_repository
from apps.shared.errors import AppError
from apps.shared.validation import is_object_id

from . import repository

NAME_CONFLICT_MESSAGE = "A calendar with this name already exists."


def ensure_identifier(calendar_id):
    if not is_object_id(calendar_id):
        raise AppError(404, "CALENDAR_NOT_FOUND", "The requested calendar does not exist.")


def ensure_exists(calendar_id, owner_id):
    calendar = repository.find_by_id(calendar_id, owner_id)

    if calendar is None:
        raise AppError(404, "CALENDAR_NOT_FOUND", "The requested calendar does not exist.")

    return calendar


def ensure_unique_name(name, excluded_id, owner_id):
    if name and repository.find_by_name(name, excluded_id, owner_id):
        raise AppError(409, "CALENDAR_NAME_CONFLICT", NAME_CONFLICT_MESSAGE)


def list_calendars(owner_id):
    return repository.list_calendars(owner_id)


def display_only(calendar_id, owner_id):
    ensure_identifier(calendar_id)
    ensure_exists(calendar_id, owner_id)

    return repository.display_only(calendar_id, owner_id)


def create(values, owner_id):
    ensure_unique_name(values["name"], None, owner_id)
    row = {**values, "defaultColor": values["color"], "visible": True, "isPrimary": False}

    if owner_id:
        row["ownerId"] = owner_id

    try:
        return repository.create(row)
    except NotUniqueError:
        raise AppError(409, "CALENDAR_NAME_CONFLICT", NAME_CONFLICT_MESSAGE)


def update(calendar_id, values, owner_id):
    ensure_identifier(calendar_id)
    ensure_unique_name(values.get("name"), calendar_id, owner_id)
    ensure_exists(calendar_id, owner_id)

    calendar = repository.update(calendar_id, values)

    if calendar is None:
        raise AppError(404, "CALENDAR_NOT_FOUND", "The requested calendar does not exist.")

    return calendar


def remove(calendar_id, owner_id):
    ensure_identifier(calendar_id)
    calendar = ensure_exists(calendar_id, owner_id)

    if calendar.get("isPrimary"):
        raise AppError(409, "PRIMARY_CALENDAR", "The primary calendar cannot be deleted.")

    event_count = event_repository.count_by_calendar_id(calendar_id)

    if event_count:
        raise AppError(409, "CALENDAR_NOT_EMPTY", "Move or delete this calendar's events before deleting it.", {"eventCount": event_count})

    repository.remove(calendar_id, owner_id)
