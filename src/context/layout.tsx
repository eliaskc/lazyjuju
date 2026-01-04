import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useFocus } from "./focus"
import { createSimpleContext } from "./helper"

const NARROW_THRESHOLD = 100
const MEDIUM_THRESHOLD = 150

const LAYOUT_WIDE = { left: 2, right: 3 }
const LAYOUT_MEDIUM = { left: 1, right: 1 }
const LAYOUT_FILES = { left: 1, right: 3 }

export const { use: useLayout, provider: LayoutProvider } = createSimpleContext(
	{
		name: "Layout",
		init: () => {
			const renderer = useRenderer()
			const focus = useFocus()

			const [terminalWidth, setTerminalWidth] = createSignal(renderer.width)
			const [terminalHeight, setTerminalHeight] = createSignal(renderer.height)

			onMount(() => {
				const handleResize = (width: number, height: number) => {
					setTerminalWidth(width)
					setTerminalHeight(height)
				}
				renderer.on("resize", handleResize)
				onCleanup(() => renderer.off("resize", handleResize))
			})

			const isNarrow = createMemo(() => terminalWidth() < NARROW_THRESHOLD)

			const isFileContext = createMemo(() => {
				const ctx = focus.activeContext()
				return ctx === "log.files" || ctx === "refs.files"
			})

			const layoutRatio = createMemo(() => {
				if (isFileContext()) return LAYOUT_FILES
				if (terminalWidth() < MEDIUM_THRESHOLD) return LAYOUT_MEDIUM
				return LAYOUT_WIDE
			})

			const mainAreaWidth = createMemo(() => {
				const width = terminalWidth()
				const { left, right } = layoutRatio()
				const ratio = right / (left + right)
				const borderWidth = 2
				return Math.floor(width * ratio) - borderWidth
			})

			return {
				terminalWidth,
				terminalHeight,
				layoutRatio,
				mainAreaWidth,
				isNarrow,
			}
		},
	},
)
