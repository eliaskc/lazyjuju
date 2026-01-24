import { useKeyboard } from "@opentui/solid"
import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { VersionBlock } from "../../utils/changelog"
import { BorderBox } from "../BorderBox"
import { FooterHints } from "../FooterHints"

interface WhatsNewModalProps {
	changes: VersionBlock[]
	onClose: () => void
	onDisable: () => void
}

export function WhatsNewModal(props: WhatsNewModalProps) {
	const { colors, style } = useTheme()

	useKeyboard((evt) => {
		if (["return", "enter", "escape", "q"].includes(evt.name ?? "")) {
			evt.preventDefault()
			evt.stopPropagation()
			props.onClose()
		} else if (evt.name === "d") {
			evt.preventDefault()
			evt.stopPropagation()
			props.onDisable()
		}
	})

	return (
		<box flexDirection="column" alignItems="center" gap={1}>
			<BorderBox
				border
				borderStyle={style().panel.borderStyle}
				borderColor={colors().borderFocused}
				backgroundColor={colors().background}
				width={70}
				topLeft={<text fg={colors().borderFocused}>What's New</text>}
			>
				<scrollbox maxHeight={20} padding={1}>
					<For each={props.changes}>
						{(block) => (
							<box flexDirection="column">
								<text fg={colors().primary}>v{block.version}</text>
								<For each={block.entries}>
									{(entry) => <text fg={colors().text}> - {entry.text}</text>}
								</For>
								<box height={1} />
							</box>
						)}
					</For>
				</scrollbox>
			</BorderBox>
			<FooterHints
				hints={[
					{ key: "enter", label: "dismiss" },
					{ key: "d", label: "don't show again" },
				]}
				boxed
			/>
		</box>
	)
}
