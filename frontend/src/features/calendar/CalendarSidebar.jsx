import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { CalendarEditor } from "./CalendarEditor.jsx";
import { CalendarOptionsMenu } from "./CalendarOptionsMenu.jsx";
import { MiniCalendar } from "./MiniCalendar.jsx";
import { TimeInsightsSummary } from "../insights/TimeInsightsSummary.jsx";
import { MeetWith } from "../people/MeetWith.jsx";
import { foregroundForColor } from "./calendar-colors.js";

const createOptions = [
    { type: "event", label: "Event" },
    { type: "task", label: "Task" },
    { type: "outOfOffice", label: "Out of office" },
    { type: "focusTime", label: "Focus time" },
    { type: "workingLocation", label: "Working location" },
    { type: "appointmentSchedule", label: "Appointment schedule" },
];

export function CalendarSidebar({ calendars, collapsed, cursor, insights, insightsError, insightsLoading, meetingPeople, miniMonth, onCalendarCreate, onCalendarDelete, onCalendarDisplayOnly, onCalendarUpdate, onCreate, onInsightsOpen, onInsightsRetry, onMeetingPeopleChange, onMiniMonthChange, onOpenSuggestions, onSelectDate }) {
    const [creating, setCreating] = useState(false);
    const [createMenuOpen, setCreateMenuOpen] = useState(false);
    const [editingCalendar, setEditingCalendar] = useState(null);
    const [menu, setMenu] = useState(null);
    const [operationError, setOperationError] = useState("");
    const createMenuReference = useRef(null);
    useEffect(() => {
        if (!createMenuOpen) return undefined;
        const closeMenu = (event) => { if (!createMenuReference.current?.contains(event.target)) setCreateMenuOpen(false); };
        const closeOnEscape = (event) => { if (event.key === "Escape") setCreateMenuOpen(false); };
        document.addEventListener("pointerdown", closeMenu);
        document.addEventListener("keydown", closeOnEscape);
        return () => { document.removeEventListener("pointerdown", closeMenu); document.removeEventListener("keydown", closeOnEscape); };
    }, [createMenuOpen]);
    return (
        <aside className="sidebar" aria-hidden={collapsed} inert={collapsed}><div className="sidebar-inner">
            <div className="create-menu-anchor" ref={createMenuReference}>
                <button className="create-button" data-testid="create-event-button" aria-expanded={createMenuOpen} aria-haspopup="menu" onClick={() => setCreateMenuOpen((open) => !open)}><MaterialIcon size={28}>add</MaterialIcon><span>Create</span><MaterialIcon className="create-chevron" size={18}>arrow_drop_down</MaterialIcon></button>
                {createMenuOpen && <div className="google-menu create-menu" role="menu" aria-label="Create calendar item">{createOptions.map((option) => <button key={option.type} role="menuitem" onClick={() => { setCreateMenuOpen(false); onCreate(option.type); }}>{option.label}</button>)}</div>}
            </div>
            <MiniCalendar cursor={cursor} month={miniMonth} onMonthChange={onMiniMonthChange} onSelect={onSelectDate} />
            <MeetWith onOpenSuggestions={onOpenSuggestions} onSelectionChange={onMeetingPeopleChange} selectedPeople={meetingPeople} />
            <TimeInsightsSummary cursor={cursor} error={insightsError} insights={insights} loading={insightsLoading} onOpen={onInsightsOpen} onRetry={onInsightsRetry} />
            <div className="calendar-list-heading"><h2>My calendars</h2><button className="icon-button" title="Add calendar" aria-label="Add calendar" onClick={() => setCreating(true)}><MaterialIcon>add</MaterialIcon></button></div>
            <div className="calendar-list">
                {calendars.map((calendar) => (
                    <div className={`calendar-row ${menu?.id === calendar._id ? "menu-open" : ""}`} key={calendar._id}>
                        <label>
                            <input className="calendar-checkbox" type="checkbox" checked={calendar.visible} data-testid={`calendar-toggle-${calendar._id}`} onChange={(event) => onCalendarUpdate(calendar._id, { visible: event.target.checked }).catch((error) => setOperationError(error.message))} />
                            <span className="calendar-checkmark" style={{ "--calendar-color": calendar.color, "--calendar-foreground": foregroundForColor(calendar.color) }}><MaterialIcon size={16}>check</MaterialIcon></span>
                            <span>{calendar.name}</span>
                        </label>
                        <button className="icon-button calendar-menu" aria-label={`Manage ${calendar.name}`} aria-expanded={menu?.id === calendar._id} aria-haspopup="menu" onClick={(event) => { const rectangle = event.currentTarget.getBoundingClientRect(); setMenu((current) => current?.id === calendar._id ? null : { id: calendar._id, position: { left: Math.min(rectangle.right + 8, window.innerWidth - 258), top: Math.max(8, Math.min(rectangle.top - 8, window.innerHeight - 320)) } }); }}><MaterialIcon>more_vert</MaterialIcon></button>
                        {menu?.id === calendar._id && <CalendarOptionsMenu calendar={calendar} onClose={() => setMenu(null)} onDisplayOnly={onCalendarDisplayOnly} onSettings={setEditingCalendar} onUpdate={onCalendarUpdate} position={menu.position} />}
                    </div>
                ))}
            </div>
            {creating && <CalendarEditor onClose={() => setCreating(false)} onSave={onCalendarCreate} usedColors={calendars.map((calendar) => calendar.color)} />}
            {editingCalendar && <CalendarEditor calendar={editingCalendar} onClose={() => setEditingCalendar(null)} onDelete={async (calendar) => { if (await onCalendarDelete(calendar)) setEditingCalendar(null); }} onSave={(values) => onCalendarUpdate(editingCalendar._id, values).then(() => setEditingCalendar(null))} />}
            {operationError && <p className="sidebar-error" role="alert">{operationError}</p>}
            <footer className="sidebar-footer"><a href="#terms">Terms</a><span aria-hidden="true">–</span><a href="#privacy">Privacy</a></footer>
        </div></aside>
    );
}
