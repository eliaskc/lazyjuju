import { ConsolePosition } from "@opentui/core"
import { extend, render, useRenderer } from "@opentui/solid"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
import { Show, createSignal } from "solid-js"
import { App } from "./App"
import { jjWorkspaceUpdateStale } from "./commander/operations"
import { ErrorScreen } from "./components/ErrorScreen"
import { StartupScreen } from "./components/StartupScreen"
import { ThemeProvider } from "./context/theme"
import { initHighlighter } from "./diff"
import { getRepoPath, setRepoPath } from "./repo"
import { checkRepoStatus, initJjGitRepo, initJjRepo } from "./utils/repo-check"
import { getRecentRepos } from "./utils/state"

// Mock modes for testing UI screens
type MockMode = null | "error-stale" | "startup-no-vcs" | "startup-git"

// Parse CLI args
const args = process.argv.slice(2)
let mockMode: MockMode = null

for (const arg of args) {
	if (arg.startsWith("--mock=")) {
		const value = arg.slice(7)
		if (["error-stale", "startup-no-vcs", "startup-git"].includes(value)) {
			mockMode = value as MockMode
		}
	} else if (!arg.startsWith("-")) {
		setRepoPath(arg)
	}
}

extend({ "ghostty-terminal": GhosttyTerminalRenderable })

initHighlighter()

// Mock error messages for testing
const MOCK_ERRORS = {
	"error-stale": `jj log failed: Error: The working copy is stale (not updated since operation abc123).
Hint: Run \`jj workspace update-stale\` to update it.
For more information, see https://martinvonz.github.io/jj/latest/working-copy/`,
}

function Root() {
	const renderer = useRenderer()
	const initialStatus = checkRepoStatus(getRepoPath())
	const [isJjRepo, setIsJjRepo] = createSignal(
		mockMode
			? mockMode !== "startup-no-vcs" && mockMode !== "startup-git"
			: initialStatus.isJjRepo,
	)
	const [hasGitRepo] = createSignal(
		mockMode === "startup-git" ? true : initialStatus.hasGitRepo,
	)
	const [initError, setInitError] = createSignal<string | null>(null)
	const [startupError, setStartupError] = createSignal<string | null>(
		mockMode ? null : initialStatus.startupError,
	)

	const handleSelectRepo = (path: string) => {
		setRepoPath(path)
		const status = checkRepoStatus(path)
		if (status.isJjRepo) {
			setIsJjRepo(true)
		}
	}

	const handleInitJj = async () => {
		setInitError(null)
		const result = await initJjRepo(getRepoPath())
		if (result.success) {
			setIsJjRepo(true)
		} else {
			setInitError(result.error ?? "Failed to initialize")
		}
	}

	const handleInitJjGit = async (colocate: boolean) => {
		setInitError(null)
		const result = await initJjGitRepo(getRepoPath(), { colocate })
		if (result.success) {
			setIsJjRepo(true)
		} else {
			setInitError(result.error ?? "Failed to initialize")
		}
	}

	const handleQuit = () => {
		renderer.destroy()
		process.exit(0)
	}

	// Mock error screen
	if (mockMode === "error-stale") {
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
		return (
			<ThemeProvider>
				<ErrorScreen
					error={MOCK_ERRORS["error-stale"]}
					onRetry={async () => {
						await sleep(1000)
						// In real usage, parent would update error prop or unmount
					}}
					onFix={async () => {
						await sleep(1000)
						// In real usage, parent would update error prop or unmount
					}}
					onQuit={handleQuit}
				/>
			</ThemeProvider>
		)
	}

	const handleRetryStartup = async () => {
		const status = checkRepoStatus(getRepoPath())
		setStartupError(status.startupError)
		if (!status.startupError) {
			setIsJjRepo(status.isJjRepo)
		}
	}

	const handleFixStartup = async () => {
		const result = await jjWorkspaceUpdateStale()
		if (result.success) {
			await handleRetryStartup()
		}
	}

	// Show error screen for critical startup errors (like stale working copy)
	const currentStartupError = startupError()
	if (currentStartupError) {
		return (
			<ThemeProvider>
				<ErrorScreen
					error={currentStartupError}
					onRetry={handleRetryStartup}
					onFix={handleFixStartup}
					onQuit={handleQuit}
				/>
			</ThemeProvider>
		)
	}

	return (
		<Show
			when={isJjRepo()}
			fallback={
				<ThemeProvider>
					<StartupScreen
						hasGitRepo={hasGitRepo()}
						recentRepos={mockMode ? [] : getRecentRepos()}
						onSelectRepo={handleSelectRepo}
						onInitJj={handleInitJj}
						onInitJjGit={handleInitJjGit}
						onQuit={handleQuit}
					/>
				</ThemeProvider>
			}
		>
			<App />
		</Show>
	)
}

render(() => <Root />, {
	consoleOptions: {
		position: ConsolePosition.BOTTOM,
		maxStoredLogs: 1000,
		sizePercent: 40,
	},
})
