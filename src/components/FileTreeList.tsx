import { For, Show } from "solid-js"
import { useFocus } from "../context/focus"
import { useTheme } from "../context/theme"
import { createDoubleClickDetector } from "../utils/double-click"
import type { FlatFileNode } from "../utils/file-tree"

const STATUS_CHARS: Record<string, string> = {
	added: "A",
	modified: "M",
	deleted: "D",
	renamed: "R",
	copied: "C",
}

export interface FileTreeListProps {
	files: () => FlatFileNode[]
	selectedIndex: () => number
	setSelectedIndex: (index: number) => void
	collapsedPaths: () => Set<string>
	toggleFolder: (path: string) => void
}

export function FileTreeList(props: FileTreeListProps) {
	const focus = useFocus()
	const { colors } = useTheme()

	const statusColors = () => ({
		added: colors().success,
		modified: colors().warning,
		deleted: colors().error,
		renamed: colors().info,
		copied: colors().info,
	})

	return (
		<For each={props.files()}>
			{(item, index) => {
				const isSelected = () => index() === props.selectedIndex()
				const node = item.node
				const indent = "  ".repeat(item.visualDepth)
				const isCollapsed = props.collapsedPaths().has(node.path)

				const icon = node.isDirectory ? (isCollapsed ? "▶" : "▼") : " "

				const statusChar = node.status
					? (STATUS_CHARS[node.status] ?? " ")
					: " "
				const statusColor = node.status
					? (statusColors()[
							node.status as keyof ReturnType<typeof statusColors>
						] ?? colors().text)
					: colors().text

				const handleDoubleClick = createDoubleClickDetector(() => {
					if (node.isDirectory) {
						props.toggleFolder(node.path)
					} else {
						focus.setPanel("detail")
					}
				})

				const handleMouseDown = (e: { stopPropagation: () => void }) => {
					e.stopPropagation()
					props.setSelectedIndex(index())
					if (node.isDirectory) {
						props.toggleFolder(node.path)
					} else {
						handleDoubleClick()
					}
				}

				return (
					<box
						backgroundColor={
							isSelected() ? colors().selectionBackground : undefined
						}
						overflow="hidden"
						onMouseDown={handleMouseDown}
					>
						<text>
							<span style={{ fg: colors().textMuted }}>{indent}</span>
							<span
								style={{
									fg: node.isDirectory ? colors().info : colors().textMuted,
								}}
							>
								{icon}{" "}
							</span>
							<Show when={!node.isDirectory}>
								<span style={{ fg: statusColor }}>{statusChar} </span>
							</Show>
							<span
								style={{
									fg: node.isDirectory ? colors().info : colors().text,
								}}
							>
								{node.name}
							</span>
						</text>
					</box>
				)
			}}
		</For>
	)
}
