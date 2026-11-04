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
