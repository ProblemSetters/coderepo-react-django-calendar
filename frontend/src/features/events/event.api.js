import { request } from "../../shared/api/client.js";
import { addCalendarDays, zonedDateTime } from "../../shared/utils/time-zone.js";

export const eventApi = {
    list: (from, to, calendarIds) => request(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&calendarIds=${calendarIds.join(",")}`),
    search: (filters, calendarIds) => {
        const parameters = new URLSearchParams({ calendarIds: calendarIds.join(",") });
        for (const field of ["what", "who", "where", "exclude"]) if (filters[field]) parameters.set(field, filters[field]);
        if (filters.from) parameters.set("from", zonedDateTime(filters.from, 0).toISOString());
        if (filters.to) {
            parameters.set("to", zonedDateTime(addCalendarDays(filters.to, 1), 0).toISOString());
        }
        return request(`/events/search?${parameters.toString()}`);
    },
    get: (id) => request(`/events/${id}`),
    create: (event) => request("/events", { method: "POST", body: JSON.stringify(event) }),
    update: (id, event) => request(`/events/${id}`, { method: "PATCH", body: JSON.stringify(event) }),
    respond: (id, status, options = {}) => request(`/events/${id}/response`, { method: "PATCH", body: JSON.stringify({ status, ...options }) }),
    remove: (id) => request(`/events/${id}`, { method: "DELETE" }),
};
