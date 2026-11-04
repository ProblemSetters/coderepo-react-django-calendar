import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "../App.jsx";
import { endScreenSession, failure, installApi, profile, reply, startScreenSession } from "./support/app-test-kit.js";

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
});
