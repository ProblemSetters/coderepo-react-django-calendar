import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { Modal } from "../../shared/components/Modal.jsx";
import { ConfirmationDialog } from "../../shared/components/ConfirmationDialog.jsx";
import { SelectMenu } from "../../shared/components/SelectMenu.jsx";
import { addDays, dateKey, eventDefaults } from "../../shared/utils/date.js";
import { PeoplePicker } from "../people/PeoplePicker.jsx";
import { availabilityApi } from "../people/availability.api.js";
import { DatePickerPopover } from "./DatePickerPopover.jsx";
import { TimeCombobox } from "./TimeCombobox.jsx";
import { combineDateAndTime, formatTimeInput, timeValue } from "./editor-date-time.js";
import { calendarColors } from "../calendar/calendar-colors.js";
import { RepeatSelector } from "./RepeatSelector.jsx";
import { SuggestedTimesSection } from "./SuggestedTimesSection.jsx";
import { DISPLAY_TIME_ZONE, dayOfWeek, formatInZone, minutesOf } from "../../shared/utils/time-zone.js";

const palette = [
    { color: "", label: "Calendar color" },
    ...calendarColors.slice(0, 8).map(({ label, value }) => ({ color: value, label })),
];
const typeConfig = {
    event: { label: "Event", placeholder: "Add title", title: "", allDay: false },
    task: { label: "Task", placeholder: "Add task", title: "", allDay: false },
    outOfOffice: { label: "Out of office", placeholder: "Out of office", title: "Out of office", allDay: true },
    focusTime: { label: "Focus time", placeholder: "Focus time", title: "Focus time", allDay: false },
    workingLocation: { label: "Working location", placeholder: "Add working location", title: "Office", allDay: true },
    appointmentSchedule: { label: "Appointment schedule", placeholder: "Add appointment schedule", title: "Appointment schedule", allDay: false },
};

