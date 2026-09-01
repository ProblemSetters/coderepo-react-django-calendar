from apps.shared.time_zone import is_time_zone
from apps.shared.validation import (
    COLOR_MESSAGE,
    COLOR_PATTERN,
    Errors,
    expected_message,
    js_type_name,
    read_boolean,
    read_comma_separated_ids,
    read_date,
    read_identifier_list,
    read_number,
    read_option,
    read_string,
    read_string_list,
    too_big_message,
    too_small_message,
)

from .constants import (
    END_TYPES,
    EVENT_TYPES,
    FREQUENCIES,
    MAX_COUNT,
    MAX_DAYS_OF_WEEK,
    MAX_DESCRIPTION_LENGTH,
    MAX_INTERVAL,
    MAX_LOCATION_LENGTH,
    MAX_ORGANIZER_LENGTH,
    MAX_PARTICIPANT_NAME_LENGTH,
    MAX_PARTICIPANTS,
    MAX_RANGE_DAYS,
    MAX_TIME_ZONE_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_WEEKDAY,
    MONTHLY_MODES,
    REPLY_STATUSES,
    RESPONSE_SCOPES,
)

MAX_SEARCH_TEXT_LENGTH = 100
DUPLICATE_PERSON_MESSAGE = "Select each person only once."
RANGE_ORDER_MESSAGE = "to must be after from"
RANGE_LENGTH_MESSAGE = "Event ranges cannot exceed 370 days."
EMPTY_UPDATE_MESSAGE = "Provide at least one field to update."
SECONDS_PER_DAY = 86400
RECURRENCE_MESSAGES = {
    "daysOfWeek": "Choose at least one weekday.",
    "count": "Enter an occurrence count.",
    "until": "Choose an end date.",
    "timeZone": "Choose a valid time zone.",
}


def read_days_of_week(errors, body):
    value = body.get("daysOfWeek")

    if value is None:
        return []

    if not isinstance(value, list):
        errors.add("recurrence", expected_message("array", js_type_name(value)))
        return None

    if len(value) > MAX_DAYS_OF_WEEK:
        errors.add("recurrence", too_big_message("array", MAX_DAYS_OF_WEEK, "items"))
        return None

    for item in value:
        if isinstance(item, bool) or not isinstance(item, int) or item < 0 or item > MAX_WEEKDAY:
            errors.add("recurrence", expected_message("number", js_type_name(item)))
            return None

    return value


def read_recurrence(errors, body):
    value = body.get("recurrence")

    if value is None:
        return None

    if not isinstance(value, dict):
        errors.add("recurrence", expected_message("object", js_type_name(value)))
        return None

    nested = Errors()
    recurrence = {
        "frequency": read_option(nested, value, "frequency", FREQUENCIES),
        "interval": read_number(nested, value, "interval", default=1, minimum=1, maximum=MAX_INTERVAL),
        "daysOfWeek": read_days_of_week(errors, value),
        "monthlyMode": read_option(nested, value, "monthlyMode", MONTHLY_MODES, default="ordinalWeekday"),
        "endType": read_option(nested, value, "endType", END_TYPES, default="never"),
        "count": read_number(nested, value, "count", default=None, minimum=1, maximum=MAX_COUNT) if value.get("count") is not None else None,
        "until": read_date(nested, value, "until", default=None) if value.get("until") is not None else None,
        "timeZone": read_string(nested, value, "timeZone", default="UTC", minimum=1, maximum=MAX_TIME_ZONE_LENGTH),
    }

    for messages in nested.field_errors.values():
        for message in messages:
            errors.add("recurrence", message)

    if errors.any():
        return None

    check_recurrence_rules(errors, recurrence)

    return recurrence


def check_recurrence_rules(errors, recurrence):
    if recurrence["frequency"] == "weekly" and not recurrence["daysOfWeek"]:
        errors.add("recurrence", RECURRENCE_MESSAGES["daysOfWeek"])

    if recurrence["endType"] == "count" and not recurrence["count"]:
        errors.add("recurrence", RECURRENCE_MESSAGES["count"])

    if recurrence["endType"] == "until" and not recurrence["until"]:
        errors.add("recurrence", RECURRENCE_MESSAGES["until"])

    if not is_time_zone(recurrence["timeZone"]):
        errors.add("recurrence", RECURRENCE_MESSAGES["timeZone"])


def read_color(errors, body):
    value = body.get("color")

    if value is None:
        return None

    if not isinstance(value, str) or not COLOR_PATTERN.match(value):
        errors.add("color", COLOR_MESSAGE)
        return None

    return value


def read_participants(errors, body, default):
    names = read_string_list(errors, body, "participants", default=default, maximum=MAX_PARTICIPANTS)

    if not names:
        return names

    trimmed = [name.strip() for name in names]

    for name in trimmed:
        if not name:
            errors.add("participants", too_small_message("string", 1, "characters"))
            return None

        if len(name) > MAX_PARTICIPANT_NAME_LENGTH:
            errors.add("participants", too_big_message("string", MAX_PARTICIPANT_NAME_LENGTH, "characters"))
            return None

    return trimmed


