import { cleanup, configure } from "@testing-library/react";
import { vi } from "vitest";
import { setProfileToken, setSessionToken } from "../../shared/api/client.js";

// The first render in a file is slow on a cold machine, so wait longer than the 1s default.
configure({ asyncUtilTimeout: 8000 });

// A Monday, so the visible week (Sunday to Sunday) is the same on every machine.
export const FIXED_NOW = "2030-06-03T09:00:00.000Z";

export const account = { _id: "a1", email: "asha@example.com", name: "Asha Rao" };
export const profile = { _id: "p1", name: "Asha Rao", email: "asha@example.com", avatarColor: "#1a73e8" };
export const workCalendar = { _id: "c1", name: "Work", color: "#1a73e8", visible: true, isPrimary: true, timeZone: "UTC" };

const REPLY = Symbol("reply");

// Handlers return plain data (sent as 200 {data}) or reply(status, body) for anything else.
export const reply = (status, body) => ({ [REPLY]: true, status, body });
export const failure = (status, code, message) => reply(status, { error: { code, message } });

function toResponse(result) {
    const wrapped = result && result[REPLY] ? result : reply(200, { data: result });
    return {
        status: wrapped.status,
        ok: wrapped.status >= 200 && wrapped.status < 300,
        headers: { get: () => "application/json" },
        json: async () => wrapped.body,
    };
}

// Routes are keyed "METHOD /path" (no query string, no /api/v1 prefix). Unknown routes answer { data: [] }.
export function installApi(handlers = {}) {
    const routes = { "GET /calendars": [workCalendar], ...handlers };
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
        const [fullPath, queryString = ""] = String(url).split("?");
        const call = {
            method: (options.method || "GET").toUpperCase(),
            path: fullPath.replace(/^\/api\/v1/, ""),
            query: new URLSearchParams(queryString),
            body: options.body ? JSON.parse(options.body) : undefined,
        };
        calls.push(call);
        const handler = routes[`${call.method} ${call.path}`];
        if (handler === undefined) return toResponse([]);
        return toResponse(typeof handler === "function" ? handler(call) : handler);
    }));
    return {
        calls,
        find: (method, path) => calls.filter((call) => call.method === method && call.path === path),
    };
}

// jsdom has no layout engine or dialog support, so give the app the few browser APIs it calls.
function fillBrowserGaps() {
    const dialog = window.HTMLDialogElement.prototype;
    if (!dialog.showModal) {
        dialog.showModal = function showModal() { this.setAttribute("open", ""); };
        dialog.close = function close() { this.removeAttribute("open"); };
    }
    if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = () => {};
}

export function startScreenSession() {
    fillBrowserGaps();
    localStorage.clear();
    setSessionToken("");
    setProfileToken("");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FIXED_NOW));
}

export function endScreenSession() {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
}
