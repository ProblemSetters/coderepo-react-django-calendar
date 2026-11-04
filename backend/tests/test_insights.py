from tests.support import event_body, matches

DAY = "from=2030-06-03T00:00:00.000Z&to=2030-06-04T00:00:00.000Z"


def minutes_by(insight):
    return {category["key"]: category["minutes"] for category in insight["categories"]}


def test_adds_up_the_days_meetings_focus_time_and_tasks_against_an_eight_hour_day(alex, calendars):
    def add(**overrides):
        return alex.post("/api/v1/events", event_body(calendars.alex_work, **overrides))

    add(title="Design review", type="event", startAt="2030-06-03T10:00:00.000Z", endAt="2030-06-03T11:00:00.000Z")
    add(title="Deep work", type="focusTime", startAt="2030-06-03T13:00:00.000Z", endAt="2030-06-03T15:00:00.000Z")
    add(title="Send notes", type="task", startAt="2030-06-03T16:00:00.000Z", endAt="2030-06-03T16:30:00.000Z")

    response = alex.get(f"/api/v1/insights/daily?{DAY}")
    insight = response.json()["data"]

    assert response.status_code == 200
    assert matches(insight, {"meetingMinutes": 60, "meetingCount": 1, "totalScheduledMinutes": 210, "remainingMinutes": 270})
    assert minutes_by(insight) == {"meetings": 60, "focus": 120, "tasks": 30, "outOfOffice": 0}


def test_counts_an_all_day_out_of_office_as_a_full_working_day_and_other_all_day_events_as_nothing(alex, calendars):
    alex.post(
        "/api/v1/events",
        event_body(calendars.alex_work, title="Holiday", type="outOfOffice", allDay=True, startAt="2030-06-03T00:00:00.000Z", endAt="2030-06-04T00:00:00.000Z"),
    )
    alex.post(
        "/api/v1/events",
        event_body(calendars.alex_work, title="Conference", type="event", allDay=True, startAt="2030-06-03T00:00:00.000Z", endAt="2030-06-04T00:00:00.000Z"),
    )

    insight = alex.get(f"/api/v1/insights/daily?{DAY}").json()["data"]

    assert minutes_by(insight) == {"meetings": 0, "focus": 0, "tasks": 0, "outOfOffice": 480}
    assert insight["remainingMinutes"] == 0
