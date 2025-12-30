import { useRenderer } from "@opentui/solid"
import { Show, onMount } from "solid-js"
import { Layout } from "./components/Layout"
import { HelpModal } from "./components/modals/HelpModal"
import { FileTreePanel } from "./components/panels/FileTreePanel"
import { LogPanel } from "./components/panels/LogPanel"
import { MainArea } from "./components/panels/MainArea"
import { CommandProvider, useCommand } from "./context/command"
import { DialogContainer, DialogProvider, useDialog } from "./context/dialog"
import { FocusProvider, useFocus } from "./context/focus"
import { KeybindProvider } from "./context/keybind"
import { SyncProvider, useSync } from "./context/sync"

function LeftPanel() {
	const { viewMode } = useSync()

	return (
		<Show when={viewMode() === "files"} fallback={<LogPanel />}>
			<FileTreePanel />
		</Show>
	)
}

function AppContent() {
	const renderer = useRenderer()
	const { loadLog } = useSync()
	const focus = useFocus()
	const command = useCommand()
	const dialog = useDialog()

	onMount(() => {
		loadLog()

		renderer.console.keyBindings = [
			{ name: "y", ctrl: true, action: "copy-selection" },
		]
		renderer.console.onCopySelection = (text) => {
			const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" })
			proc.stdin.write(text)
			proc.stdin.end()
		}
	})

	command.register(() => [
		{
			id: "global.quit",
			title: "Quit",
			keybind: "quit",
			context: "global",
			category: "UI",
			onSelect: () => {
				renderer.destroy()
				process.exit(0)
			},
		},
		...(typeof DEV === "undefined" || DEV
			? [
					{
						id: "global.toggle_console",
						title: "Toggle Console",
						keybind: "toggle_console" as const,
						context: "global" as const,
						category: "UI",
						onSelect: () => renderer.console.toggle(),
					},
				]
			: []),
		{
			id: "global.toggle_focus",
			title: "Toggle Focus",
			keybind: "toggle_focus",
			context: "global",
			category: "UI",
			onSelect: () => focus.toggle(),
		},
		{
			id: "global.help",
			title: "Help",
			keybind: "help",
			context: "global",
			category: "UI",
			onSelect: () => dialog.open(() => <HelpModal />),
		},
		{
			id: "global.refresh",
			title: "Refresh",
			keybind: "refresh",
			context: "global",
			category: "UI",
			onSelect: () => loadLog(),
		},
	])

	return (
		<DialogContainer>
			<Layout left={<LeftPanel />} right={<MainArea />} />
		</DialogContainer>
	)
}

export function App() {
	return (
		<SyncProvider>
			<FocusProvider>
				<KeybindProvider>
					<DialogProvider>
						<CommandProvider>
							<AppContent />
						</CommandProvider>
					</DialogProvider>
				</KeybindProvider>
			</FocusProvider>
		</SyncProvider>
	)
}
