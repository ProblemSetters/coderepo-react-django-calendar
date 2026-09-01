from datetime import datetime, timedelta, timezone

from bson import ObjectId

from apps.calendars import repository as calendar_repository
from apps.people import services as person_service
from apps.shared.errors import AppError
from apps.shared.time_zone import local_date_key, to_utc
from apps.shared.validation import is_object_id

from . import repository
from .constants import FALLBACK_AVATAR_COLOR, RESPONSE_STATUSES
from .recurrence import expand_events, is_recurring, recurrence_until_date, response_for_occurrence

EPOCH = datetime(1970, 1, 1)
SEARCH_HORIZON_DAYS = 366
RECURRENCE_FIELDS = ["frequency", "interval", "daysOfWeek", "monthlyMode", "endType", "count", "until", "timeZone"]
EVENT_NOT_FOUND_MESSAGE = "The requested event does not exist."


def ensure_chronology(event):
    if to_utc(event["startAt"]) >= to_utc(event["endAt"]):
        raise AppError(400, "INVALID_EVENT_RANGE", "The event end time must be after its start time.")


def ensure_recurrence(event):
    recurrence = event.get("recurrence")

    if not recurrence or recurrence.get("frequency") == "none" or recurrence.get("endType") != "until":
        return

    if not recurrence.get("until"):
        return

    start_date = local_date_key(to_utc(event["startAt"]), recurrence.get("timeZone") or "UTC")

    if recurrence_until_date(recurrence["until"]) < start_date:
        raise AppError(400, "INVALID_RECURRENCE_END", "The recurrence end date cannot be before the event starts.")


def ensure_identifier(event_id):
    if not is_object_id(event_id):
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)


def ensure_calendar(calendar_id, profile_id):
    if not is_object_id(calendar_id) or not calendar_repository.find_by_id(calendar_id, profile_id):
        raise AppError(422, "INVALID_CALENDAR", "The selected calendar does not exist.")


def recurrence_signature(recurrence):
    values = recurrence or {}
    signature = []

    for field in RECURRENCE_FIELDS:
        if field == "until":
            signature.append(to_utc(values["until"]) if values.get("until") else None)
        elif field == "daysOfWeek":
            signature.append(sorted(values.get("daysOfWeek") or []))
        else:
            signature.append(values.get(field))

    return signature


def same_instant(left, right):
    return to_utc(left) == to_utc(right)


def has_schedule_change(values, existing):
    if "startAt" in values and not same_instant(values["startAt"], existing["startAt"]):
        return True

    if "endAt" in values and not same_instant(values["endAt"], existing["endAt"]):
        return True

    if "allDay" in values and bool(values["allDay"]) != bool(existing.get("allDay")):
        return True

    return "recurrence" in values and recurrence_signature(values["recurrence"]) != recurrence_signature(
        existing.get("recurrence")
    )


def normalized_name(name):
    return str(name).strip().lower()


def public_person(person):
    return {
        "_id": person["_id"],
        "name": person["name"],
        "email": person["email"],
        "avatarColor": person["avatarColor"],
    }


def legacy_guest(event, name, index):
    return {
        "_id": f"saved-participant-{event['_id']}-{index}",
        "name": name,
        "email": "",
        "avatarColor": FALLBACK_AVATAR_COLOR,
        "responseStatus": "needsAction",
    }


def current_response_for(event, profile_id):
    if not profile_id:
        return None

    if not any(str(person_id) == str(profile_id) for person_id in event.get("participantIds", [])):
        return None

    return response_for_occurrence(event, profile_id) or {
        "personId": profile_id,
        "status": "needsAction",
        "respondedAt": None,
    }


def decoration_context(events, profile_id):
    calendar_ids = list({str(event["calendarId"]) for event in events})
    owner_by_calendar = {
        str(calendar["_id"]): str(calendar.get("ownerId") or "")
        for calendar in calendar_repository.find_owners(calendar_ids)
    }
    participant_ids = [str(person_id) for event in events for person_id in event.get("participantIds", [])]
    ids = [value for value in dict.fromkeys([*participant_ids, *owner_by_calendar.values()]) if value]
    people = person_service.find_existing(ids) if ids else []
    people_by_id = {str(person["_id"]): person for person in people}
    owned_ids = None

    if profile_id:
        owned = calendar_repository.find_owned_ids([event["calendarId"] for event in events], profile_id)
        owned_ids = {str(calendar["_id"]) for calendar in owned}

    return owner_by_calendar, people_by_id, owned_ids


