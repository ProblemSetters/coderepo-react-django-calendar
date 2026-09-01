import re

from apps.shared.validation import (
    Errors,
    read_date,
    read_number,
    read_string,
    read_string_list,
    read_time_zone,
)

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATE_MESSAGE = "Invalid string: must match pattern /^\\d{4}-\\d{2}-\\d{2}$/"
TIME_ZONE_MESSAGE = "Select a valid IANA time zone."
DUPLICATE_PERSON_MESSAGE = "Select each person only once."
ORDER_MESSAGE = "endAt must be after startAt."
INCREMENT_MESSAGE = "Duration must use 15-minute increments."
MAX_CONFLICT_PEOPLE = 100
MAX_SUGGESTION_PEOPLE = 10
MIN_DAYS = 1
MAX_DAYS = 14
DEFAULT_DAYS = 5
MIN_DURATION = 15
MAX_DURATION = 240
DURATION_INCREMENT = 15


def read_people(errors, body, maximum):
    return read_string_list(
        errors,
        body,
        "participantIds",
        minimum=1,
        maximum=maximum,
        unique_message=DUPLICATE_PERSON_MESSAGE,
    )


def read_start_date(errors, body):
    value = read_string(errors, body, "from")

    if value is None:
        return None

    if not DATE_PATTERN.match(value):
        errors.add("from", DATE_MESSAGE)
        return None

    return value


def read_duration(errors, body):
    value = read_number(errors, body, "durationMinutes", minimum=MIN_DURATION, maximum=MAX_DURATION)

    if value is None:
        return None

    if value % DURATION_INCREMENT:
        errors.add("durationMinutes", INCREMENT_MESSAGE)
        return None

    return value


def validate_conflicts(body):
    errors = Errors()
    values = {
        "participantIds": read_people(errors, body, MAX_CONFLICT_PEOPLE),
        "startAt": read_date(errors, body, "startAt"),
        "endAt": read_date(errors, body, "endAt"),
        "timeZone": read_time_zone(errors, body, "timeZone", TIME_ZONE_MESSAGE, default="UTC"),
    }

    if not errors.any() and values["startAt"] >= values["endAt"]:
        errors.add("endAt", ORDER_MESSAGE)

    errors.raise_if_any()

    return values


def validate_suggestions(body):
    errors = Errors()
    values = {
        "participantIds": read_people(errors, body, MAX_SUGGESTION_PEOPLE),
        "from": read_start_date(errors, body),
        "timeZone": read_time_zone(errors, body, "timeZone", TIME_ZONE_MESSAGE),
        "days": read_number(errors, body, "days", default=DEFAULT_DAYS, minimum=MIN_DAYS, maximum=MAX_DAYS),
        "durationMinutes": read_duration(errors, body),
    }

    errors.raise_if_any()

    return values
