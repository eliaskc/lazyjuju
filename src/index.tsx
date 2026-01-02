import { ConsolePosition } from "@opentui/core"
import { extend, render } from "@opentui/solid"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
import { App } from "./App"

// Register ghostty-terminal component for ANSI rendering
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

render(() => <App />, {
	consoleOptions: {
		position: ConsolePosition.BOTTOM,
		maxStoredLogs: 1000,
		sizePercent: 40,
	},
})
