from tests.support import error_code, event_body


def repeating(calendars, **overrides):
    return event_body(calendars.alex_work, recurrence={"frequency": "weekly", "daysOfWeek": [1], "endType": "never", "timeZone": "UTC", **overrides})


def test_refuses_bad_colours_time_zones_and_repeat_settings_empty_updates_and_over_long_ranges_and_saves_nothing(alex, calendars):
    saved = alex.post("/api/v1/events", event_body(calendars.alex_work))
    event_path = f"/api/v1/events/{saved.json()['data']['_id']}"

    attempts = {
        "eventColour": alex.post("/api/v1/events", event_body(calendars.alex_work, color="#12345")),
        "weeklyWithoutDays": alex.post("/api/v1/events", repeating(calendars, daysOfWeek=[])),
        "countWithoutNumber": alex.post("/api/v1/events", repeating(calendars, endType="count")),
        "untilWithoutDate": alex.post("/api/v1/events", repeating(calendars, endType="until")),
        "repeatTimeZone": alex.post("/api/v1/events", repeating(calendars, timeZone="Mars/Olympus")),
        "emptyEventUpdate": alex.patch(event_path, {}),
        "rangeOverLimit": alex.get(f"/api/v1/events?from=2030-01-01T00:00:00.000Z&to=2031-01-10T00:00:00.000Z&calendarIds={calendars.alex_work.id}"),
        "calendarColour": alex.post("/api/v1/calendars", {"name": "Side projects", "color": "green"}),
        "calendarTimeZone": alex.post("/api/v1/calendars", {"name": "Side projects", "color": "#0b8043", "timeZone": "Mars/Olympus"}),
        "emptyCalendarUpdate": alex.patch(f"/api/v1/calendars/{calendars.alex_work.id}", {}),
    }
    events = alex.get(f"/api/v1/events?from=2030-06-01T00:00:00.000Z&to=2030-07-01T00:00:00.000Z&calendarIds={calendars.alex_work.id}")
    my_calendars = alex.get("/api/v1/calendars")

    outcome = {name: [response.status_code, error_code(response)] for name, response in attempts.items()}
    assert outcome == {name: [400, "VALIDATION_ERROR"] for name in attempts}
    assert [event["title"] for event in events.json()["data"]] == ["Design review"]
    assert [calendar["name"] for calendar in my_calendars.json()["data"]] == ["Alex Morgan", "Work"]
