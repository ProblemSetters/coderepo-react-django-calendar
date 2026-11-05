from datetime import datetime

from apps.events.recurrence import expand_event


def moment(text):
    # The app keeps its moments as UTC datetimes without a zone, the way MongoDB hands them back.
    return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)


def repeating(start_at, end_at, **recurrence):
    return {
        "_id": "series",
        "title": "Series",
        "startAt": moment(start_at),
        "endAt": moment(end_at),
        "recurrence": {"interval": 1, "daysOfWeek": [], "timeZone": "UTC", **recurrence},
    }


def starts_of(event, start, end):
    occurrences = expand_event(event, moment(start), moment(end))
    return [occurrence["startAt"].strftime("%Y-%m-%dT%H:%M:%S.000Z") for occurrence in occurrences]


def test_a_weekly_repeat_on_chosen_weekdays_stops_at_its_end_date():
    series = repeating(
        "2030-06-03T10:00:00.000Z",
        "2030-06-03T10:30:00.000Z",
        frequency="weekly",
        daysOfWeek=[1, 3],
        endType="until",
        until=moment("2030-06-12T00:00:00.000Z"),
    )

    assert starts_of(series, "2030-06-01T00:00:00.000Z", "2030-07-01T00:00:00.000Z") == [
        "2030-06-03T10:00:00.000Z",
        "2030-06-05T10:00:00.000Z",
        "2030-06-10T10:00:00.000Z",
        "2030-06-12T10:00:00.000Z",
    ]


def test_a_monthly_repeat_on_the_first_monday_stops_after_its_count():
    series = repeating(
        "2030-06-03T09:00:00.000Z",
        "2030-06-03T10:00:00.000Z",
        frequency="monthly",
        monthlyMode="ordinalWeekday",
        endType="count",
        count=3,
    )

    assert starts_of(series, "2030-06-01T00:00:00.000Z", "2031-01-01T00:00:00.000Z") == [
        "2030-06-03T09:00:00.000Z",
        "2030-07-01T09:00:00.000Z",
        "2030-08-05T09:00:00.000Z",
    ]


def test_a_repeat_keeps_its_local_time_across_a_daylight_saving_change():
    series = repeating(
        "2030-03-04T14:00:00.000Z",
        "2030-03-04T15:00:00.000Z",
        frequency="weekly",
        endType="never",
        timeZone="America/New_York",
    )

    assert starts_of(series, "2030-03-01T00:00:00.000Z", "2030-03-15T00:00:00.000Z") == [
        "2030-03-04T14:00:00.000Z",
        "2030-03-11T13:00:00.000Z",
    ]


def test_a_yearly_repeat_lands_on_the_same_date_each_year_and_an_every_other_day_repeat_skips_a_day():
    yearly = repeating("2030-06-03T10:00:00.000Z", "2030-06-03T11:00:00.000Z", frequency="yearly", endType="never")
    every_other_day = repeating("2030-06-03T10:00:00.000Z", "2030-06-03T10:30:00.000Z", frequency="daily", interval=2, endType="never")

    assert starts_of(yearly, "2030-01-01T00:00:00.000Z", "2033-01-01T00:00:00.000Z") == [
        "2030-06-03T10:00:00.000Z",
        "2031-06-03T10:00:00.000Z",
        "2032-06-03T10:00:00.000Z",
    ]
    assert starts_of(every_other_day, "2030-06-01T00:00:00.000Z", "2030-06-09T00:00:00.000Z") == [
        "2030-06-03T10:00:00.000Z",
        "2030-06-05T10:00:00.000Z",
        "2030-06-07T10:00:00.000Z",
    ]
