import { formatTime } from "../../shared/utils/date.js";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatInZone } from "../../shared/utils/time-zone.js";

export function SearchResults({ calendars, criteria, error, loading, onClear, onEventSelect, results }) {
    const description = [criteria.what && `“${criteria.what}”`, criteria.who && `person: ${criteria.who}`, criteria.where && `place: ${criteria.where}`, criteria.exclude && `excluding: ${criteria.exclude}`].filter(Boolean).join(" · ") || "the selected dates and calendars";
    if (loading) return <div className="view-status" role="status">Searching events…</div>;
    if (error) return <div className="empty-state error-state" role="alert"><h2>Search failed</h2><p>{error}</p><button onClick={onClear}>Modify search</button></div>;
    if (!results.length) return <div className="empty-state"><h2>No results found</h2><p>No calendar items matched {description}.</p><button onClick={onClear}>Modify search</button></div>;
    const now = new Date();
    const sections = [{ title: "Upcoming", events: results.filter((event) => new Date(event.endAt) >= now) }, { title: "Past", events: results.filter((event) => new Date(event.endAt) < now).reverse() }];
    return <div className="search-results"><div className="search-results-toolbar"><span>Results for {description}</span><button onClick={onClear}>Modify search</button></div>{sections.filter((section) => section.events.length).map((section) => <section key={section.title}><h2>{section.title}</h2>{section.events.map((event) => {
        const calendar = calendars.find((item) => item._id === String(event.calendarId));
        return <button key={event.occurrenceKey || event._id} className="search-result" data-item-type={event.type || "event"} data-response-status={event.responseStatus} onClick={() => onEventSelect(event)}><time>{formatInZone(event.startAt, { month: "short", day: "numeric", year: "numeric" })}<span>{event.allDay ? "All day" : formatTime(event.startAt)}</span></time>{event.type === "outOfOffice" ? <MaterialIcon className="out-of-office-icon" size={18}>event_busy</MaterialIcon> : <i style={{ backgroundColor: event.color || calendar?.color }} />}<span><strong>{event.title}</strong><small>{[event.location, calendar?.name].filter(Boolean).join(" · ")}</small></span></button>;
    })}</section>)}</div>;
}
