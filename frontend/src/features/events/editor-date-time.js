import { minutesOf, zonedDateTime } from "../../shared/utils/time-zone.js";

const pad = (value) => String(value).padStart(2, "0");

export function parseTimeInput(input) {
    const normalized = String(input || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const periodMatch = normalized.match(/(am|pm)$/);
    const period = periodMatch?.[1] || "";
    const numeric = period ? normalized.slice(0, -period.length) : normalized;
    let hourText; let minuteText;
    if (numeric.includes(":")) {
        const parts = numeric.split(":");
        if (parts.length !== 2) return null;
        [hourText, minuteText] = parts;
    } else if (/^\d{3,4}$/.test(numeric)) {
        hourText = numeric.slice(0, -2);
        minuteText = numeric.slice(-2);
    } else if (/^\d{1,2}$/.test(numeric)) {
        hourText = numeric;
        minuteText = "0";
    } else return null;
    let hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (period) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (period === "pm" ? 12 : 0);
    } else if (hour < 0 || hour > 23) return null;
    return `${pad(hour)}:${pad(minute)}`;
}

export function formatTimeInput(value) {
    const parsed = parseTimeInput(value);
    if (!parsed) return String(value || "");
    const [hour, minute] = parsed.split(":").map(Number);
    return `${hour % 12 || 12}:${pad(minute)}${hour >= 12 ? "pm" : "am"}`;
}

export function timeValue(date) {
    const minutes = minutesOf(date);
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function combineDateAndTime(date, time) {
    const parsed = parseTimeInput(time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsed) return null;
    const [hour, minute] = parsed.split(":").map(Number);
    const value = zonedDateTime(date, hour * 60 + minute);
    return Number.isNaN(value.getTime()) ? null : value;
}
