import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "calendar_backend.settings")

import django

django.setup()

import bcrypt

from apps.auth.models import WorkspaceAccount
from apps.calendars.models import Calendar
from apps.events.constants import EVENT_TYPES
from apps.events.models import Event
from apps.events.repository import build_event
from apps.people.models import Person, WorkingHours
from apps.shared.demo_colors import demo_color_for
from apps.shared.documents import stamp
from apps.shared.time_zone import add_calendar_days, day_of_week, is_weekend, local_date_key, parts_at, zoned_date_time
from scripts.seed_data import (
    DAY_OFF_PREFERENCES,
    DEMO_PASSWORD,
    DEMO_TIME_ZONE,
    EVENTS_PER_DAY_ROTATION,
    MILESTONES_AFTER_DAYS_OFF,
    MILESTONES_BEFORE_DAYS_OFF,
    PASSWORD_ROUNDS,
    PROFILE_ROWS,
    RECURRING_TEMPLATES,
    RESPONDED_DAY,
    RESPONDED_HOUR,
    SLOT_STEP_COUNT,
    SLOT_STEP_MINUTES,
    SPREAD_FIRST_DAY,
    SPREAD_LAST_DAY,
    SPREAD_TEMPLATES,
    TAYLOR_AFTERNOON_BLOCK,
    TEMPLATE_DAY_STRIDE,
    TEMPLATE_SLOT_STRIDE,
)

MINUTES_PER_HOUR = 60
MINUTES_PER_DAY = 1440
SECONDS_PER_MINUTE = 60
DEFAULT_RECURRENCE_COUNT = 20
SEPARATOR = "========================================"

TODAY_KEY = os.environ.get("DEMO_TODAY") or local_date_key(datetime.now(timezone.utc), DEMO_TIME_ZONE)


def day_key(day_offset):
    return add_calendar_days(TODAY_KEY, day_offset)


def moment(day_offset, minute_of_day):
    return zoned_date_time(day_key(day_offset), minute_of_day, DEMO_TIME_ZONE)


def minutes_of(value):
    parts = parts_at(value, DEMO_TIME_ZONE)

    return parts["hour"] * MINUTES_PER_HOUR + parts["minute"]


def duration_minutes(row):
    return int((row["endAt"] - row["startAt"]).total_seconds() // SECONDS_PER_MINUTE)


def build_recurrence(options):
    return {
        "frequency": options["frequency"],
        "interval": 1,
        "endType": "count",
        "count": DEFAULT_RECURRENCE_COUNT,
        "timeZone": DEMO_TIME_ZONE,
        **options,
    }


def weekly_days(recurrence, start_at):
    if recurrence["frequency"] != "weekly" or recurrence.get("daysOfWeek"):
        return recurrence

    return {**recurrence, "daysOfWeek": [day_of_week(local_date_key(start_at, DEMO_TIME_ZONE))]}


def invited(people, statuses, responded_at):
    return {
        "participants": [person.name for person in people],
        "participantIds": [person.id for person in people],
        "attendeeResponses": [
            {
                "personId": person.id,
                "status": statuses[index] if index < len(statuses) else "needsAction",
                "respondedAt": responded_at if index < len(statuses) and statuses[index] != "needsAction" else None,
            }
            for index, person in enumerate(people)
        ],
    }


def clear_collections():
    print("Clearing existing collections...")

    for model in (Event, Calendar, Person, WorkspaceAccount):
        model.objects.delete()


def to_profile_document(row):
    return stamp(
        Person(
            name=row["name"],
            email=row["email"],
            avatar_color=row["avatarColor"],
            is_profile=row["isProfile"],
            sort_order=row["sortOrder"],
            time_zone=row["timeZone"],
            working_hours=WorkingHours(
                start_minute=row["workingHours"]["startMinute"],
                end_minute=row["workingHours"]["endMinute"],
            ),
        )
    )


def insert_profiles():
    print("\nSeeding profiles...")

    profiles = [to_profile_document(row) for row in PROFILE_ROWS]
    Person.objects.insert(profiles)

    print(f"  Created {len(profiles)} profiles")

    return profiles


def insert_accounts(profiles):
    print("\nSeeding sign-in accounts...")

    password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(PASSWORD_ROUNDS)).decode()
    allowed_profile_ids = [profile.id for profile in profiles]
    accounts = [
        stamp(
            WorkspaceAccount(
                name=profile.name,
                email=profile.email,
                password_hash=password_hash,
                allowed_profile_ids=allowed_profile_ids,
            )
        )
        for profile in profiles
    ]
    WorkspaceAccount.objects.insert(accounts)

    print(f"  Created {len(accounts)} accounts, each able to open any of the {len(profiles)} profiles")

    return accounts


