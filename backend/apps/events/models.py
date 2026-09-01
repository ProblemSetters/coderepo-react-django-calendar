from mongoengine import (
    BooleanField,
    DateTimeField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    IntField,
    ListField,
    ObjectIdField,
    StringField,
)

from apps.shared.documents import TimestampedDocument

from .constants import (
    DEFAULT_ORGANIZER,
    END_TYPES,
    EVENT_TYPES,
    FREQUENCIES,
    MAX_COUNT,
    MAX_DESCRIPTION_LENGTH,
    MAX_INTERVAL,
    MAX_LOCATION_LENGTH,
    MAX_ORGANIZER_LENGTH,
    MAX_PARTICIPANT_NAME_LENGTH,
    MAX_TIME_ZONE_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_WEEKDAY,
    MONTHLY_MODES,
    OVERRIDE_SCOPES,
    REPLY_STATUSES,
    RESPONSE_STATUSES,
)


class AttendeeResponse(EmbeddedDocument):
    person_id = ObjectIdField(db_field="personId", required=True)
    status = StringField(choices=RESPONSE_STATUSES, default="needsAction", required=True)
    responded_at = DateTimeField(db_field="respondedAt", null=True, default=None)


class Recurrence(EmbeddedDocument):
    frequency = StringField(choices=FREQUENCIES, default="none", required=True)
    interval = IntField(min_value=1, max_value=MAX_INTERVAL, default=1, required=True)
    days_of_week = ListField(IntField(min_value=0, max_value=MAX_WEEKDAY), db_field="daysOfWeek", default=list)
    monthly_mode = StringField(db_field="monthlyMode", choices=MONTHLY_MODES, default="ordinalWeekday")
    end_type = StringField(db_field="endType", choices=END_TYPES, default="never", required=True)
    count = IntField(min_value=1, max_value=MAX_COUNT, null=True, default=None)
    until = DateTimeField(null=True, default=None)
    time_zone = StringField(db_field="timeZone", default="UTC", max_length=MAX_TIME_ZONE_LENGTH)


class RecurrenceResponseOverride(EmbeddedDocument):
    person_id = ObjectIdField(db_field="personId", required=True)
    occurrence_start_at = DateTimeField(db_field="occurrenceStartAt", required=True)
    scope = StringField(choices=OVERRIDE_SCOPES, required=True)
    status = StringField(choices=REPLY_STATUSES, required=True)
    responded_at = DateTimeField(db_field="respondedAt", required=True)


class Event(TimestampedDocument):
    meta = {
        "collection": "events",
        "indexes": [
            {"fields": ["calendar_id", "start_at", "end_at"], "name": "calendar_range_idx"},
            {"fields": ["type"], "name": "type_idx"},
        ],
    }

    calendar_id = ObjectIdField(db_field="calendarId", required=True)
    title = StringField(required=True, max_length=MAX_TITLE_LENGTH)
    type = StringField(choices=EVENT_TYPES, default="event")
    description = StringField(default="", max_length=MAX_DESCRIPTION_LENGTH)
    location = StringField(default="", max_length=MAX_LOCATION_LENGTH)
    organizer = StringField(default=DEFAULT_ORGANIZER, max_length=MAX_ORGANIZER_LENGTH)
    participants = ListField(StringField(max_length=MAX_PARTICIPANT_NAME_LENGTH), default=list)
    participant_ids = ListField(ObjectIdField(), db_field="participantIds", default=list)
    attendee_responses = EmbeddedDocumentListField(AttendeeResponse, db_field="attendeeResponses", default=list)
    recurrence = EmbeddedDocumentField(Recurrence, default=Recurrence)
    recurrence_response_overrides = EmbeddedDocumentListField(
        RecurrenceResponseOverride, db_field="recurrenceResponseOverrides", default=list
    )
    start_at = DateTimeField(db_field="startAt", required=True)
    end_at = DateTimeField(db_field="endAt", required=True)
    all_day = BooleanField(db_field="allDay", default=False)
    color = StringField(regex=r"^#[0-9A-Fa-f]{6}$")
