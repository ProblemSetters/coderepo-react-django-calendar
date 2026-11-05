from tests.support import WEEKLY, error_code, event_body, matches


def inviting_jordan(calendars, people, **overrides):
    return event_body(calendars.alex_work, participantIds=[str(people.jordan.id)], **overrides)


def test_creates_an_event_in_my_calendar_with_its_guests(alex, calendars, people):
    response = alex.post("/api/v1/events", inviting_jordan(calendars, people))

    assert response.status_code == 201
    assert matches(
        response.json()["data"],
        {
            "title": "Design review",
            "organizerPerson": {"name": "Alex Morgan"},
            "participantPeople": [{"name": "Jordan Smith", "responseStatus": "needsAction"}],
            "responseSummary": {"needsAction": 1, "accepted": 0, "declined": 0, "tentative": 0},
        },
    )


def test_refuses_an_event_that_ends_before_it_starts_a_repeat_that_ends_before_it_starts_and_a_bad_body(alex, calendars):
    backwards = alex.post("/api/v1/events", event_body(calendars.alex_work, endAt="2030-06-03T09:00:00.000Z"))
    repeat_ends_early = alex.post(
        "/api/v1/events",
        event_body(calendars.alex_work, recurrence={**WEEKLY, "endType": "until", "until": "2030-06-01T00:00:00.000Z"}),
    )
    no_title = alex.post("/api/v1/events", event_body(calendars.alex_work, title=""))

    assert [backwards.status_code, error_code(backwards)] == [400, "INVALID_EVENT_RANGE"]
    assert [repeat_ends_early.status_code, error_code(repeat_ends_early)] == [400, "INVALID_RECURRENCE_END"]
    assert [no_title.status_code, error_code(no_title)] == [400, "VALIDATION_ERROR"]


def test_refuses_to_add_an_event_to_a_calendar_i_do_not_own(alex, calendars):
    response = alex.post("/api/v1/events", event_body(calendars.jordan_primary))

    assert response.status_code == 422
    assert error_code(response) == "INVALID_CALENDAR"


def test_lists_single_events_and_every_occurrence_of_a_weekly_repeat_inside_the_range(alex, calendars):
    alex.post(
        "/api/v1/events",
        event_body(calendars.alex_work, title="Launch", startAt="2030-06-05T15:00:00.000Z", endAt="2030-06-05T16:00:00.000Z"),
    )
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Standup", recurrence=WEEKLY))
    alex.post(
        "/api/v1/events",
        event_body(calendars.alex_work, title="Retro", startAt="2030-07-01T10:00:00.000Z", endAt="2030-07-01T11:00:00.000Z"),
    )

    response = alex.get(
        f"/api/v1/events?from=2030-06-01T00:00:00.000Z&to=2030-06-15T00:00:00.000Z&calendarIds={calendars.alex_work.id}"
    )

    assert response.status_code == 200
    assert [[event["title"], event["startAt"]] for event in response.json()["data"]] == [
        ["Standup", "2030-06-03T10:00:00.000Z"],
        ["Launch", "2030-06-05T15:00:00.000Z"],
        ["Standup", "2030-06-10T10:00:00.000Z"],
    ]


def test_lets_an_invited_guest_open_an_event_but_not_change_it_and_hides_it_from_everyone_else(alex, jordan, taylor, calendars, people):
    created = alex.post("/api/v1/events", inviting_jordan(calendars, people))
    path = f"/api/v1/events/{created.json()['data']['_id']}"

    guest_opens = jordan.get(path)
    guest_edits = jordan.patch(path, {"title": "Moved by a guest"})
    guest_deletes = jordan.delete(path)
    stranger_opens = taylor.get(path)

    assert guest_opens.status_code == 200
    assert guest_opens.json()["data"]["editable"] is False
    assert guest_edits.status_code == 404
    assert guest_deletes.status_code == 404
    assert stranger_opens.status_code == 404
    assert error_code(stranger_opens) == "EVENT_NOT_FOUND"


def test_resets_every_guests_answer_when_the_time_moves_but_keeps_it_when_only_the_title_changes(alex, jordan, calendars, people):
    created = alex.post("/api/v1/events", inviting_jordan(calendars, people))
    path = f"/api/v1/events/{created.json()['data']['_id']}"
    jordan.patch(f"{path}/response", {"status": "accepted"})

    alex.patch(path, {"title": "Design review (room change)"})
    after_rename = jordan.get(path)
    alex.patch(path, {"startAt": "2030-06-03T14:00:00.000Z", "endAt": "2030-06-03T15:00:00.000Z"})
    after_move = jordan.get(path)

    assert after_rename.json()["data"]["responseStatus"] == "accepted"
    assert after_move.json()["data"]["responseStatus"] == "needsAction"


def test_deletes_an_event_and_treats_a_malformed_id_as_not_found(alex, calendars):
    created = alex.post("/api/v1/events", event_body(calendars.alex_work))
    path = f"/api/v1/events/{created.json()['data']['_id']}"

    deleted = alex.delete(path)
    after_delete = alex.get(path)
    malformed = alex.get("/api/v1/events/not-an-id")

    assert deleted.status_code == 204
    assert after_delete.status_code == 404
    assert [malformed.status_code, error_code(malformed)] == [404, "EVENT_NOT_FOUND"]


def test_keeps_answers_when_a_guest_is_added_shuts_out_a_removed_guest_and_resets_answers_when_the_repeat_rule_changes(alex, jordan, taylor, calendars, people):
    created = alex.post("/api/v1/events", inviting_jordan(calendars, people, recurrence=WEEKLY))
    path = f"/api/v1/events/{created.json()['data']['_id']}"
    jordan.patch(f"{path}/response", {"status": "accepted"})

    # The editor always sends the guest names and their ids together, so the test does the same.
    def guests(*guest_people):
        return {"participants": [person.name for person in guest_people], "participantIds": [str(person.id) for person in guest_people]}

    added = alex.patch(path, guests(people.jordan, people.taylor))
    taylor.patch(f"{path}/response", {"status": "accepted"})
    removed = alex.patch(path, guests(people.taylor))
    removed_guest_opens = jordan.get(path)
    alex.patch(path, {"recurrence": {**WEEKLY, "daysOfWeek": [1, 3]}})
    after_rule_change = taylor.get(path)

    assert [[guest["name"], guest["responseStatus"]] for guest in added.json()["data"]["participantPeople"]] == [["Jordan Smith", "accepted"], ["Taylor Johnson", "needsAction"]]
    assert [[guest["name"], guest["responseStatus"]] for guest in removed.json()["data"]["participantPeople"]] == [["Taylor Johnson", "accepted"]]
    assert removed_guest_opens.status_code == 404
    assert after_rule_change.json()["data"]["responseStatus"] == "needsAction"


def test_refuses_a_guest_id_that_is_malformed_unknown_or_listed_twice(alex, calendars, people):
    jordan_id = str(people.jordan.id)
    malformed = alex.post("/api/v1/events", event_body(calendars.alex_work, participantIds=["not-an-id"]))
    unknown = alex.post("/api/v1/events", event_body(calendars.alex_work, participantIds=["0123456789abcdef01234567"]))
    twice = alex.post("/api/v1/events", event_body(calendars.alex_work, participantIds=[jordan_id, jordan_id]))

    assert [malformed.status_code, error_code(malformed)] == [400, "VALIDATION_ERROR"]
    assert [unknown.status_code, error_code(unknown)] == [404, "PEOPLE_NOT_FOUND"]
    assert [twice.status_code, error_code(twice)] == [400, "VALIDATION_ERROR"]
