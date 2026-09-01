import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatInsightDate, formatInsightDuration } from "./insight-format.js";

function buildGradient(items, total) {
    if (!total) return "conic-gradient(var(--border-strong) 0 100%)";
    let cursor = 0;
    const stops = [];
    for (const item of items.filter(({ minutes }) => minutes > 0)) {
        const end = cursor + item.minutes / total * 100;
        stops.push(`${item.color} ${cursor}% ${end}%`);
        cursor = end;
    }
    if (cursor < 100) stops.push(`var(--border-strong) ${cursor}% 100%`);
    return `conic-gradient(${stops.join(", ")})`;
}

export function TimeInsightsDrawer({ cursor, insights, loading = false, onClose, onScheduleFocus }) {
    const [breakdown, setBreakdown] = useState("type");
    const drawerReference = useRef(null);
    const closeReference = useRef(null);
    useEffect(() => {
        const previouslyFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeReference.current?.focus();
        const handleKeyboard = (event) => {
            if (event.key === "Escape") onClose();
            if (event.key !== "Tab") return;
            const controls = [...(drawerReference.current?.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") || [])];
            if (!controls.length) return;
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener("keydown", handleKeyboard);
        return () => {
            document.removeEventListener("keydown", handleKeyboard);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    }, [onClose]);
    const typeItems = insights?.categories || [];
    const calendarItems = insights?.calendars || [];
    const items = breakdown === "type" ? typeItems : calendarItems;
    const busyMinutes = insights?.totalScheduledMinutes || 0;
    const total = Math.max(insights?.workingDayMinutes || 480, busyMinutes);
    const chartItems = useMemo(() => items.map((item) => ({ ...item, color: item.color || "#5f6368" })), [items]);
    return <>
        <button className="insights-scrim" aria-label="Close time insights" onClick={onClose} tabIndex={-1} />
        <aside className="insights-drawer" aria-labelledby="time-insights-title" aria-modal="true" ref={drawerReference} role="dialog">
            <header className="insights-drawer-header">
                <div><p>{formatInsightDate(cursor)}</p><h2 id="time-insights-title">Time Insights <span><MaterialIcon size={16}>lock</MaterialIcon></span></h2></div>
                <button className="icon-button" aria-label="Close time insights" onClick={onClose} ref={closeReference}><MaterialIcon size={24}>close</MaterialIcon></button>
            </header>
            <div className="insights-drawer-content">
                <div className="insights-breakdown-heading"><h3>Time breakdown</h3><MaterialIcon size={20}>help</MaterialIcon></div>
                <div className="insights-segmented" role="group" aria-label="Time breakdown grouping">
                    <button className={breakdown === "type" ? "active" : ""} aria-pressed={breakdown === "type"} onClick={() => setBreakdown("type")}>{breakdown === "type" && <MaterialIcon size={18}>check</MaterialIcon>}By type</button>
                    <button className={breakdown === "calendar" ? "active" : ""} aria-pressed={breakdown === "calendar"} onClick={() => setBreakdown("calendar")}>{breakdown === "calendar" && <MaterialIcon size={18}>check</MaterialIcon>}By calendar</button>
                </div>
                {loading ? <div className="insights-drawer-loading" role="status">Calculating your time…</div> : <>
                    <div className="insights-donut" style={{ background: buildGradient(chartItems, total) }}><div><strong>{formatInsightDuration(busyMinutes)}</strong><span>scheduled</span></div></div>
                    <div className="insights-metrics">
                        {items.map((item) => <div className="insight-metric" key={item.key || item.calendarId}><i style={{ backgroundColor: item.color }} /><span>{item.label || item.name}</span><strong>{formatInsightDuration(item.minutes)}</strong></div>)}
                        <div className="insight-metric"><i className="remaining" /><span>Remaining time</span><strong>{formatInsightDuration(insights?.remainingMinutes || 0)}</strong></div>
                    </div>
                    <button className="schedule-focus-button" data-testid="schedule-focus-time" onClick={onScheduleFocus}><MaterialIcon size={20}>headphones</MaterialIcon><span>Schedule focus time</span></button>
                </>}
            </div>
        </aside>
    </>;
}
