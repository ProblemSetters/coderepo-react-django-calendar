export const calendarColors = [
    ["Cornflower", "#1a73e8"], ["Burnt orange", "#b85c00"], ["Berry", "#c2185b"], ["Teal", "#00796b"],
    ["Grape", "#7b1fa2"], ["Tomato", "#c5221f"], ["Basil", "#0b8043"], ["Indigo", "#3f51b5"],
    ["Cyan", "#007c91"], ["Cocoa", "#795548"], ["Olive", "#6b6f00"], ["Graphite", "#5f6368"],
].map(([label, value]) => ({ label, value }));

const channel = (value) => {
    const normalized = value / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!match) return 0;
    const number = Number.parseInt(match[1], 16);
    return .2126 * channel((number >> 16) & 255) + .7152 * channel((number >> 8) & 255) + .0722 * channel(number & 255);
};

const contrast = (first, second) => {
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + .05) / (darker + .05);
};

export const foregroundForColor = (background) => {
    const backgroundLuminance = luminance(background);
    return contrast(1, backgroundLuminance) >= contrast(luminance("#202124"), backgroundLuminance) ? "#fff" : "#202124";
};

export const overlapColor = (background, column, columns) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(background || ""));
    if (!match || columns <= 1 || column === 0) return background;
    const value = Number.parseInt(match[1], 16);
    const factor = Math.max(.72, 1 - Math.min(column, 3) * .09);
    const channels = [value >> 16, value >> 8 & 255, value & 255].map((channelValue) => Math.round(channelValue * factor));
    return `#${channels.map((channelValue) => channelValue.toString(16).padStart(2, "0")).join("")}`;
};

export const nextAvailableCalendarColor = (usedColors = []) => {
    const used = new Set(usedColors.map((color) => String(color).toLowerCase()));
    return calendarColors.find((option) => !used.has(option.value))?.value || calendarColors[used.size % calendarColors.length].value;
};
