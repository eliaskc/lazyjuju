import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import {
	type DiffRow,
	type FileId,
	type FlattenedFile,
	type HunkId,
	type SyntaxToken,
	flattenToRows,
	getFileStatusColor,
	getFileStatusIndicator,
	getLanguage,
	getLineNumWidth,
	getMaxLineNumber,
	getVisibleRange,
	highlighterReady,
	tokenVersion,
	tokenizeLineSync,
} from "../../diff"

const DIFF_BG = {
	addition: "#0d2818",
	deletion: "#2d1215",
	additionEmphasis: "#1a5a2a",
	deletionEmphasis: "#5a1a1a",
	hunkHeader: "#161620",
} as const

const BAR_COLORS = {
	addition: "#3fb950",
	deletion: "#f85149",
} as const

const LINE_NUM_COLORS = {
	addition: "#3fb950",
	deletion: "#f85149",
	context: "#6e7681",
} as const

const BAR_CHAR = "▌"
const SEPARATOR_COLOR = "#30363d"
const FILE_HEADER_BG = "#1c2128"
const HUNK_HEADER_BG = "#161b22"
const RIGHT_PADDING = 3

const STAT_COLORS = {
	addition: "#3fb950",
	deletion: "#f85149",
}

interface VirtualizedUnifiedViewProps {
	files: FlattenedFile[]
	activeFileId?: FileId | null
	currentHunkId?: HunkId | null
	scrollTop: number
	viewportHeight: number
	viewportWidth: number
	wrapEnabled: boolean
}

type WrappedRow =
	| { type: "file-header" | "hunk-header"; row: DiffRow }
	| {
			type: "content"
			row: DiffRow
			lineStart: number
			lineLength: number
	  }

export function VirtualizedUnifiedView(props: VirtualizedUnifiedViewProps) {
	const { colors } = useTheme()

	const filesToRender = createMemo(() => {
		if (props.activeFileId) {
			const file = props.files.find((f) => f.fileId === props.activeFileId)
			return file ? [file] : []
		}
		return props.files
	})

	const rows = createMemo(() => flattenToRows(filesToRender()))

	const lineNumWidth = createMemo(() => {
		const maxLine = getMaxLineNumber(props.files)
		return Math.max(1, getLineNumWidth(maxLine))
	})

	const wrapWidth = createMemo(() => {
		const width = Math.max(1, props.viewportWidth)
		const prefixWidth = lineNumWidth() + 5
		return Math.max(1, width - prefixWidth - RIGHT_PADDING)
	})

	const wrappedRows = createMemo(() =>
		buildWrappedRows(rows(), wrapWidth(), props.wrapEnabled),
	)

	const visibleRange = createMemo(() =>
		getVisibleRange({
			scrollTop: props.scrollTop,
			viewportHeight: props.viewportHeight,
			totalRows: wrappedRows().length,
		}),
	)

	const visibleRows = createMemo(() => {
		const { start, end } = visibleRange()
		return wrappedRows().slice(start, end)
	})

	const fileStats = createMemo(() => {
		const stats = new Map<
			FileId,
			{ additions: number; deletions: number; prevName?: string; type: string }
		>()
		for (const file of filesToRender()) {
			stats.set(file.fileId, {
				additions: file.additions,
				deletions: file.deletions,
				prevName: file.prevName,
				type: file.type,
			})
		}
		return stats
	})

	return (
		<box flexDirection="column">
			<Show when={rows().length === 0}>
				<text fg={colors().textMuted}>No changes</text>
			</Show>
			<Show when={rows().length > 0}>
				<box height={visibleRange().start} flexShrink={0} />
				<For each={visibleRows()}>
					{(row) => (
						<VirtualizedRow
							row={row}
							lineNumWidth={lineNumWidth()}
							currentHunkId={props.currentHunkId}
							fileStats={fileStats()}
							highlighterReady={highlighterReady}
						/>
					)}
				</For>
				<box
					height={wrappedRows().length - visibleRange().end}
					flexShrink={0}
				/>
			</Show>
		</box>
	)
}

interface VirtualizedRowProps {
	row: WrappedRow
	lineNumWidth: number
	currentHunkId?: HunkId | null
	fileStats: Map<
		FileId,
		{ additions: number; deletions: number; prevName?: string; type: string }
	>
	highlighterReady: () => boolean
}

function VirtualizedRow(props: VirtualizedRowProps) {
	const { colors } = useTheme()

	if (props.row.type === "file-header") {
		const stats = props.fileStats.get(props.row.row.fileId)
		return (
			<box backgroundColor={FILE_HEADER_BG} paddingLeft={1} paddingRight={1}>
				<text>
					<span
						style={{
							fg: getFileStatusColor(
								(stats?.type ?? "change") as
									| "change"
									| "rename-pure"
									| "rename-changed"
									| "new"
									| "deleted",
							),
						}}
					>
						{getFileStatusIndicator(
							(stats?.type ?? "change") as
								| "change"
								| "rename-pure"
								| "rename-changed"
								| "new"
								| "deleted",
						)}
					</span>
					<span style={{ fg: colors().text }}> {props.row.row.content}</span>
					<Show when={stats?.prevName}>
						<span style={{ fg: colors().textMuted }}>
							{" ← "}
							{stats?.prevName}
						</span>
					</Show>
					<span style={{ fg: SEPARATOR_COLOR }}> │ </span>
					<Show when={stats && stats.additions > 0}>
						<span style={{ fg: STAT_COLORS.addition }}>
							+{stats?.additions}
						</span>
					</Show>
					<Show when={stats && stats.additions > 0 && stats.deletions > 0}>
						<span> </span>
					</Show>
					<Show when={stats && stats.deletions > 0}>
						<span style={{ fg: STAT_COLORS.deletion }}>
							-{stats?.deletions}
						</span>
					</Show>
				</text>
			</box>
		)
	}

	if (props.row.type === "hunk-header") {
		const isCurrent = props.row.row.hunkId === props.currentHunkId
		return (
			<box backgroundColor={HUNK_HEADER_BG} paddingLeft={1}>
				<text>
					<span
						style={{
							fg: isCurrent ? "#58a6ff" : "#6e7681",
						}}
					>
						{props.row.row.content}
					</span>
				</text>
			</box>
		)
	}

	if (props.row.type !== "content") return null

	const contentRow = props.row
	return (
		<DiffLineRow
			row={contentRow.row}
			lineStart={contentRow.lineStart}
			lineLength={contentRow.lineLength}
			lineNumWidth={props.lineNumWidth}
			highlighterReady={props.highlighterReady}
		/>
	)
}

