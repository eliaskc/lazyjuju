import { useRenderer } from "@opentui/solid"
import {
	type JSX,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	useContext,
} from "solid-js"
import { fetchDiff } from "../commander/diff"
import { fetchFiles } from "../commander/files"
import { fetchLog } from "../commander/log"
import type { Commit, FileChange } from "../commander/types"
import {
	type FileTreeNode,
	type FlatFileNode,
	buildFileTree,
	flattenTree,
	getFilePaths,
} from "../utils/file-tree"

export type ViewMode = "log" | "files"

interface SyncContextValue {
	commits: () => Commit[]
	selectedIndex: () => number
	setSelectedIndex: (index: number) => void
	selectPrev: () => void
	selectNext: () => void
	selectFirst: () => void
	selectLast: () => void
	selectedCommit: () => Commit | undefined
	loadLog: () => Promise<void>
	loading: () => boolean
	error: () => string | null
	diff: () => string | null
	diffLoading: () => boolean
	diffError: () => string | null
	terminalWidth: () => number
	terminalHeight: () => number
	mainAreaWidth: () => number

	viewMode: () => ViewMode
	fileTree: () => FileTreeNode | null
	flatFiles: () => FlatFileNode[]
	selectedFileIndex: () => number
	setSelectedFileIndex: (index: number) => void
	collapsedPaths: () => Set<string>
	filesLoading: () => boolean
	filesError: () => string | null
	selectedFile: () => FlatFileNode | undefined

	enterFilesView: () => Promise<void>
	exitFilesView: () => void
	toggleFolder: (path: string) => void
	selectPrevFile: () => void
	selectNextFile: () => void
	selectFirstFile: () => void
	selectLastFile: () => void
}

const SyncContext = createContext<SyncContextValue>()

