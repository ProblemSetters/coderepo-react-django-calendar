import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import App from "../App.jsx";
import { account, endScreenSession, failure, installApi, profile, startScreenSession } from "./support/app-test-kit.js";

function signIn(email, password) {
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: email } });
    fireEvent.change(screen.getByTestId("password-input"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("sign-in screen", () => {
    beforeEach(startScreenSession);
    afterEach(endScreenSession);

    test("opens the calendar workspace when the password is right", async () => {
        const api = installApi({
            "POST /auth/login": { token: "session-token", account },
            "GET /profiles": [profile],
            "POST /auth/switch-profile": { token: "profile-token" },
        });
        render(<App />);

        signIn("asha@example.com", "correct-horse");

        expect(await screen.findByTestId("create-event-button")).toBeTruthy();
        expect(api.find("POST", "/auth/login")[0].body).toEqual({ email: "asha@example.com", password: "correct-horse" });
        expect(api.find("POST", "/auth/switch-profile")[0].body).toEqual({ profileId: "p1" });
        expect(screen.queryByTestId("password-input")).toBeNull();
    });

    test("shows the server's message when the password is wrong", async () => {
        const api = installApi({
            "POST /auth/login": failure(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
        });
        render(<App />);

        signIn("asha@example.com", "wrong-password");

        expect((await screen.findByRole("alert")).textContent).toBe("Email or password is incorrect.");
        await waitFor(() => expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false));
        expect(screen.getByTestId("password-input")).toBeTruthy();
        expect(screen.queryByTestId("create-event-button")).toBeNull();
        expect(api.find("GET", "/profiles")).toHaveLength(0);
    });
});