def read_participant_ids(errors, body, default):
    return read_identifier_list(
        errors,
        body,
        "participantIds",
        default=default,
        maximum=MAX_PARTICIPANTS,
        unique_message=DUPLICATE_PERSON_MESSAGE,
    )


def validate_create(body):
    errors = Errors()
    values = {
        "calendarId": read_string(errors, body, "calendarId", minimum=1),
        "title": read_string(errors, body, "title", trim=True, minimum=1, maximum=MAX_TITLE_LENGTH),
        "type": read_option(errors, body, "type", EVENT_TYPES, default="event"),
        "description": read_string(errors, body, "description", default="", maximum=MAX_DESCRIPTION_LENGTH),
        "location": read_string(errors, body, "location", default="", maximum=MAX_LOCATION_LENGTH),
        "organizer": read_string(errors, body, "organizer", default="Calendar owner", trim=True, maximum=MAX_ORGANIZER_LENGTH),
        "participants": read_participants(errors, body, []),
        "participantIds": read_participant_ids(errors, body, []),
        "startAt": read_date(errors, body, "startAt"),
        "endAt": read_date(errors, body, "endAt"),
        "allDay": read_boolean(errors, body, "allDay", default=False),
    }

    if "color" in body:
        values["color"] = read_color(errors, body)

    recurrence = read_recurrence(errors, body)

    if recurrence is not None:
        values["recurrence"] = recurrence

    errors.raise_if_any()

    return values


UPDATE_READERS = {
    "calendarId": lambda errors, body: read_string(errors, body, "calendarId", minimum=1),
    "title": lambda errors, body: read_string(errors, body, "title", trim=True, minimum=1, maximum=MAX_TITLE_LENGTH),
    "type": lambda errors, body: read_option(errors, body, "type", EVENT_TYPES),
    "description": lambda errors, body: read_string(errors, body, "description", maximum=MAX_DESCRIPTION_LENGTH),
    "location": lambda errors, body: read_string(errors, body, "location", maximum=MAX_LOCATION_LENGTH),
    "organizer": lambda errors, body: read_string(errors, body, "organizer", trim=True, maximum=MAX_ORGANIZER_LENGTH),
    "participants": lambda errors, body: read_participants(errors, body, None),
    "participantIds": lambda errors, body: read_participant_ids(errors, body, None),
    "startAt": lambda errors, body: read_date(errors, body, "startAt"),
    "endAt": lambda errors, body: read_date(errors, body, "endAt"),
    "allDay": lambda errors, body: read_boolean(errors, body, "allDay"),
    "color": read_color,
    "recurrence": read_recurrence,
}


def validate_update(body):
    errors = Errors()
    values = {field: reader(errors, body) for field, reader in UPDATE_READERS.items() if field in body}

    if not errors.any() and not values:
        errors.add_form(EMPTY_UPDATE_MESSAGE)

    errors.raise_if_any()

    return values


def validate_response(body):
    errors = Errors()
    values = {"status": read_option(errors, body, "status", REPLY_STATUSES)}

    if "scope" in body:
        values["scope"] = read_option(errors, body, "scope", RESPONSE_SCOPES)

    if "occurrenceStartAt" in body:
        values["occurrenceStartAt"] = read_date(errors, body, "occurrenceStartAt")

    errors.raise_if_any()

    return values


def validate_list(query):
    errors = Errors()
    values = {
        "from": read_date(errors, query, "from"),
        "to": read_date(errors, query, "to"),
        "calendarIds": read_comma_separated_ids(errors, query, "calendarIds"),
    }

    if not errors.any():
        check_range(errors, values)

    errors.raise_if_any()

    return values


def check_range(errors, values):
    if values["from"] >= values["to"]:
        errors.add("to", RANGE_ORDER_MESSAGE)

    if (values["to"] - values["from"]).total_seconds() > MAX_RANGE_DAYS * SECONDS_PER_DAY:
        errors.add("to", RANGE_LENGTH_MESSAGE)


def validate_search(query):
    errors = Errors()
    values = {
        "q": read_optional_text(errors, query, "q"),
        "what": read_optional_text(errors, query, "what"),
        "who": read_optional_text(errors, query, "who"),
        "where": read_optional_text(errors, query, "where"),
        "exclude": read_optional_text(errors, query, "exclude"),
        "from": read_date(errors, query, "from", default=None) if query.get("from") is not None else None,
        "to": read_date(errors, query, "to", default=None) if query.get("to") is not None else None,
        "calendarIds": read_comma_separated_ids(errors, query, "calendarIds"),
    }
    values["what"] = values["what"] or values["q"] or ""

    if not errors.any() and values["from"] and values["to"] and values["from"] >= values["to"]:
        errors.add("to", RANGE_ORDER_MESSAGE)

    errors.raise_if_any()

    return values


def read_optional_text(errors, query, field):
    if query.get(field) is None:
        return None

    return read_string(errors, query, field, trim=True, maximum=MAX_SEARCH_TEXT_LENGTH)
