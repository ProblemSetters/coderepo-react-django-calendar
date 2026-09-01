import math

from apps.shared.rendering import to_iso_string
from apps.shared.time_zone import (
    add_calendar_days,
    day_of_week,
    is_weekend,
    local_date_key,
    parse_date_key,
    parts_at,
    to_utc,
    zoned_date_time,
)

DAYS_PER_WEEK = 7
MONTHS_PER_YEAR = 12
MINUTES_PER_HOUR = 60


def date_parts(date_key):
    return parse_date_key(date_key)


def day_difference(first, second):
    return (date_parts(second) - date_parts(first)).days


def month_difference(first, second):
    start = date_parts(first)
    end = date_parts(second)

    return (end.year - start.year) * MONTHS_PER_YEAR + end.month - start.month


def ordinal_in_month(date_key):
    return math.ceil(date_parts(date_key).day / DAYS_PER_WEEK)


def is_last_weekday_in_month(date_key):
    return date_parts(add_calendar_days(date_key, DAYS_PER_WEEK)).month != date_parts(date_key).month


def matches_daily(days, interval):
    return days % interval == 0


def matches_weekly(anchor_date, candidate_date, recurrence, days, interval):
    weekday = day_of_week(candidate_date)
    days_from_week_start = days + day_of_week(anchor_date) - weekday
    week = round(days_from_week_start / DAYS_PER_WEEK)
    chosen = recurrence.get("daysOfWeek") or [day_of_week(anchor_date)]

    return week % interval == 0 and weekday in chosen


def matches_monthly(anchor_date, candidate_date, recurrence, interval):
    months = month_difference(anchor_date, candidate_date)

    if months < 0 or months % interval != 0:
        return False

    if recurrence.get("monthlyMode") == "dayOfMonth":
        return date_parts(anchor_date).day == date_parts(candidate_date).day

    if day_of_week(anchor_date) != day_of_week(candidate_date):
        return False

    if is_last_weekday_in_month(anchor_date):
        return is_last_weekday_in_month(candidate_date)

    return ordinal_in_month(anchor_date) == ordinal_in_month(candidate_date)


def matches_yearly(anchor_date, candidate_date, interval):
    anchor = date_parts(anchor_date)
    candidate = date_parts(candidate_date)

    return (
        candidate.year >= anchor.year
        and (candidate.year - anchor.year) % interval == 0
        and candidate.month == anchor.month
        and candidate.day == anchor.day
    )


def matches_date(anchor_date, candidate_date, recurrence):
    days = day_difference(anchor_date, candidate_date)

    if days < 0:
        return False

    interval = recurrence.get("interval") or 1
    frequency = recurrence.get("frequency")

    if frequency == "daily":
        return matches_daily(days, interval)

    if frequency == "weekdays":
        return not is_weekend(candidate_date)

    if frequency == "weekly":
        return matches_weekly(anchor_date, candidate_date, recurrence, days, interval)

    if frequency == "monthly":
        return matches_monthly(anchor_date, candidate_date, recurrence, interval)

    if frequency == "yearly":
        return matches_yearly(anchor_date, candidate_date, interval)

    return False


def recurrence_until_date(until):
    return to_utc(until).date().isoformat()


def is_recurring(event):
    recurrence = event.get("recurrence") or {}

    return bool(recurrence.get("frequency")) and recurrence["frequency"] != "none"


def expansion_bounds(recurrence, start, from_moment, to_moment, duration):
    time_zone = recurrence.get("timeZone") or "UTC"
    anchor_date = local_date_key(start, time_zone)
    anchor_parts = parts_at(start, time_zone)
    anchor_minute = anchor_parts["hour"] * MINUTES_PER_HOUR + anchor_parts["minute"]
    query_start_date = local_date_key(max(start, from_moment - duration), time_zone)
    query_end_date = local_date_key(to_moment, time_zone)

    return time_zone, anchor_date, anchor_minute, query_start_date, query_end_date


def expand_event(event, from_moment, to_moment):
    start = to_utc(event["startAt"])
    end = to_utc(event["endAt"])

    if not is_recurring(event):
        return [event] if start < to_moment and end > from_moment else []

    recurrence = event["recurrence"]
    duration = end - start
    time_zone, anchor_date, anchor_minute, query_start_date, query_end_date = expansion_bounds(
        recurrence, start, from_moment, to_moment, duration
    )
    count_limit = recurrence.get("count") if recurrence.get("endType") == "count" else None
    until_date = (
        recurrence_until_date(recurrence["until"])
        if recurrence.get("endType") == "until" and recurrence.get("until")
        else None
    )
    instances = []
    matched = 0
    date_key = anchor_date

    while date_key <= query_end_date:
        if matches_date(anchor_date, date_key, recurrence):
            matched += 1

            if count_limit and matched > count_limit:
                break

            occurrence_start = zoned_date_time(date_key, anchor_minute, time_zone)

            if until_date and date_key > until_date:
                break

            occurrence_end = occurrence_start + duration

            if date_key >= query_start_date and occurrence_start < to_moment and occurrence_end > from_moment:
                instances.append(to_occurrence(event, occurrence_start, occurrence_end))

        date_key = add_calendar_days(date_key, 1)

    return instances


def to_occurrence(event, occurrence_start, occurrence_end):
    return {
        **event,
        "seriesStartAt": event["startAt"],
        "seriesEndAt": event["endAt"],
        "startAt": occurrence_start,
        "endAt": occurrence_end,
        "recurring": True,
        "occurrenceStartAt": occurrence_start,
        "occurrenceKey": f"{event['_id']}:{to_iso_string(occurrence_start)}",
    }


def expand_events(events, from_moment, to_moment):
    expanded = [
        occurrence for event in events for occurrence in expand_event(event, from_moment, to_moment)
    ]

    return sorted(expanded, key=lambda event: (to_utc(event["startAt"]), event["title"]))


def response_for_occurrence(event, person_id):
    base = next(
        (response for response in event.get("attendeeResponses", []) if str(response["personId"]) == str(person_id)),
        None,
    )

    if not event.get("occurrenceStartAt"):
        return base

    occurrence_time = to_utc(event["occurrenceStartAt"])
    overrides = [
        override
        for override in event.get("recurrenceResponseOverrides", [])
        if str(override["personId"]) == str(person_id)
    ]
    exact = next(
        (
            override
            for override in overrides
            if override["scope"] == "this" and to_utc(override["occurrenceStartAt"]) == occurrence_time
        ),
        None,
    )

    if exact:
        return exact

    following = sorted(
        (
            override
            for override in overrides
            if override["scope"] == "following" and to_utc(override["occurrenceStartAt"]) <= occurrence_time
        ),
        key=lambda override: to_utc(override["occurrenceStartAt"]),
        reverse=True,
    )

    return following[0] if following else base
