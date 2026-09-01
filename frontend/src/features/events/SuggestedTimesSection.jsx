import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { toDateInput } from "../../shared/utils/date.js";
import { availabilityApi } from "../people/availability.api.js";
import { DISPLAY_TIME_ZONE } from "../../shared/utils/time-zone.js";

const VISIBLE_SUGGESTIONS = 5;
const SEARCH_DAYS = 5;
const REQUEST_DELAY = 250;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const formatTime = (date) => timeFormatter.format(date).replace(/\s?(AM|PM)/i, (match) => match.trim().toLowerCase());

export function SuggestedTimesSection({ cursor, durationMinutes, onChoose, people }) {
    const [open, setOpen] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [selected, setSelected] = useState("");
    const [data, setData] = useState(null);
    const [status, setStatus] = useState({ loading: true, error: "" });
    const requestId = useRef(0);
    const from = toDateInput(cursor);
    const participantKey = people.map((person) => person._id).filter((id) => objectIdPattern.test(String(id))).join(",");

    const load = useCallback(async () => {
        if (!participantKey) return;
        const currentRequest = ++requestId.current;
        setStatus({ loading: true, error: "" });
        try {
            const next = await availabilityApi.suggestions({
                participantIds: participantKey.split(","),
                from,
                timeZone: DISPLAY_TIME_ZONE,
                days: SEARCH_DAYS,
                durationMinutes,
            });
            if (requestId.current === currentRequest) { setData(next); setStatus({ loading: false, error: "" }); }
        } catch (error) {
            if (requestId.current === currentRequest) setStatus({ loading: false, error: error.message });
        }
    }, [durationMinutes, from, participantKey]);

    useEffect(() => {
        const timer = window.setTimeout(load, REQUEST_DELAY);
        return () => { window.clearTimeout(timer); requestId.current += 1; };
    }, [load]);

    if (!participantKey) return null;

    const suggestions = data?.suggestions || [];
    const shown = expanded ? suggestions : suggestions.slice(0, VISIBLE_SUGGESTIONS);

    return <div className="form-row suggested-times-row">
        <MaterialIcon>history</MaterialIcon>
        <section className="suggested-times" aria-labelledby="suggested-times-heading">
            <button className="suggested-times-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <h3 id="suggested-times-heading">Suggested times</h3>
                <MaterialIcon size={20}>{open ? "expand_less" : "expand_more"}</MaterialIcon>
            </button>
            {open && <>
                {status.loading && <p className="suggested-times-note" role="status">Checking everyone’s calendar…</p>}
                {!status.loading && status.error && <p className="suggested-times-note suggested-times-error" role="alert">{status.error} <button type="button" onClick={load}>Try again</button></p>}
                {!status.loading && !status.error && !suggestions.length && <p className="suggested-times-note">No times work for everyone in the next {SEARCH_DAYS} days.</p>}
                {!status.loading && !status.error && suggestions.length > 0 && <p className="suggested-times-note">Everyone is available</p>}
                {!status.loading && !status.error && shown.map((suggestion) => {
                    const start = new Date(suggestion.startAt);
                    const end = new Date(suggestion.endAt);
                    return <label className="suggested-time" key={suggestion.startAt}>
                        <input
                            type="radio"
                            name="suggested-time"
                            data-testid={`suggested-time-${suggestion.startAt}`}
                            checked={selected === suggestion.startAt}
                            onChange={() => { setSelected(suggestion.startAt); onChoose(suggestion); }}
                        />
                        <span className="suggested-time-mark" aria-hidden="true" />
                        <span className="suggested-time-label">{`${dateFormatter.format(start)} · ${formatTime(start)} – ${formatTime(end)}`}</span>
                    </label>;
                })}
                {!status.loading && !status.error && suggestions.length > VISIBLE_SUGGESTIONS && <div className="suggested-times-footer">
                    <button className="link-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Fewer suggestions" : "More suggestions"}</button>
                </div>}
            </>}
        </section>
    </div>;
}
