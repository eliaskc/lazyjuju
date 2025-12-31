import { For, createMemo } from "solid-js"
import { useCommand } from "../context/command"
import { useFocus } from "../context/focus"
import { useKeybind } from "../context/keybind"
import { colors } from "../theme"

export function StatusBar() {
	const command = useCommand()
	const focus = useFocus()
	const keybind = useKeybind()

	const relevantCommands = createMemo(() => {
		const all = command.all()
		const currentFocus = focus.current()

		const contextCommands = all.filter(
			(cmd) => cmd.keybind && cmd.context === currentFocus,
		)

		const globalCommands = all.filter(
			(cmd) => cmd.keybind && cmd.context === "global",
		)

		const combined = [...contextCommands, ...globalCommands]

		const seen = new Set<string>()
		return combined.filter((cmd) => {
			if (cmd.hidden) return false
			if (seen.has(cmd.id)) return false
			seen.add(cmd.id)
			return true
		})
	})

	return (
		<box
			height={1}
			flexShrink={0}
			paddingLeft={1}
			paddingRight={1}
			flexDirection="row"
			gap={3}
		>
			<For each={relevantCommands()}>
				{(cmd) => (
					<text>
						<span style={{ fg: colors.text }}>
							{cmd.keybind ? keybind.print(cmd.keybind) : ""}
						</span>
						<span style={{ fg: colors.textMuted }}> {cmd.title}</span>
					</text>
				)}
			</For>
		</box>
	)
}
