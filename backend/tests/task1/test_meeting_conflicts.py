from datetime import datetime

from apps.events.models import AttendeeResponse, Event, Recurrence
from apps.people.models import BusyBlock

MONDAY = "2030-01-07"
TUESDAY = "2030-01-08"
THIRD_WEEK = "2030-01-21"
DAY_AFTER_THIRD_WEEK = "2030-01-22"


def at(date_key, time):
    return f"{date_key}T{time}:00.000Z"


def moment(date_key, time):
    return datetime.fromisoformat(f"{date_key}T{time}:00")


def check_conflicts(api, workspace, people, start_at, end_at):
    return api.post(
        "/api/v1/availability/conflicts",
        {
            "participantIds": [str(person.id) for person in people],
            "startAt": start_at,
            "endAt": end_at,
            "timeZone": "UTC",
        },
        workspace.token,
    )


def suggest_times(api, workspace, people):
    return api.post(
        "/api/v1/availability/suggestions",
        {
            "participantIds": [str(person.id) for person in people],
            "from": MONDAY,
            "timeZone": "UTC",
            "days": 1,
            "durationMinutes": 30,
        },
        workspace.token,
    )


def guest_event(workspace, **values):
    return Event(
        calendar_id=workspace.guest_calendar.id,
        organizer=workspace.guest_one.name,
        type=values.pop("type", "event"),
        all_day=values.pop("all_day", False),
        **values,
    ).save()


def busy_ids(payload):
    return [str(conflict["person"]["_id"]) for conflict in payload["data"]["conflicts"]]


def test_reports_a_clash_only_when_the_proposed_time_overlaps_a_busy_block(api, workspace):
    workspace.guest_one.busy_blocks = [
        BusyBlock(title="Design sync", start_at=moment(MONDAY, "10:00"), end_at=moment(MONDAY, "11:00"))
    ]
    workspace.guest_one.save()

    status, back_to_back = check_conflicts(
        api, workspace, [workspace.guest_one], at(MONDAY, "11:00"), at(MONDAY, "11:30")
    )
    assert status == 200
    assert back_to_back["data"]["available"] is True
    assert back_to_back["data"]["conflicts"] == []

    status, surrounding = check_conflicts(
        api, workspace, [workspace.guest_one], at(MONDAY, "09:00"), at(MONDAY, "12:00")
    )
    assert status == 200
    assert surrounding["data"]["available"] is False
    assert busy_ids(surrounding) == [str(workspace.guest_one.id)]


def test_treats_invitations_that_were_not_declined_as_busy_for_that_guest_only(api, workspace):
    Event(
        calendar_id=workspace.organizer_calendar.id,
        organizer=workspace.organizer.name,
        type="event",
        title="Release readiness",
        all_day=False,
        start_at=moment(MONDAY, "14:00"),
        end_at=moment(MONDAY, "15:00"),
        participants=[workspace.guest_one.name, workspace.guest_two.name, workspace.guest_three.name],
        participant_ids=[workspace.guest_one.id, workspace.guest_two.id, workspace.guest_three.id],
        attendee_responses=[
            AttendeeResponse(person_id=workspace.guest_one.id, status="needsAction", responded_at=None),
            AttendeeResponse(
                person_id=workspace.guest_two.id, status="tentative", responded_at=moment(MONDAY, "09:00")
            ),
            AttendeeResponse(
                person_id=workspace.guest_three.id, status="declined", responded_at=moment(MONDAY, "09:00")
            ),
        ],
    ).save()

    guests = [workspace.guest_one, workspace.guest_two, workspace.guest_three, workspace.bystander]
    status, payload = check_conflicts(api, workspace, guests, at(MONDAY, "14:15"), at(MONDAY, "14:45"))

    assert status == 200
    assert payload["data"]["available"] is False

    busy = busy_ids(payload)
    assert str(workspace.guest_one.id) in busy
    assert str(workspace.guest_two.id) in busy
    assert str(workspace.guest_three.id) not in busy
    assert str(workspace.bystander.id) not in busy


def test_treats_an_all_day_out_of_office_as_busy_while_other_all_day_items_stay_free(api, workspace):
    for title, event_type in (("Out of office", "outOfOffice"), ("Home", "workingLocation"), ("Company offsite", "event")):
        guest_event(
            workspace,
            title=title,
            type=event_type,
            all_day=True,
            start_at=moment(MONDAY, "00:00"),
            end_at=moment(TUESDAY, "00:00"),
        )

    status, payload = check_conflicts(
        api, workspace, [workspace.guest_one], at(MONDAY, "11:00"), at(MONDAY, "11:30")
    )

    assert status == 200
    assert payload["data"]["available"] is False
    assert len(payload["data"]["conflicts"][0]["busy"]) == 1
    assert payload["data"]["conflicts"][0]["busy"][0]["type"] == "outOfOffice"


def test_reports_every_occurrence_of_a_recurring_meeting_as_busy(api, workspace):
    guest_event(
        workspace,
        title="Weekly planning",
        start_at=moment(MONDAY, "10:00"),
        end_at=moment(MONDAY, "10:30"),
        recurrence=Recurrence(frequency="weekly", interval=1, end_type="count", count=5, time_zone="UTC"),
    )

    status, third = check_conflicts(
        api, workspace, [workspace.guest_one], at(THIRD_WEEK, "10:00"), at(THIRD_WEEK, "10:30")
    )
    assert status == 200
    assert third["data"]["available"] is False
    assert len(third["data"]["conflicts"][0]["busy"]) == 1

    status, day_after = check_conflicts(
        api, workspace, [workspace.guest_one], at(DAY_AFTER_THIRD_WEEK, "10:00"), at(DAY_AFTER_THIRD_WEEK, "10:30")
    )
    assert status == 200
    assert day_after["data"]["available"] is True


def test_clips_each_reported_busy_block_to_the_proposed_meeting_window(api, workspace):
    guest_event(
        workspace,
        title="Out of office",
        type="outOfOffice",
        all_day=True,
        start_at=moment(MONDAY, "00:00"),
        end_at=moment(TUESDAY, "00:00"),
    )

    status, payload = check_conflicts(
        api, workspace, [workspace.guest_one], at(MONDAY, "11:00"), at(MONDAY, "11:30")
    )

    assert status == 200

    block = payload["data"]["conflicts"][0]["busy"][0]
    assert block["startAt"] == at(MONDAY, "11:00")
    assert block["endAt"] == at(MONDAY, "11:30")


def test_never_suggests_a_time_when_the_organizer_or_a_guest_is_already_busy(api, workspace):
    Event(
        calendar_id=workspace.organizer_calendar.id,
        organizer=workspace.organizer.name,
        type="event",
        title="Metrics review",
        all_day=False,
        start_at=moment("2029-12-17", "10:00"),
        end_at=moment("2029-12-17", "11:00"),
        recurrence=Recurrence(frequency="weekly", interval=1, end_type="count", count=8, time_zone="UTC"),
    ).save()
    guest_event(
        workspace, title="Focus time", start_at=moment(MONDAY, "09:00"), end_at=moment(MONDAY, "09:30")
    )

    status, payload = suggest_times(api, workspace, [workspace.guest_one])

    assert status == 200
    assert len(payload["data"]["owner"]["busy"]) == 1

    starts = [suggestion["startAt"] for suggestion in payload["data"]["suggestions"]]
    assert at(MONDAY, "11:30") in starts
    assert at(MONDAY, "10:00") not in starts
    assert at(MONDAY, "10:30") not in starts
    assert at(MONDAY, "09:00") not in starts