export function SyncProvider(props: { children: JSX.Element }) {
	const renderer = useRenderer()
	const [commits, setCommits] = createSignal<Commit[]>([])
	const [selectedIndex, setSelectedIndex] = createSignal(0)
	const [loading, setLoading] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [diff, setDiff] = createSignal<string | null>(null)
	const [diffLoading, setDiffLoading] = createSignal(false)
	const [diffError, setDiffError] = createSignal<string | null>(null)
	const [terminalWidth, setTerminalWidth] = createSignal(renderer.width)
	const [terminalHeight, setTerminalHeight] = createSignal(renderer.height)

	const [viewMode, setViewMode] = createSignal<ViewMode>("log")
	const [files, setFiles] = createSignal<FileChange[]>([])
	const [fileTree, setFileTree] = createSignal<FileTreeNode | null>(null)
	const [selectedFileIndex, setSelectedFileIndex] = createSignal(0)
	const [collapsedPaths, setCollapsedPaths] = createSignal<Set<string>>(
		new Set(),
	)
	const [filesLoading, setFilesLoading] = createSignal(false)
	const [filesError, setFilesError] = createSignal<string | null>(null)

	const flatFiles = createMemo(() => {
		const tree = fileTree()
		if (!tree) return []
		return flattenTree(tree, collapsedPaths())
	})

	const selectedFile = () => flatFiles()[selectedFileIndex()]

	const mainAreaWidth = () => {
		const width = terminalWidth()
		const mainAreaRatio = 2 / 3
		const borderWidth = 2
		return Math.floor(width * mainAreaRatio) - borderWidth
	}

	onMount(() => {
		const handleResize = (width: number, height: number) => {
			setTerminalWidth(width)
			setTerminalHeight(height)
		}
		renderer.on("resize", handleResize)
		onCleanup(() => renderer.off("resize", handleResize))
	})

	const selectPrev = () => {
		setSelectedIndex((i) => Math.max(0, i - 1))
	}

	const selectNext = () => {
		setSelectedIndex((i) => Math.min(commits().length - 1, i + 1))
	}

	const selectFirst = () => {
		setSelectedIndex(0)
	}

	const selectLast = () => {
		setSelectedIndex(Math.max(0, commits().length - 1))
	}

	const selectedCommit = () => commits()[selectedIndex()]

	const selectPrevFile = () => {
		setSelectedFileIndex((i) => Math.max(0, i - 1))
	}

	const selectNextFile = () => {
		setSelectedFileIndex((i) => Math.min(flatFiles().length - 1, i + 1))
	}

	const selectFirstFile = () => {
		setSelectedFileIndex(0)
	}

	const selectLastFile = () => {
		setSelectedFileIndex(Math.max(0, flatFiles().length - 1))
	}

	let diffDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let currentDiffKey: string | null = null

	const loadDiff = async (
		changeId: string,
		columns: number,
		paths?: string[],
	) => {
		const key = paths?.length ? `${changeId}:${paths.join(",")}` : changeId
		currentDiffKey = key
		setDiffLoading(true)
		setDiffError(null)
		try {
			const result = await fetchDiff(changeId, { columns, paths })
			if (currentDiffKey === key) {
				setDiff(result)
			}
		} catch (e) {
			if (currentDiffKey === key) {
				setDiffError(e instanceof Error ? e.message : "Failed to load diff")
				setDiff(null)
			}
		} finally {
			if (currentDiffKey === key) {
				setDiffLoading(false)
			}
		}
	}

	createEffect(() => {
		const commit = selectedCommit()
		const columns = mainAreaWidth()
		const mode = viewMode()

		if (!commit) return

		if (diffDebounceTimer) {
			clearTimeout(diffDebounceTimer)
		}

		if (mode === "files") {
			const file = selectedFile()
			if (file) {
				const paths = file.node.isDirectory
					? getFilePaths(file.node)
					: [file.node.path]
				diffDebounceTimer = setTimeout(() => {
					loadDiff(commit.changeId, columns, paths)
				}, 100)
			}
		} else {
			diffDebounceTimer = setTimeout(() => {
				loadDiff(commit.changeId, columns)
			}, 100)
		}
	})

	const loadLog = async () => {
		setLoading(true)
		setError(null)
		try {
			const result = await fetchLog()
			setCommits(result)
			setSelectedIndex(0)
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load log")
		} finally {
			setLoading(false)
		}
	}

	const enterFilesView = async () => {
		const commit = selectedCommit()
		if (!commit) return

		setFilesLoading(true)
		setFilesError(null)
		try {
			const result = await fetchFiles(commit.changeId, {
				ignoreWorkingCopy: true,
			})
			setFiles(result)
			setFileTree(buildFileTree(result))
			setSelectedFileIndex(0)
			setCollapsedPaths(new Set<string>())
			setViewMode("files")
		} catch (e) {
			setFilesError(e instanceof Error ? e.message : "Failed to load files")
		} finally {
			setFilesLoading(false)
		}
	}

	const exitFilesView = () => {
		setViewMode("log")
		setFiles([])
		setFileTree(null)
		setSelectedFileIndex(0)
		setCollapsedPaths(new Set<string>())
	}

	const toggleFolder = (path: string) => {
		setCollapsedPaths((prev) => {
			const next = new Set(prev)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}

	const value: SyncContextValue = {
		commits,
		selectedIndex,
		setSelectedIndex,
		selectPrev,
		selectNext,
		selectFirst,
		selectLast,
		selectedCommit,
		loadLog,
		loading,
		error,
		diff,
		diffLoading,
		diffError,
		terminalWidth,
		terminalHeight,
		mainAreaWidth,

		viewMode,
		fileTree,
		flatFiles,
		selectedFileIndex,
		setSelectedFileIndex,
		collapsedPaths,
		filesLoading,
		filesError,
		selectedFile,

		enterFilesView,
		exitFilesView,
		toggleFolder,
		selectPrevFile,
		selectNextFile,
		selectFirstFile,
		selectLastFile,
	}

	return (
		<SyncContext.Provider value={value}>{props.children}</SyncContext.Provider>
	)
}

export function useSync(): SyncContextValue {
	const ctx = useContext(SyncContext)
	if (!ctx) {
		throw new Error("useSync must be used within SyncProvider")
	}
	return ctx
}
