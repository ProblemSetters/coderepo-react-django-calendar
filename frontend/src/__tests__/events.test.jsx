import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, installApi, profile, reply, startScreenSession } from "./support/app-test-kit.js";

const standup = { _id: "e1", calendarId: "c1", title: "Team standup", type: "event", startAt: "2030-06-03T09:00:00.000Z", endAt: "2030-06-03T09:30:00.000Z", allDay: false, editable: true, location: "Room 4", description: "Daily sync" };
const invite = { _id: "e2", calendarId: "c1", title: "Quarterly review", type: "event", startAt: "2030-06-04T10:00:00.000Z", endAt: "2030-06-04T11:00:00.000Z", allDay: false, editable: false, organizer: "Jordan Lee", responseStatus: "needsAction" };

const renderWorkspace = () => render(<CalendarWorkspace activeProfile={profile} onLogout={vi.fn()} onSwitchProfile={vi.fn()} />);

async function openEventEditor() {
    fireEvent.click(await screen.findByTestId("create-event-button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Event" }));
    return screen.findByTestId("event-title-input");
}

describe("event editor", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("saves a new event with the typed title and shows it on the grid", async () => {
        const saved = [];
        const api = installApi({
            "GET /events": () => saved,
            "POST /events": (call) => {
                const created = { _id: "e9", editable: true, ...call.body };
                saved.push(created);
                return reply(201, { data: created });
            },
        });
        renderWorkspace();

        fireEvent.change(await openEventEditor(), { target: { value: "Planning session" } });
        fireEvent.click(screen.getByTestId("save-event-button"));

        expect(await screen.findByRole("button", { name: /Planning session/ })).toBeTruthy();
        const [post] = api.find("POST", "/events");
        expect(post.body).toMatchObject({ title: "Planning session", type: "event", calendarId: "c1", allDay: false, startAt: "2030-06-03T09:30:00.000Z", endAt: "2030-06-03T10:30:00.000Z" });
        expect(screen.queryByTestId("event-title-input")).toBeNull();
    });

    test("refuses to save an event without a title and sends nothing", async () => {
        const api = installApi();
        renderWorkspace();
        const titleInput = await openEventEditor();

        expect(screen.getByTestId("save-event-button").disabled).toBe(true);
        fireEvent.click(screen.getByTestId("save-event-button"));
        fireEvent.change(titleInput, { target: { value: "   " } });
        fireEvent.submit(titleInput.closest("form"));

        expect((await screen.findByRole("alert")).textContent).toBe("Title is required.");
        expect(api.find("POST", "/events")).toHaveLength(0);
        expect(screen.getByTestId("event-title-input")).toBeTruthy();
    });

    test("saves a weekly repeat chosen in the editor", async () => {
        const api = installApi({
            "POST /events": (call) => reply(201, { data: { _id: "e9", editable: true, ...call.body } }),
        });
        renderWorkspace();

        fireEvent.change(await openEventEditor(), { target: { value: "Weekly sync" } });
        fireEvent.click(screen.getByRole("combobox", { name: "Repeat" }));
        fireEvent.click(screen.getByRole("option", { name: "Weekly on Monday" }));
        fireEvent.click(screen.getByTestId("save-event-button"));

        await waitFor(() => expect(api.find("POST", "/events")).toHaveLength(1));
        expect(api.find("POST", "/events")[0].body.recurrence).toMatchObject({ frequency: "weekly", interval: 1, daysOfWeek: [1], endType: "never", count: null, until: null });
        await waitFor(() => expect(screen.queryByTestId("event-title-input")).toBeNull());
    });
});

describe("event preview", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("opens an event's details and deletes it after confirmation", async () => {
        const remaining = [standup];
        const api = installApi({
            "GET /events": () => remaining,
            "DELETE /events/e1": () => {
                remaining.length = 0;
                return reply(204, null);
            },
        });
        renderWorkspace();

        fireEvent.click(await screen.findByTestId("event-chip-e1"));

        expect(await screen.findByRole("heading", { name: "Team standup" })).toBeTruthy();
        expect(screen.getByText("Room 4")).toBeTruthy();
        expect(screen.getByText("Daily sync")).toBeTruthy();

        fireEvent.click(screen.getByTestId("preview-delete"));
        expect(await screen.findByRole("heading", { name: "Delete event?" })).toBeTruthy();
        expect(api.find("DELETE", "/events/e1")).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(screen.queryByTestId("event-chip-e1")).toBeNull());
        expect(api.find("DELETE", "/events/e1")).toHaveLength(1);
        expect(screen.queryByRole("heading", { name: "Team standup" })).toBeNull();
    });

    test("answers an invitation with Yes and shows that answer as chosen", async () => {
        let current = invite;
        const api = installApi({
            "GET /events": () => [current],
            "PATCH /events/e2/response": (call) => {
                current = { ...invite, responseStatus: call.body.status };
                return current;
            },
        });
        renderWorkspace();

        fireEvent.click(await screen.findByTestId("event-chip-e2"));

        expect(await screen.findByText("Organized by Jordan Lee")).toBeTruthy();
        expect(screen.queryByTestId("preview-edit")).toBeNull();
        expect(screen.queryByTestId("preview-delete")).toBeNull();
        expect(screen.getByTestId("rsvp-accepted").getAttribute("aria-pressed")).toBe("false");

        fireEvent.click(screen.getByTestId("rsvp-accepted"));

        await waitFor(() => expect(screen.getByTestId("rsvp-accepted").getAttribute("aria-pressed")).toBe("true"));
        expect(api.find("PATCH", "/events/e2/response").map((call) => call.body)).toEqual([{ status: "accepted" }]);
        expect(screen.getByTestId("rsvp-declined").getAttribute("aria-pressed")).toBe("false");
    });

    test("edits an event from its preview and shows the new title", async () => {
        let current = standup;
        const api = installApi({
            "GET /events": () => [current],
            "PATCH /events/e1": (call) => {
                current = { ...standup, ...call.body };
                return current;
            },
        });
        renderWorkspace();

        fireEvent.click(await screen.findByTestId("event-chip-e1"));
        fireEvent.click(await screen.findByTestId("preview-edit"));
        const titleInput = await screen.findByTestId("event-title-input");
        expect(titleInput.value).toBe("Team standup");
        fireEvent.change(titleInput, { target: { value: "Team standup (Room 6)" } });
        fireEvent.click(screen.getByTestId("save-event-button"));

        expect(await screen.findByRole("button", { name: /Team standup \(Room 6\)/ })).toBeTruthy();
        expect(api.find("PATCH", "/events/e1")[0].body).toMatchObject({ title: "Team standup (Room 6)", calendarId: "c1", startAt: standup.startAt, endAt: standup.endAt });
        expect(api.find("POST", "/events")).toHaveLength(0);
    });
});
