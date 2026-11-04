import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, installApi, profile, reply, startScreenSession } from "./support/app-test-kit.js";

const standup = { _id: "e1", calendarId: "c1", title: "Team standup", type: "event", startAt: "2030-06-03T09:00:00.000Z", endAt: "2030-06-03T09:30:00.000Z", allDay: false, editable: true, location: "Room 4", description: "Daily sync" };

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
});
