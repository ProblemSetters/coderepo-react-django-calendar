import os
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import bcrypt
import pytest
from dotenv import load_dotenv

DEFAULT_URI = "mongodb://localhost:27017/calendar_db"
PING_TIMEOUT_MS = 3000
# The app hashes with its own cost. Tests only need a valid hash, so they use the cheapest one.
TEST_HASH_ROUNDS = 4

# Filled in by pytest_configure: the test database's name and URI.
run = SimpleNamespace(database="", uri="")


def with_database(uri, database):
    parts = urlsplit(uri)
    return urlunsplit(parts._replace(path=f"/{database}"))


def pytest_configure(config):
    # Runs before Django loads, so settings.py connects to <app database>_test and never to the app's own.
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    app_uri = os.environ.get("MONGODB_URI", DEFAULT_URI)
    app_database = urlsplit(app_uri).path.lstrip("/") or "calendar_db"
    run.database = f"{app_database}_test"
    run.uri = with_database(app_uri, run.database)
    os.environ["MONGODB_URI"] = run.uri
    os.environ.setdefault("JWT_SECRET", "calendar-test-secret")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "calendar_backend.settings")

    import django

    django.setup()


def declared_models():
    from apps.auth.models import WorkspaceAccount
    from apps.calendars.models import Calendar
    from apps.events.models import Event
    from apps.people.models import Person

    return [WorkspaceAccount, Person, Calendar, Event]


def pytest_sessionstart(session):
    import mongoengine
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError

    try:
        MongoClient(run.uri, serverSelectionTimeoutMS=PING_TIMEOUT_MS).admin.command("ping")
    except PyMongoError:
        pytest.exit(
            f"The tests need MongoDB at {run.uri}, and it did not answer. Click Install or Run to start it, then run the tests again.",
            1,
        )
    # Every run starts from an empty test database.
    mongoengine.get_connection().drop_database(run.database)
    # Builds every declared index before a test relies on it, such as the unique calendar name.
    for model in declared_models():
        model.ensure_indexes()


@pytest.fixture(autouse=True)
def reset_database():
    for model in declared_models():
        model.objects.delete()


def create_profile(name, email, sort_order):
    from apps.people.models import Person, WorkingHours

    return Person(
        name=name,
        email=email,
        avatar_color="#1a73e8",
        is_profile=True,
        sort_order=sort_order,
        time_zone="UTC",
        working_hours=WorkingHours(start_minute=9 * 60, end_minute=17 * 60),
    ).save()


def create_account(profile):
    from apps.auth.models import WorkspaceAccount
    from tests.support import PASSWORD

    password_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(TEST_HASH_ROUNDS)).decode()
    return WorkspaceAccount(
        name=profile.name, email=profile.email, password_hash=password_hash, allowed_profile_ids=[profile.id]
    ).save()


def create_calendar(owner, name, color, is_primary=False):
    from apps.calendars.models import Calendar

    return Calendar(owner_id=owner.id, name=name, color=color, default_color=color, is_primary=is_primary).save()


@pytest.fixture
def workspace(reset_database):
    # Three people, each signing in with an account that may use only their own profile. Each owns a primary
    # calendar; Alex also owns a second one.
    alex = create_profile("Alex Morgan", "alex@calendar.test", 1)
    jordan = create_profile("Jordan Smith", "jordan@calendar.test", 2)
    taylor = create_profile("Taylor Johnson", "taylor@calendar.test", 3)
    for profile in (alex, jordan, taylor):
        create_account(profile)
    calendars = SimpleNamespace(
        alex_primary=create_calendar(alex, "Alex Morgan", "#1a73e8", is_primary=True),
        alex_work=create_calendar(alex, "Work", "#0b8043"),
        jordan_primary=create_calendar(jordan, "Jordan Smith", "#8e24aa", is_primary=True),
        taylor_primary=create_calendar(taylor, "Taylor Johnson", "#e67c73", is_primary=True),
    )
    return SimpleNamespace(people=SimpleNamespace(alex=alex, jordan=jordan, taylor=taylor), calendars=calendars)


@pytest.fixture
def people(workspace):
    return workspace.people


@pytest.fixture
def calendars(workspace):
    return workspace.calendars


@pytest.fixture
def alex(people):
    from tests.support import ApiClient, sign_in

    return ApiClient(sign_in(people.alex))


@pytest.fixture
def jordan(people):
    from tests.support import ApiClient, sign_in

    return ApiClient(sign_in(people.jordan))


@pytest.fixture
def taylor(people):
    from tests.support import ApiClient, sign_in

    return ApiClient(sign_in(people.taylor))
