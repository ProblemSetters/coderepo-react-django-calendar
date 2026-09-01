import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { SelectMenu } from "../../shared/components/SelectMenu.jsx";
import { toDateInput } from "../../shared/utils/date.js";
import { identityInitials } from "../../shared/utils/identity.js";
import { availabilityApi } from "./availability.api.js";
import { DISPLAY_TIME_ZONE } from "../../shared/utils/time-zone.js";
import { localDateKey, minutesOf } from "../../shared/utils/time-zone.js";

const rawTimeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const formatTime = (date) => rawTimeFormatter.format(date).replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const sameDay = (left, right) => localDateKey(left) === localDateKey(right);
const minuteOfDay = (date) => minutesOf(date);

function AvailabilityTrack({ busy, color = "#5f6368", date, name }) {
    const blocks = busy.filter((block) => sameDay(new Date(block.startAt), date));
    return <div className="availability-row">
        <span>{name}</span>
        <div className="availability-track" aria-label={`${name} availability`}>
            {blocks.map((block, index) => {
                const start = Math.max(540, minuteOfDay(new Date(block.startAt)));
                const end = Math.min(1080, minuteOfDay(new Date(block.endAt)));
                if (end <= start) return null;
                return <i key={`${block.startAt}-${index}`} title={`${block.title}: ${formatTime(new Date(block.startAt))} – ${formatTime(new Date(block.endAt))}`} style={{ left: `${(start - 540) / 540 * 100}%`, width: `${(end - start) / 540 * 100}%`, backgroundColor: color }} />;
            })}
        </div>
    </div>;
}

export function SuggestedTimesDrawer({ cursor, people, onChoose, onClose }) {
    const [date, setDate] = useState(toDateInput(cursor));
    const [durationMinutes, setDurationMinutes] = useState(30);
    const [data, setData] = useState(null);
    const [status, setStatus] = useState({ loading: true, error: "" });
    const drawer = useRef(null);
    const closeButton = useRef(null);
    const requestId = useRef(0);
    const selectedDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);
    const changeDate = (event) => setDate(event.currentTarget.value);

    const load = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setStatus({ loading: true, error: "" });
        try {
            const nextData = await availabilityApi.suggestions({ participantIds: people.map((person) => person._id), from: date, timeZone: DISPLAY_TIME_ZONE, days: 5, durationMinutes });
            if (requestId.current === currentRequest) { setData(nextData); setStatus({ loading: false, error: "" }); }
        } catch (error) {
            if (requestId.current === currentRequest) setStatus({ loading: false, error: error.message });
        }
    }, [date, durationMinutes, people]);
    useEffect(() => {
        const timer = window.setTimeout(load, 0);
        return () => { window.clearTimeout(timer); requestId.current += 1; };
    }, [load]);
    useEffect(() => {
        const previouslyFocused = document.activeElement;
        closeButton.current?.focus();
        const keyboard = (event) => {
            if (event.key === "Escape") onClose();
            if (event.key !== "Tab") return;
            const controls = [...(drawer.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)") || [])];
            if (!controls.length) return;
            if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
            if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
        };
        document.addEventListener("keydown", keyboard);
        return () => { document.removeEventListener("keydown", keyboard); previouslyFocused?.focus?.(); };
    }, [onClose]);

    return <>
        <button className="suggestions-scrim" aria-label="Close suggested times" onClick={onClose} tabIndex={-1} />
        <aside className="suggestions-drawer" aria-labelledby="suggestions-title" aria-modal="true" ref={drawer} role="dialog">
            <header className="suggestions-header">
                <div><p>FIND A TIME</p><h2 id="suggestions-title">Suggested times</h2></div>
                <button className="icon-button" aria-label="Close suggested times" onClick={onClose} ref={closeButton}><MaterialIcon>close</MaterialIcon></button>
            </header>
            <div className="suggestions-content">
                <div className="suggestion-people" aria-label={`${people.length} selected ${people.length === 1 ? "person" : "people"}`}>
                    {people.map((person) => <span className="person-avatar" key={person._id} style={{ backgroundColor: person.avatarColor }} title={`${person.name} (${person.email})`}>{identityInitials(person.name)}</span>)}
                    <div><strong>{people.map((person) => person.name).join(", ")}</strong><small>{people.length + 1} attendees including you</small></div>
                </div>
                <div className="suggestion-controls">
                    <label>Starting date<input type="date" value={date} onChange={changeDate} onInput={changeDate} /></label>
                    <div className="select-field">Duration<SelectMenu ariaLabel="Duration" value={durationMinutes} onChange={(value) => setDurationMinutes(Number(value))} options={[{ value: 30, label: "30 minutes" }, { value: 45, label: "45 minutes" }, { value: 60, label: "1 hour" }, { value: 90, label: "1.5 hours" }, { value: 120, label: "2 hours" }]} /></div>
                </div>
                <section className="availability-preview" aria-labelledby="availability-heading">
                    <div className="suggestions-section-title"><div><h3 id="availability-heading">Availability</h3><p>{dateFormatter.format(selectedDate)}</p></div><span>9 AM <i /> 6 PM</span></div>
                    {status.loading ? <div className="suggestions-loading" role="status">Checking everyone’s calendar…</div> : data && <>
                        <AvailabilityTrack busy={data.owner.busy} date={selectedDate} name="You" />
                        {data.participants.map(({ person, busy }) => <AvailabilityTrack busy={busy} color={person.avatarColor} date={selectedDate} key={person._id} name={person.name.split(" ")[0]} />)}
                    </>}
                </section>
                <section className="best-times" aria-labelledby="best-times-heading">
                    <div className="suggestions-section-title"><div><h3 id="best-times-heading">Best available times</h3><p>Free for everyone</p></div></div>
                    {status.loading && <div className="suggestions-loading" role="status">Finding the best times…</div>}
                    {!status.loading && status.error && <div className="suggestions-error" role="alert"><p>{status.error}</p><button onClick={load}>Try again</button></div>}
                    {!status.loading && !status.error && !data?.suggestions.length && <div className="no-suggestions"><MaterialIcon size={28}>event_busy</MaterialIcon><strong>No open times found</strong><span>Try another date or a shorter duration.</span></div>}
                    {!status.loading && !status.error && data?.suggestions.map((suggestion) => <button aria-label={`${dateFormatter.format(new Date(suggestion.startAt))}, ${formatTime(new Date(suggestion.startAt))} – ${formatTime(new Date(suggestion.endAt))}, ${suggestion.attendeeCount} available`} className="suggestion-card" data-testid={`suggested-time-${suggestion.startAt}`} key={suggestion.startAt} onClick={() => onChoose(suggestion, people)}>
                        <span className="suggestion-date"><strong>{dateFormatter.format(new Date(suggestion.startAt))}</strong><small>{formatTime(new Date(suggestion.startAt))} – {formatTime(new Date(suggestion.endAt))}</small></span>
                        <span className="suggestion-available"><MaterialIcon size={18}>group</MaterialIcon>{suggestion.attendeeCount} available</span>
                        <MaterialIcon>chevron_right</MaterialIcon>
                    </button>)}
                </section>
            </div>
        </aside>
    </>;
}
