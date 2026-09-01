import { useEffect, useMemo, useRef, useState } from "react";
import { SelectMenu } from "../../shared/components/SelectMenu.jsx";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { DatePickerPopover } from "./DatePickerPopover.jsx";
import { DISPLAY_TIME_ZONE, addCalendarDays, formatInZone, localDateKey, partsAt, weekdayOf } from "../../shared/utils/time-zone.js";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortWeekdays = ["S", "M", "T", "W", "T", "F", "S"];
const defaultRule = (timeZone) => ({ frequency: "none", interval: 1, daysOfWeek: [], monthlyMode: "ordinalWeekday", endType: "never", count: null, until: null, timeZone });
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || minimum));

function NumberStepper({ ariaLabel, disabled = false, max, min = 1, onChange, value }) {
    const commit = (next) => onChange(clamp(next, min, max));
    return <div className="recurrence-stepper">
        <input aria-label={ariaLabel} disabled={disabled} inputMode="numeric" max={max} min={min} pattern="[0-9]*" type="text" value={value} onChange={(event) => { if (/^\d*$/.test(event.target.value)) onChange(event.target.value); }} onBlur={() => commit(value)} />
        <span className="recurrence-stepper-actions">
            <button aria-label={`Increase ${ariaLabel.toLowerCase()}`} disabled={disabled || Number(value) >= max} type="button" onClick={() => commit(Number(value) + 1)}><MaterialIcon size={18}>arrow_drop_up</MaterialIcon></button>
            <button aria-label={`Decrease ${ariaLabel.toLowerCase()}`} disabled={disabled || Number(value) <= min} type="button" onClick={() => commit(Number(value) - 1)}><MaterialIcon size={18}>arrow_drop_down</MaterialIcon></button>
        </span>
    </div>;
}

function ordinalWeekday(date) {
    const key = localDateKey(date);
    const ordinal = Math.ceil(partsAt(date).day / 7);
    const nextWeek = addCalendarDays(key, 7);
    const label = Number(nextWeek.slice(5, 7)) !== partsAt(date).month ? "last" : ["first", "second", "third", "fourth", "fifth"][ordinal - 1];
    return `${label} ${weekdays[weekdayOf(date)]}`;
}

export function recurrenceLabel(rule, startAt) {
    const date = new Date(startAt);
    if (!rule || rule.frequency === "none") return "Does not repeat";
    if (rule.frequency === "daily") return rule.interval === 1 ? "Daily" : `Every ${rule.interval} days`;
    if (rule.frequency === "weekdays") return "Every weekday (Monday to Friday)";
    if (rule.frequency === "weekly") {
        const selectedDays = (rule.daysOfWeek || []).map((day) => weekdays[day]).join(", ");
        const cadence = rule.interval === 1 ? "Weekly" : `Every ${rule.interval} weeks`;
        return selectedDays ? `${cadence} on ${selectedDays}` : cadence;
    }
    if (rule.frequency === "monthly") return rule.interval === 1 ? `Monthly on the ${rule.monthlyMode === "dayOfMonth" ? partsAt(date).day : ordinalWeekday(date)}` : `Every ${rule.interval} months`;
    if (rule.frequency === "yearly") return rule.interval === 1 ? `Annually on ${formatInZone(date, { month: "long", day: "numeric" })}` : `Every ${rule.interval} years`;
    return "Custom";
}

