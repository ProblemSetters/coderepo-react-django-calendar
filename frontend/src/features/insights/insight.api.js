import { request } from "../../shared/api/client.js";

export const insightApi = {
    daily(from, to, calendarIds) {
        const parameters = new URLSearchParams({ from, to, calendarIds: calendarIds.join(",") });
        return request(`/insights/daily?${parameters}`);
    },
};
