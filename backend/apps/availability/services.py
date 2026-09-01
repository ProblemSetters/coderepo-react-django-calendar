from datetime import datetime, timedelta, timezone

from apps.events.recurrence import expand_events, response_for_occurrence
from apps.people import services as person_service
from apps.shared.rendering import to_iso_string
from apps.shared.time_zone import (
    add_calendar_days,
    as_instant,
    is_weekend,
    local_date_key,
    working_hours_status,
    zoned_date_time,
)

from . import repository

OWNER_HOURS = {"startMinute": 540, "endMinute": 1050}
OWNER_FALLBACK_NAME = "You"
MINUTES_PER_DAY = 1440
SLOT_STEP_MINUTES = 30
MAX_SUGGESTIONS = 12
INTERVAL_MARGIN_DAYS = 1


def overlaps(start_at, end_at, block):
    return start_at < as_instant(block["endAt"]) and end_at > as_instant(block["startAt"])


def clip_block(block, from_moment, to_moment):
    clipped = {}

    if block.get("_id"):
        clipped["_id"] = str(block["_id"])

    clipped["title"] = block.get("title") or "Busy"

    if block.get("calendarId"):
        clipped["calendarId"] = str(block["calendarId"])

    for field in ("type", "description", "location", "organizer"):
        if block.get(field):
            clipped[field] = block[field]

    if block.get("participants"):
        clipped["participants"] = block["participants"]

    if block.get("color"):
        clipped["color"] = block["color"]

    if block.get("allDay"):
        clipped["allDay"] = True

    clipped["startAt"] = to_iso_string(max(from_moment, as_instant(block["startAt"])))
    clipped["endAt"] = to_iso_string(min(to_moment, as_instant(block["endAt"])))

    return clipped


def clip_blocks(blocks, from_moment, to_moment):
    return [
        clip_block(block, from_moment, to_moment)
        for block in blocks
        if overlaps(from_moment, to_moment, block)
    ]


def is_scheduled_for(event, person_id):
    if str(event.get("ownerId") or "") == str(person_id):
        return True

    if not any(str(value) == str(person_id) for value in event.get("participantIds", [])):
        return False

    response = response_for_occurrence(event, person_id)

    return (response or {}).get("status") != "declined"


def scheduled_for(events, person_id):
    return [event for event in events if is_scheduled_for(event, person_id)]


def hours_for(person):
    return person.get("workingHours") or OWNER_HOURS


def zone_for(person, fallback):
    return person.get("timeZone") or fallback


def public_person(person, fallback_time_zone):
    return {
        "_id": person["_id"],
        "name": person["name"],
        "email": person["email"],
        "avatarColor": person["avatarColor"],
        "workingHours": hours_for(person),
        "timeZone": zone_for(person, fallback_time_zone),
    }


def within_hours(start_at, end_at, person, fallback_time_zone):
    return working_hours_status(start_at, end_at, hours_for(person), zone_for(person, fallback_time_zone))


def working_intervals(from_date, days, display_time_zone, person):
    from_moment = zoned_date_time(from_date, 0, display_time_zone)
    to_moment = zoned_date_time(add_calendar_days(from_date, days), 0, display_time_zone)
    zone = zone_for(person, display_time_zone)
    hours = hours_for(person)
    first_local_date = local_date_key(from_moment, zone)
    intervals = []

    for offset in range(-INTERVAL_MARGIN_DAYS, days + INTERVAL_MARGIN_DAYS + 1):
        date_key = add_calendar_days(first_local_date, offset)

        if is_weekend(date_key):
            continue

        start_at = zoned_date_time(date_key, hours["startMinute"], zone)
        end_at = zoned_date_time(date_key, hours["endMinute"], zone)

        if not overlaps(from_moment, to_moment, {"startAt": start_at, "endAt": end_at}):
            continue

        intervals.append(
            {
                "startAt": to_iso_string(max(from_moment, start_at)),
                "endAt": to_iso_string(min(to_moment, end_at)),
            }
        )

    return intervals


