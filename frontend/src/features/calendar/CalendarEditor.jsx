import { useMemo, useState } from "react";
import { ConfirmationDialog } from "../../shared/components/ConfirmationDialog.jsx";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { Modal } from "../../shared/components/Modal.jsx";
import { SelectMenu } from "../../shared/components/SelectMenu.jsx";
import { calendarColors, nextAvailableCalendarColor } from "./calendar-colors.js";
import { DISPLAY_TIME_ZONE } from "../../shared/utils/time-zone.js";

const commonTimeZones = ["UTC", "Asia/Kolkata", "Asia/Singapore", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];

export function CalendarEditor({ calendar, onClose, onDelete, onSave, usedColors = [] }) {
    const resolvedTimeZone = DISPLAY_TIME_ZONE;
    const localTimeZone = resolvedTimeZone === "Asia/Calcutta" ? "Asia/Kolkata" : resolvedTimeZone;
    const timeZones = useMemo(() => [...new Set([localTimeZone, ...commonTimeZones])], [localTimeZone]);
    const editing = Boolean(calendar);
    const [name, setName] = useState(calendar?.name || "");
    const [description, setDescription] = useState(calendar?.description || "");
    const [color, setColor] = useState(calendar?.color || nextAvailableCalendarColor(usedColors));
    const [timeZone, setTimeZone] = useState(calendar?.timeZone || localTimeZone);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const close = () => { if (!saving) onClose(); };
    const submit = async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) { setError("Enter a calendar name."); return; }
        try {
            setSaving(true);
            setError("");
            await onSave({ name: trimmedName, description: description.trim(), color, timeZone });
            onClose();
        } catch (requestError) {
            setError(requestError.message || "Calendar could not be created.");
        } finally {
            setSaving(false);
        }
    };
    const remove = async () => {
        try {
            setDeleting(true);
            setError("");
            await onDelete(calendar);
        } catch (requestError) {
            setError(requestError.message || "The calendar could not be deleted.");
            setDeleteConfirmation(false);
            setDeleting(false);
        }
    };

    return <><Modal className="calendar-editor-modal" onClose={close}>
        <form className="calendar-editor" onSubmit={submit}>
            <header className="calendar-editor-header">
                <div><MaterialIcon size={24}>event</MaterialIcon><h2>{editing ? "Calendar settings" : "Create new calendar"}</h2></div>
                <button className="icon-button" type="button" aria-label="Close calendar editor" onClick={close} disabled={saving}><MaterialIcon>close</MaterialIcon></button>
            </header>
            <p className="calendar-editor-intro">{editing ? "Update this calendar’s details, time zone, and display color." : "Add a separate calendar to organize events and control their visibility."}</p>
            <label className="outlined-field">
                <span>Name</span>
                <input data-autofocus data-testid="calendar-name-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required aria-describedby="calendar-name-help" />
                <small id="calendar-name-help">{name.length}/80</small>
            </label>
            <label className="outlined-field calendar-description-field">
                <span>Description <em>Optional</em></span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="What is this calendar for?" />
                <small>{description.length}/1000</small>
            </label>
            <div className="outlined-field">
                <span>Time zone</span>
                <SelectMenu ariaLabel="Time zone" value={timeZone} onChange={setTimeZone} options={timeZones.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))} />
            </div>
            <fieldset className="calendar-color-picker">
                <legend>Calendar color</legend>
                <div>{calendarColors.map((option) => <label key={option.value} title={option.label} style={{ "--calendar-option": option.value }}>
                    <input type="radio" name="calendarColor" value={option.value} checked={color === option.value} onChange={() => setColor(option.value)} />
                    <span><MaterialIcon size={16}>check</MaterialIcon></span><span className="sr-only">{option.label}</span>
                </label>)}</div>
            </fieldset>
            {error && <p className="calendar-editor-error" role="alert"><MaterialIcon size={18}>error</MaterialIcon><span>{error}</span></p>}
            <footer className="calendar-editor-actions">
                {editing && !calendar.isPrimary && <button className="calendar-delete-action" type="button" onClick={() => setDeleteConfirmation(true)} disabled={saving || deleting}><MaterialIcon size={18}>delete</MaterialIcon><span>Delete</span></button>}
                <button type="button" onClick={close} disabled={saving}>Cancel</button>
                <button className="primary-button" data-testid="create-calendar-submit" disabled={saving || !name.trim()}>{saving ? (editing ? "Saving…" : "Creating…") : (editing ? "Save" : "Create calendar")}</button>
            </footer>
        </form>
    </Modal>{deleteConfirmation && <ConfirmationDialog busy={deleting} confirmLabel="Delete" message={`“${calendar.name}” will be permanently removed. Only empty calendars can be deleted.`} onCancel={() => setDeleteConfirmation(false)} onConfirm={remove} title="Delete calendar?" />}</>;
}