def calendar_rows(profiles):
    rows = []

    for profile in profiles:
        rows.append(
            {
                "key": f"{profile.email}:primary",
                "owner_id": profile.id,
                "name": "My calendar",
                "color": profile.avatar_color,
                "visible": True,
                "is_primary": True,
            }
        )
        rows.append(
            {
                "key": f"{profile.email}:work",
                "owner_id": profile.id,
                "name": "Work",
                "color": demo_color_for(profile.email, "work"),
                "visible": True,
                "is_primary": False,
            }
        )

    owner = profiles[0]
    rows.append(
        {
            "key": f"{owner.email}:birthdays",
            "owner_id": owner.id,
            "name": "Birthdays",
            "color": demo_color_for(owner.email, "Birthdays"),
            "visible": True,
            "is_primary": False,
        }
    )

    return rows


def insert_calendars(profiles):
    print("\nSeeding calendars...")

    rows = calendar_rows(profiles)
    calendars = [stamp(Calendar(**{key: value for key, value in row.items() if key != "key"}, default_color=row["color"])) for row in rows]
    Calendar.objects.insert(calendars)

    print(f"  Created {len(calendars)} calendars")

    return calendars, {row["key"]: calendars[index] for index, row in enumerate(rows)}


class Schedule:
    def __init__(self, profiles_by_name):
        self.slots = {}
        self.profiles_by_name = profiles_by_name

    def slots_for(self, name, offset):
        return self.slots.get((name, offset), [])

    def reserve(self, name, offset, start_minute, end_minute):
        self.slots[(name, offset)] = [*self.slots_for(name, offset), (start_minute, end_minute)]

    def is_free(self, name, offset, start_minute, end_minute):
        return not any(start_minute < slot[1] and end_minute > slot[0] for slot in self.slots_for(name, offset))

    def is_away(self, name, offset):
        return any(slot[1] - slot[0] >= MINUTES_PER_DAY for slot in self.slots_for(name, offset))

    def working_hours(self, name):
        return self.profiles_by_name[name].working_hours


def build_row(owner, calendars_by_key, values):
    calendar = values.get("calendar", "primary")
    row = {
        "calendarId": calendars_by_key[f"{owner.email}:{calendar}"].id,
        "organizer": owner.name,
        "type": values.get("type", "event"),
        "description": values.get("description", ""),
        "location": values.get("location", ""),
        "title": values["title"],
        "startAt": moment(values["startDay"], values["startMinute"]),
        "endAt": moment(values["endDay"], values["endMinute"]),
    }

    if values.get("allDay"):
        row["allDay"] = True

    return row


def build_recurring_rows(profiles_by_email, calendars_by_key, responded_at):
    rows = []

    for template in RECURRING_TEMPLATES:
        owner = profiles_by_email[template["owner"]]
        row = build_row(owner, calendars_by_key, template)
        recurrence = build_recurrence(template["recurrence"])
        row["recurrence"] = weekly_days(recurrence, row["startAt"])

        if template.get("guests"):
            guests = [profiles_by_email[email] for email in template["guests"]]
            row.update(invited(guests, template.get("statuses", []), responded_at))

        rows.append(row)

    return rows


def repeat_covers_day(row, offset):
    anchor_key = local_date_key(row["startAt"], DEMO_TIME_ZONE)

    if day_key(offset) < anchor_key:
        return False

    if day_key(offset) == anchor_key:
        return True

    frequency = row.get("recurrence", {}).get("frequency")

    if frequency == "weekdays":
        return not is_weekend(day_key(offset))

    if frequency == "weekly":
        return day_of_week(day_key(offset)) in row["recurrence"].get("daysOfWeek", [])

    return False


