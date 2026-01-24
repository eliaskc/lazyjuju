import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import type {
	DiffLine,
	FileId,
	FlattenedFile,
	HunkId,
	SyntaxToken,
	WordDiffSegment,
} from "../../diff"
import {
	computeWordDiff,
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
	empty: "#161b22",
	additionEmphasis: "#1a5a2a",
	deletionEmphasis: "#5a1a1a",
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

const SEPARATOR_COLOR = "#30363d"
const FILE_HEADER_BG = "#1c2128"
const HUNK_HEADER_BG = "#161b22"

const STAT_COLORS = {
	addition: "#3fb950",
	deletion: "#f85149",
}

const BAR_CHAR = "▌"
const EMPTY_STRIPE_CHAR = "╱"
const EMPTY_STRIPE_COLOR = "#2a2a2a"
const RIGHT_PADDING = 3

type SplitRowType = "file-header" | "hunk-header" | "content"

interface SplitRow {
	type: SplitRowType
	fileId: FileId
	hunkId: HunkId | null
	fileName: string
	left: DiffLine | null
	right: DiffLine | null
	leftWordDiff?: WordDiffSegment[]
	rightWordDiff?: WordDiffSegment[]
	hunkHeader?: string
	rowIndex: number
}

function flattenToSplitRows(files: FlattenedFile[]): SplitRow[] {
	const rows: SplitRow[] = []
	let rowIndex = 0

	for (const file of files) {
		rows.push({
			type: "file-header",
			fileId: file.fileId,
			hunkId: null,
			fileName: file.name,
			left: null,
			right: null,
			rowIndex: rowIndex++,
		})

		for (const hunk of file.hunks) {
			rows.push({
				type: "hunk-header",
				fileId: file.fileId,
				hunkId: hunk.hunkId,
				fileName: file.name,
				left: null,
				right: null,
				hunkHeader: hunk.header,
				rowIndex: rowIndex++,
			})

			const alignedRows = buildAlignedRows(hunk.lines)
			for (const aligned of alignedRows) {
				rows.push({
					type: "content",
					fileId: file.fileId,
					hunkId: hunk.hunkId,
					fileName: file.name,
					left: aligned.left,
					right: aligned.right,
					leftWordDiff: aligned.leftWordDiff,
					rightWordDiff: aligned.rightWordDiff,
					rowIndex: rowIndex++,
				})
			}
		}
	}

	return rows
}

interface AlignedRow {
	left: DiffLine | null
	right: DiffLine | null
	leftWordDiff?: WordDiffSegment[]
	rightWordDiff?: WordDiffSegment[]
}

function buildAlignedRows(lines: DiffLine[]): AlignedRow[] {
	const rows: AlignedRow[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i]
		if (!line) {
			i++
			continue
		}

		if (line.type === "context") {
			rows.push({ left: line, right: line })
			i++
		} else if (line.type === "deletion") {
			const deletions: DiffLine[] = []
			while (i < lines.length && lines[i]?.type === "deletion") {
				const del = lines[i]
				if (del) deletions.push(del)
				i++
			}

			const additions: DiffLine[] = []
			while (i < lines.length && lines[i]?.type === "addition") {
				const add = lines[i]
				if (add) additions.push(add)
				i++
			}

			const maxLen = Math.max(deletions.length, additions.length)
			for (let j = 0; j < maxLen; j++) {
				const del = deletions[j]
				const add = additions[j]
				const row: AlignedRow = {
					left: del ?? null,
					right: add ?? null,
				}

				if (del && add) {
					const { old: oldSegs, new: newSegs } = computeWordDiff(
						del.content,
						add.content,
					)
					row.leftWordDiff = oldSegs
					row.rightWordDiff = newSegs
				}

				rows.push(row)
			}
		} else if (line.type === "addition") {
			rows.push({ left: null, right: line })
			i++
		} else {
			i++
		}
	}

	return rows
}