def conflicts(query):
    start_at = query["startAt"]
    end_at = query["endAt"]
    time_zone = query["timeZone"]
    people = person_service.get_selected(query["participantIds"])
    scheduled = expand_events(repository.participant_busy(query["participantIds"], start_at, end_at), start_at, end_at)
    busy_people = [
        {
            "person": public_person(person, time_zone),
            "busy": clip_blocks(
                [*person.get("busyBlocks", []), *scheduled_for(scheduled, person["_id"])], start_at, end_at
            ),
        }
        for person in people
    ]
    busy_people = [entry for entry in busy_people if entry["busy"]]
    warnings = [
        {"person": public_person(person, time_zone), **within_hours(start_at, end_at, person, time_zone)}
        for person in people
    ]
    warnings = [warning for warning in warnings if not warning["withinWorkingHours"]]

    return {
        "startAt": to_iso_string(start_at),
        "endAt": to_iso_string(end_at),
        "available": not busy_people,
        "withinWorkingHours": not warnings,
        "conflicts": busy_people,
        "workingHoursWarnings": warnings,
    }


def person_schedules(people, scheduled, from_date, days, time_zone, from_moment, to_moment):
    return [
        {
            "person": public_person(person, time_zone),
            "workingIntervals": working_intervals(from_date, days, time_zone, person),
            "busy": clip_blocks(
                [*person.get("busyBlocks", []), *scheduled_for(scheduled, person["_id"])], from_moment, to_moment
            ),
        }
        for person in people
    ]


def is_open_slot(start_at, end_at, owner, people, time_zone, owner_busy, schedules):
    if end_at <= datetime.now(timezone.utc).replace(tzinfo=None):
        return False

    if not within_hours(start_at, end_at, owner, time_zone)["withinWorkingHours"]:
        return False

    if any(not within_hours(start_at, end_at, person, time_zone)["withinWorkingHours"] for person in people):
        return False

    if any(overlaps(start_at, end_at, block) for block in owner_busy):
        return False

    return not any(
        overlaps(start_at, end_at, block) for schedule in schedules for block in schedule["busy"]
    )


def collect_suggestions(query, owner, people, owner_busy, schedules):
    from_date = query["from"]
    duration = query["durationMinutes"]
    time_zone = query["timeZone"]
    suggestions = []

    for day_index in range(query["days"]):
        date_key = add_calendar_days(from_date, day_index)
        minute = 0

        while minute + duration <= MINUTES_PER_DAY:
            start_at = zoned_date_time(date_key, minute, time_zone)
            end_at = start_at + timedelta(minutes=duration)
            minute += SLOT_STEP_MINUTES

            if not is_open_slot(start_at, end_at, owner, people, time_zone, owner_busy, schedules):
                continue

            suggestions.append(
                {
                    "startAt": to_iso_string(start_at),
                    "endAt": to_iso_string(end_at),
                    "attendeeCount": len(people) + 1,
                }
            )

            if len(suggestions) == MAX_SUGGESTIONS:
                return suggestions

    return suggestions


def suggest(query, profile):
    from_date = query["from"]
    time_zone = query["timeZone"]
    days = query["days"]
    people = person_service.get_selected(query["participantIds"])
    from_moment = zoned_date_time(from_date, 0, time_zone)
    to_moment = zoned_date_time(add_calendar_days(from_date, days), 0, time_zone)
    owner_busy = expand_events(
        repository.owner_busy(from_moment, to_moment, profile["_id"] if profile else None), from_moment, to_moment
    )
    scheduled = expand_events(
        repository.participant_busy(query["participantIds"], from_moment, to_moment), from_moment, to_moment
    )
    schedules = person_schedules(people, scheduled, from_date, days, time_zone, from_moment, to_moment)
    owner = profile or {"name": OWNER_FALLBACK_NAME, "workingHours": OWNER_HOURS, "timeZone": time_zone}

    return {
        "from": to_iso_string(from_moment),
        "to": to_iso_string(to_moment),
        "durationMinutes": query["durationMinutes"],
        "timeZone": time_zone,
        "owner": {
            "name": profile["name"] if profile else OWNER_FALLBACK_NAME,
            "timeZone": zone_for(owner, time_zone),
            "workingHours": hours_for(owner),
            "workingIntervals": working_intervals(from_date, days, time_zone, owner),
            "busy": clip_blocks(owner_busy, from_moment, to_moment),
        },
        "participants": schedules,
        "suggestions": collect_suggestions(query, owner, people, owner_busy, schedules),
    }