def decorate_event(event, profile_id, owner_by_calendar, people_by_id, owned_ids):
    host = people_by_id.get(owner_by_calendar.get(str(event["calendarId"])) or "")
    directory_guests = [
        people_by_id[str(person_id)]
        for person_id in event.get("participantIds", [])
        if str(person_id) in people_by_id
    ]
    directory_names = {normalized_name(person["name"]) for person in directory_guests}
    response_summary = {status: 0 for status in RESPONSE_STATUSES}

    for person in directory_guests:
        response = response_for_occurrence(event, person["_id"])
        response_summary[response["status"] if response else "needsAction"] += 1

    current = current_response_for(event, profile_id)
    legacy_names = [name for name in event.get("participants", []) if normalized_name(name) not in directory_names]
    decorated = {
        **event,
        "editable": str(event["calendarId"]) in owned_ids if owned_ids is not None else True,
        "respondedAt": current.get("respondedAt") if current else None,
        "responseSummary": response_summary,
        "organizerPerson": public_person(host) if host else None,
        "participantPeople": [
            *[
                {
                    **public_person(person),
                    "responseStatus": (response_for_occurrence(event, person["_id"]) or {}).get("status")
                    or "needsAction",
                }
                for person in directory_guests
            ],
            *[legacy_guest(event, name, index) for index, name in enumerate(legacy_names)],
        ],
    }

    if current:
        decorated["responseStatus"] = current["status"]

    return decorated


def decorate_events(events, profile_id):
    if not events:
        return []

    owner_by_calendar, people_by_id, owned_ids = decoration_context(events, profile_id)

    return [decorate_event(event, profile_id, owner_by_calendar, people_by_id, owned_ids) for event in events]


def normalize_participants(values):
    selected = person_service.get_selected(values["participantIds"]) if values.get("participantIds") else []
    selected_names = {normalized_name(person["name"]) for person in selected}
    legacy = [
        str(name).strip()
        for name in values.get("participants") or []
        if str(name).strip() and normalized_name(name) not in selected_names
    ]

    return {**values, "participants": [*[person["name"] for person in selected], *legacy]}


def reconcile_responses(participant_ids, previous_responses=(), reset=False):
    previous_by_id = {str(response["personId"]): response for response in previous_responses}
    responses = []

    for person_id in participant_ids or []:
        previous = previous_by_id.get(str(person_id))

        if not reset and previous:
            responses.append(
                {
                    "personId": person_id,
                    "status": previous["status"],
                    "respondedAt": previous.get("respondedAt"),
                }
            )
        else:
            responses.append({"personId": person_id, "status": "needsAction", "respondedAt": None})

    return responses


def to_identifiers(values):
    return [ObjectId(value) if is_object_id(value) else value for value in values]


def list_events(query, profile_id):
    events = repository.find_in_range(query["from"], query["to"], query["calendarIds"], profile_id)

    return decorate_events(expand_events(events, query["from"], query["to"]), profile_id)


def search(query, profile_id):
    events = repository.search(query, profile_id)

    if query.get("from") or query.get("to"):
        horizon = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=SEARCH_HORIZON_DAYS)
        events = expand_events(events, query.get("from") or EPOCH, query.get("to") or horizon)

    return decorate_events(events, profile_id)


def get_by_id(event_id, profile_id):
    ensure_identifier(event_id)
    event = repository.find_by_id(event_id)

    if event is None or not can_view(event, profile_id):
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)

    return decorate_events([event], profile_id)[0]


def can_view(event, profile_id):
    if not profile_id:
        return True

    if any(str(person_id) == str(profile_id) for person_id in event.get("participantIds", [])):
        return True

    return bool(calendar_repository.find_by_id(event["calendarId"], profile_id))


def create(values, profile):
    ensure_calendar(values["calendarId"], profile["_id"] if profile else None)
    normalized = normalize_participants({**values, **({"organizer": profile["name"]} if profile else {})})
    normalized["participantIds"] = to_identifiers(normalized.get("participantIds") or [])
    normalized["calendarId"] = ObjectId(normalized["calendarId"])
    normalized["attendeeResponses"] = reconcile_responses(normalized["participantIds"])
    ensure_chronology(normalized)
    ensure_recurrence(normalized)

    return decorate_events([repository.create(normalized)], profile["_id"] if profile else None)[0]


def load_editable(event_id, profile_id):
    existing = repository.find_by_id(event_id)

    if existing is None:
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)

    if profile_id and not calendar_repository.find_by_id(existing["calendarId"], profile_id):
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)

    return existing