export function RepeatSelector({ startAt, value, onChange }) {
    const timeZone = DISPLAY_TIME_ZONE;
    const date = new Date(startAt);
    const normalized = value || defaultRule(timeZone);
    const [customOpen, setCustomOpen] = useState(false);
    const [custom, setCustom] = useState(normalized.frequency === "none" ? { ...defaultRule(timeZone), frequency: "weekly", daysOfWeek: [weekdayOf(date)] } : normalized);
    const dialog = useRef(null);
    const presets = useMemo(() => [
        { value: "none", label: "Does not repeat", rule: defaultRule(timeZone) },
        { value: "daily", label: "Daily", rule: { ...defaultRule(timeZone), frequency: "daily" } },
        { value: "weekly", label: `Weekly on ${weekdays[weekdayOf(date)]}`, rule: { ...defaultRule(timeZone), frequency: "weekly", daysOfWeek: [weekdayOf(date)] } },
        { value: "monthly", label: `Monthly on the ${ordinalWeekday(date)}`, rule: { ...defaultRule(timeZone), frequency: "monthly" } },
        { value: "yearly", label: `Annually on ${formatInZone(date, { month: "long", day: "numeric" })}`, rule: { ...defaultRule(timeZone), frequency: "yearly" } },
        { value: "weekdays", label: "Every weekday (Monday to Friday)", rule: { ...defaultRule(timeZone), frequency: "weekdays" } },
    ], [localDateKey(date), timeZone]);
    const selected = presets.find((preset) => JSON.stringify(preset.rule) === JSON.stringify(normalized))?.value || (normalized.frequency === "none" ? "none" : "custom");
    const customOptionLabel = selected === "custom" ? recurrenceLabel(normalized, startAt) : "Custom…";
    const pluralUnits = Number(custom.interval) !== 1;
    const frequencyOptions = [
        { value: "daily", label: pluralUnits ? "days" : "day" },
        { value: "weekly", label: pluralUnits ? "weeks" : "week" },
        { value: "monthly", label: pluralUnits ? "months" : "month" },
        { value: "yearly", label: pluralUnits ? "years" : "year" },
    ];
    const choose = (value) => {
        if (value === "custom") {
            setCustom(normalized.frequency === "none" ? { ...defaultRule(timeZone), frequency: "weekly", daysOfWeek: [weekdayOf(date)] } : normalized);
            setCustomOpen(true);
            return;
        }
        onChange(presets.find((preset) => preset.value === value).rule);
    };
    const update = (fields) => setCustom((current) => ({ ...current, ...fields }));
    const saveCustom = () => {
        onChange({
            ...custom,
            interval: clamp(custom.interval, 1, 99),
            daysOfWeek: custom.frequency === "weekly" ? custom.daysOfWeek : [],
            count: custom.endType === "count" ? clamp(custom.count, 1, 730) : null,
            until: custom.endType === "until" ? custom.until : null,
        });
        setCustomOpen(false);
    };
    useEffect(() => {
        if (!customOpen) return undefined;
        const previousFocus = document.activeElement;
        const keyboard = (event) => {
            if (event.key === "Escape") {
                if (!dialog.current?.querySelector(".editor-date-popover, .select-menu-options")) setCustomOpen(false);
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = [...(dialog.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener("keydown", keyboard);
        requestAnimationFrame(() => dialog.current?.querySelector("input, button")?.focus());
        return () => { document.removeEventListener("keydown", keyboard); previousFocus?.focus?.(); };
    }, [customOpen]);
    return <>
        <div className="repeat-select" data-testid="repeat-select"><SelectMenu ariaLabel="Repeat" value={selected} onChange={choose} options={[...presets.map(({ value, label }) => ({ value, label })), { value: "custom", label: customOptionLabel }]} /></div>
        {customOpen && <div className="recurrence-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomOpen(false); }}><section aria-labelledby="custom-recurrence-title" aria-modal="true" className="recurrence-dialog" ref={dialog} role="dialog">
            <h3 id="custom-recurrence-title">Custom recurrence</h3>
            <div className="recurrence-line"><span>Repeat every</span><NumberStepper ariaLabel="Repeat interval" max={99} value={custom.interval} onChange={(interval) => update({ interval })} /><SelectMenu ariaLabel="Repeat frequency" value={custom.frequency} onChange={(frequency) => update({ frequency, daysOfWeek: frequency === "weekly" && !custom.daysOfWeek.length ? [weekdayOf(date)] : custom.daysOfWeek })} options={frequencyOptions} /></div>
            {custom.frequency === "weekly" && <fieldset className="recurrence-weekdays"><legend>Repeat on</legend>{shortWeekdays.map((label, day) => <label key={day} title={weekdays[day]}><input type="checkbox" checked={custom.daysOfWeek.includes(day)} onChange={(event) => update({ daysOfWeek: event.target.checked ? [...custom.daysOfWeek, day].sort() : custom.daysOfWeek.filter((value) => value !== day) })} /><span>{label}</span></label>)}</fieldset>}
            {custom.frequency === "monthly" && <div className="recurrence-monthly">Repeat by<SelectMenu ariaLabel="Repeat by" value={custom.monthlyMode} onChange={(monthlyMode) => update({ monthlyMode })} options={[{ value: "ordinalWeekday", label: `the ${ordinalWeekday(date)}` }, { value: "dayOfMonth", label: `day ${partsAt(date).day}` }]} /></div>}
            <fieldset className="recurrence-ends"><legend>Ends</legend>
                <label><input name="recurrence-end" type="radio" checked={custom.endType === "never"} onChange={() => update({ endType: "never", count: null, until: null })} /><span>Never</span></label>
                <label><input name="recurrence-end" type="radio" checked={custom.endType === "until"} onChange={() => update({ endType: "until", until: custom.until || startAt.slice(0, 10), count: null })} /><span>On</span><DatePickerPopover className="recurrence-end-date" concise disabled={custom.endType !== "until"} label="Recurrence end date" min={startAt.slice(0, 10)} value={custom.until ? String(custom.until).slice(0, 10) : startAt.slice(0, 10)} onChange={(until) => update({ until })} /></label>
                <label><input name="recurrence-end" type="radio" checked={custom.endType === "count"} onChange={() => update({ endType: "count", count: custom.count || 10, until: null })} /><span>After</span><div className="recurrence-count-field"><NumberStepper ariaLabel="Number of occurrences" disabled={custom.endType !== "count"} max={730} value={custom.count ?? 10} onChange={(count) => update({ count })} /><span>{Number(custom.count ?? 10) === 1 ? "occurrence" : "occurrences"}</span></div></label>
            </fieldset>
            {custom.frequency === "weekly" && !custom.daysOfWeek.length && <p className="recurrence-validation" role="alert">Choose at least one day.</p>}
            <div className="recurrence-dialog-actions"><button type="button" onClick={() => setCustomOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={custom.frequency === "weekly" && !custom.daysOfWeek.length} onClick={saveCustom}>Done</button></div>
        </section></div>}
    </>;
}
