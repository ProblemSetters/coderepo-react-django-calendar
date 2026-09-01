import { useEffect, useRef, useState } from "react";
import { formatTimeInput, parseTimeInput } from "./editor-date-time.js";

const quarterHourOptions = Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = index % 4 * 15;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { value, label: formatTimeInput(value) };
});

export function TimeCombobox({ label, onChange, onValidityChange, options = quarterHourOptions, value }) {
    const availableOptions = options.length ? options : quarterHourOptions;
    const [text, setText] = useState(() => formatTimeInput(value));
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(() => Math.max(0, availableOptions.findIndex((option) => option.value === value)));
    const [keyboardNavigated, setKeyboardNavigated] = useState(false);
    const root = useRef(null);
    const list = useRef(null);
    useEffect(() => {
        if (root.current?.contains(document.activeElement)) return undefined;
        const timer = window.setTimeout(() => setText(formatTimeInput(value)), 0);
        return () => window.clearTimeout(timer);
    }, [value]);
    useEffect(() => {
        if (!open) return;
        list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: "nearest" });
    }, [activeIndex, open]);
    const choose = (option) => { setText(option.inputLabel || formatTimeInput(option.value)); onChange(option.value, option); onValidityChange?.(true); setOpen(false); };
    const validate = (nextText, normalize = false) => {
        const parsed = parseTimeInput(nextText);
        onValidityChange?.(Boolean(parsed));
        if (parsed) { onChange(parsed); if (normalize) setText(formatTimeInput(parsed)); }
        return parsed;
    };
    const handleKeyDown = (event) => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (event.key === "Tab") return;
        if (event.key === "Enter") {
            event.preventDefault();
            if (open && keyboardNavigated) choose(availableOptions[activeIndex]);
            else { validate(text, true); setOpen(false); }
            return;
        }
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        setOpen(true);
        setKeyboardNavigated(true);
        setActiveIndex((index) => event.key === "ArrowDown" ? (index + 1) % availableOptions.length : (index - 1 + availableOptions.length) % availableOptions.length);
    };
    return <div className={`editor-time-combobox ${options !== quarterHourOptions ? "contextual" : ""}`} ref={root}>
        <label><span className="sr-only">{label}</span><input aria-autocomplete="list" aria-controls={`${label.replace(/\s/g, "-").toLowerCase()}-options`} aria-expanded={open} autoComplete="off" className={`editor-time-input${!parseTimeInput(text) ? " invalid" : ""}`} value={text} onBlur={() => { setOpen(false); validate(text, true); }} onChange={(event) => { setText(event.target.value); validate(event.target.value); setKeyboardNavigated(false); setOpen(true); }} onClick={() => setOpen(true)} onFocus={() => { setActiveIndex(Math.max(0, availableOptions.findIndex((option) => option.value === value))); setKeyboardNavigated(false); setOpen(true); }} onKeyDown={handleKeyDown} /></label>
        {open && <div className="editor-time-options" id={`${label.replace(/\s/g, "-").toLowerCase()}-options`} ref={list} role="listbox" aria-label={`${label} options`}>{availableOptions.map((option, index) => <button aria-selected={option.value === value} className={index === activeIndex ? "active" : ""} data-index={index} key={`${option.value}-${index}`} role="option" type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>{option.label}</button>)}</div>}
    </div>;
}
