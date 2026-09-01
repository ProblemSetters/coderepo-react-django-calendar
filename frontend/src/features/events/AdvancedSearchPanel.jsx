import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { SelectMenu } from "../../shared/components/SelectMenu.jsx";

const initialFilters = { quick: "", scope: "active", what: "", who: "", where: "", exclude: "", from: "", to: "" };

export function AdvancedSearchPanel({ expanded = false, initialValues, onDismiss, onExpandedChange, onSearch }) {
    const [filters, setFilters] = useState(() => ({ ...initialFilters, ...initialValues }));
    const panelReference = useRef(null);
    const update = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
    const reset = () => setFilters(initialFilters);
    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key !== "Escape") return;
            if (expanded) onExpandedChange(false);
            else onDismiss();
        };
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [expanded, onDismiss, onExpandedChange]);
    const runSearch = () => {
        if (filters.from && filters.to && filters.from > filters.to) return;
        onSearch({ ...filters, what: filters.what || filters.quick });
    };
    const submit = (event) => { event.preventDefault(); runSearch(); };
    const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
    return (
        <section className={`advanced-search-panel ${expanded ? "expanded" : "compact"}`} ref={panelReference} aria-label="Search events">
            <form onSubmit={submit}>
                <div className="advanced-search-top">
                    <MaterialIcon size={23}>search</MaterialIcon>
                    <input autoFocus data-testid="search-quick" value={filters.quick} maxLength={100} placeholder="Search" aria-label="Search" onChange={update("quick")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }} />
                    <button type="button" className={`icon-button search-options-toggle ${expanded ? "active" : ""}`} aria-expanded={expanded} aria-label={expanded ? "Hide search options" : "Show search options"} onClick={() => onExpandedChange(!expanded)}><MaterialIcon>{expanded ? "expand_less" : "arrow_drop_down"}</MaterialIcon></button>
                </div>
                {expanded && <><div className="advanced-search-fields">
                    <div className="select-field"><span>Search in</span><SelectMenu ariaLabel="Search in" className="search-scope-menu" value={filters.scope} onChange={(value) => setFilters((current) => ({ ...current, scope: value }))} options={[{ value: "active", label: "Active calendars" }, { value: "all", label: "All calendars" }]} /></div>
                    <label><span>What</span><input value={filters.what} maxLength={100} placeholder="Keywords contained in event" onChange={update("what")} /></label>
                    <label><span>Who</span><input value={filters.who} maxLength={100} placeholder="Enter a participant, organizer, or creator" onChange={update("who")} /></label>
                    <label><span>Where</span><input value={filters.where} maxLength={100} placeholder="Enter a location or room" onChange={update("where")} /></label>
                    <label><span>Doesn't have</span><input value={filters.exclude} maxLength={100} placeholder="Keywords not contained in event" onChange={update("exclude")} /></label>
                    <div className="advanced-date-row"><span>Date</span><label><span className="sr-only">From date</span><input type="date" value={filters.from} aria-label="From date" onChange={update("from")} onInput={update("from")} /></label><small>to</small><label><span className="sr-only">To date</span><input type="date" value={filters.to} aria-label="To date" onChange={update("to")} onInput={update("to")} /></label></div>
                </div>
                {invalidRange && <p className="search-range-error" role="alert">To date must be on or after From date.</p>}
                <div className="advanced-search-actions"><button type="button" onClick={reset}>Reset</button><button type="submit" disabled={invalidRange}>Search</button></div></>}
            </form>
        </section>
    );
}
