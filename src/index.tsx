import { ConsolePosition } from "@opentui/core"
import { extend, render } from "@opentui/solid"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
import { App } from "./App"
import { initHighlighter } from "./diff"

extend({ "ghostty-terminal": GhosttyTerminalRenderable })

initHighlighter()

render(() => <App />, {
	consoleOptions: {
		position: ConsolePosition.BOTTOM,
		maxStoredLogs: 1000,
		sizePercent: 40,
	},
})
