import { ptyToJson } from "ghostty-opentui"
import { For, createMemo } from "solid-js"

interface AnsiTextProps {
	content: string
	cols?: number
}

export function AnsiText(props: AnsiTextProps) {
	const data = createMemo(() => {
		if (!props.content) return { lines: [] }
		return ptyToJson(props.content, { cols: props.cols ?? 120 })
	})

	return (
		<box flexDirection="column">
			<For each={data().lines}>
				{(line) => (
					<text>
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
					</text>
				)}
			</For>
		</box>
	)
}
