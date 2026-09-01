from mongoengine import BooleanField, ObjectIdField, StringField

from apps.shared.documents import TimestampedDocument

COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"


class Calendar(TimestampedDocument):
    meta = {
        "collection": "calendars",
        "indexes": [
            {"fields": ["owner_id"], "name": "owner_id_idx"},
            {"fields": ["owner_id", "name"], "unique": True, "name": "owner_id_name_unique_idx"},
        ],
    }

    owner_id = ObjectIdField(db_field="ownerId")
    name = StringField(required=True, min_length=1, max_length=80)
    color = StringField(required=True, regex=COLOR_PATTERN)
    default_color = StringField(db_field="defaultColor", required=True, regex=COLOR_PATTERN)
    description = StringField(default="", max_length=1000)
    time_zone = StringField(db_field="timeZone", default="UTC", max_length=100)
    visible = BooleanField(default=True)
    is_primary = BooleanField(db_field="isPrimary", default=False)
