import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatTime, formatTimeZoneOffset, startOfDay, toDateInput } from "../../shared/utils/date.js";
import { identityInitials } from "../../shared/utils/identity.js";
import { getEventColumnGeometry, layoutTimedEvents } from "../calendar/event-layout.js";
import { foregroundForColor } from "../calendar/calendar-colors.js";
import { availabilityApi } from "./availability.api.js";
import { DISPLAY_TIME_ZONE } from "../../shared/utils/time-zone.js";
import { formatInZone, localDateKey, minutesOf, partsAt, zonedDateTime } from "../../shared/utils/time-zone.js";

const hourHeight = 64;
const ownerHours = { startMinute: 9 * 60, endMinute: 17 * 60 + 30 };

function BusyBlocks({ blocks, color, onSelect, person }) {
    const positioned = layoutTimedEvents(blocks.map((block, index) => ({ ...block, _id: block._id || `${block.startAt}-${index}` })));
    return positioned.map(({ event, column, columns }) => {
        const start = new Date(event.startAt);
        const end = new Date(event.endAt);
        const startMinute = minutesOf(start);
        const actualDurationMinutes = Math.max(1, (end - start) / 60000);
        const duration = Math.max(20, actualDurationMinutes);
        const density = actualDurationMinutes <= 30 ? "micro" : actualDurationMinutes < 60 ? "compact" : "comfortable";
        const geometry = getEventColumnGeometry(column, columns);
        const background = event.color || color;
        return <button type="button" className="comparison-busy" data-density={density} data-item-type={event.type || "event"} key={event._id} style={{ backgroundColor: background, color: foregroundForColor(background), top: `${startMinute / 60 * hourHeight}px`, height: `${duration / 60 * hourHeight}px`, left: `${geometry.left}%`, width: `calc(${geometry.width}% - 6px)`, zIndex: geometry.zIndex + 2 }} title={`${event.title}: ${formatTime(event.startAt)} – ${formatTime(event.endAt)}`} aria-label={`${event.title || "Busy"}, ${formatTime(event.startAt)} to ${formatTime(event.endAt)}, ${person.name}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); onSelect(event, person, color); }}>
            {event.type === "outOfOffice" && <MaterialIcon className="out-of-office-icon" size={16}>event_busy</MaterialIcon>}<strong>{event.title || "Busy"}</strong><span>{formatTime(event.startAt)} – {formatTime(event.endAt)}</span>
        </button>;
    });
}

function ScheduleColumn({ blocks, color, name, onBusySelect, onTryCreate, person, workingIntervals = [] }) {
    return <div className={`comparison-column ${person._id === "owner" ? "owner-column" : ""}`} aria-label={`${name} schedule`} onClick={(event) => {
        if (!onTryCreate) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const minute = Math.max(0, Math.min(1439, (event.clientY - bounds.top) / hourHeight * 60));
        onTryCreate(Math.floor(minute / 15) * 15, person, workingIntervals);
    }}>
        {workingIntervals.map((interval) => {
            const start = new Date(interval.startAt);
            const end = new Date(interval.endAt);
            const startMinute = minutesOf(start);
            const duration = Math.max(0, (end - start) / 60000);
            return <span aria-hidden="true" className="comparison-working-window" data-testid={`working-window-${person._id}`} key={interval.startAt} style={{ top: `${startMinute / 60 * hourHeight}px`, height: `${duration / 60 * hourHeight}px` }} />;
        })}
        <BusyBlocks blocks={blocks} color={color} onSelect={onBusySelect} person={person} />
    </div>;
}

export function AvailabilityComparison({ cursor, onCreate, onEventSelect = () => {}, ownerColor = "#039be5", people }) {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState({ loading: true, error: "" });
    const [slotNotice, setSlotNotice] = useState("");
    const scrollReference = useRef(null);
    const requestId = useRef(0);
    const day = useMemo(() => startOfDay(cursor), [cursor]);
    const columns = useMemo(() => [{ person: { _id: "owner", name: "You", avatarColor: ownerColor, workingHours: data?.owner?.workingHours || ownerHours, timeZone: data?.owner?.timeZone }, workingIntervals: data?.owner?.workingIntervals || [], busy: data?.owner?.busy || [] }, ...(data?.participants || people.map((person) => ({ person, busy: [], workingIntervals: [] })))], [data, ownerColor, people]);
    const load = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setStatus({ loading: true, error: "" });
        try {
            const result = await availabilityApi.suggestions({ participantIds: people.map((person) => person._id), from: toDateInput(day), timeZone: DISPLAY_TIME_ZONE, days: 1, durationMinutes: 30 });
            if (currentRequest === requestId.current) { setData(result); setStatus({ loading: false, error: "" }); }
        } catch (error) {
            if (currentRequest === requestId.current) setStatus({ loading: false, error: error.message });
        }
    }, [day, people]);
    useEffect(() => {
        const timer = window.setTimeout(load, 0);
        return () => { window.clearTimeout(timer); requestId.current += 1; };
    }, [load]);
    useEffect(() => { if (scrollReference.current) scrollReference.current.scrollTop = 7 * hourHeight; }, [cursor]);
    useEffect(() => {
        if (!slotNotice) return undefined;
        const timer = window.setTimeout(() => setSlotNotice(""), 3000);
        return () => window.clearTimeout(timer);
    }, [slotNotice]);

    const minWidth = 80 + columns.length * 190;
    const tryCreateAtMinute = (minute, clickedPerson, clickedWorkingIntervals) => {
        if (status.loading) {
            setSlotNotice("Wait while everyone’s working hours are checked.");
            return;
        }
        if (status.error) {
            setSlotNotice("Working hours could not be verified. Retry the comparison before scheduling.");
            return;
        }
        const startAt = zonedDateTime(localDateKey(day), minute);
        const clickedOutsideHours = !clickedWorkingIntervals.some((interval) => startAt >= new Date(interval.startAt) && startAt < new Date(interval.endAt));
        if (clickedPerson._id !== "owner" && clickedOutsideHours) {
            setSlotNotice("You can’t schedule events for this calendar.");
            return;
        }
        setSlotNotice("");
        onCreate(startAt, people);
    };
    const selectBusyEvent = (block, person, color) => onEventSelect({
        ...block,
        editable: person._id === "owner" && Boolean(block._id),
        calendarName: person._id === "owner" ? "Your calendar" : `${person.name}’s calendar`,
        color: block.color || color,
        readOnlyOwner: person._id === "owner" ? "" : person.name,
    });
    return <div className="comparison-view">
        <div className="comparison-horizontal-scroll">
            <div className="comparison-content" style={{ minWidth: `${minWidth}px` }}>
                <header className="comparison-header" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(190px, 1fr))` }}>
                    <div className="comparison-date"><span>{formatInZone(day, { weekday: "short" })}</span><strong>{partsAt(day).day}</strong><small>{formatTimeZoneOffset(day)}</small></div>
                    {columns.map(({ person }) => <div className="comparison-person" key={person._id}>
                        <span className="person-avatar" style={{ backgroundColor: person.avatarColor }}>{identityInitials(person.name)}</span>
                        <strong title={person.email || person.name}>{person.name}</strong>
                    </div>)}
                </header>
                <div className="comparison-vertical-scroll" ref={scrollReference}>
                    <div className="comparison-grid" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(190px, 1fr))`, height: `${24 * hourHeight}px` }}>
                        <div className="time-axis comparison-axis">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: `${hour * hourHeight - 7}px` }}>{hour === 0 ? "" : formatInZone(Date.UTC(2000, 0, 1, hour), { hour: "numeric", hour12: true })}</span>)}</div>
                        {columns.map(({ person, busy, workingIntervals }) => <ScheduleColumn blocks={busy} color={person.avatarColor || "#1a73e8"} key={person._id} name={person.name} onBusySelect={selectBusyEvent} onTryCreate={tryCreateAtMinute} person={person} workingIntervals={workingIntervals} />)}
                    </div>
                </div>
            </div>
        </div>
        {status.loading && <div className="comparison-status" role="status"><MaterialIcon>sync</MaterialIcon>Comparing everyone’s calendar…</div>}
        {!status.loading && status.error && <div className="comparison-status error" role="alert"><span>{status.error}</span><button onClick={load}>Retry</button></div>}
        {slotNotice && !status.loading && <div className="comparison-slot-notice" role="status"><span>{slotNotice}</span><button type="button" aria-label="Dismiss scheduling notice" onClick={() => setSlotNotice("")}><MaterialIcon size={22}>close</MaterialIcon></button></div>}
    </div>;
}
