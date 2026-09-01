from apps.shared.validation import Errors, read_comma_separated_ids, read_date

RANGE_ORDER_MESSAGE = "to must be after from"


def validate_daily(query):
    errors = Errors()
    values = {
        "from": read_date(errors, query, "from"),
        "to": read_date(errors, query, "to"),
        "calendarIds": read_comma_separated_ids(errors, query, "calendarIds"),
    }

    if not errors.any() and values["from"] >= values["to"]:
        errors.add("to", RANGE_ORDER_MESSAGE)

    errors.raise_if_any()

    return values
