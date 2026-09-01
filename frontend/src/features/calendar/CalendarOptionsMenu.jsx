import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { calendarColors } from "./calendar-colors.js";

export function CalendarOptionsMenu({ calendar, onClose, onDisplayOnly, onSettings, onUpdate, position }) {
    const reference = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const defaultColor = (calendar.defaultColor || "#1a73e8").toLowerCase();
    const selectedColor = calendar.color.toLowerCase();

    useEffect(() => {
        const closeOutside = (event) => { if (!reference.current?.contains(event.target)) onClose(); };
        const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        reference.current?.querySelector("button")?.focus();
        return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
    }, [onClose]);

    const run = async (operation, shouldClose = true) => {
        try {
            setBusy(true);
            setError("");
            await operation();
            if (shouldClose) onClose();
        } catch (operationError) {
            setError(operationError.message || "Calendar could not be updated.");
        } finally {
            setBusy(false);
        }
    };

    return createPortal(<div className="calendar-options-menu" role="menu" aria-label={`${calendar.name} options`} ref={reference} style={{ left: position.left, top: position.top }}>
        <div className="calendar-option-actions">
            <button role="menuitem" disabled={busy} onClick={() => run(() => onDisplayOnly(calendar._id))}>Display this only</button>
            <button role="menuitem" disabled={busy} onClick={() => { onSettings(calendar); onClose(); }}>Settings and sharing</button>
        </div>
        <div className="calendar-color-section">
            <label className="custom-calendar-color" title="Custom color">
                <input type="color" value={calendar.color} disabled={busy} aria-label="Custom calendar color" onChange={(event) => run(() => onUpdate(calendar._id, { color: event.target.value }))} />
                <span><MaterialIcon size={20}>edit</MaterialIcon></span>
            </label>
            <div className="calendar-menu-palette" role="group" aria-label="Calendar color">
                {calendarColors.map((option) => <button type="button" key={option.value} className="calendar-menu-color" style={{ "--calendar-option": option.value }} aria-label={option.label} aria-pressed={selectedColor === option.value} disabled={busy} onClick={() => run(() => onUpdate(calendar._id, { color: option.value }))}>
                    {selectedColor === option.value && <MaterialIcon size={17}>check</MaterialIcon>}
                </button>)}
            </div>
            <button type="button" className="calendar-default-color" role="menuitemradio" aria-checked={selectedColor === defaultColor} disabled={busy} onClick={() => run(() => onUpdate(calendar._id, { color: defaultColor }))}>
                <span className={selectedColor === defaultColor ? "selected" : ""}>{selectedColor === defaultColor && <MaterialIcon size={17}>check</MaterialIcon>}</span><strong>Default</strong>
            </button>
        </div>
        {error && <p className="calendar-menu-error" role="alert">{error}</p>}
    </div>, document.body);
}
