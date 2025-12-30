import type { TerminalLine } from "ghostty-opentui"
import { ptyToJson } from "ghostty-opentui"
import { For, Show, createMemo } from "solid-js"

interface AnsiTextProps {
	content: string
	cols?: number
	bold?: boolean
	wrapMode?: "none" | "char" | "word"
}

export function AnsiText(props: AnsiTextProps) {
	const data = createMemo(() => {
		if (!props.content) return { lines: [] as TerminalLine[] }
		return ptyToJson(props.content, { cols: props.cols ?? 9999, rows: 1 })
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
		<For each={data().lines}>
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
