import { request } from "../../shared/api/client.js";

export const peopleApi = {
    search: (query = "") => request(`/people?q=${encodeURIComponent(query)}&limit=20`),
};
