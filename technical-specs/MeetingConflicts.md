# Calendar: Meeting Conflicts

## Overview

Calendar is a scheduling app where a team keeps their calendars and invites each
other to meetings. While an organizer picks a time, the event editor checks the
guests and warns about anyone who is already busy. Suggested times offers slots
that clash with nobody.

Both features are served by the same availability layer. A person is busy for
anything on a calendar they own, and for any invitation they have not declined.

Your task is to fix the availability layer in the backend so that a busy guest is
reported as busy, and so that no suggested slot clashes with anyone.

---

## Busy Rules

| Rule | Behaviour |
|------|-----------|
| Overlap | A meeting clashes when it starts before the proposed end and ends after the proposed start |
| Touching times | A meeting that ends exactly when the slot begins does not clash, and neither does one that begins exactly when it ends |
| Replies | Busy unless declined, so `needsAction` and `tentative` both block |
| Own calendar | Busy for anything on a calendar they own, whatever their reply |
| Single occurrence reply | A reply scoped to one occurrence overrides the reply for the series |
| Repeating meetings | Every occurrence blocks time, not only the first |
| All-day out of office | Blocks the whole day |
| All-day working location | Never blocks, and neither does a timed one |
| Reported blocks | Clipped to the window that was asked about |

---

## API Contract

All availability endpoints require authentication. Send `Authorization: Bearer <token>`.

---

### POST /api/v1/availability/conflicts

**Purpose:** Report which of the selected people are busy inside a proposed window, and whether that window sits inside everyone's working hours.

**Request Body:**
```json
{
  "participantIds": ["6a962265089578efdcee297a"],
  "startAt": "2026-09-07T13:30:00.000Z",
  "endAt": "2026-09-07T15:00:00.000Z",
  "timeZone": "UTC"
}
```

- `participantIds`: 1 to 100 unique, existing people.
- `startAt` and `endAt`: UTC ISO datetimes, `startAt` strictly before `endAt`.
- `timeZone`: optional IANA zone, defaults to `UTC`.

**Success Response (200):**
```json
{
  "data": {
    "startAt": "2026-09-07T13:30:00.000Z",
    "endAt": "2026-09-07T15:00:00.000Z",
    "available": false,
    "withinWorkingHours": true,
    "conflicts": [
      {
        "person": {
          "_id": "6a962265089578efdcee297a",
          "name": "Jordan Smith",
          "email": "jordan.smith@calendar.com",
          "avatarColor": "#b85c00",
          "workingHours": { "startMinute": 540, "endMinute": 1020 },
          "timeZone": "UTC"
        },
        "busy": [
          {
            "_id": "6a962266089578efdcee29f4",
            "title": "Team roadmap",
            "startAt": "2026-09-07T14:00:00.000Z",
            "endAt": "2026-09-07T15:00:00.000Z"
          }
        ]
      }
    ],
    "workingHoursWarnings": []
  }
}
```

- `available` is `true` only when `conflicts` is empty.
- Only people with at least one overlapping block appear in `conflicts`.
- Each reported block is clipped to the requested window.
- `workingHoursWarnings` lists people the window falls outside of. It warns, it does not block.

**Error Responses:**
- `400 VALIDATION_ERROR` - criteria failed validation, including `endAt` not after `startAt`.
- `400 INVALID_PERSON_ID` - a participant identifier is malformed.
- `401 AUTH_REQUIRED` - no bearer token.
- `404 PEOPLE_NOT_FOUND` - one or more people no longer exist.

---

### POST /api/v1/availability/suggestions

**Purpose:** Propose meeting slots that clash with neither the organizer nor any selected guest.

**Request Body:**
```json
{
  "participantIds": ["6a962265089578efdcee297a"],
  "from": "2026-09-07",
  "timeZone": "UTC",
  "days": 3,
  "durationMinutes": 30
}
```

- `participantIds`: 1 to 10 unique, existing people.
- `from`: a local `YYYY-MM-DD` calendar date.
- `days`: 1 to 14.
- `durationMinutes`: 15 to 240, in 15-minute increments.

**Success Response (200):** the owner's and each participant's working intervals and clipped busy blocks, plus the suggestions.

```json
{
  "data": {
    "from": "2026-09-07T00:00:00.000Z",
    "to": "2026-09-10T00:00:00.000Z",
    "durationMinutes": 30,
    "timeZone": "UTC",
    "owner": { "name": "Alex Morgan", "timeZone": "UTC", "workingHours": { "startMinute": 540, "endMinute": 1050 }, "workingIntervals": [], "busy": [] },
    "participants": [{ "person": {}, "workingIntervals": [], "busy": [] }],
    "suggestions": [
      { "startAt": "2026-09-07T09:00:00.000Z", "endAt": "2026-09-07T09:30:00.000Z", "attendeeCount": 2 }
    ]
  }
}
```

A suggestion is only offered when **all** of these hold:

1. The slot clashes with nothing on the **organizer's** own calendars.
2. The slot clashes with nothing for any selected guest.
3. The slot sits inside the organizer's working hours **and** every guest's working hours.
4. The slot has not already passed.

Further rules:

- At most twelve suggestions, in chronological order.
- Candidate starts step every 30 minutes.
- Weekends are skipped.
- `attendeeCount` includes the organizer.
- No free slot is a `200` with an empty `suggestions` array, not an error.

**Error Responses:**
- `400 VALIDATION_ERROR` - criteria failed validation.
- `400 INVALID_PERSON_ID` - a participant identifier is malformed.
- `401 AUTH_REQUIRED` - no bearer token.
- `401 PROFILE_REQUIRED` - a workspace token that has not selected a profile.
- `404 PEOPLE_NOT_FOUND` - one or more people no longer exist.

---

## Additional Information

- To manually reset the database, execute `bun run seed` command, and reload the frontend preview.
- The code repository may intentionally contain other issues that are unrelated to this specific task. Please focus only on the described task requirements and address bugs or errors directly associated with them.
- If you're using Run and Debug mode in the IDE, the frontend server may start before the backend (including database seeding) is ready. In that case, the frontend might not display any data. Please reload the preview once the backend setup is complete.
