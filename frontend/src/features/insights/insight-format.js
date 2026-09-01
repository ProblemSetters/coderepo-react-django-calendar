import { formatInZone } from "../../shared/utils/time-zone.js";

export function formatInsightDuration(minutes) {
    if (!minutes) return "0 hr";
    const hours = Math.round((minutes / 60) * 10) / 10;
    return `${hours} hr`;
}

export function formatInsightDate(date) {
    return formatInZone(date, { weekday: "long", month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}
