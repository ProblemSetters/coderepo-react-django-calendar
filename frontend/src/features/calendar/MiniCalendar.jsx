import { addDays, addMonths, dateKey, startOfMonth, startOfWeek } from "../../shared/utils/date.js";
import { formatInZone, partsAt } from "../../shared/utils/time-zone.js";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";

export function MiniCalendar({ cursor, month, onMonthChange, onSelect }) {
    const start = startOfWeek(startOfMonth(month));
    const todayKey = dateKey(new Date());
    const selectedKey = dateKey(cursor);
    return (
        <section className="mini-calendar" aria-label="Mini calendar">
            <div className="mini-calendar-header">
                <strong>{formatInZone(month, { month: "long", year: "numeric" })}</strong>
                <div>
                    <button className="icon-button" data-testid="mini-calendar-previous" aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))}><MaterialIcon size={18}>chevron_left</MaterialIcon></button>
                    <button className="icon-button" data-testid="mini-calendar-next" aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))}><MaterialIcon size={18}>chevron_right</MaterialIcon></button>
                </div>
            </div>
            <div className="mini-grid" role="grid">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span className="mini-weekday" key={`${day}-${index}`}>{day}</span>)}
                {Array.from({ length: 42 }, (_, index) => addDays(start, index)).map((date) => {
                    const key = dateKey(date);
                    return <button key={key} data-date={key} data-testid={`mini-calendar-day-${key}`} className={`mini-date ${partsAt(date).month !== partsAt(month).month ? "outside" : ""} ${key === todayKey ? "today" : ""} ${key === selectedKey ? "selected" : ""}`} aria-label={formatInZone(date, { month: "long", day: "numeric", year: "numeric" })} onClick={() => onSelect(date)}>{partsAt(date).day}</button>;
                })}
            </div>
        </section>
    );
}
