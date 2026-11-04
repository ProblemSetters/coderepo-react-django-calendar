from tests.support import event_body


def test_finds_my_events_by_title_and_never_shows_events_i_cannot_see(alex, jordan, calendars):
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Quarterly planning"))
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Hiring sync"))
    jordan.post("/api/v1/events", event_body(calendars.jordan_primary, title="Quarterly budget"))

    response = alex.get(f"/api/v1/events/search?q=quarterly&calendarIds={calendars.alex_primary.id},{calendars.alex_work.id}")

    assert response.status_code == 200
    assert [event["title"] for event in response.json()["data"]] == ["Quarterly planning"]


def test_finds_people_by_name_or_email_leaving_out_the_person_searching(alex):
    by_name = alex.get("/api/v1/people?q=jor")
    by_email = alex.get("/api/v1/people?q=taylor@calendar")
    own = alex.get("/api/v1/people?q=alex")

    assert [person["name"] for person in by_name.json()["data"]] == ["Jordan Smith"]
    assert [person["name"] for person in by_email.json()["data"]] == ["Taylor Johnson"]
    assert own.json()["data"] == []


def test_narrows_a_search_by_place_and_dates_leaves_out_excluded_words_and_finds_a_repeat_inside_the_dates(alex, calendars):
    def at(day, hour):
        return {"startAt": f"2030-06-{day}T{hour}:00:00.000Z", "endAt": f"2030-06-{day}T{hour}:30:00.000Z"}

    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Roadmap review", location="Room 4", **at("04", 10)))
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Roadmap review draft", location="Room 4", **at("05", 10)))
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Roadmap review", location="Online", **at("06", 10)))
    alex.post("/api/v1/events", event_body(calendars.alex_work, title="Roadmap review", location="Room 4", **at("20", 10)))
    alex.post(
        "/api/v1/events",
        event_body(
            calendars.alex_work,
            title="Roadmap sync",
            location="Room 4",
            startAt="2030-05-06T09:00:00.000Z",
            endAt="2030-05-06T09:30:00.000Z",
            recurrence={"frequency": "weekly", "daysOfWeek": [1], "endType": "never", "timeZone": "UTC"},
        ),
    )

    response = alex.get(
        "/api/v1/events/search?q=roadmap&where=room%204&exclude=draft&from=2030-06-01T00:00:00.000Z&to=2030-06-08T00:00:00.000Z"
        f"&calendarIds={calendars.alex_primary.id},{calendars.alex_work.id}"
    )

    assert response.status_code == 200
    assert sorted([event["title"], event["startAt"]] for event in response.json()["data"]) == [
        ["Roadmap review", "2030-06-04T10:00:00.000Z"],
        ["Roadmap sync", "2030-06-03T09:00:00.000Z"],
    ]
