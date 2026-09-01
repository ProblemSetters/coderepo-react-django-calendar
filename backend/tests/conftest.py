import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("CALENDAR_TEST_DB", "1")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "calendar_backend.settings")

import django

django.setup()

import bcrypt
import pytest
from django.test import Client

from apps.auth.models import WorkspaceAccount
from apps.calendars.models import Calendar
from apps.events.models import Event
from apps.people.models import Person

DEMO_PASSWORD = "password123"
TEST_PASSWORD_ROUNDS = 4
PROFILE_ROWS = [
    {"name": "Alex Morgan", "email": "alex.morgan@calendar.com", "avatar_color": "#039be5", "sort_order": 1},
    {"name": "Jordan Smith", "email": "jordan.smith@calendar.com", "avatar_color": "#e37400", "sort_order": 2},
    {"name": "Taylor Johnson", "email": "taylor.johnson@calendar.com", "avatar_color": "#d93025", "sort_order": 3},
    {"name": "Riley Parker", "email": "riley.parker@calendar.com", "avatar_color": "#7e57c2", "sort_order": 4},
    {"name": "Casey Bennett", "email": "casey.bennett@calendar.com", "avatar_color": "#0f9d58", "sort_order": 5},
]


class ApiClient:
    def __init__(self):
        self.client = Client()

    def request(self, method, path, body=None, token=None):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
        response = getattr(self.client, method)(
            path,
            data=None if body is None else json.dumps(body),
            content_type="application/json",
            **headers,
        )

        try:
            payload = response.json()
        except ValueError:
            payload = {}

        return response.status_code, payload

    def get(self, path, token=None):
        return self.request("get", path, None, token)

    def post(self, path, body=None, token=None):
        return self.request("post", path, body or {}, token)


class Workspace:
    def __init__(self, people, calendars, token):
        self.organizer, self.guest_one, self.guest_two, self.guest_three, self.bystander = people
        self.organizer_calendar, self.guest_calendar = calendars
        self.token = token


@pytest.fixture
def api():
    for model in (Calendar, Event, Person, WorkspaceAccount):
        model.objects.delete()

    return ApiClient()


@pytest.fixture
def workspace(api):
    people = [Person(is_profile=True, **row).save() for row in PROFILE_ROWS]
    calendars = [
        Calendar(
            owner_id=people[0].id, name="My calendar", color="#039be5", default_color="#039be5", is_primary=True
        ).save(),
        Calendar(
            owner_id=people[1].id, name="My calendar", color="#e37400", default_color="#e37400", is_primary=True
        ).save(),
    ]
    WorkspaceAccount(
        name=people[0].name,
        email=people[0].email,
        password_hash=bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(TEST_PASSWORD_ROUNDS)).decode(),
        allowed_profile_ids=[person.id for person in people],
    ).save()

    status, login = api.post("/api/v1/auth/login", {"email": people[0].email, "password": DEMO_PASSWORD})
    assert status == 200

    status, switched = api.post(
        "/api/v1/auth/switch-profile", {"profileId": str(people[0].id)}, login["data"]["token"]
    )
    assert status == 200

    return Workspace(people, calendars, switched["data"]["token"])
