import { useId, useState } from "react";
import { ConfirmationDialog } from "../../shared/components/ConfirmationDialog.jsx";
import { Modal } from "../../shared/components/Modal.jsx";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatTime } from "../../shared/utils/date.js";
import { identityInitials } from "../../shared/utils/identity.js";
import { rsvpOptions, rsvpStatusLabels } from "./rsvp.js";
import { recurrenceLabel } from "./RepeatSelector.jsx";
import { formatInZone } from "../../shared/utils/time-zone.js";

export function EventPreview({ calendar, error = "", event, onClose, onDelete, onEdit, onRespond, responding = false }) {
    const [pendingResponse, setPendingResponse] = useState(null);
    const [responseScope, setResponseScope] = useState("this");
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [guestsExpanded, setGuestsExpanded] = useState(false);
    const guestListId = useId();
    const date = new Date(event.startAt);
    const typeLabels = { event: "Event", task: "Task", outOfOffice: "Out of office", focusTime: "Focus time", workingLocation: "Working location", appointmentSchedule: "Appointment schedule" };
    const guests = event.participantPeople || [];
    const host = event.organizerPerson && !guests.some((guest) => String(guest._id) === String(event.organizerPerson._id)) ? event.organizerPerson : null;
    const responseCounts = event.responseSummary || guests.reduce((counts, guest) => ({ ...counts, [guest.responseStatus || "needsAction"]: (counts[guest.responseStatus || "needsAction"] || 0) + 1 }), {});
    const responseRows = [["accepted", "yes"], ["declined", "no"], ["needsAction", "awaiting"], ["tentative", "maybe"]].map(([status, label]) => ({ count: responseCounts[status] || 0, label })).filter(({ count }) => count > 0);
    const guestCount = Math.max(guests.length, event.participants?.length || 0, responseRows.reduce((total, row) => total + row.count, 0));
    const canRespond = event.editable === false && Boolean(event.responseStatus) && Boolean(onRespond);
    const organizerName = event.readOnlyOwner || event.organizer;
    const recurring = Boolean(event.recurring || event.recurrence?.frequency && event.recurrence.frequency !== "none");
    const chooseResponse = (status) => {
        if (recurring) { setPendingResponse(status); setResponseScope("this"); }
        else onRespond(status);
    };
    return <><Modal className="event-preview-modal" onClose={onClose}><article className="event-preview">
        <div className="preview-actions">{event.editable !== false && <><button className="icon-button" data-testid="preview-edit" title="Edit event" aria-label="Edit event" onClick={onEdit}><MaterialIcon size={20}>edit</MaterialIcon></button><button className="icon-button" data-testid="preview-delete" title="Delete event" aria-label="Delete event" onClick={() => { setDeleteError(""); setDeleteConfirmation(true); }}><MaterialIcon size={20}>delete</MaterialIcon></button></>}<button className="icon-button" data-testid="preview-close" title="Close" aria-label="Close" onClick={onClose}><MaterialIcon size={22}>close</MaterialIcon></button></div>
        <div className="preview-title"><i style={{ backgroundColor: event.color || calendar?.color }} /><h2>{event.title}</h2></div>
        <div className="preview-detail"><MaterialIcon>schedule</MaterialIcon><span>{formatInZone(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}<small>{event.allDay ? "All day" : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`}</small></span></div>
        <div className="preview-detail"><MaterialIcon>{event.type === "outOfOffice" ? "event_busy" : "event"}</MaterialIcon><span>{typeLabels[event.type || "event"]}<small>{calendar?.name || event.calendarName || "Calendar"}</small></span></div>
        {recurring && <div className="preview-detail"><MaterialIcon>repeat</MaterialIcon><span>{recurrenceLabel(event.recurrence, event.seriesStartAt || event.startAt)}</span></div>}
        {event.editable === false && <div className="preview-detail preview-organizer"><MaterialIcon>person</MaterialIcon><span>{organizerName ? `Organized by ${organizerName}` : "Invited event"}</span></div>}
        {canRespond && <section className="preview-rsvp" aria-labelledby="preview-rsvp-title">
            <strong id="preview-rsvp-title">Going?</strong>
            <div className="preview-rsvp-actions">{rsvpOptions.map((option) => <button type="button" data-testid={`rsvp-${option.status}`} aria-label={option.accessibleLabel} aria-pressed={event.responseStatus === option.status} className={event.responseStatus === option.status ? "selected" : ""} disabled={responding} key={option.status} onClick={() => { if (recurring || event.responseStatus !== option.status) chooseResponse(option.status); }}>{event.responseStatus === option.status && <MaterialIcon size={17}>{option.icon}</MaterialIcon>}<span>{option.label}</span></button>)}</div>
        </section>}
        {(guestCount > 0 || event.organizer) && <div className="preview-detail preview-attendees"><MaterialIcon>group</MaterialIcon><div>
            {guests.length > 0 ? <button aria-controls={guestListId} aria-expanded={guestsExpanded} aria-label={`${guestsExpanded ? "Hide" : "Show"} guest details`} className="preview-attendees-summary" type="button" onClick={() => setGuestsExpanded((expanded) => !expanded)}><span><strong>{guestCount} guest{guestCount === 1 ? "" : "s"}</strong><span className="preview-attendee-counts">{responseRows.map(({ count, label }) => <small key={label}>{count} {label}</small>)}</span></span><MaterialIcon className="preview-attendees-chevron" size={20}>{guestsExpanded ? "expand_less" : "expand_more"}</MaterialIcon></button> : <span>{guestCount > 0 ? `${guestCount} guest${guestCount === 1 ? "" : "s"}` : event.organizer}{responseRows.length > 0 && <span className="preview-attendee-counts">{responseRows.map(({ count, label }) => <small key={label}>{count} {label}</small>)}</span>}</span>}
            {guests.length > 0 && guestsExpanded && <ul id={guestListId}>{host && <li className="preview-attendee-host" key="host">
                <span className="preview-attendee-avatar-wrap"><i className="preview-attendee-avatar" style={{ backgroundColor: host.avatarColor || "#5f6368" }}>{identityInitials(host.name)}</i></span>
                <span><strong>{host.name}</strong>{host.email && <small>{host.email}</small>}<small className="preview-attendee-role">Organizer</small></span>
            </li>}{guests.map((guest) => <li key={guest._id || guest.name}>
                <span className="preview-attendee-avatar-wrap"><i className="preview-attendee-avatar" style={{ backgroundColor: guest.avatarColor || "#5f6368" }}>{identityInitials(guest.name)}</i><i className={`preview-attendee-badge ${guest.responseStatus || "needsAction"}`}><MaterialIcon size={13}>{guest.responseStatus === "accepted" ? "check" : guest.responseStatus === "declined" ? "close" : guest.responseStatus === "tentative" ? "help_outline" : "schedule"}</MaterialIcon></i></span>
                <span><strong>{guest.name}</strong>{guest.email && <small>{guest.email}</small>}</span>
                <span className="sr-only">{rsvpStatusLabels[guest.responseStatus || "needsAction"]}</span>
            </li>)}</ul>}
        </div></div>}
        {event.location && <div className="preview-detail"><MaterialIcon>location_on</MaterialIcon><span>{event.location}</span></div>}
        {event.description && <div className="preview-detail"><MaterialIcon>subject</MaterialIcon><span>{event.description}</span></div>}
        {(error || deleteError) && <p className="preview-error" role="alert">{deleteError || error}</p>}
        {pendingResponse && <div className="recurrence-dialog-backdrop recurrence-scope-backdrop" role="presentation"><section aria-labelledby="recurrence-scope-title" aria-modal="true" className="recurrence-dialog recurrence-scope-dialog" role="dialog"><h3 id="recurrence-scope-title">RSVP to recurring event</h3><fieldset><legend className="sr-only">Apply response to</legend>{[["this", "This event"], ["following", "This and following events"], ["all", "All events"]].map(([value, label]) => <label key={value}><input type="radio" name="response-scope" checked={responseScope === value} onChange={() => setResponseScope(value)} /><span>{label}</span></label>)}</fieldset><div className="recurrence-dialog-actions"><button type="button" disabled={responding} onClick={() => setPendingResponse(null)}>Cancel</button><button type="button" className="primary-button" disabled={responding} onClick={async () => { const saved = await onRespond(pendingResponse, { scope: responseScope, occurrenceStartAt: event.occurrenceStartAt || event.startAt }); if (saved !== false) setPendingResponse(null); }}>{responding ? "Saving…" : "OK"}</button></div></section></div>}
    </article></Modal>{deleteConfirmation && <ConfirmationDialog busy={deleting} confirmLabel="Delete" error={deleteError} message={`“${event.title}” will be permanently removed from this calendar.`} onCancel={() => { setDeleteConfirmation(false); setDeleteError(""); }} onConfirm={async () => { try { setDeleting(true); setDeleteError(""); await onDelete(); } catch (requestError) { setDeleteError(requestError.message || "The event could not be deleted."); setDeleting(false); } }} title="Delete event?" />}</>;
}
