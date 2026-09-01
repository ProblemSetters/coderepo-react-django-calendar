import { useEffect, useRef } from "react";
import { addDays, dateKey, formatTime, formatTimeZoneOffset, isSameDay, startOfDay, startOfWeek } from "../../shared/utils/date.js";
import { formatInZone, minutesOf, partsAt, zonedDateTime } from "../../shared/utils/time-zone.js";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { getEventColumnGeometry, layoutTimedEvents } from "./event-layout.js";
import { foregroundForColor, overlapColor } from "./calendar-colors.js";

export const hourHeight = 48;
export const timeGridLayers = Object.freeze({ eventHover: 50, currentTime: 60 });
const cssNumber = (value) => Number(value.toFixed(4));

export function TimeGrid({ calendars, cursor, days, events, onCreate, onEventSelect }) {
    const scrollReference = useRef(null);
    const headerReference = useRef(null);
    const today = new Date();
    const start = days === 1 ? startOfDay(cursor) : startOfWeek(cursor);
    const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
    const overlapsDate = (event, date) => new Date(event.startAt) < addDays(startOfDay(date), 1) && new Date(event.endAt) > startOfDay(date);
    const workingLocations = events.filter((event) => event.allDay && event.type === "workingLocation");
    const allDayEvents = events.filter((event) => event.allDay && event.type !== "workingLocation");
    const timedEvents = events.filter((event) => !event.allDay);
    const hasVisibleAllDayEvents = dates.some((date) => allDayEvents.some((event) => overlapsDate(event, date)));
    const colorFor = (event) => event.color || calendars.find((calendar) => calendar._id === String(event.calendarId))?.color || "#1a73e8";
    useEffect(() => {
        const viewport = scrollReference.current;
        if (!viewport) return;
        const now = new Date();
        const viewStart = days === 1 ? startOfDay(cursor) : startOfWeek(cursor);
        const containsToday = now >= viewStart && now < addDays(viewStart, days);
        const targetHour = containsToday ? Math.max(0, Math.floor(minutesOf(now) / 60) - 2) : 7;
        viewport.scrollTop = targetHour * hourHeight;
    }, [cursor, days]);
    return (
        <div className={`time-view ${days === 1 ? "single-day" : "multi-day"}`}>
            <div ref={headerReference} className={`time-view-header ${days === 1 ? "single-day-header" : ""} ${hasVisibleAllDayEvents ? "has-all-day-events" : "empty-all-day"}`} style={{ gridTemplateColumns: `80px repeat(${days}, minmax(130px, 1fr))` }}>
                <div className="timezone-heading">{formatTimeZoneOffset(cursor)}</div>
                {dates.map((date) => {
                    const location = workingLocations.find((event) => overlapsDate(event, date));
                    return <div key={dateKey(date)} className={`day-heading ${isSameDay(date, today) ? "today" : ""}`} data-testid={`calendar-day-${dateKey(date)}`}>
                        <button className="day-heading-date" aria-label={`Create event on ${formatInZone(date, { month: "long", day: "numeric", year: "numeric" })}`} onClick={() => onCreate(zonedDateTime(dateKey(date), 9 * 60))}><span>{formatInZone(date, { weekday: "short" })}</span><strong>{partsAt(date).day}</strong></button>
                        {location && <button className="day-location-chip" onClick={() => onEventSelect(location)} aria-label={`Working location: ${location.title}`}><MaterialIcon size={14}>business</MaterialIcon><span>{location.title}</span></button>}
                    </div>;
                })}
                <div className="all-day-label" aria-hidden="true" />
                {dates.map((date) => <div className="all-day-cell" key={`all-${dateKey(date)}`}>{allDayEvents.filter((event) => overlapsDate(event, date)).map((event) => { const background = colorFor(event); const filled = !event.responseStatus || event.responseStatus === "accepted"; return <button key={event.occurrenceKey || event._id} data-testid={`all-day-chip-${event._id}`} className="all-day-event" data-item-type={event.type || "event"} data-response-status={event.responseStatus} style={{ "--event-color": background, backgroundColor: filled ? background : "var(--surface)", color: filled ? foregroundForColor(background) : background, borderColor: background, borderWidth: filled ? undefined : 1 }} onClick={() => onEventSelect(event)}>{event.type === "outOfOffice" && <MaterialIcon className="out-of-office-icon" size={15}>event_busy</MaterialIcon>}<span>{event.title}</span></button>; })}</div>)}
            </div>
            <div className="time-view-scroll" ref={scrollReference} onScroll={(event) => { if (headerReference.current) headerReference.current.scrollLeft = event.currentTarget.scrollLeft; }}>
                <div className="time-grid" style={{ gridTemplateColumns: `80px repeat(${days}, minmax(130px, 1fr))`, height: `${24 * hourHeight}px`, "--hour-row": `${hourHeight}px` }}>
                    <div className="time-axis">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: `${hour * hourHeight - 7}px` }}>{hour === 0 ? "" : formatInZone(Date.UTC(2000, 0, 1, hour), { hour: "numeric", hour12: true })}</span>)}</div>
                    {dates.map((date) => {
                        const dayStart = startOfDay(date);
                        const dayEnd = addDays(dayStart, 1);
                        const dayEvents = timedEvents.filter((event) => new Date(event.startAt) < dayEnd && new Date(event.endAt) > dayStart).map((event) => ({ ...event, originalEvent: event, startAt: new Date(Math.max(new Date(event.startAt), dayStart)), endAt: new Date(Math.min(new Date(event.endAt), dayEnd)) }));
                        const layout = layoutTimedEvents(dayEvents);
                    return <div key={dateKey(date)} className="time-column" style={{ "--event-hover-layer": timeGridLayers.eventHover, "--current-time-layer": timeGridLayers.currentTime }} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const minutes = Math.max(0, Math.min(1439, ((event.clientY - bounds.top) / hourHeight) * 60)); const slot = Math.floor(minutes / 30); onCreate(zonedDateTime(dateKey(date), slot * 30)); }}>
                            {isSameDay(date, today) && <div className="current-time" style={{ top: `${(minutesOf(today) / 60) * hourHeight}px` }}><i /></div>}
                            {layout.map(({ event, column, columns }) => {
                                const eventStart = new Date(event.startAt); const eventEnd = new Date(event.endAt);
                                const startMinutes = minutesOf(eventStart);
                                const actualDurationMinutes = Math.max(1, (eventEnd - eventStart) / 60000);
                                const durationMinutes = Math.max(30, actualDurationMinutes);
                                const rawTop = startMinutes / 60 * hourHeight;
                                const rawHeight = durationMinutes / 60 * hourHeight;
                                const geometry = getEventColumnGeometry(column, columns);
                                const rowInset = days === 1 ? 24 : 4;
                                const insetShare = rowInset / columns;
                                const eventLeft = column === 0 ? "0%" : `calc(${cssNumber(geometry.left)}% - ${cssNumber(insetShare * column)}px)`;
                                const eventWidth = `calc(${cssNumber(geometry.width)}% - ${cssNumber(insetShare)}px)`;
                                const density = actualDurationMinutes <= 30 ? "micro" : actualDurationMinutes < 60 ? "compact" : "comfortable";
                                const background = colorFor(event);
                                const filled = !event.responseStatus || event.responseStatus === "accepted";
                                const displayBackground = filled ? overlapColor(background, column, columns) : "var(--surface)";
                                const eventSummary = `${event.title}, ${formatTime(event.startAt)} – ${formatTime(event.endAt)}${event.location ? `, ${event.location}` : ""}`;
                                const overlapEdge = columns === 1 ? "single" : column === 0 ? "start" : column === columns - 1 ? "end" : "middle";
                                return <button aria-label={eventSummary} data-testid={`event-chip-${event._id}`} key={event.occurrenceKey || event._id} className="timed-event" data-crowded={columns >= 4 ? "true" : "false"} data-density={density} data-item-type={event.type || "event"} data-overlap={columns > 1 ? "true" : "false"} data-overlap-column={column} data-overlap-count={columns} data-overlap-edge={overlapEdge} data-response-status={event.responseStatus} style={{ "--event-base-layer": geometry.zIndex, "--event-color": background, backgroundColor: displayBackground, color: filled ? foregroundForColor(displayBackground) : background, borderColor: filled ? displayBackground : background, borderWidth: filled ? undefined : 1, top: `${rawTop + 2}px`, height: `${Math.max(20, rawHeight - 4)}px`, left: eventLeft, width: eventWidth, zIndex: geometry.zIndex }} onClick={(clickEvent) => { clickEvent.stopPropagation(); onEventSelect(event.originalEvent || event); }}>{event.type === "outOfOffice" && <MaterialIcon className="out-of-office-icon" size={16}>event_busy</MaterialIcon>}<strong>{event.title}</strong><span>{formatTime(event.startAt)} – {formatTime(event.endAt)}{event.location ? `, ${event.location}` : ""}</span></button>;
                            })}
                        </div>;
                    })}
                </div>
            </div>
        </div>
    );
}
