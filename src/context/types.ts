/**
 * Panel represents the physical UI region (derived from context's first segment)
 */
export type Panel = "log" | "refs" | "detail" | "commandlog"

/**
 * Context represents the current interaction mode (what keys mean right now).
 * Format: panel.mode (e.g., "log.revisions", "log.files")
 *
 * Modes are siblings, not hierarchical. "files" is NOT a child of "revisions".
 * This prevents accidental command inheritance via prefix matching.
 */
export type Context =
	// Special contexts
	| "global"
	| "help"
	// Log panel modes
	| "log"
	| "log.revisions"
	| "log.files"
	| "log.oplog"
	// Refs panel modes
	| "refs"
	| "refs.bookmarks"
	// Detail panel
	| "detail"
	// Command log panel
	| "commandlog"

export type CommandType = "action" | "navigation" | "view" | "git"

/**
 * Controls where a command appears:
 * - "all": show in both status bar and help modal (default)
 * - "help-only": show only in help modal (navigation, git ops, refresh)
 * - "status-only": show only in status bar (modal hints)
 * - "none": hidden everywhere (internal commands)
 */
export type CommandVisibility = "all" | "help-only" | "status-only" | "none"

/**
 * Extract the panel from a hierarchical context
 */
export function panelFromContext(context: Context): Panel | null {
	if (context === "global" || context === "help") return null
	const panel = context.split(".")[0]
	if (
		panel === "log" ||
		panel === "refs" ||
		panel === "detail" ||
		panel === "commandlog"
	) {
		return panel as Panel
	}
	return null
}
