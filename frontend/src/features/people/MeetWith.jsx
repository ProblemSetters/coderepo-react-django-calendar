import { useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { PeoplePicker } from "./PeoplePicker.jsx";

export function MeetWith({ onOpenSuggestions, onSelectionChange, selectedPeople }) {
    const [internalSelected, setInternalSelected] = useState([]);
    const selected = selectedPeople ?? internalSelected;
    const updateSelected = (next) => {
        if (selectedPeople === undefined) setInternalSelected(next);
        onSelectionChange?.(next);
    };
    return <section className="meet-with" aria-labelledby="meet-with-title">
        <h2 id="meet-with-title">Meet with…</h2>
        <PeoplePicker onSelectionChange={updateSelected} selectedPeople={selected} />
        {selected.length > 0 && <button className="suggested-times-button" type="button" onClick={() => onOpenSuggestions(selected)}><MaterialIcon size={18}>schedule</MaterialIcon>Suggested times</button>}
    </section>;
}