interface DiffLineRowProps {
	row: DiffRow
	lineStart: number
	lineLength: number
	lineNumWidth: number
	highlighterReady: () => boolean
}

function DiffLineRow(props: DiffLineRowProps) {
	const { colors } = useTheme()

	const language = createMemo(() => getLanguage(props.row.fileName))

	const lineBg = createMemo(() => {
		switch (props.row.type) {
			case "addition":
				return DIFF_BG.addition
			case "deletion":
				return DIFF_BG.deletion
			default:
				return undefined
		}
	})

	// Worker-based tokenization - returns immediately, re-renders when tokens arrive
	const tokens = createMemo((): SyntaxToken[] => {
		// Track tokenVersion to re-render when worker sends new tokens
		tokenVersion()

		// Strip trailing newline - shiki does this internally, but plain text fallback doesn't
		const content = props.row.content.replace(/\n$/, "")
		const defaultColor = colors().text

		// If highlighter not ready, return plain text
		if (!props.highlighterReady()) {
			return [{ content, color: defaultColor }]
		}

		// Request tokenization from worker (returns cached or queues request)
		const result = tokenizeLineSync(content, language())
		return result.map((t) => ({
			content: t.content,
			color: t.color ?? defaultColor,
		}))
	})

	const lineNum = createMemo(() => {
		if (props.lineStart > 0) return " ".repeat(props.lineNumWidth)
		const num =
			props.row.type === "deletion"
				? props.row.oldLineNumber
				: props.row.newLineNumber
		return (num?.toString() ?? "").padStart(props.lineNumWidth, " ")
	})

	const lineNumColor = createMemo(() => {
		switch (props.row.type) {
			case "deletion":
				return LINE_NUM_COLORS.deletion
			case "addition":
				return LINE_NUM_COLORS.addition
			default:
				return LINE_NUM_COLORS.context
		}
	})

	const bar = createMemo(() => {
		switch (props.row.type) {
			case "addition":
				return { char: BAR_CHAR, color: BAR_COLORS.addition }
			case "deletion":
				return { char: BAR_CHAR, color: BAR_COLORS.deletion }
			default:
				return { char: " ", color: undefined }
		}
	})

	return (
		<box flexDirection="row" backgroundColor={lineBg()} flexGrow={1}>
			<text wrapMode="none">
				<span style={{ fg: bar().color }}>{bar().char}</span>
				<span style={{ fg: lineNumColor() }}> {lineNum()} </span>
				<span style={{ fg: SEPARATOR_COLOR }}>│</span>
				<span> </span>
				<For each={sliceTokens(tokens(), props.lineStart, props.lineLength)}>
					{(token) => <span style={{ fg: token.color }}>{token.content}</span>}
				</For>
				<span> </span>
			</text>
		</box>
	)
}

function buildWrappedRows(
	rows: DiffRow[],
	wrapWidth: number,
	wrapEnabled: boolean,
): WrappedRow[] {
	const result: WrappedRow[] = []

	for (const row of rows) {
		if (row.type === "file-header" || row.type === "hunk-header") {
			result.push({ type: row.type, row })
			continue
		}

		const content = row.content.replace(/\n$/, "")
		const contentLength = content.length
		if (!wrapEnabled) {
			result.push({
				type: "content",
				row,
				lineStart: 0,
				lineLength: contentLength,
			})
			continue
		}

		const width = Math.max(1, wrapWidth)
		const totalLines = Math.max(1, Math.ceil(contentLength / width))

		for (let i = 0; i < totalLines; i += 1) {
			const start = i * width
			const lineLength = Math.min(width, Math.max(0, contentLength - start))
			result.push({
				type: "content",
				row,
				lineStart: start,
				lineLength,
			})
		}
	}

	return result
}

function sliceTokens<T extends { content: string }>(
	tokens: T[],
	start: number,
	length: number,
): T[] {
	if (length <= 0) return []
	const end = start + length
	let offset = 0
	const result: T[] = []

	for (const token of tokens) {
		const tokenLength = token.content.length
		const tokenStart = offset
		const tokenEnd = offset + tokenLength
		offset = tokenEnd

		if (tokenEnd <= start) continue
		if (tokenStart >= end) break

		const sliceStart = Math.max(0, start - tokenStart)
		const sliceEnd = Math.min(tokenLength, end - tokenStart)
		if (sliceEnd > sliceStart) {
			result.push({
				...token,
				content: token.content.slice(sliceStart, sliceEnd),
			})
		}
	}

	return result
}