const shiftEndWithStart = (oldStart, oldEnd, newStart) => oldStart && oldEnd && newStart && oldEnd > oldStart ? new Date(newStart.getTime() + (oldEnd - oldStart)) : null;
const durationLabel = (minutes) => minutes < 60 ? `${minutes} mins` : `${minutes / 60} ${minutes === 60 ? "hr" : "hrs"}`;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const formatConflictTime = (value) => formatInZone(value, { hour: "numeric", minute: "2-digit", hour12: true });
const formatWorkingMinute = (minute) => formatInZone(Date.UTC(2000, 0, 1, Math.floor(minute / 60), minute % 60), { hour: "numeric", minute: "2-digit", hour12: true });
const participantPeople = (draft, participants) => {
    if (Array.isArray(draft?.participantPeople) && draft.participantPeople.length) return draft.participantPeople;
    const seen = new Set();
    return participants.map((name, index) => ({ _id: String(draft?.participantIds?.[index] || `saved-participant-${index}`), name: String(name).trim(), email: "", avatarColor: "#5f6368" })).filter((person) => {
        const key = person.name.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export function EventEditor({ calendars, draft, onClose, onDelete, onSave }) {
    const defaults = useMemo(() => {
        if (draft?._id) return { ...draft, startAt: draft.seriesStartAt || draft.startAt, endAt: draft.seriesEndAt || draft.endAt, type: draft.type || "event" };
        const type = draft?.type || "event";
        const config = typeConfig[type];
        const base = eventDefaults(draft?.cursor || new Date(), draft?.startAt);
        return { ...base, type, calendarId: calendars.find((calendar) => calendar.visible)?._id || calendars[0]?._id, title: draft?.title ?? config.title, description: draft?.description ?? "", location: draft?.location ?? "", participants: draft?.participants ?? [], color: draft?.color ?? "", allDay: draft?.allDay ?? config.allDay, ...(draft?.endAt ? { endAt: draft.endAt } : {}) };
    }, [draft, calendars]);
    const initialEndDate = defaults.allDay && dateKey(defaults.endAt) !== dateKey(defaults.startAt) ? dateKey(addDays(new Date(defaults.endAt), -1)) : dateKey(defaults.endAt);
    const [type, setType] = useState(defaults.type);
    const [title, setTitle] = useState(defaults.title || "");
    const [allDay, setAllDay] = useState(Boolean(defaults.allDay));
    const [startDate, setStartDate] = useState(dateKey(defaults.startAt));
    const [endDate, setEndDate] = useState(initialEndDate);
    const [startTime, setStartTime] = useState(timeValue(defaults.startAt));
    const [endTime, setEndTime] = useState(timeValue(defaults.endAt));
    const [startTimeValid, setStartTimeValid] = useState(true);
    const [endTimeValid, setEndTimeValid] = useState(true);
    const [calendarId, setCalendarId] = useState(String(defaults.calendarId || ""));
    const [guests, setGuests] = useState(() => participantPeople(draft, defaults.participants || []));
    const [recurrence, setRecurrence] = useState(defaults.recurrence || { frequency: "none", interval: 1, daysOfWeek: [], monthlyMode: "ordinalWeekday", endType: "never", count: null, until: null, timeZone: DISPLAY_TIME_ZONE });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [discardConfirmation, setDiscardConfirmation] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [conflictState, setConflictState] = useState({ checking: false, error: "", conflicts: [], workingHoursWarnings: [], key: "" });
    const conflictRequest = useRef(0);
    const config = typeConfig[type] || typeConfig.event;
    const startAt = allDay ? new Date(`${startDate}T00:00:00`) : combineDateAndTime(startDate, startTime);
    const endAt = allDay ? addDays(new Date(`${endDate}T00:00:00`), 1) : combineDateAndTime(endDate, endTime);
    const endTimeOptions = useMemo(() => {
        const selectedStart = combineDateAndTime(startDate, startTime);
        if (!selectedStart) return [];
        return Array.from({ length: 96 }, (_, index) => (index + 1) * 15).map((durationMinutes) => {
            const optionEnd = new Date(selectedStart.getTime() + durationMinutes * 60000);
            const value = timeValue(optionEnd);
            return { value, date: dateKey(optionEnd), inputLabel: formatTimeInput(value), label: `${formatTimeInput(value)} (${durationLabel(durationMinutes)})` };
        });
    }, [startDate, startTime]);
    const spansMultipleDays = startDate !== endDate;
    const validRange = Boolean(startAt && endAt && endAt > startAt && (allDay || (startTimeValid && endTimeValid)));
    const canSubmit = Boolean(title.trim() && calendarId && validRange);
    const guestIds = useMemo(() => guests.map((person) => String(person._id)).filter((id) => objectIdPattern.test(id)), [guests]);
    const conflictPayload = useMemo(() => {
        if (!validRange || !guestIds.length) return null;
        const conflictStart = allDay ? new Date(`${startDate}T00:00:00`) : combineDateAndTime(startDate, startTime);
        const conflictEnd = allDay ? addDays(new Date(`${endDate}T00:00:00`), 1) : combineDateAndTime(endDate, endTime);
        return { participantIds: guestIds, startAt: conflictStart.toISOString(), endAt: conflictEnd.toISOString(), timeZone: DISPLAY_TIME_ZONE };
    }, [allDay, endDate, endTime, guestIds, startDate, startTime, validRange]);
    const conflictKey = conflictPayload ? JSON.stringify(conflictPayload) : "";
    const conflictPending = Boolean(conflictPayload && conflictState.key !== conflictKey) || conflictState.checking;
    useEffect(() => {
        const currentRequest = ++conflictRequest.current;
        const timer = window.setTimeout(async () => {
            if (!conflictPayload) {
                setConflictState({ checking: false, error: "", conflicts: [], workingHoursWarnings: [], key: "" });
                return;
            }
            setConflictState((current) => ({ ...current, checking: true, error: "" }));
            try {
                const result = await availabilityApi.conflicts(conflictPayload);
                if (currentRequest === conflictRequest.current) setConflictState({ checking: false, error: "", conflicts: result.conflicts || [], workingHoursWarnings: result.workingHoursWarnings || [], key: conflictKey });
            } catch (conflictError) {
                if (currentRequest === conflictRequest.current) setConflictState({ checking: false, error: conflictError.message, conflicts: [], workingHoursWarnings: [], key: conflictKey });
            }
        }, conflictPayload ? 300 : 0);
        return () => window.clearTimeout(timer);
    }, [conflictKey, conflictPayload]);
    const [findTimeOpen, setFindTimeOpen] = useState(false);
    const durationMinutes = useMemo(() => {
        if (!startAt || !endAt || endAt <= startAt) return 30;
        return Math.min(240, Math.max(15, Math.round((endAt - startAt) / 60000 / 15) * 15));
    }, [startAt, endAt]);
    const applySuggestion = (suggestion) => {
        const start = new Date(suggestion.startAt);
        const end = new Date(suggestion.endAt);
        setStartDate(dateKey(start));
        setEndDate(dateKey(end));
        setStartTime(timeValue(start));
        setEndTime(timeValue(end));
        markDirty();
    };
    const markDirty = () => setDirty(true);
    const close = () => { if (!saving) { if (dirty) setDiscardConfirmation(true); else onClose(); } };
    const applyShiftedEnd = (nextStart, previousStart = startAt, previousEnd = endAt) => {
        const shifted = shiftEndWithStart(previousStart, previousEnd, nextStart);
        if (!shifted) return;
        setEndDate(dateKey(shifted));
        setEndTime(timeValue(shifted));
    };
    const changeStartDate = (nextDate) => {
        const nextStart = allDay ? new Date(`${nextDate}T00:00:00`) : combineDateAndTime(nextDate, startTime);
        if (allDay) {
            const durationDays = Math.max(0, Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000));
            setEndDate(dateKey(addDays(new Date(`${nextDate}T00:00:00`), durationDays)));
        } else applyShiftedEnd(nextStart);
        if (recurrence.frequency === "weekly" && recurrence.daysOfWeek?.length === 1 && recurrence.daysOfWeek[0] === dayOfWeek(startDate)) {
            setRecurrence({ ...recurrence, daysOfWeek: [dayOfWeek(nextDate)] });
        }
        setStartDate(nextDate); markDirty();
    };
    const changeStartTime = (nextTime) => {
        const nextStart = combineDateAndTime(startDate, nextTime);
        applyShiftedEnd(nextStart);
        setStartTime(nextTime); markDirty();
    };
    const changeEndTime = (nextTime, option) => {
        setEndTime(nextTime);
        if (option?.date) setEndDate(option.date);
        else {
            const nextStart = combineDateAndTime(startDate, startTime);
            const nextEnd = combineDateAndTime(startDate, nextTime);
            if (nextStart && nextEnd) {
                const crossesMidnight = nextEnd <= nextStart && minutesOf(nextStart) >= 12 * 60 && minutesOf(nextEnd) < 12 * 60;
                setEndDate(dateKey(crossesMidnight ? addDays(nextEnd, 1) : nextEnd));
            }
        }
        markDirty();
    };
    const changeType = (nextType) => {
        const previousConfig = typeConfig[type];
        if (!title.trim() || title === previousConfig.title) setTitle(typeConfig[nextType].title);
        setType(nextType);
        if (!previousConfig.allDay && typeConfig[nextType].allDay) setEndDate(startDate);
        setAllDay(typeConfig[nextType].allDay);
        setError(""); markDirty();
    };
    const changeAllDay = (checked) => {
        if (checked && !allDay) setEndDate(startDate);
        setAllDay(checked); markDirty();
    };
    const submit = async (event) => {
        event.preventDefault();
        setError("");
        if (!title.trim()) return setError("Title is required.");
        if (!startAt || !endAt || endAt <= startAt) return setError(allDay ? "End date must be on or after start date." : "End time must be after start time.");
        const values = Object.fromEntries(new FormData(event.currentTarget));
        setSaving(true);
        try {
            if (conflictPayload) {
                const latest = await availabilityApi.conflicts(conflictPayload);
                setConflictState({ checking: false, error: "", conflicts: latest.conflicts || [], workingHoursWarnings: latest.workingHoursWarnings || [], key: conflictKey });
            }
            await onSave({ title: title.trim(), type, description: values.description.trim(), location: values.location.trim(), participants: guests.map((person) => person.name.trim()).filter(Boolean), participantIds: guestIds, calendarId, color: values.color || null, allDay, startAt: startAt.toISOString(), endAt: endAt.toISOString(), recurrence });
        } catch (saveError) { setError(saveError.message); setSaving(false); }
    };
    return <><Modal className="event-editor-modal" onClose={close}><form className="event-editor" onSubmit={submit} onChange={markDirty}>
        <div className="modal-header"><span className="modal-grip" /><h2>{defaults._id ? "Edit calendar item" : "Create calendar item"}</h2>{defaults._id && defaults.editable !== false && onDelete && <button type="button" className="icon-button event-editor-delete" aria-label="Delete event" title="Delete event" disabled={saving || deleting} onClick={() => { setDeleteError(""); setDeleteConfirmation(true); }}><MaterialIcon size={20}>delete</MaterialIcon></button>}<button type="button" className="icon-button" aria-label="Close" disabled={saving || deleting} onClick={close}><MaterialIcon size={22}>close</MaterialIcon></button></div>
        <div className="event-editor-body">
        <label className="title-field"><span>Title</span><input autoFocus data-autofocus data-testid="event-title-input" maxLength={140} value={title} placeholder={config.placeholder} onChange={(event) => { setTitle(event.target.value); markDirty(); }} /></label>
        <div className="event-type-tabs" role="tablist" aria-label="Calendar item type">{Object.entries(typeConfig).map(([value, option]) => <button aria-selected={type === value} key={value} role="tab" type="button" onClick={() => changeType(value)}>{option.label}</button>)}</div>
        <div className="form-row editor-date-time-row"><MaterialIcon>schedule</MaterialIcon><div className="editor-date-time-fields">
            <div className={`editor-date-time-line ${allDay ? "all-day" : "timed"} ${spansMultipleDays ? "spans-days" : "same-day"}`}>
                <DatePickerPopover label="Start date" value={startDate} onChange={changeStartDate} />
                {allDay && spansMultipleDays && <span className="date-time-separator" aria-hidden="true">–</span>}
                {!allDay && <><TimeCombobox label="Start time" value={startTime} onChange={changeStartTime} onValidityChange={setStartTimeValid} /><span className="date-time-separator" aria-hidden="true">–</span><TimeCombobox label="End time" value={endTime} onChange={changeEndTime} onValidityChange={setEndTimeValid} options={endTimeOptions} /></>}
                {spansMultipleDays && <DatePickerPopover label="End date" value={endDate} onChange={(value) => { setEndDate(value); markDirty(); }} />}
            </div>
            <label className="checkbox-label"><input type="checkbox" checked={allDay} onChange={(event) => changeAllDay(event.target.checked)} />All day</label>
            <RepeatSelector startAt={startAt?.toISOString() || new Date().toISOString()} value={recurrence} onChange={(value) => { setRecurrence(value); markDirty(); }} />
            {!validRange && <small className="inline-range-error">{allDay ? "End date must be on or after start date" : "Enter a valid end time after the start time"}</small>}
        </div></div>
        <div className="form-row"><span className="calendar-swatch" style={{ backgroundColor: calendars.find((calendar) => calendar._id === calendarId)?.color }} /><div className="select-field">Calendar<SelectMenu ariaLabel="Calendar" value={calendarId} onChange={(value) => { setCalendarId(String(value)); markDirty(); }} options={calendars.map((calendar) => ({ value: calendar._id, label: calendar.name }))} /></div></div>
        <div className="form-row"><MaterialIcon>location_on</MaterialIcon><label><span className="sr-only">Location</span><input name="location" maxLength={250} defaultValue={defaults.location} placeholder="Add location" /></label></div>
        <div className="form-row event-guests-row"><MaterialIcon>group</MaterialIcon><div><PeoplePicker className="event-people-picker" inputLabel="Search guests" testIdPrefix="guest" maxSelected={100} onSelectionChange={(people) => { setGuests(people); markDirty(); }} placeholder="Add guests" selectedLabel="Selected guests" selectedPeople={guests} showLeadingIcon={false} />
            {conflictPending && <p className="guest-conflict-check" role="status"><MaterialIcon size={16}>sync</MaterialIcon>Checking guest availability…</p>}
            {!conflictPending && conflictState.error && <p className="guest-conflict-error" role="alert"><MaterialIcon size={16}>error_outline</MaterialIcon>Guest availability could not be checked. {conflictState.error}</p>}
            {!conflictPending && conflictState.conflicts.length > 0 && <div className="guest-conflict-warning" role="alert"><MaterialIcon size={19}>warning_amber</MaterialIcon><div><strong>{conflictState.conflicts.length === 1 ? `${conflictState.conflicts[0].person.name} is unavailable` : `${conflictState.conflicts.length} guests are unavailable`}</strong>{conflictState.conflicts.map(({ person, busy }) => <span key={person._id}>{person.name}: {busy.map((block) => `${formatConflictTime(block.startAt)}–${formatConflictTime(block.endAt)}`).join(", ")}</span>)}</div></div>}
            {!allDay && !conflictPending && conflictState.workingHoursWarnings.length > 0 && <div className="guest-hours-warning" role="status"><MaterialIcon size={19}>schedule</MaterialIcon><div><strong>Outside working hours</strong>{conflictState.workingHoursWarnings.map(({ person }) => <span key={person._id}>{person.name}: {formatWorkingMinute(person.workingHours.startMinute)}–{formatWorkingMinute(person.workingHours.endMinute)} ({person.timeZone.replaceAll("_", " ")})</span>)}</div></div>}
            {!conflictPending && !conflictState.error && conflictPayload && conflictState.conflicts.length === 0 && (allDay || conflictState.workingHoursWarnings.length === 0) && <p className="guest-available"><MaterialIcon size={16}>check_circle</MaterialIcon>All guests are available</p>}
        </div></div>
        {!allDay && guestIds.length > 0 && !findTimeOpen && <div className="form-row editor-find-time-row"><MaterialIcon>history</MaterialIcon>
            <button className="find-time-button" data-testid="find-a-time" type="button" onClick={() => setFindTimeOpen(true)}>Find a time</button>
        </div>}
        {!allDay && findTimeOpen && <SuggestedTimesSection cursor={startAt || new Date()} durationMinutes={durationMinutes} onChoose={applySuggestion} people={guests} />}
        <div className="form-row"><MaterialIcon>subject</MaterialIcon><label><span className="sr-only">Description</span><textarea name="description" maxLength={2000} rows={3} defaultValue={defaults.description} placeholder="Add description" /></label></div>
        <div className="form-row"><MaterialIcon>palette</MaterialIcon><fieldset className="color-palette"><legend>Event color</legend>{palette.map(({ color, label }) => <label title={label} key={label} className={color ? "color-choice" : "color-choice calendar-color-choice"} style={color ? { "--choice": color } : undefined}><input name="color" type="radio" value={color} defaultChecked={(defaults.color || "") === color} /><span>{color ? <MaterialIcon size={15}>check</MaterialIcon> : <MaterialIcon size={17}>event</MaterialIcon>}</span><span className="sr-only">{label}</span></label>)}</fieldset></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="modal-actions"><button type="button" disabled={saving} onClick={close}>Cancel</button><button className="primary-button" data-testid="save-event-button" disabled={saving || !canSubmit}>{saving ? "Saving…" : "Save"}</button></div>
    </form></Modal>{discardConfirmation && <ConfirmationDialog confirmLabel="Discard" onCancel={() => setDiscardConfirmation(false)} onConfirm={onClose} title="Discard unsaved changes?" />}{deleteConfirmation && <ConfirmationDialog busy={deleting} confirmLabel="Delete" error={deleteError} message={`“${title || defaults.title || "Untitled event"}” will be permanently removed from this calendar.`} onCancel={() => { setDeleteConfirmation(false); setDeleteError(""); }} onConfirm={async () => { try { setDeleting(true); setDeleteError(""); await onDelete(); } catch (requestError) { setDeleteError(requestError.message || "The event could not be deleted."); setDeleting(false); } }} title="Delete event?" />}</>;
}