interface VirtualizedSplitViewProps {
	files: FlattenedFile[]
	activeFileId?: FileId | null
	currentHunkId?: HunkId | null
	scrollTop: number
	viewportHeight: number
	viewportWidth: number
	wrapEnabled: boolean
}

type WrappedSplitRow =
	| { type: "file-header" | "hunk-header"; row: SplitRow }
	| {
			type: "content"
			row: SplitRow
			leftStart: number | null
			leftLength: number
			rightStart: number | null
			rightLength: number
	  }

export function VirtualizedSplitView(props: VirtualizedSplitViewProps) {
	const { colors } = useTheme()

	const filesToRender = createMemo(() => {
		if (props.activeFileId) {
			const file = props.files.find((f) => f.fileId === props.activeFileId)
			return file ? [file] : []
		}
		return props.files
	})

	const rows = createMemo(() => flattenToSplitRows(filesToRender()))

	const lineNumWidth = createMemo(() => {
		const maxLine = getMaxLineNumber(props.files)
		return Math.max(1, getLineNumWidth(maxLine))
	})

	const wrapWidth = createMemo(() => {
		const width = Math.max(1, props.viewportWidth)
		const columnWidth = Math.max(1, Math.floor((width - 1) / 2))
		const prefixWidth = lineNumWidth() + 5
		return Math.max(1, columnWidth - prefixWidth - RIGHT_PADDING)
	})

	const columnWidth = createMemo(() => {
		const width = Math.max(1, props.viewportWidth)
		return Math.max(1, Math.floor((width - 1) / 2))
	})

	const wrappedRows = createMemo(() =>
		buildWrappedSplitRows(rows(), wrapWidth(), props.wrapEnabled),
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
						<VirtualizedSplitRow
							row={row}
							lineNumWidth={lineNumWidth()}
							currentHunkId={props.currentHunkId}
							fileStats={fileStats()}
							highlighterReady={highlighterReady}
							columnWidth={columnWidth()}
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

interface VirtualizedSplitRowProps {
	row: WrappedSplitRow
	lineNumWidth: number
	currentHunkId?: HunkId | null
	fileStats: Map<
		FileId,
		{ additions: number; deletions: number; prevName?: string; type: string }
	>
	highlighterReady: () => boolean
	columnWidth: number
}

function VirtualizedSplitRow(props: VirtualizedSplitRowProps) {
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
					<span style={{ fg: colors().text }}> {props.row.row.fileName}</span>
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
					<span style={{ fg: isCurrent ? "#58a6ff" : "#6e7681" }}>
						{props.row.row.hunkHeader}
					</span>
				</text>
			</box>
		)
	}

	if (props.row.type !== "content") return null

	return (
		<SplitContentRow
			row={props.row}
			lineNumWidth={props.lineNumWidth}
			highlighterReady={props.highlighterReady}
			columnWidth={props.columnWidth}
		/>
	)
}

interface SplitContentRowProps {
	row: Extract<WrappedSplitRow, { type: "content" }>
	lineNumWidth: number
	highlighterReady: () => boolean
	columnWidth: number
}

interface TokenWithEmphasis extends SyntaxToken {
	emphasis?: boolean
}

