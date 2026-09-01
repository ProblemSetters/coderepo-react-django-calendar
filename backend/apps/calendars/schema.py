from apps.shared.validation import COLOR_MESSAGE, COLOR_PATTERN, Errors, read_boolean, read_string, read_time_zone

MAX_NAME_LENGTH = 80
MAX_DESCRIPTION_LENGTH = 1000
TIME_ZONE_MESSAGE = "Provide a valid IANA time zone."
EMPTY_UPDATE_MESSAGE = "Provide at least one field to update."


def read_color(errors, body):
    value = read_string(errors, body, "color")

    if value is None:
        return None

    if not COLOR_PATTERN.match(value):
        errors.add("color", COLOR_MESSAGE)
        return None

    return value


def validate_create(body):
    errors = Errors()
    values = {
        "name": read_string(errors, body, "name", trim=True, minimum=1, maximum=MAX_NAME_LENGTH),
        "color": read_color(errors, body),
        "description": read_string(errors, body, "description", default="", trim=True, maximum=MAX_DESCRIPTION_LENGTH),
        "timeZone": read_time_zone(errors, body, "timeZone", TIME_ZONE_MESSAGE, default="UTC"),
    }

    errors.raise_if_any()

    return values


def validate_update(body):
    errors = Errors()
    values = {}

    if "name" in body:
        values["name"] = read_string(errors, body, "name", trim=True, minimum=1, maximum=MAX_NAME_LENGTH)

    if "color" in body:
        values["color"] = read_color(errors, body)

    if "description" in body:
        values["description"] = read_string(errors, body, "description", trim=True, maximum=MAX_DESCRIPTION_LENGTH)

    if "timeZone" in body:
        values["timeZone"] = read_time_zone(errors, body, "timeZone", TIME_ZONE_MESSAGE)

    if "visible" in body:
        values["visible"] = read_boolean(errors, body, "visible")

    if not errors.any() and not values:
        errors.add_form(EMPTY_UPDATE_MESSAGE)

    errors.raise_if_any()

    return values