def claims_a_location(recurring_rows, name, offset):
    return any(
        row["type"] == "workingLocation" and row["organizer"] == name and repeat_covers_day(row, offset)
        for row in recurring_rows
    )


def pick_days_off(recurring_rows, profiles_by_email, workday_offsets, schedule):
    days_off = []

    for preference in DAY_OFF_PREFERENCES:
        owner = profiles_by_email[preference["owner"]]
        offset = next(
            (
                day
                for day in workday_offsets
                if day >= preference["preferred"] and not claims_a_location(recurring_rows, owner.name, day)
            ),
            None,
        )

        if offset is None:
            raise ValueError(f"No clear out-of-office day for {owner.name}.")

        schedule.reserve(owner.name, offset, 0, MINUTES_PER_DAY)
        days_off.append({"owner": owner, "offset": offset, "description": preference["description"]})

    return days_off


def decline_occurrences_on_days_off(recurring_rows, days_off, responded_at):
    for day_off in days_off:
        owner = day_off["owner"]

        for row in recurring_rows:
            is_guest = any(str(person_id) == str(owner.id) for person_id in row.get("participantIds", []))

            if not is_guest or not repeat_covers_day(row, day_off["offset"]):
                continue

            row["recurrenceResponseOverrides"] = [
                *row.get("recurrenceResponseOverrides", []),
                {
                    "personId": owner.id,
                    "occurrenceStartAt": moment(day_off["offset"], minutes_of(row["startAt"])),
                    "scope": "this",
                    "status": "declined",
                    "respondedAt": responded_at,
                },
            ]


def find_slot(template, offset, schedule, names):

    if any(schedule.is_away(name, offset) for name in names):
        return None

    window_start = max(schedule.working_hours(name).start_minute for name in names)
    window_end = min(schedule.working_hours(name).end_minute for name in names)
    candidates = [
        template["hour"] * MINUTES_PER_HOUR,
        *[window_start + step * SLOT_STEP_MINUTES for step in range(SLOT_STEP_COUNT)],
    ]

    for start_minute in candidates:
        if start_minute < window_start or start_minute + template["minutes"] > window_end:
            continue

        if all(schedule.is_free(name, offset, start_minute, start_minute + template["minutes"]) for name in names):
            return start_minute

    return None


def build_spread_rows(profiles_by_email, calendars_by_key, workday_offsets, schedule, responded_at):
    rows = []

    for day_index, offset in enumerate(workday_offsets):
        per_day = EVENTS_PER_DAY_ROTATION[day_index % len(EVENTS_PER_DAY_ROTATION)]

        for slot in range(per_day):
            index = (day_index * TEMPLATE_DAY_STRIDE + slot * TEMPLATE_SLOT_STRIDE) % len(SPREAD_TEMPLATES)
            template = SPREAD_TEMPLATES[index]
            owner = profiles_by_email[template["owner"]]
            guests = [profiles_by_email[email] for email in template.get("guests", [])]
            guest_names = [guest.name for guest in guests]
            start_minute = find_slot(template, offset, schedule, [owner.name, *guest_names])

            if start_minute is None:
                continue

            for name in [owner.name, *guest_names]:
                schedule.reserve(name, offset, start_minute, start_minute + template["minutes"])

            row = build_row(
                owner,
                calendars_by_key,
                {**template, "startDay": offset, "startMinute": start_minute, "endDay": offset, "endMinute": start_minute + template["minutes"]},
            )

            if guests:
                row.update(invited(guests, template.get("statuses", []), responded_at))

            rows.append(row)

    return rows


