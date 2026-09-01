import { useState } from "react";
import { MaterialIcon } from "../../shared/components/MaterialIcon.jsx";
import { formatInsightDate, formatInsightDuration } from "./insight-format.js";

export function TimeInsightsSummary({ cursor, error = "", insights, loading = false, onOpen = () => {}, onRetry = () => {} }) {
    const [expanded, setExpanded] = useState(true);
    const meetingMinutes = insights?.meetingMinutes || 0;
    const averageMinutes = insights?.averageDailyMeetingMinutes || 0;
    const workingDayMinutes = insights?.workingDayMinutes || 480;
    const progress = Math.min(100, meetingMinutes / workingDayMinutes * 100);
    return (
        <section className="time-insights-summary" aria-labelledby="time-insights-summary-title">
            <button className="time-insights-heading" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
                <span id="time-insights-summary-title">Time Insights</span>
                <MaterialIcon size={20}>{expanded ? "expand_less" : "expand_more"}</MaterialIcon>
            </button>
            {expanded && <div className="time-insights-summary-body">
                <p className="insight-summary-date">{formatInsightDate(cursor)}</p>
                {loading ? <div className="insight-summary-skeleton" aria-label="Loading time insights" role="status" /> : error ? <div className="insight-summary-error" role="alert"><span>Insights unavailable</span><button onClick={onRetry}>Retry</button></div> : <>
                    <p className="insight-summary-copy">{formatInsightDuration(meetingMinutes)} in meetings <span>(avg: {formatInsightDuration(averageMinutes)})</span></p>
                    <div className="insight-progress" aria-label={`${formatInsightDuration(meetingMinutes)} in meetings`} role="img"><span style={{ width: `${progress}%` }} /></div>
                    <button className="more-insights-button" data-testid="more-insights" onClick={onOpen}><MaterialIcon size={20}>insights</MaterialIcon><span>More insights</span></button>
                </>}
            </div>}
        </section>
    );
}
