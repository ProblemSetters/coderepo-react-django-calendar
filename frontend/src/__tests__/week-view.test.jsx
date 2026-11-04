import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, installApi, profile, startScreenSession } from "./support/app-test-kit.js";

const weekEvents = [
    { _id: "e1", calendarId: "c1", title: "Team standup", type: "event", startAt: "2030-06-03T09:00:00.000Z", endAt: "2030-06-03T09:30:00.000Z", allDay: false, editable: true },
    { _id: "e2", calendarId: "c1", title: "Design review", type: "event", startAt: "2030-06-05T14:00:00.000Z", endAt: "2030-06-05T15:00:00.000Z", allDay: false, editable: true },
];

const renderWorkspace = () => render(<CalendarWorkspace activeProfile={profile} onLogout={vi.fn()} onSwitchProfile={vi.fn()} />);

describe("week view", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("shows the events the server returns for the visible week", async () => {
        const api = installApi({ "GET /events": weekEvents });
        renderWorkspace();

        expect(await screen.findByRole("button", { name: /Team standup/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Design review/ })).toBeTruthy();
        const request = api.find("GET", "/events")[0];
        expect(request.query.get("from")).toBe("2030-06-02T00:00:00.000Z");
        expect(request.query.get("to")).toBe("2030-06-09T00:00:00.000Z");
        expect(request.query.get("calendarIds")).toBe("c1");
    });

    test("asks for the following week when the next-period button is pressed", async () => {
        const api = installApi({ "GET /events": weekEvents });
        renderWorkspace();
        await screen.findByRole("button", { name: /Team standup/ });

        fireEvent.click(screen.getByTestId("period-next"));

        await waitFor(() => {
            const requests = api.find("GET", "/events");
            expect(requests[requests.length - 1].query.get("from")).toBe("2030-06-09T00:00:00.000Z");
        });
        const [first] = api.find("GET", "/events");
        const last = api.find("GET", "/events").at(-1);
        expect(new Date(last.query.get("from")) > new Date(first.query.get("from"))).toBe(true);
    });
});

describe("month view", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("loads the whole month and shows an event outside the current week after switching to Month", async () => {
        const offsite = { _id: "e5", calendarId: "c1", title: "Team offsite", type: "event", startAt: "2030-06-20T10:00:00.000Z", endAt: "2030-06-20T12:00:00.000Z", allDay: false, editable: true };
        const inRange = (call) => new Date(call.query.get("from")) < new Date(offsite.endAt) && new Date(call.query.get("to")) > new Date(offsite.startAt);
        const api = installApi({ "GET /events": (call) => (inRange(call) ? [offsite] : []) });
        renderWorkspace();
        await waitFor(() => expect(api.find("GET", "/events").length).toBeGreaterThan(0));
        expect(screen.queryByTestId("event-chip-e5")).toBeNull();

        fireEvent.click(screen.getByTestId("view-select"));
        fireEvent.click(screen.getByRole("menuitemradio", { name: /Month/ }));

        expect((await screen.findByTestId("event-chip-e5")).getAttribute("aria-label")).toMatch(/^Team offsite/);
        const monthLoad = api.find("GET", "/events").at(-1).query;
        expect([monthLoad.get("from"), monthLoad.get("to")]).toEqual(["2030-05-26T00:00:00.000Z", "2030-07-07T00:00:00.000Z"]);
    });
});
