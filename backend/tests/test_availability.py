from tests.support import error_code, event_body, matches


def conflicts_for(alex, people, start_at, end_at):
    return alex.post(
        "/api/v1/availability/conflicts",
        {"participantIds": [str(people.jordan.id)], "startAt": start_at, "endAt": end_at, "timeZone": "UTC"},
    )


def suggestions(alex, people, **overrides):
    return alex.post(
        "/api/v1/availability/suggestions",
        {
            "participantIds": [str(people.jordan.id)],
            "from": "2030-06-03",
            "timeZone": "UTC",
            "days": 1,
            "durationMinutes": 60,
            **overrides,
        },
    )


def busy_titles(response):
    return [[conflict["person"]["name"], [block["title"] for block in conflict["busy"]]] for conflict in response.json()["data"]["conflicts"]]


def test_marks_a_time_busy_when_a_guest_has_their_own_event_or_an_invitation_then_but_not_a_declined_one(alex, jordan, taylor, calendars, people):
    def invite_jordan(**overrides):
        return taylor.post(
            "/api/v1/events", event_body(calendars.taylor_primary, participantIds=[str(people.jordan.id)], **overrides)
        )

    jordan.post("/api/v1/events", event_body(calendars.jordan_primary, title="Dentist"))
    invite_jordan(title="Planning", startAt="2030-06-03T13:00:00.000Z", endAt="2030-06-03T14:00:00.000Z")
    declined = invite_jordan(title="Optional demo", startAt="2030-06-03T15:00:00.000Z", endAt="2030-06-03T16:00:00.000Z")
    jordan.patch(f"/api/v1/events/{declined.json()['data']['_id']}/response", {"status": "declined"})

    own_event = conflicts_for(alex, people, "2030-06-03T10:00:00.000Z", "2030-06-03T11:00:00.000Z")
    invited = conflicts_for(alex, people, "2030-06-03T13:00:00.000Z", "2030-06-03T14:00:00.000Z")
    declined_slot = conflicts_for(alex, people, "2030-06-03T15:00:00.000Z", "2030-06-03T16:00:00.000Z")
    late = conflicts_for(alex, people, "2030-06-03T20:00:00.000Z", "2030-06-03T21:00:00.000Z")

    assert busy_titles(own_event) == [["Jordan Smith", ["Dentist"]]]
    assert busy_titles(invited) == [["Jordan Smith", ["Planning"]]]
    assert matches(declined_slot.json()["data"], {"available": True, "withinWorkingHours": True})
    assert matches(late.json()["data"], {"available": True, "withinWorkingHours": False})


def test_suggests_times_inside_everyones_working_hours_that_avoid_their_events(alex, jordan, calendars, people):
    jordan.post(
        "/api/v1/events",
        event_body(calendars.jordan_primary, title="Workshop", startAt="2030-06-03T09:00:00.000Z", endAt="2030-06-03T12:00:00.000Z"),
    )

    response = suggestions(alex, people)
    slots = response.json()["data"]["suggestions"]

    assert response.status_code == 200
    assert len(slots) > 0
    assert slots[0]["startAt"] == "2030-06-03T12:00:00.000Z"
    for slot in slots:
        assert slot["startAt"] >= "2030-06-03T12:00:00.000Z"
        assert slot["endAt"] <= "2030-06-03T17:00:00.000Z"


def test_checks_the_rules_for_a_suggestion_request(alex, people):
    odd_duration = suggestions(alex, people, durationMinutes=20)
    too_many_days = suggestions(alex, people, days=15)
    same_person_twice = suggestions(alex, people, participantIds=[str(people.jordan.id), str(people.jordan.id)])

    for response in (odd_duration, too_many_days, same_person_twice):
        assert [response.status_code, error_code(response)] == [400, "VALIDATION_ERROR"]
