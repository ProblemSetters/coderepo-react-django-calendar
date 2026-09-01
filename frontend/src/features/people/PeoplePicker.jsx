import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { identityInitials } from "../../shared/utils/identity.js";
import { peopleApi } from "./people.api.js";

const identity = (person) => String(person.email || person.name || person._id).trim().toLowerCase();
const matchesPerson = (left, right) => Boolean(left._id && right._id && String(left._id) === String(right._id)) || identity(left) === identity(right);

export function PeoplePicker({
    className = "",
    inputLabel = "Search for people",
    testIdPrefix = "people",
    maxSelected = 10,
    onSelectionChange,
    placeholder = "Search for people",
    selectedLabel = "Selected people",
    selectedPeople = [],
    showLeadingIcon = true,
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [retryToken, setRetryToken] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const [resultsPosition, setResultsPosition] = useState(null);
    const root = useRef(null);
    const resultsList = useRef(null);
    const instanceId = useId().replace(/:/g, "");
    const resultsId = `${instanceId}-people-results`;
    const available = selectedPeople.length >= maxSelected ? [] : results.filter((person) => !selectedPeople.some((selected) => matchesPerson(selected, person)));

    useEffect(() => {
        if (!open) return undefined;
        let active = true;
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError("");
            try {
                const people = await peopleApi.search(query.trim());
                if (active) setResults(people);
            } catch (requestError) {
                if (active) setError(requestError.message);
            } finally {
                if (active) setLoading(false);
            }
        }, 180);
        return () => { active = false; window.clearTimeout(timer); };
    }, [open, query, retryToken]);

    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [open]);

    useLayoutEffect(() => {
        if (!open) { setResultsPosition(null); return undefined; }
        const positionResults = () => {
            const anchor = root.current?.querySelector(".people-search");
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const actions = root.current?.closest("dialog")?.querySelector(".modal-actions");
            const actionsTop = actions?.getBoundingClientRect().top;
            const lowerBoundary = Number.isFinite(actionsTop) && actionsTop > rect.bottom ? Math.min(viewportHeight - 12, actionsTop - 8) : viewportHeight - 12;
            const spaceBelow = lowerBoundary - rect.bottom;
            const spaceAbove = rect.top - 12;
            const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
            const availableSpace = Math.max(96, Math.min(336, openAbove ? spaceAbove : spaceBelow));
            setResultsPosition({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
                width: Math.min(rect.width, window.innerWidth - 16),
                maxHeight: availableSpace,
                ...(openAbove ? { bottom: viewportHeight - rect.top + 4, top: "auto" } : { top: rect.bottom + 4, bottom: "auto" }),
            });
        };
        positionResults();
        window.addEventListener("resize", positionResults);
        window.addEventListener("scroll", positionResults, true);
        return () => {
            window.removeEventListener("resize", positionResults);
            window.removeEventListener("scroll", positionResults, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open || !available.length) return;
        if (activeIndex >= available.length) { setActiveIndex(available.length - 1); return; }
        resultsList.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, available.length, open]);

    const add = (person) => {
        if (selectedPeople.length >= maxSelected || selectedPeople.some((selected) => matchesPerson(selected, person))) return;
        onSelectionChange([...selectedPeople, person]);
        setQuery("");
        setOpen(false);
    };
    const remove = (person) => onSelectionChange(selectedPeople.filter((selected) => !matchesPerson(selected, person)));
    const handleSearchKeyboard = (event) => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        if (!available.length) return;
        if (event.key === "ArrowDown") setActiveIndex((index) => (index + 1) % available.length);
        if (event.key === "ArrowUp") setActiveIndex((index) => (index - 1 + available.length) % available.length);
        if (event.key === "Enter") add(available[Math.min(activeIndex, available.length - 1)]);
    };

    return <div className={`people-picker ${className}`.trim()} ref={root}>
        <div className={`people-search ${open ? "active" : ""}`}>
            {showLeadingIcon && <MaterialIcon size={20}>group</MaterialIcon>}
            <label><span className="sr-only">{inputLabel}</span><input aria-activedescendant={open && available[activeIndex] ? `${instanceId}-person-option-${available[activeIndex]._id}` : undefined} aria-autocomplete="list" aria-controls={resultsId} aria-expanded={open} autoComplete="off" className="people-search-input" data-testid={`${testIdPrefix}-search-input`} placeholder={placeholder} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onKeyDown={handleSearchKeyboard} /></label>
            {query && <button className="icon-button" type="button" aria-label="Clear people search" onClick={() => setQuery("")}><MaterialIcon size={18}>close</MaterialIcon></button>}
            {open && <div className="people-results" id={resultsId} ref={resultsList} role="listbox" aria-label="People" style={resultsPosition || { visibility: "hidden" }}>
                {loading && <p role="status">Finding people…</p>}
                {!loading && error && <div className="people-state" role="alert"><span>{error}</span><button type="button" onClick={() => setRetryToken((value) => value + 1)}>Retry</button></div>}
                {!loading && !error && available.map((person, index) => <button className={index === activeIndex ? "active" : ""} data-option-index={index} id={`${instanceId}-person-option-${person._id}`} data-testid={`${testIdPrefix}-option-${person._id}`} key={person._id} role="option" type="button" tabIndex={-1} aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => add(person)}>
                    <span className="person-avatar" style={{ backgroundColor: person.avatarColor }}>{identityInitials(person.name)}</span>
                    <span><strong>{person.name}</strong><small>{person.email}</small></span>
                </button>)}
                {!loading && !error && !available.length && <p>{selectedPeople.length >= maxSelected ? `Guest limit reached (${maxSelected})` : query ? "No matching people" : selectedPeople.length ? "Everyone is already selected" : "No people available"}</p>}
            </div>}
        </div>
        {selectedPeople.length > 0 && <div className="selected-people" aria-label={selectedLabel}>
            {selectedPeople.map((person, index) => <div className="selected-person" key={`${identity(person)}-${index}`}>
                <span className="person-avatar" style={{ backgroundColor: person.avatarColor || "#5f6368" }}>{identityInitials(person.name)}</span>
                <span title={person.email || person.name}>{person.name}</span>
                <button type="button" data-testid={`${testIdPrefix}-remove-${person._id}`} aria-label={`Remove ${person.name}`} onClick={() => remove(person)}><MaterialIcon size={16}>close</MaterialIcon></button>
            </div>)}
        </div>}
    </div>;
}
