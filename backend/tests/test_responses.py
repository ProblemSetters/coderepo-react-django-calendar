from tests.support import WEEKLY, error_code, event_body


def invite_jordan(alex, calendars, people, **overrides):
    response = alex.post(
        "/api/v1/events", event_body(calendars.alex_work, participantIds=[str(people.jordan.id)], **overrides)
    )
    return response.json()["data"]["_id"]


def test_an_invited_guest_answers_and_the_summary_counts_it_while_anyone_else_is_refused(alex, jordan, calendars, people):
    event_id = invite_jordan(alex, calendars, people)

    answered = jordan.patch(f"/api/v1/events/{event_id}/response", {"status": "accepted"})
    organizer = alex.patch(f"/api/v1/events/{event_id}/response", {"status": "accepted"})

    assert answered.status_code == 200
    assert answered.json()["data"]["responseSummary"] == {"needsAction": 0, "accepted": 1, "declined": 0, "tentative": 0}
    assert organizer.status_code == 403
    assert error_code(organizer) == "NOT_EVENT_ATTENDEE"


def test_an_answer_for_one_occurrence_of_a_repeat_changes_only_that_occurrence(alex, jordan, calendars, people):
    event_id = invite_jordan(alex, calendars, people, recurrence=WEEKLY)

    answered = jordan.patch(
        f"/api/v1/events/{event_id}/response",
        {"status": "declined", "scope": "this", "occurrenceStartAt": "2030-06-10T10:00:00.000Z"},
    )
    listed = jordan.get("/api/v1/events?from=2030-06-01T00:00:00.000Z&to=2030-06-20T00:00:00.000Z")

    assert answered.status_code == 200
    assert [[event["startAt"], event["responseStatus"]] for event in listed.json()["data"]] == [
        ["2030-06-03T10:00:00.000Z", "needsAction"],
        ["2030-06-10T10:00:00.000Z", "declined"],
        ["2030-06-17T10:00:00.000Z", "needsAction"],
    ]


def test_rejects_occurrence_choices_that_do_not_fit_the_event(alex, jordan, calendars, people):
    single_id = invite_jordan(alex, calendars, people)
    repeat_id = invite_jordan(alex, calendars, people, title="Weekly sync", recurrence=WEEKLY)

    on_single = jordan.patch(
        f"/api/v1/events/{single_id}/response",
        {"status": "accepted", "scope": "this", "occurrenceStartAt": "2030-06-03T10:00:00.000Z"},
    )
    no_occurrence = jordan.patch(f"/api/v1/events/{repeat_id}/response", {"status": "accepted", "scope": "this"})
    not_in_series = jordan.patch(
        f"/api/v1/events/{repeat_id}/response",
        {"status": "accepted", "scope": "this", "occurrenceStartAt": "2030-06-11T10:00:00.000Z"},
    )

    assert [on_single.status_code, error_code(on_single)] == [400, "NOT_RECURRING"]
    assert [no_occurrence.status_code, error_code(no_occurrence)] == [400, "OCCURRENCE_REQUIRED"]
    assert [not_in_series.status_code, error_code(not_in_series)] == [400, "INVALID_OCCURRENCE"]
