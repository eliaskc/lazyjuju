export const colors = {
	primary: "#fab283",
	secondary: "#5c9cf5",
	background: "#0a0a0a",
	backgroundSecondary: "#141414",
	backgroundElement: "#1e1e1e",

	text: "#eeeeee",
	textMuted: "#808080",

	border: "#484848",
	borderFocused: "#eeeeee",

	selectionBackground: "#1e1e1e",
	selectionText: "#fab283",

	success: "#12c905",
	warning: "#fcd53a",
	error: "#fc533a",
	info: "#5c9cf5",

	purple: "#9d7cd8",
	orange: "#f5a742",
	greenCode: "#7fd88f",
} as const

export type Colors = typeof colors
