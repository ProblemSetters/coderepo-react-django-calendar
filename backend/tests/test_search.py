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