function SplitContentRow(props: SplitContentRowProps) {
	const { colors } = useTheme()

	const language = createMemo(() => getLanguage(props.row.row.fileName))

	const formatLineNum = (num: number | undefined) =>
		(num?.toString() ?? "").padStart(props.lineNumWidth, " ")

	const hasLeftLine = createMemo(
		() => props.row.leftStart !== null && props.row.row.left,
	)
	const hasRightLine = createMemo(
		() => props.row.rightStart !== null && props.row.row.right,
	)

	const leftBg = createMemo(() => {
		if (!hasLeftLine()) return DIFF_BG.empty
		return props.row.row.left?.type === "deletion"
			? DIFF_BG.deletion
			: undefined
	})

	const rightBg = createMemo(() => {
		if (!hasRightLine()) return DIFF_BG.empty
		return props.row.row.right?.type === "addition"
			? DIFF_BG.addition
			: undefined
	})

	const defaultColor = colors().text

	// Tokenize with word diff emphasis
	const tokenizeWithWordDiff = (
		content: string,
		wordDiff: WordDiffSegment[] | undefined,
		emphasisType: "removed" | "added",
	): TokenWithEmphasis[] => {
		const lang = language()

		if (!props.highlighterReady()) {
			if (wordDiff) {
				return wordDiff.map((seg) => ({
					content: seg.text,
					color: defaultColor,
					emphasis: seg.type === emphasisType,
				}))
			}
			return [{ content, color: defaultColor }]
		}

		if (!wordDiff) {
			const tokens = tokenizeLineSync(content, lang)
			return tokens.map((t) => ({
				content: t.content,
				color: t.color ?? defaultColor,
			}))
		}

		// Tokenize each word diff segment
		const result: TokenWithEmphasis[] = []
		for (const segment of wordDiff) {
			const segmentTokens = tokenizeLineSync(segment.text, lang)
			const isEmphasis = segment.type === emphasisType
			for (const token of segmentTokens) {
				result.push({
					content: token.content,
					color: token.color ?? defaultColor,
					emphasis: isEmphasis,
				})
			}
		}
		return result
	}

	const leftTokens = createMemo((): TokenWithEmphasis[] => {
		// Track tokenVersion to re-render when worker sends new tokens
		tokenVersion()

		// Strip trailing newline - shiki does this internally, but plain text fallback doesn't
		const leftContent = (props.row.row.left?.content ?? "").replace(/\n$/, "")
		if (!leftContent) return []
		return tokenizeWithWordDiff(
			leftContent,
			props.row.row.leftWordDiff,
			"removed",
		)
	})

	const rightTokens = createMemo((): TokenWithEmphasis[] => {
		// Track tokenVersion to re-render when worker sends new tokens
		tokenVersion()

		// Strip trailing newline - shiki does this internally, but plain text fallback doesn't
		const rightContent = (props.row.row.right?.content ?? "").replace(/\n$/, "")
		if (!rightContent) return []
		return tokenizeWithWordDiff(
			rightContent,
			props.row.row.rightWordDiff,
			"added",
		)
	})

	const leftLineNumColor = createMemo(() => {
		if (!hasLeftLine()) return LINE_NUM_COLORS.context
		return props.row.row.left?.type === "deletion"
			? LINE_NUM_COLORS.deletion
			: LINE_NUM_COLORS.context
	})

	const rightLineNumColor = createMemo(() => {
		if (!hasRightLine()) return LINE_NUM_COLORS.context
		return props.row.row.right?.type === "addition"
			? LINE_NUM_COLORS.addition
			: LINE_NUM_COLORS.context
	})

	const leftBar = createMemo(() => {
		if (!hasLeftLine()) return null
		if (props.row.row.left?.type === "deletion")
			return { char: BAR_CHAR, color: BAR_COLORS.deletion }
		return { char: " ", color: undefined }
	})

	const rightBar = createMemo(() => {
		if (!hasRightLine()) return null
		if (props.row.row.right?.type === "addition")
			return { char: BAR_CHAR, color: BAR_COLORS.addition }
		return { char: " ", color: undefined }
	})

	const leftLineNum = createMemo(() =>
		props.row.leftStart === 0 ? props.row.row.left?.oldLineNumber : undefined,
	)

	const rightLineNum = createMemo(() =>
		props.row.rightStart === 0 ? props.row.row.right?.newLineNumber : undefined,
	)

	const emptyFill = createMemo(() =>
		EMPTY_STRIPE_CHAR.repeat(props.columnWidth),
	)

	return (
		<box flexDirection="row">
			<box
				backgroundColor={leftBg()}
				flexGrow={1}
				flexBasis={0}
				overflow="hidden"
			>
				<Show
					when={hasLeftLine()}
					fallback={
						<text wrapMode="none">
							<span style={{ fg: EMPTY_STRIPE_COLOR }}>{emptyFill()}</span>
						</text>
					}
				>
					<text wrapMode="none">
						<span style={{ fg: leftBar()?.color }}>{leftBar()?.char}</span>
						<span style={{ fg: leftLineNumColor() }}>
							{" "}
							{formatLineNum(leftLineNum())}{" "}
						</span>
						<span style={{ fg: SEPARATOR_COLOR }}>│</span>
						<span> </span>
						<For
							each={sliceTokens(
								leftTokens(),
								props.row.leftStart ?? 0,
								props.row.leftLength,
							)}
						>
							{(token) => (
								<span
									style={{
										fg: token.color,
										bg: token.emphasis ? DIFF_BG.deletionEmphasis : undefined,
									}}
								>
									{token.content}
								</span>
							)}
						</For>
						<span> </span>
					</text>
				</Show>
			</box>
			<box width={1} />
			<box
				backgroundColor={rightBg()}
				flexGrow={1}
				flexBasis={0}
				overflow="hidden"
			>
				<Show
					when={hasRightLine()}
					fallback={
						<text wrapMode="none">
							<span style={{ fg: EMPTY_STRIPE_COLOR }}>{emptyFill()}</span>
						</text>
					}
				>
					<text wrapMode="none">
						<span style={{ fg: rightBar()?.color }}>{rightBar()?.char}</span>
						<span style={{ fg: rightLineNumColor() }}>
							{" "}
							{formatLineNum(rightLineNum())}{" "}
						</span>
						<span style={{ fg: SEPARATOR_COLOR }}>│</span>
						<span> </span>
						<For
							each={sliceTokens(
								rightTokens(),
								props.row.rightStart ?? 0,
								props.row.rightLength,
							)}
						>
							{(token) => (
								<span
									style={{
										fg: token.color,
										bg: token.emphasis ? DIFF_BG.additionEmphasis : undefined,
									}}
								>
									{token.content}
								</span>
							)}
						</For>
						<span> </span>
					</text>
				</Show>
			</box>
		</box>
	)
}

