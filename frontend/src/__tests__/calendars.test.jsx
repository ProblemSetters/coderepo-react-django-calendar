import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, failure, installApi, profile, reply, startScreenSession, workCalendar } from "./support/app-test-kit.js";

const renderWorkspace = () => render(<CalendarWorkspace activeProfile={profile} onLogout={vi.fn()} onSwitchProfile={vi.fn()} />);

async function submitCalendarName(name) {
    fireEvent.click(await screen.findByRole("button", { name: "Add calendar" }));
    fireEvent.change(await screen.findByTestId("calendar-name-input"), { target: { value: name } });
    fireEvent.click(screen.getByTestId("create-calendar-submit"));
}

describe("calendars in the sidebar", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("creates a calendar and lists it under My calendars", async () => {
        const api = installApi({
            "POST /calendars": (call) => reply(201, { data: { _id: "c2", visible: true, isPrimary: false, color: "#0b8043", ...call.body } }),
        });
        renderWorkspace();

        await submitCalendarName("Side projects");

        expect(await screen.findByText("Side projects")).toBeTruthy();
        expect(api.find("POST", "/calendars")[0].body).toMatchObject({ name: "Side projects", description: "", timeZone: "UTC" });
        expect(screen.queryByTestId("calendar-name-input")).toBeNull();
    });

    test("shows the server's message when the calendar name is already taken", async () => {
        const api = installApi({
            "POST /calendars": failure(409, "CALENDAR_NAME_CONFLICT", "A calendar with this name already exists."),
        });
        renderWorkspace();

        await submitCalendarName("Work");

        expect((await screen.findByRole("alert")).textContent).toBe("A calendar with this name already exists.");
        expect(api.find("POST", "/calendars")).toHaveLength(1);
        expect(screen.getByTestId("calendar-name-input").value).toBe("Work");
    });

    test("shows only the chosen calendar from its options menu", async () => {
        const personal = { _id: "c2", name: "Personal", color: "#0b8043", visible: true, isPrimary: false, timeZone: "UTC" };
        const api = installApi({
            "GET /calendars": [workCalendar, personal],
            "POST /calendars/c2/display-only": [{ ...workCalendar, visible: false }, personal],
        });
        renderWorkspace();

        fireEvent.click(await screen.findByRole("button", { name: "Manage Personal" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Display this only" }));

        await waitFor(() => expect(screen.getByTestId("calendar-toggle-c1").checked).toBe(false));
        expect(screen.getByTestId("calendar-toggle-c2").checked).toBe(true);
        expect(api.find("POST", "/calendars/c2/display-only")).toHaveLength(1);
        await waitFor(() => expect(api.find("GET", "/events").at(-1).query.get("calendarIds")).toBe("c2"));
        expect(screen.queryByRole("menu", { name: "Personal options" })).toBeNull();
    });
});
