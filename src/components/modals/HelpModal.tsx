import { For, createMemo, createSignal } from "solid-js"
import { type CommandOption, useCommand } from "../../context/command"
import { useDialog } from "../../context/dialog"
import { useKeybind } from "../../context/keybind"
import { colors } from "../../theme"

interface CategoryGroup {
	name: string
	commands: CommandOption[]
}

export function HelpModal() {
	const command = useCommand()
	const keybind = useKeybind()
	const dialog = useDialog()
	const [filter, setFilter] = createSignal("")

	const groupedCommands = createMemo(() => {
		const all = command.all()
		const filterText = filter().toLowerCase()

		const filtered = filterText
			? all.filter(
					(cmd) =>
						cmd.title.toLowerCase().includes(filterText) ||
						cmd.category?.toLowerCase().includes(filterText) ||
						(cmd.keybind && keybind.print(cmd.keybind).includes(filterText)),
				)
			: all

		const groups = new Map<string, CommandOption[]>()
		for (const cmd of filtered) {
			const category = cmd.category || "Other"
			const existing = groups.get(category) || []
			groups.set(category, [...existing, cmd])
		}

		const result: CategoryGroup[] = []
		for (const [name, commands] of groups) {
			result.push({ name, commands })
		}

		return result.sort((a, b) => a.name.localeCompare(b.name))
	})

	const columnCount = 3
	const columns = createMemo(() => {
		const groups = groupedCommands()
		const cols: CategoryGroup[][] = Array.from(
			{ length: columnCount },
			() => [],
		)

		let colIndex = 0
		for (const group of groups) {
			const col = cols[colIndex]
			if (col) col.push(group)
			colIndex = (colIndex + 1) % columnCount
		}

		return cols
	})

	const columnKeybindWidths = createMemo(() => {
		return columns().map((col) => {
			let maxWidth = 0
			for (const group of col) {
				for (const cmd of group.commands) {
					if (cmd.keybind) {
						const width = keybind.print(cmd.keybind).length
						if (width > maxWidth) maxWidth = width
					}
				}
			}
			return maxWidth
		})
	})

	return (
		<box
			flexDirection="column"
			backgroundColor={colors.background}
			border
			borderColor={colors.border}
			title="Commands"
			paddingTop={1}
			paddingBottom={1}
			paddingLeft={3}
			paddingRight={3}
			width="90%"
			height="80%"
		>
			<box flexDirection="row" marginBottom={2}>
				<text fg={colors.text}>Search: </text>
				<input
					focused
					placeholder="Type to filter ..."
					onInput={(value) => setFilter(value)}
					onSubmit={() => dialog.close()}
				/>
			</box>

			<box flexDirection="row" flexGrow={1} gap={4}>
				<For each={columns()}>
					{(column, colIndex) => {
						const maxWidth = () => columnKeybindWidths()[colIndex()] || 0
						return (
							<box flexDirection="column" flexGrow={1} flexBasis={0}>
								<For each={column}>
									{(group) => {
										const headerPad = " ".repeat(maxWidth() + 1)
										return (
											<box flexDirection="column" marginBottom={1}>
												<text fg={colors.purple}>
													{headerPad}
													<b>{group.name}</b>
												</text>
												<For each={group.commands}>
													{(cmd) => {
														const kb = cmd.keybind
															? keybind.print(cmd.keybind)
															: ""
														const padded = kb.padStart(maxWidth())
														return (
															<text>
																<span style={{ fg: colors.primary }}>
																	{padded}
																</span>
																<span style={{ fg: colors.text }}>
																	{" "}
																	{cmd.title}
																</span>
															</text>
														)
													}}
												</For>
											</box>
										)
									}}
								</For>
							</box>
						)
					}}
				</For>
			</box>
		</box>
	)
}
