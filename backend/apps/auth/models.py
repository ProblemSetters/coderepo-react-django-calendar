from mongoengine import BooleanField, ListField, ObjectIdField, StringField

from apps.shared.documents import TimestampedDocument


class WorkspaceAccount(TimestampedDocument):
    meta = {
        "collection": "workspaceaccounts",
        "indexes": [{"fields": ["email"], "unique": True, "name": "email_unique_idx"}],
    }

    name = StringField(required=True, max_length=120)
    email = StringField(required=True, max_length=254)
    password_hash = StringField(db_field="passwordHash", required=True)
    allowed_profile_ids = ListField(ObjectIdField(), db_field="allowedProfileIds", default=list)
    active = BooleanField(default=True)
