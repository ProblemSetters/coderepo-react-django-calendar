import { describe, expect, test } from "vitest";
import { getEventColumnGeometry, layoutTimedEvents } from "../features/calendar/event-layout.js";

describe("event layout", () => {
    test("puts two overlapping events side by side and leaves a later event alone", () => {
        const layout = layoutTimedEvents([
            { _id: "b", startAt: "2030-06-03T09:30:00.000Z", endAt: "2030-06-03T10:30:00.000Z" },
            { _id: "a", startAt: "2030-06-03T09:00:00.000Z", endAt: "2030-06-03T10:00:00.000Z" },
            { _id: "c", startAt: "2030-06-03T11:00:00.000Z", endAt: "2030-06-03T12:00:00.000Z" },
        ]);

        const summary = layout.map(({ event, column, columns }) => [event._id, column, columns]);
        expect(summary).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 0, 1]]);
        expect(getEventColumnGeometry(0, 2)).toMatchObject({ left: 0, width: 50 });
        expect(getEventColumnGeometry(1, 2)).toMatchObject({ left: 50, width: 50 });
    });
});
