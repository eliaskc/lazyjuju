import { For, Show } from "solid-js"
import { useCommand } from "../../context/command"
import { useFocus } from "../../context/focus"
import { useSync } from "../../context/sync"
import { colors } from "../../theme"

const STATUS_COLORS: Record<string, string> = {
	added: colors.success,
	modified: colors.warning,
	deleted: colors.error,
	renamed: colors.info,
	copied: colors.info,
}

const STATUS_CHARS: Record<string, string> = {
	added: "A",
	modified: "M",
	deleted: "D",
	renamed: "R",
	copied: "C",
}

export function FileTreePanel() {
	const {
		selectedCommit,
		flatFiles,
		selectedFileIndex,
		filesLoading,
		filesError,
		collapsedPaths,
		exitFilesView,
		toggleFolder,
		selectNextFile,
		selectPrevFile,
		selectFirstFile,
		selectLastFile,
	} = useSync()
	const focus = useFocus()
	const command = useCommand()

	const isFocused = () => focus.is("log")

	const handleEnter = () => {
		const file = flatFiles()[selectedFileIndex()]
		if (file?.node.isDirectory) {
			toggleFolder(file.node.path)
		}
	}

	command.register(() => [
		{
			id: "files.next",
			title: "Next file",
			keybind: "nav_down",
			context: "log",
			category: "Navigation",
			onSelect: selectNextFile,
		},
		{
			id: "files.prev",
			title: "Previous file",
			keybind: "nav_up",
			context: "log",
			category: "Navigation",
			onSelect: selectPrevFile,
		},
		{
			id: "files.first",
			title: "First file",
			keybind: "nav_first",
			context: "log",
			category: "Navigation",
			onSelect: selectFirstFile,
		},
		{
			id: "files.last",
			title: "Last file",
			keybind: "nav_last",
			context: "log",
			category: "Navigation",
			onSelect: selectLastFile,
		},
		{
			id: "files.toggle_or_select",
			title: "Toggle folder / Select file",
			keybind: "enter",
			context: "log",
			category: "Files",
			onSelect: handleEnter,
		},
		{
			id: "files.back",
			title: "Back to log",
			keybind: "escape",
			context: "log",
			category: "Files",
			onSelect: exitFilesView,
		},
	])

	const commit = selectedCommit()
	const title = commit ? `Files (${commit.changeId.slice(0, 8)})` : "Files"

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			height="100%"
			border
			borderColor={isFocused() ? colors.borderFocused : colors.border}
			overflow="hidden"
			gap={0}
		>
			<Show when={filesLoading()}>
				<text fg={colors.textMuted}>Loading files...</text>
			</Show>
			<Show when={filesError()}>
				<text fg={colors.error}>Error: {filesError()}</text>
			</Show>
			<Show when={!filesLoading() && !filesError()}>
				<For each={flatFiles()}>
					{(item, index) => {
						const isSelected = () => index() === selectedFileIndex()
						const node = item.node
						const indent = "  ".repeat(item.visualDepth)
						const isCollapsed = collapsedPaths().has(node.path)

						const icon = node.isDirectory ? (isCollapsed ? "▶" : "▼") : " "

						const statusChar = node.status
							? (STATUS_CHARS[node.status] ?? " ")
							: " "
						const statusColor = node.status
							? STATUS_COLORS[node.status]
							: colors.text

						return (
							<box
								backgroundColor={
									isSelected() ? colors.selectionBackground : undefined
								}
								overflow="hidden"
							>
								<text>
									<span style={{ fg: colors.textMuted }}>{indent}</span>
									<span
										style={{
											fg: node.isDirectory ? colors.info : colors.textMuted,
										}}
									>
										{icon}{" "}
									</span>
									<Show when={!node.isDirectory}>
										<span style={{ fg: statusColor }}>{statusChar} </span>
									</Show>
									<span
										style={{
											fg: node.isDirectory ? colors.info : colors.text,
										}}
									>
										{node.name}
									</span>
								</text>
							</box>
						)
					}}
				</For>
			</Show>
		</box>
	)
}
