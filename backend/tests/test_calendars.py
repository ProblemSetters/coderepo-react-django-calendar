from concurrent.futures import ThreadPoolExecutor

from apps.calendars.models import Calendar
from tests.support import ApiClient, error_code, event_body, matches, sign_in


def test_lists_only_the_signed_in_profiles_calendars_primary_first(alex):
    response = alex.get("/api/v1/calendars")

    assert response.status_code == 200
    assert [[calendar["name"], calendar["isPrimary"]] for calendar in response.json()["data"]] == [
        ["Alex Morgan", True],
        ["Work", False],
    ]


def test_creates_renames_and_recolours_a_calendar_and_refuses_a_name_already_in_use(alex):
    created = alex.post("/api/v1/calendars", {"name": "Projects", "color": "#f4511e"})
    renamed = alex.patch(f"/api/v1/calendars/{created.json()['data']['_id']}", {"name": "Roadmap", "color": "#039be5"})
    duplicate = alex.post("/api/v1/calendars", {"name": "work", "color": "#f4511e"})

    assert created.status_code == 201
    assert renamed.status_code == 200
    assert matches(renamed.json()["data"], {"name": "Roadmap", "color": "#039be5"})
    assert duplicate.status_code == 409
    assert error_code(duplicate) == "CALENDAR_NAME_CONFLICT"


def test_keeps_one_calendar_when_the_same_name_is_created_twice_at_once(people):
    token = sign_in(people.alex)

    def create_launch():
        return ApiClient(token).post("/api/v1/calendars", {"name": "Launch", "color": "#f4511e"})

    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = [pool.submit(create_launch), pool.submit(create_launch)]
        responses = [future.result() for future in pending]

    assert sorted(response.status_code for response in responses) == [201, 409]
    assert Calendar.objects(owner_id=people.alex.id, name="Launch").count() == 1


def test_shows_only_the_chosen_calendar_when_asked_to_display_it_alone(alex, calendars):
    response = alex.post(f"/api/v1/calendars/{calendars.alex_work.id}/display-only")

    assert response.status_code == 200
    assert [[calendar["name"], calendar["visible"]] for calendar in response.json()["data"]] == [
        ["Alex Morgan", False],
        ["Work", True],
    ]


def test_never_deletes_the_primary_calendar_or_one_that_still_has_events(alex, calendars):
    primary = alex.delete(f"/api/v1/calendars/{calendars.alex_primary.id}")
    event = alex.post("/api/v1/events", event_body(calendars.alex_work))
    with_events = alex.delete(f"/api/v1/calendars/{calendars.alex_work.id}")
    alex.delete(f"/api/v1/events/{event.json()['data']['_id']}")
    empty = alex.delete(f"/api/v1/calendars/{calendars.alex_work.id}")

    assert primary.status_code == 409
    assert error_code(primary) == "PRIMARY_CALENDAR"
    assert with_events.status_code == 409
    assert error_code(with_events) == "CALENDAR_NOT_EMPTY"
    assert empty.status_code == 204


def test_keeps_my_calendars_away_from_other_profiles(jordan, calendars):
    listed = jordan.get("/api/v1/calendars")
    renamed = jordan.patch(f"/api/v1/calendars/{calendars.alex_work.id}", {"name": "Mine now"})
    deleted = jordan.delete(f"/api/v1/calendars/{calendars.alex_work.id}")

    assert [calendar["name"] for calendar in listed.json()["data"]] == ["Jordan Smith"]
    assert renamed.status_code == 404
    assert deleted.status_code == 404
    assert error_code(deleted) == "CALENDAR_NOT_FOUND"
