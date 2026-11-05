from django.test import Client

from apps.auth.models import WorkspaceAccount

PASSWORD = "Calendar#2026"
WEEKLY = {"frequency": "weekly", "interval": 1, "daysOfWeek": [1], "endType": "never", "timeZone": "UTC"}


class ApiClient:
    """A Django test client that sends JSON, with the bearer token when it has one."""

    def __init__(self, token=None):
        self.client = Client()
        self.extra = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}

    def get(self, path):
        return self.client.get(path, **self.extra)

    def post(self, path, body=None):
        return self.client.post(path, {} if body is None else body, content_type="application/json", **self.extra)

    def patch(self, path, body=None):
        return self.client.patch(path, {} if body is None else body, content_type="application/json", **self.extra)

    def delete(self, path):
        return self.client.delete(path, **self.extra)


def sign_in_workspace(person):
    response = ApiClient().post("/api/v1/auth/login", {"email": person.email, "password": PASSWORD})
    return response.json()["data"]["token"]


def sign_in(person):
    """Signs in and picks the person's own profile, like the sign-in screen does."""
    workspace_token = sign_in_workspace(person)
    response = ApiClient(workspace_token).post("/api/v1/auth/switch-profile", {"profileId": str(person.id)})
    return response.json()["data"]["token"]


def event_body(calendar, **overrides):
    return {
        "calendarId": str(calendar.id),
        "title": "Design review",
        "startAt": "2030-06-03T10:00:00.000Z",
        "endAt": "2030-06-03T11:00:00.000Z",
        **overrides,
    }


def error_code(response):
    return (response.json().get("error") or {}).get("code")


def matches(actual, expected):
    """True when actual holds every field of expected, like Jest's toMatchObject."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(key in actual and matches(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and all(matches(a, e) for a, e in zip(actual, expected))
    return actual == expected


# Change an account behind the app's back, the way an admin taking access away would.
def revoke_profile_access(person):
    WorkspaceAccount.objects(email=person.email).update_one(set__allowed_profile_ids=[])


def deactivate_account(person):
    WorkspaceAccount.objects(email=person.email).update_one(set__active=False)
