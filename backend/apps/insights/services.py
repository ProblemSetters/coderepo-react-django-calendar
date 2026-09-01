from datetime import timedelta

from apps.events.recurrence import expand_events
from apps.shared.numbers import round_half_up
from apps.shared.time_zone import to_utc

from . import repository

MINUTES_PER_DAY = 1440
WORKING_DAY_MINUTES = 480
HISTORY_DAYS = 7
SECONDS_PER_MINUTE = 60
TRACKED_TYPES = {"event", "appointmentSchedule", "focusTime", "task", "outOfOffice"}
CATEGORY_BY_TYPE = {
    "event": "meetings",
    "appointmentSchedule": "meetings",
    "focusTime": "focus",
    "task": "tasks",
    "outOfOffice": "outOfOffice",
}
CATEGORY_METADATA = [
    {"key": "meetings", "label": "Meetings", "color": "#1a73e8"},
    {"key": "focus", "label": "Focus time", "color": "#039be5"},
    {"key": "tasks", "label": "Tasks", "color": "#7e57c2"},
    {"key": "outOfOffice", "label": "Out of office", "color": "#f4511e"},
]
FALLBACK_CALENDAR_NAME = "Calendar"
FALLBACK_CALENDAR_COLOR = "#5f6368"


def all_day_minutes(event, from_moment, to_moment):
    if event["type"] != "outOfOffice":
        return 0

    overlap_start = max(to_utc(event["startAt"]), from_moment)
    overlap_end = min(to_utc(event["endAt"]), to_moment)

    if overlap_end <= overlap_start:
        return 0

    covered_days = min(1, (overlap_end - overlap_start) / timedelta(days=1))

    return round_half_up(WORKING_DAY_MINUTES * covered_days)


def clipped_minutes(event, from_moment, to_moment):
    if event["type"] not in TRACKED_TYPES:
        return 0

    if event.get("allDay"):
        return all_day_minutes(event, from_moment, to_moment)

    start = max(to_utc(event["startAt"]), from_moment)
    end = min(to_utc(event["endAt"]), to_moment)

    return max(0, round_half_up((end - start).total_seconds() / SECONDS_PER_MINUTE))


def category_for(event_type):
    return CATEGORY_BY_TYPE.get(event_type)


def historical_meeting_minutes(events, history_from):
    total = 0

    for index in range(HISTORY_DAYS):
        day_start = history_from + timedelta(days=index)
        day_end = day_start + timedelta(days=1)
        total += sum(
            clipped_minutes(event, day_start, day_end)
            for event in events
            if category_for(event["type"]) == "meetings"
        )

    return total


def calendar_rows(calendar_minutes, calendars):
    lookup = {str(calendar["_id"]): calendar for calendar in calendars}
    rows = [
        {
            "calendarId": calendar_id,
            "name": lookup[calendar_id]["name"] if calendar_id in lookup else FALLBACK_CALENDAR_NAME,
            "color": lookup[calendar_id]["color"] if calendar_id in lookup else FALLBACK_CALENDAR_COLOR,
            "minutes": minutes,
        }
        for calendar_id, minutes in calendar_minutes.items()
    ]

    return sorted(rows, key=lambda row: (-row["minutes"], row["name"]))


def daily(query, profile_id):
    from_moment = query["from"]
    to_moment = query["to"]
    history_from = from_moment - timedelta(days=HISTORY_DAYS - 1)
    events = repository.find_events(history_from, to_moment, query["calendarIds"], profile_id)
    calendars = repository.find_calendars(query["calendarIds"], profile_id)
    events = expand_events(events, history_from, to_moment)

    category_minutes = {metadata["key"]: 0 for metadata in CATEGORY_METADATA}
    calendar_minutes = {}
    meeting_count = 0

    for event in events:
        minutes = clipped_minutes(event, from_moment, to_moment)
        category = category_for(event["type"])

        if not minutes or not category:
            continue

        category_minutes[category] += minutes

        if category == "meetings":
            meeting_count += 1

        calendar_id = str(event["calendarId"])
        calendar_minutes[calendar_id] = calendar_minutes.get(calendar_id, 0) + minutes

    total_scheduled_minutes = sum(category_minutes.values())

    return {
        "date": from_moment,
        "workingDayMinutes": WORKING_DAY_MINUTES,
        "totalScheduledMinutes": total_scheduled_minutes,
        "meetingMinutes": category_minutes["meetings"],
        "meetingCount": meeting_count,
        "averageDailyMeetingMinutes": round_half_up(historical_meeting_minutes(events, history_from) / HISTORY_DAYS),
        "remainingMinutes": max(0, WORKING_DAY_MINUTES - min(WORKING_DAY_MINUTES, total_scheduled_minutes)),
        "categories": [{**metadata, "minutes": category_minutes[metadata["key"]]} for metadata in CATEGORY_METADATA],
        "calendars": calendar_rows(calendar_minutes, calendars),
    }