function buildWrappedSplitRows(
	rows: SplitRow[],
	wrapWidth: number,
	wrapEnabled: boolean,
): WrappedSplitRow[] {
	const result: WrappedSplitRow[] = []
	const width = Math.max(1, wrapWidth)

	for (const row of rows) {
		if (row.type === "file-header" || row.type === "hunk-header") {
			result.push({ type: row.type, row })
			continue
		}

		const leftContent = (row.left?.content ?? "").replace(/\n$/, "")
		const rightContent = (row.right?.content ?? "").replace(/\n$/, "")
		const leftLength = leftContent.length
		const rightLength = rightContent.length

		if (!wrapEnabled) {
			result.push({
				type: "content",
				row,
				leftStart: row.left ? 0 : null,
				leftLength,
				rightStart: row.right ? 0 : null,
				rightLength,
			})
			continue
		}
		const leftLines = row.left ? Math.max(1, Math.ceil(leftLength / width)) : 1
		const rightLines = row.right
			? Math.max(1, Math.ceil(rightLength / width))
			: 1
		const totalLines = Math.max(leftLines, rightLines)

		for (let i = 0; i < totalLines; i += 1) {
			const leftStart = row.left && i < leftLines ? i * width : null
			const leftSegmentLength =
				leftStart === null
					? 0
					: Math.min(width, Math.max(0, leftLength - leftStart))
			const rightStart = row.right && i < rightLines ? i * width : null
			const rightSegmentLength =
				rightStart === null
					? 0
					: Math.min(width, Math.max(0, rightLength - rightStart))

			result.push({
				type: "content",
				row,
				leftStart,
				leftLength: leftSegmentLength,
				rightStart,
				rightLength: rightSegmentLength,
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
