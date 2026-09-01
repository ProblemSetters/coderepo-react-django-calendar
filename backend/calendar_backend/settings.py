import os
from pathlib import Path

import mongoengine
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "calendar-django-development-key")
DEBUG = os.getenv("NODE_ENV", "development") == "development"
ALLOWED_HOSTS = ["*"]

JWT_SECRET = os.getenv("JWT_SECRET", "calendar-secret-jwt-key-2026")
JWT_EXPIRES_IN = os.getenv("JWT_EXPIRES_IN", "24h")
JWT_ISSUER = "calendar-api"
JWT_AUDIENCE = "calendar-assessment"

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/calendar_db")
IS_TEST_RUN = os.getenv("CALENDAR_TEST_DB") == "1"


def build_mongodb_uri(uri, is_test):
    if not is_test:
        return uri

    marker = uri.find("?")

    if marker == -1:
        return f"{uri}_test"

    return f"{uri[:marker]}_test{uri[marker:]}"


mongoengine.connect(host=build_mongodb_uri(MONGODB_URI, IS_TEST_RUN), uuidRepresentation="standard")

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

CORS_ALLOW_ALL_ORIGINS = True

ROOT_URLCONF = "calendar_backend.urls"

DATABASES = {}

TEMPLATES = []

REST_FRAMEWORK = {
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "apps.shared.errors.api_exception_handler",
    "DEFAULT_RENDERER_CLASSES": ["apps.shared.rendering.ApiRenderer"],
}

USE_TZ = True
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
