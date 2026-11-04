import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, installApi, profile, startScreenSession } from "./support/app-test-kit.js";

const renderWorkspace = () => render(<CalendarWorkspace activeProfile={profile} onLogout={vi.fn()} onSwitchProfile={vi.fn()} />);

describe("quick search", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("lists the events the search endpoint returns", async () => {
        const api = installApi({
            "GET /events/search": [
                { _id: "s1", calendarId: "c1", title: "Budget review", type: "event", startAt: "2030-06-10T10:00:00.000Z", endAt: "2030-06-10T11:00:00.000Z", allDay: false, location: "Boardroom" },
            ],
        });
        renderWorkspace();

        fireEvent.click(await screen.findByTestId("search-open"));
        const box = await screen.findByTestId("search-quick");
        fireEvent.change(box, { target: { value: "budget" } });
        fireEvent.keyDown(box, { key: "Enter" });

        expect(await screen.findByText("Budget review")).toBeTruthy();
        expect(screen.getByText("Boardroom · Work")).toBeTruthy();
        const [request] = api.find("GET", "/events/search");
        expect(request.query.get("what")).toBe("budget");
        expect(request.query.get("calendarIds")).toBe("c1");
    });
});

describe("find a time", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("shows the slots suggested for the chosen guest", async () => {
        const guestId = "64b7f0a1c2d3e4f5a6b7c8d9";
        const api = installApi({
            "GET /people": [{ _id: guestId, name: "Ravi Menon", email: "ravi@example.com", avatarColor: "#d93025" }],
            "POST /availability/suggestions": {
                suggestions: [
                    { startAt: "2030-06-04T10:00:00.000Z", endAt: "2030-06-04T11:00:00.000Z" },
                    { startAt: "2030-06-05T15:00:00.000Z", endAt: "2030-06-05T16:00:00.000Z" },
                ],
            },
        });
        renderWorkspace();

        fireEvent.click(await screen.findByTestId("create-event-button"));
        fireEvent.click(screen.getByRole("menuitem", { name: "Event" }));
        fireEvent.focus(await screen.findByTestId("guest-search-input"));
        fireEvent.click(await screen.findByTestId(`guest-option-${guestId}`));
        fireEvent.click(await screen.findByTestId("find-a-time"));

        expect(await screen.findByText(/Tue, Jun 4 · 10:00\s?am/)).toBeTruthy();
        expect(screen.getByText(/Wed, Jun 5 · 3:00\s?pm/)).toBeTruthy();
        expect(screen.getByText("Everyone is available")).toBeTruthy();
        expect(api.find("POST", "/availability/suggestions")[0].body).toEqual({
            participantIds: [guestId],
            from: "2030-06-03",
            timeZone: "UTC",
            days: 5,
            durationMinutes: 60,
        });
    });
});

describe("meet with", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("compares the chosen person's day and books one of the suggested times", async () => {
        const ravi = { _id: "64b7f0a1c2d3e4f5a6b7c8d9", name: "Ravi Menon", email: "ravi@example.com", avatarColor: "#d93025" };
        const hours = { startMinute: 9 * 60, endMinute: 17 * 60 };
        const workday = [{ startAt: "2030-06-03T09:00:00.000Z", endAt: "2030-06-03T17:00:00.000Z" }];
        const api = installApi({
            "GET /people": [ravi],
            "POST /availability/suggestions": {
                owner: { name: "Asha Rao", timeZone: "UTC", workingHours: hours, workingIntervals: workday, busy: [] },
                participants: [{ person: { ...ravi, timeZone: "UTC", workingHours: hours }, workingIntervals: workday, busy: [{ _id: "b1", title: "Busy", startAt: "2030-06-03T10:00:00.000Z", endAt: "2030-06-03T11:00:00.000Z" }] }],
                suggestions: [{ startAt: "2030-06-03T13:00:00.000Z", endAt: "2030-06-03T13:30:00.000Z", attendeeCount: 2 }],
            },
        });
        renderWorkspace();

        fireEvent.focus(await screen.findByTestId("people-search-input"));
        fireEvent.click(await screen.findByTestId(`people-option-${ravi._id}`));
        expect(await screen.findByLabelText(/Ravi.* schedule/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Suggested times/ }));
        fireEvent.click(await screen.findByTestId("suggested-time-2030-06-03T13:00:00.000Z"));

        expect((await screen.findByTestId("event-title-input")).value).toBe("Meeting with Ravi Menon");
        expect(screen.getByTestId(`guest-remove-${ravi._id}`)).toBeTruthy();
        await waitFor(() => expect(api.find("POST", "/availability/suggestions").length).toBeGreaterThanOrEqual(2));
        const bodies = api.find("POST", "/availability/suggestions").map((call) => call.body);
        expect(bodies).toContainEqual(expect.objectContaining({ participantIds: [ravi._id], from: "2030-06-03", days: 1 }));
        expect(bodies).toContainEqual(expect.objectContaining({ participantIds: [ravi._id], from: "2030-06-03", days: 5, durationMinutes: 30 }));
    });
});

describe("time insights", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("shows today's meeting time from the insights endpoint", async () => {
        const api = installApi({
            "GET /insights/daily": { meetingMinutes: 150, averageDailyMeetingMinutes: 60, workingDayMinutes: 480 },
        });
        renderWorkspace();

        expect(await screen.findByText("2.5 hr in meetings")).toBeTruthy();
        expect(screen.getByText("(avg: 1 hr)")).toBeTruthy();
        expect(screen.getByTestId("more-insights")).toBeTruthy();
        const [request] = api.find("GET", "/insights/daily");
        expect(request.query.get("from")).toBe("2030-06-03T00:00:00.000Z");
        expect(request.query.get("to")).toBe("2030-06-04T00:00:00.000Z");
    });
});