def update(event_id, values, profile_id):
    ensure_identifier(event_id)
    existing = load_editable(event_id, profile_id)
    merged = {**existing, **values}

    if values.get("calendarId"):
        ensure_calendar(values["calendarId"], profile_id)
        values = {**values, "calendarId": ObjectId(values["calendarId"])}
        merged["calendarId"] = values["calendarId"]

    if "participantIds" in values:
        values = {**values, "participantIds": to_identifiers(values["participantIds"])}
        merged["participantIds"] = values["participantIds"]

    if "participants" in values or "participantIds" in values:
        merged = normalize_participants(merged)
        values = {
            **values,
            "participants": merged["participants"],
            "participantIds": merged.get("participantIds", []),
        }

    schedule_changed = has_schedule_change(values, existing)

    if schedule_changed or "participantIds" in values:
        responses = reconcile_responses(
            merged.get("participantIds"), existing.get("attendeeResponses", []), schedule_changed
        )
        values = {**values, "attendeeResponses": responses}

        if schedule_changed:
            values["recurrenceResponseOverrides"] = []

        merged = {**merged, "attendeeResponses": responses}

    ensure_chronology(merged)
    ensure_recurrence(merged)

    return decorate_events([repository.update(event_id, values)], profile_id)[0]


def ensure_attendee(event, profile_id):
    if not any(str(person_id) == str(profile_id) for person_id in event.get("participantIds", [])):
        raise AppError(403, "NOT_EVENT_ATTENDEE", "Only an invited attendee can respond to this event.")


def resolve_scope(event, options, recurring):
    if not recurring and options.get("scope") and options["scope"] != "all":
        raise AppError(400, "NOT_RECURRING", "Occurrence scope is available only for recurring events.")

    scope = (options.get("scope") or "all") if recurring else "all"

    if scope != "all" and not options.get("occurrenceStartAt"):
        raise AppError(400, "OCCURRENCE_REQUIRED", "Choose which occurrence should receive this response.")

    return scope


def occurrence_window(event, occurrence_start_at):
    duration = to_utc(event["endAt"]) - to_utc(event["startAt"])

    return expand_events(
        [event],
        occurrence_start_at - timedelta(milliseconds=1),
        occurrence_start_at + duration + timedelta(milliseconds=1),
    )


def find_occurrence(event, occurrence_start_at):
    window = occurrence_window(event, occurrence_start_at)

    return next((item for item in window if to_utc(item["occurrenceStartAt"]) == occurrence_start_at), None)


def respond(event_id, status, profile_id, options):
    ensure_identifier(event_id)

    if not profile_id:
        raise AppError(401, "PROFILE_REQUIRED", "Choose a profile before responding to an invitation.")

    existing = repository.find_by_id(event_id)

    if existing is None:
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)

    ensure_attendee(existing, profile_id)

    recurring = is_recurring(existing)
    scope = resolve_scope(existing, options, recurring)
    occurrence_start_at = to_utc(options["occurrenceStartAt"]) if options.get("occurrenceStartAt") else None

    if recurring and occurrence_start_at and find_occurrence(existing, occurrence_start_at) is None:
        raise AppError(400, "INVALID_OCCURRENCE", "The selected occurrence does not belong to this recurring event.")

    updated = save_response(event_id, profile_id, scope, occurrence_start_at, status)

    if updated is None:
        raise AppError(409, "INVITATION_CHANGED", "This invitation changed before your response was saved. Refresh and try again.")

    return decorate_events([to_display_event(updated, recurring, occurrence_start_at)], profile_id)[0]


def save_response(event_id, profile_id, scope, occurrence_start_at, status):
    responded_at = datetime.now(timezone.utc)
    attendee_id = ObjectId(profile_id)

    if scope == "all":
        return repository.respond_all(event_id, attendee_id, status, responded_at) or repository.add_response(
            event_id, attendee_id, status, responded_at
        )

    return repository.respond_occurrence(event_id, attendee_id, scope, occurrence_start_at, status, responded_at)


def to_display_event(event, recurring, occurrence_start_at):
    if not recurring or not occurrence_start_at:
        return event

    window = occurrence_window(event, occurrence_start_at)

    return window[0] if window else event


def remove(event_id, profile_id):
    ensure_identifier(event_id)
    load_editable(event_id, profile_id)

    if repository.remove(event_id) is None:
        raise AppError(404, "EVENT_NOT_FOUND", EVENT_NOT_FOUND_MESSAGE)
