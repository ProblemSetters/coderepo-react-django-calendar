import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatHeading, moveCursor } from "../../shared/utils/date.js";
import { applyTheme, readTheme } from "../../shared/utils/theme.js";
import { ProfileAvatar } from "../profiles/ProfileAvatar.jsx";

const views = [
    { value: "day", label: "Day", shortcut: "D" },
    { value: "week", label: "Week", shortcut: "W" },
    { value: "month", label: "Month", shortcut: "M" },
];

export function CalendarHeader({ cursor, onCreate, onLogout, onProfileSwitch, onSearchClose, onSearchOpen, onSidebarToggle, profile, searchMode = false, setCursor, setView, view }) {
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const [theme, setTheme] = useState(readTheme);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const viewMenuReference = useRef(null);
    const profileMenuReference = useRef(null);
    useEffect(() => {
        if (!viewMenuOpen) return undefined;
        const closeMenu = (event) => { if (!viewMenuReference.current?.contains(event.target)) setViewMenuOpen(false); };
        const closeOnEscape = (event) => { if (event.key === "Escape") { setViewMenuOpen(false); viewMenuReference.current?.querySelector("button")?.focus(); } };
        document.addEventListener("pointerdown", closeMenu);
        document.addEventListener("keydown", closeOnEscape);
        return () => { document.removeEventListener("pointerdown", closeMenu); document.removeEventListener("keydown", closeOnEscape); };
    }, [viewMenuOpen]);
    useEffect(() => {
        if (!profileMenuOpen) return undefined;
        const closeMenu = (event) => { if (!profileMenuReference.current?.contains(event.target)) setProfileMenuOpen(false); };
        const closeOnEscape = (event) => { if (event.key === "Escape") { setProfileMenuOpen(false); profileMenuReference.current?.querySelector(".header-profile-button")?.focus(); } };
        document.addEventListener("pointerdown", closeMenu);
        document.addEventListener("keydown", closeOnEscape);
        return () => { document.removeEventListener("pointerdown", closeMenu); document.removeEventListener("keydown", closeOnEscape); };
    }, [profileMenuOpen]);
    const selectedView = views.find((option) => option.value === view) || views[1];
    return (
        <header className="app-header">
            {searchMode ? <><button className="icon-button header-menu" aria-label="Back to calendar" onClick={onSearchClose}><MaterialIcon size={23}>arrow_back</MaterialIcon></button><h1 className="search-page-title">Search</h1></> : <><button className="icon-button header-menu" aria-label="Toggle sidebar" title="Main menu" onClick={onSidebarToggle}><MaterialIcon size={24}>menu</MaterialIcon></button>
            <div className="brand" aria-label="Calendar"><span className="brand-date"><span className="brand-binding" />31</span><span>Calendar</span></div>
            <button className="today-button" data-testid="today-button" onClick={() => setCursor(new Date())}>Today</button>
            <div className="period-controls">
                <button className="icon-button" data-testid="period-previous" title="Previous" aria-label="Previous period" onClick={() => setCursor(moveCursor(view, cursor, -1))}><MaterialIcon>chevron_left</MaterialIcon></button>
                <button className="icon-button" data-testid="period-next" title="Next" aria-label="Next period" onClick={() => setCursor(moveCursor(view, cursor, 1))}><MaterialIcon>chevron_right</MaterialIcon></button>
            </div><h1>{formatHeading(view, cursor)}</h1></>}
            {!searchMode && <div className="header-actions">
                <button className="icon-button" data-testid="search-open" title="Search" aria-label="Search events" onClick={() => { setViewMenuOpen(false); setProfileMenuOpen(false); onSearchOpen(); }}><MaterialIcon size={23}>search</MaterialIcon></button>
                <div className="menu-anchor" ref={viewMenuReference}>
                    <button className={`view-picker ${viewMenuOpen ? "active" : ""}`} data-testid="view-select" aria-expanded={viewMenuOpen} aria-haspopup="menu" aria-label="Calendar view" onClick={() => { setProfileMenuOpen(false); setViewMenuOpen((open) => !open); }}><span>{selectedView.label}</span><MaterialIcon size={18}>arrow_drop_down</MaterialIcon></button>
                    {viewMenuOpen && <div className="google-menu view-menu" role="menu" aria-label="Calendar views">{views.map((option) => <button key={option.value} role="menuitemradio" aria-checked={view === option.value} onClick={() => { setView(option.value); setViewMenuOpen(false); }}><span>{option.label}</span><kbd>{option.shortcut}</kbd></button>)}</div>}
                </div>
                <button className="mobile-create" aria-label="Create event" onClick={onCreate}><MaterialIcon>add</MaterialIcon></button>
                {profile && <div className="profile-menu-anchor" ref={profileMenuReference}>
                    <button className="header-profile-button" aria-label={`${profile.name} profile`} aria-expanded={profileMenuOpen} aria-haspopup="menu" onClick={() => { setViewMenuOpen(false); setProfileMenuOpen((open) => !open); }}><ProfileAvatar profile={profile} size="small" /></button>
                    {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Profile menu">
                        <div className="profile-menu-identity"><span className="profile-menu-label">CALENDAR PROFILE</span><ProfileAvatar profile={profile} size="medium" /><strong>{profile.name}</strong><span>{profile.email}</span></div>
                        <div className="profile-menu-appearance" role="group" aria-label="Appearance"><span>Appearance</span><div className="theme-toggle">{[{ value: "light", label: "Light", icon: "light_mode" }, { value: "dark", label: "Dark", icon: "dark_mode" }].map((option) => <button key={option.value} type="button" aria-pressed={theme === option.value} onClick={() => setTheme(applyTheme(option.value))}><MaterialIcon size={18}>{option.icon}</MaterialIcon><span>{option.label}</span></button>)}</div></div><button className="profile-switch-button" role="menuitem" aria-label="Switch profile" onClick={() => { setProfileMenuOpen(false); onProfileSwitch(); }}><span className="profile-switch-icon"><MaterialIcon size={21}>group</MaterialIcon></span><span><strong>Switch profile</strong><small>Choose a different calendar</small></span><MaterialIcon size={20}>chevron_right</MaterialIcon></button>
                        <button className="profile-signout-button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onLogout(); }}><MaterialIcon size={19}>logout</MaterialIcon><span>Sign out</span></button>
                    </div>}
                </div>}
            </div>}
        </header>
    );
}
