import { For, Show } from "solid-js"
import { useCommand } from "../../context/command"
import { useFocus } from "../../context/focus"
import { useSync } from "../../context/sync"
import { colors } from "../../theme"
import { AnsiText } from "../AnsiText"

export function LogPanel() {
	const {
		commits,
		selectedIndex,
		loading,
		error,
		selectNext,
		selectPrev,
		selectFirst,
		selectLast,
		enterFilesView,
	} = useSync()
	const focus = useFocus()
	const command = useCommand()

	const isFocused = () => focus.is("log")

	command.register(() => [
		{
			id: "log.next",
			title: "Next commit",
			keybind: "nav_down",
			context: "log",
			category: "Navigation",
			onSelect: selectNext,
		},
		{
			id: "log.prev",
			title: "Previous commit",
			keybind: "nav_up",
			context: "log",
			category: "Navigation",
			onSelect: selectPrev,
		},
		{
			id: "log.first",
			title: "First commit",
			keybind: "nav_first",
			context: "log",
			category: "Navigation",
			onSelect: selectFirst,
		},
		{
			id: "log.last",
			title: "Last commit",
			keybind: "nav_last",
			context: "log",
			category: "Navigation",
			onSelect: selectLast,
		},
		{
			id: "log.enter_files",
			title: "View files",
			keybind: "enter",
			context: "log",
			category: "Navigation",
			onSelect: () => enterFilesView(),
		},
	])

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
			<Show when={loading()}>
				<text>Loading...</text>
			</Show>
			<Show when={error()}>
				<text>Error: {error()}</text>
			</Show>
			<Show when={!loading() && !error()}>
				<For each={commits()}>
					{(commit, index) => {
						const isSelected = () => index() === selectedIndex()
						return (
							<For each={commit.lines}>
								{(line) => (
									<box
										backgroundColor={
											isSelected() ? colors.selectionBackground : undefined
										}
										overflow="hidden"
									>
										<AnsiText
											content={line}
											bold={commit.isWorkingCopy}
											wrapMode="none"
										/>
									</box>
								)}
							</For>
						)
					}}
				</For>
			</Show>
		</box>
	)
}