def build_milestone_rows(profiles_by_email, calendars_by_key, days_off):
    rows = [
        build_row(profiles_by_email[template["owner"]], calendars_by_key, template)
        for template in MILESTONES_BEFORE_DAYS_OFF
    ]

    for day_off in days_off:
        rows.append(
            build_row(
                day_off["owner"],
                calendars_by_key,
                {
                    "title": "Out of office",
                    "type": "outOfOffice",
                    "description": day_off["description"],
                    "startDay": day_off["offset"],
                    "startMinute": 0,
                    "endDay": day_off["offset"] + 1,
                    "endMinute": 0,
                    "allDay": True,
                },
            )
        )

    rows.extend(
        build_row(profiles_by_email[template["owner"]], calendars_by_key, template)
        for template in MILESTONES_AFTER_DAYS_OFF
    )

    return rows


def build_event_rows(profiles, calendars_by_key):
    profiles_by_email = {profile.email: profile for profile in profiles}
    profiles_by_name = {profile.name: profile for profile in profiles}
    responded_at = moment(RESPONDED_DAY, RESPONDED_HOUR * MINUTES_PER_HOUR)

    recurring_rows = build_recurring_rows(profiles_by_email, calendars_by_key, responded_at)
    workday_offsets = [offset for offset in range(SPREAD_FIRST_DAY, SPREAD_LAST_DAY + 1) if not is_weekend(day_key(offset))]

    schedule = Schedule(profiles_by_name)

    for row in recurring_rows:
        if row.get("allDay"):
            continue

        start_minute = minutes_of(row["startAt"])
        end_minute = start_minute + duration_minutes(row)

        for offset in workday_offsets:
            if not repeat_covers_day(row, offset):
                continue

            for name in [row["organizer"], *row.get("participants", [])]:
                schedule.reserve(name, offset, start_minute, end_minute)

    days_off = pick_days_off(recurring_rows, profiles_by_email, workday_offsets, schedule)
    decline_occurrences_on_days_off(recurring_rows, days_off, responded_at)
    milestone_rows = build_milestone_rows(profiles_by_email, calendars_by_key, days_off)

    block = TAYLOR_AFTERNOON_BLOCK
    schedule.reserve(profiles_by_email[block["owner"]].name, block["day"], block["startMinute"], block["endMinute"])

    spread_rows = build_spread_rows(profiles_by_email, calendars_by_key, workday_offsets, schedule, responded_at)

    assert_schedule_is_coherent(recurring_rows, spread_rows, days_off, workday_offsets, profiles, schedule)

    return [*recurring_rows, *spread_rows, *milestone_rows]


def offset_of_row(row, workday_offsets):
    key = local_date_key(row["startAt"], DEMO_TIME_ZONE)

    return next((offset for offset in workday_offsets if day_key(offset) == key), None)


def assert_schedule_is_coherent(recurring_rows, spread_rows, days_off, workday_offsets, profiles, schedule):
    days_off_by_name = {day_off["owner"].name: day_off["offset"] for day_off in days_off}

    def fail(reason):
        raise ValueError(f"Seed schedule is incoherent: {reason}.")

    for (name, offset), slots in schedule.slots.items():
        timed = [slot for slot in slots if slot[1] - slot[0] < MINUTES_PER_DAY]

        for first in range(len(timed)):
            for second in range(first + 1, len(timed)):
                if timed[first][0] >= timed[second][1] or timed[first][1] <= timed[second][0]:
                    continue

                fail(f"{name} is double booked on day {offset}")

    for row in spread_rows:
        offset = offset_of_row(row, workday_offsets)
        start_minute = minutes_of(row["startAt"])
        end_minute = start_minute + duration_minutes(row)

        if offset is None or is_weekend(day_key(offset)):
            fail(f'"{row["title"]}" does not land on a workday')

        for name in [row["organizer"], *row.get("participants", [])]:
            hours = schedule.working_hours(name)

            if start_minute < hours.start_minute or end_minute > hours.end_minute:
                fail(f'"{row["title"]}" falls outside {name}\'s working hours')

            if days_off_by_name.get(name) == offset:
                fail(f'{name} has "{row["title"]}" on their day off')

    for name, offset in days_off_by_name.items():
        if claims_a_location(recurring_rows, name, offset):
            fail(f"{name} claims a working location on their day off")

    for offset in workday_offsets:
        for profile in profiles:
            locations = [
                row
                for row in recurring_rows
                if row["type"] == "workingLocation" and row["organizer"] == profile.name and repeat_covers_day(row, offset)
            ]

            if len(locations) > 1:
                fail(f"{profile.name} claims {len(locations)} working locations on day {offset}")


