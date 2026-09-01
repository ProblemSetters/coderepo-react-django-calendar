export function layoutTimedEvents(events) {
    const sorted = [...events].sort((left, right) => new Date(left.startAt) - new Date(right.startAt));
    const groups = [];
    let group = [];
    let groupEnd = -Infinity;
    for (const event of sorted) {
        const start = new Date(event.startAt).getTime();
        if (group.length && start >= groupEnd) {
            groups.push(group);
            group = [];
            groupEnd = -Infinity;
        }
        group.push(event);
        groupEnd = Math.max(groupEnd, new Date(event.endAt).getTime());
    }
    if (group.length) groups.push(group);
    return groups.flatMap((eventsInGroup) => {
        const columnEnds = [];
        const assigned = eventsInGroup.map((event) => {
            const start = new Date(event.startAt).getTime();
            let column = columnEnds.findIndex((end) => end <= start);
            if (column === -1) column = columnEnds.length;
            columnEnds[column] = new Date(event.endAt).getTime();
            return { event, column };
        });
        return assigned.map((item) => ({ ...item, columns: columnEnds.length }));
    });
}

export function getEventColumnGeometry(column, columns) {
    const columnCount = Math.max(1, columns);
    const width = 100 / columnCount;
    return { left: column * width, width, zIndex: 2 };
}
