import type { TerminalLine } from "ghostty-opentui"
import { ptyToJson } from "ghostty-opentui"
import { For, Show, createEffect, createMemo } from "solid-js"
import { profile } from "../utils/profiler"

interface AnsiTextProps {
	content: string
	cols?: number
	bold?: boolean
	wrapMode?: "none" | "char" | "word"
	maxLines?: number
	onTotalLines?: (total: number) => void
}

export function AnsiText(props: AnsiTextProps) {
	const allLines = createMemo(() => {
		if (!props.content) return [] as TerminalLine[]
		const endParse = profile("ptyToJson parse")
		const result = ptyToJson(props.content, {
			cols: props.cols ?? 9999,
			rows: 1,
		})
		endParse(`${result.lines.length} lines from ${props.content.length} chars`)
		return result.lines
	})

	createEffect(() => {
		const total = allLines().length
		props.onTotalLines?.(total)
	})

	const visibleLines = createMemo(() => {
		const lines = allLines()
		const limit = props.maxLines
		if (limit !== undefined && lines.length > limit) {
			return lines.slice(0, limit)
		}
		return lines
	})

	const renderSpans = (line: TerminalLine) => (
		<For each={line.spans}>
			{(span) => (
				<span
					style={{
						fg: span.fg ?? undefined,
						bg: span.bg ?? undefined,
					}}
				>
					{span.text}
				</span>
			)}
		</For>
	)

	return (
		<For each={visibleLines()}>
			{(line) => (
				<text wrapMode={props.wrapMode ?? "word"}>
					<Show when={props.bold} fallback={renderSpans(line)}>
						<b>{renderSpans(line)}</b>
					</Show>
				</text>
			)}
		</For>
	)
}