def validate_event_rows(rows, profiles, calendars):
    profile_by_id = {str(profile.id): profile for profile in profiles}
    calendar_owner_by_id = {str(calendar.id): str(calendar.owner_id) for calendar in calendars}

    for row in rows:
        context = f"{row['organizer']}: {row['title']}"

        if not row["title"].strip():
            raise ValueError(f"Seed event title is missing ({context}).")

        if row["type"] not in EVENT_TYPES:
            raise ValueError(f"Seed event type is invalid ({context}).")

        if row["endAt"] <= row["startAt"]:
            raise ValueError(f"Seed event range is invalid ({context}).")

        calendar_owner = profile_by_id.get(calendar_owner_by_id.get(str(row["calendarId"])))

        if calendar_owner is None or calendar_owner.name != row["organizer"]:
            raise ValueError(f"Seed calendar ownership is inconsistent ({context}).")

        if row.get("allDay") and any(minutes_of(value) or parts_at(value, DEMO_TIME_ZONE)["second"] for value in (row["startAt"], row["endAt"])):
            raise ValueError(f"Seed all-day boundaries must sit at midnight in {DEMO_TIME_ZONE} ({context}).")

        participant_ids = [str(person_id) for person_id in row.get("participantIds", [])]

        if len(set(participant_ids)) != len(participant_ids) or str(calendar_owner.id) in participant_ids:
            raise ValueError(f"Seed participants are duplicated or include the organizer ({context}).")

        expected_names = [profile_by_id[person_id].name for person_id in participant_ids if person_id in profile_by_id]

        if len(expected_names) != len(participant_ids) or expected_names != row.get("participants", []):
            raise ValueError(f"Seed participant names and identifiers disagree ({context}).")

        response_ids = [str(response["personId"]) for response in row.get("attendeeResponses", [])]

        if response_ids != participant_ids:
            raise ValueError(f"Seed RSVP rows do not match the invitation list ({context}).")

        recurrence = row.get("recurrence")

        if recurrence and (recurrence["count"] < 1 or recurrence["frequency"] == "none"):
            raise ValueError(f"Seed recurrence is invalid ({context}).")


def insert_events(profiles, calendars, calendars_by_key):
    print("\nSeeding events...")

    rows = build_event_rows(profiles, calendars_by_key)
    validate_event_rows(rows, profiles, calendars)
    Event.objects.insert([stamp(build_event(row)) for row in rows])

    print(f"  Created {len(rows)} events between {day_key(SPREAD_FIRST_DAY)} and {day_key(SPREAD_LAST_DAY)}")

    return rows


def seed():
    print(SEPARATOR)
    print("Database Seeding")
    print(f"{SEPARATOR}\n")

    print("Connecting to MongoDB...")
    print("Connected to MongoDB")

    clear_collections()

    profiles = insert_profiles()
    insert_accounts(profiles)
    calendars, calendars_by_key = insert_calendars(profiles)
    insert_events(profiles, calendars, calendars_by_key)

    print(f"\n{SEPARATOR}")
    print("Seeding completed successfully!")
    print(SEPARATOR)
    print("\nCollection counts:")
    print(f"  Profiles:  {Person.objects.count()}")
    print(f"  Accounts:  {WorkspaceAccount.objects.count()}")
    print(f"  Calendars: {Calendar.objects.count()}")
    print(f"  Events:    {Event.objects.count()}")
    print("\nTest Users:")

    for profile in profiles:
        print(f"  Email: {profile.email} | Password: {DEMO_PASSWORD}")

    print(f"\nAll times are seeded in {DEMO_TIME_ZONE}, relative to {TODAY_KEY}.")
    print(f"{SEPARATOR}\n")


def main():
    try:
        seed()
    except Exception as error:
        print(f"\nSeeding failed: {error}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        print("Disconnected from MongoDB")


if __name__ == "__main__":
    main()
