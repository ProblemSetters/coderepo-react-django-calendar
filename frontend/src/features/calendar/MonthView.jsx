import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, dateKey, formatTime, isSameDay, startOfDay, startOfMonth, startOfWeek } from "../../shared/utils/date.js";
import { formatInZone, partsAt, zonedDateTime } from "../../shared/utils/time-zone.js";
import { foregroundForColor } from "./calendar-colors.js";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";

export function MonthView({ calendars, cursor, events, onCreate, onDaySelect, onEventSelect }) {
    const [overflowDay, setOverflowDay] = useState(null);
    const popoverReference = useRef(null);
    const start = startOfWeek(startOfMonth(cursor));
    const dates = Array.from({ length: 42 }, (_, index) => addDays(start, index));
    const colorFor = (event) => event.color || calendars.find((calendar) => calendar._id === String(event.calendarId))?.color || "#1a73e8";
    const overlapsDate = (event, date) => { const start = startOfDay(date); return new Date(event.startAt) < addDays(start, 1) && new Date(event.endAt) > start; };
    useEffect(() => {
        if (!overflowDay) return undefined;
        const closeOnPointerDown = (event) => { if (!popoverReference.current?.contains(event.target)) setOverflowDay(null); };
        const closeOnEscape = (event) => { if (event.key === "Escape") setOverflowDay(null); };
        document.addEventListener("pointerdown", closeOnPointerDown);
        document.addEventListener("keydown", closeOnEscape);
        return () => { document.removeEventListener("pointerdown", closeOnPointerDown); document.removeEventListener("keydown", closeOnEscape); };
    }, [overflowDay]);
    const openOverflow = (event, date, dayEvents) => {
        event.stopPropagation();
        const bounds = event.currentTarget.closest(".month-cell").getBoundingClientRect();
        const width = Math.min(292, window.innerWidth - 24);
        setOverflowDay({
            date,
            events: dayEvents,
            left: Math.max(12, Math.min(window.innerWidth - width - 12, bounds.left + bounds.width / 2 - width / 2)),
            top: Math.max(12, Math.min(window.innerHeight - 340, bounds.top + 22)),
            width,
        });
    };
    const overflowPopover = overflowDay && createPortal(<section className="month-day-popover" ref={popoverReference} role="dialog" aria-label={`Events on ${formatInZone(overflowDay.date, { month: "long", day: "numeric", year: "numeric" })}`} style={{ left: `${overflowDay.left}px`, top: `${overflowDay.top}px`, width: `${overflowDay.width}px` }}>
        <button type="button" className="month-day-popover-close" aria-label="Close day events" onClick={() => setOverflowDay(null)}><MaterialIcon size={22}>close</MaterialIcon></button>
        <button type="button" className={`month-day-popover-date ${isSameDay(overflowDay.date, new Date()) ? "today" : ""}`} aria-label={`Open ${formatInZone(overflowDay.date, { weekday: "long", month: "long", day: "numeric" })} in day view`} onClick={() => { const date = overflowDay.date; setOverflowDay(null); onDaySelect(date); }}><span>{formatInZone(overflowDay.date, { weekday: "short" })}</span><strong>{partsAt(overflowDay.date).day}</strong></button>
        <div className="month-day-popover-events">{overflowDay.events.map((event) => {
            const background = colorFor(event);
            const time = event.allDay ? "" : isSameDay(event.startAt, overflowDay.date) ? formatTime(event.startAt) : "Continues";
            const filled = !event.responseStatus || event.responseStatus === "accepted";
            return <button type="button" className={`month-day-popover-event ${event.allDay ? "all-day" : ""}`} data-item-type={event.type || "event"} data-response-status={event.responseStatus} key={event.occurrenceKey || event._id} style={event.allDay ? { backgroundColor: filled ? background : "var(--surface)", color: filled ? foregroundForColor(background) : background, borderColor: background } : undefined} onClick={() => { setOverflowDay(null); onEventSelect(event); }}>
                {event.type === "workingLocation" ? <MaterialIcon size={15}>business</MaterialIcon> : event.type === "outOfOffice" ? <MaterialIcon className="out-of-office-icon" size={16}>event_busy</MaterialIcon> : !event.allDay && <i style={{ borderColor: background, backgroundColor: event.color ? background : "transparent" }} />}
                <span>{time && <time>{time}</time>}<strong>{event.title}</strong></span>
            </button>;
        })}</div>
    </section>, document.body);
    return (
        <div className="month-view">
            <div className="month-weekdays">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => <span key={day}>{day.slice(0, 3)}</span>)}</div>
            <div className="month-grid">
                {dates.map((date) => {
                    const dayEvents = events.filter((event) => overlapsDate(event, date));
                    const shown = dayEvents.slice(0, 3);
                    return <div className={`month-cell ${partsAt(date).month !== partsAt(cursor).month ? "outside" : ""} ${isSameDay(date, new Date()) ? "today" : ""}`} data-testid={`calendar-day-${dateKey(date)}`} key={dateKey(date)} onClick={(clickEvent) => { if (clickEvent.target.closest("button")) return; onCreate(zonedDateTime(dateKey(date), 9 * 60)); }}>
                        <button className="month-date" aria-label={`Open ${formatInZone(date, { month: "long", day: "numeric", year: "numeric" })}`} onClick={() => onDaySelect(date)}>{partsAt(date).day}</button>
                        <div className="month-events">
                            {shown.map((event) => {
                                const time = event.allDay ? "All day" : isSameDay(event.startAt, date) ? formatTime(event.startAt) : "Continues";
                                const background = colorFor(event);
                                const filled = !event.responseStatus || event.responseStatus === "accepted";
                                return <button aria-label={`${event.title}, ${time}`} key={event.occurrenceKey || event._id} data-item-type={event.type || "event"} data-response-status={event.responseStatus} className={`month-event ${event.allDay ? "all-day" : ""}`} data-testid={`event-chip-${event._id}`} onClick={() => onEventSelect(event)}>{event.allDay ? <span className="event-fill" style={{ backgroundColor: filled ? background : "var(--surface)", color: filled ? foregroundForColor(background) : background, borderColor: background }}>{event.type === "outOfOffice" && <MaterialIcon className="out-of-office-icon" size={14}>event_busy</MaterialIcon>}<span>{event.title}</span></span> : <>{event.type === "outOfOffice" ? <MaterialIcon className="out-of-office-icon" size={15}>event_busy</MaterialIcon> : <i style={{ backgroundColor: background }} />}<span>{time}</span><strong>{event.title}</strong></>}</button>;
                            })}
                            {dayEvents.length > shown.length && <button className="more-events" data-testid={`month-more-${dateKey(date)}`} aria-haspopup="dialog" onClick={(event) => openOverflow(event, date, dayEvents)}>+{dayEvents.length - shown.length} more</button>}
                        </div>
                    </div>;
                })}
            </div>
            {overflowPopover}
        </div>
    );
}
