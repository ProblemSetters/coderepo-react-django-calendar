from apps.shared.validation import Errors, read_number, read_string

MAX_QUERY_LENGTH = 100
MIN_LIMIT = 1
MAX_LIMIT = 50
DEFAULT_LIMIT = 20


def validate_search(query):
    errors = Errors()
    text = read_string(errors, query, "q", default="", trim=True, maximum=MAX_QUERY_LENGTH)
    limit = read_number(errors, query, "limit", default=DEFAULT_LIMIT, minimum=MIN_LIMIT, maximum=MAX_LIMIT)

    errors.raise_if_any()

    return text, limit
