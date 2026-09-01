import { request } from "../../shared/api/client.js";

export const availabilityApi = {
    suggestions: (payload) => request("/availability/suggestions", { method: "POST", body: JSON.stringify(payload) }),
    conflicts: (payload) => request("/availability/conflicts", { method: "POST", body: JSON.stringify(payload) }),
};
