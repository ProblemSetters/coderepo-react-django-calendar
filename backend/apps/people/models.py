from mongoengine import (
    BooleanField,
    DateTimeField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    IntField,
    StringField,
)

from apps.shared.documents import TimestampedDocument

DEFAULT_START_MINUTE = 540
DEFAULT_END_MINUTE = 1020
LAST_MINUTE_OF_DAY = 1439
MINUTES_PER_DAY = 1440


class BusyBlock(EmbeddedDocument):
    title = StringField(default="Busy", max_length=140)
    start_at = DateTimeField(db_field="startAt", required=True)
    end_at = DateTimeField(db_field="endAt", required=True)


class WorkingHours(EmbeddedDocument):
    start_minute = IntField(db_field="startMinute", min_value=0, max_value=LAST_MINUTE_OF_DAY, default=DEFAULT_START_MINUTE)
    end_minute = IntField(db_field="endMinute", min_value=1, max_value=MINUTES_PER_DAY, default=DEFAULT_END_MINUTE)


class Person(TimestampedDocument):
    meta = {
        "collection": "people",
        "indexes": [
            {"fields": ["email"], "unique": True, "name": "email_unique_idx"},
            {"fields": ["name"], "name": "name_idx"},
            {"fields": ["is_profile"], "name": "is_profile_idx"},
        ],
    }

    name = StringField(required=True, max_length=120)
    email = StringField(required=True, max_length=254)
    avatar_color = StringField(db_field="avatarColor", required=True, regex=r"^#[0-9A-Fa-f]{6}$")
    is_profile = BooleanField(db_field="isProfile", default=False)
    headline = StringField(default="", max_length=120)
    sort_order = IntField(db_field="sortOrder", default=0)
    time_zone = StringField(db_field="timeZone", default="UTC", max_length=100)
    working_hours = EmbeddedDocumentField(WorkingHours, db_field="workingHours", default=WorkingHours)
    busy_blocks = EmbeddedDocumentListField(BusyBlock, db_field="busyBlocks", default=list)
