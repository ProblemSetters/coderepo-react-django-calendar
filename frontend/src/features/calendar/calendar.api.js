import { request } from "../../shared/api/client.js";

export const calendarApi = {
    list: () => request("/calendars"),
    create: (calendar) => request("/calendars", { method: "POST", body: JSON.stringify(calendar) }),
    displayOnly: (id) => request(`/calendars/${id}/display-only`, { method: "POST" }),
    update: (id, calendar) => request(`/calendars/${id}`, { method: "PATCH", body: JSON.stringify(calendar) }),
    remove: (id) => request(`/calendars/${id}`, { method: "DELETE" }),
};
