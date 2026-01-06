import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import {
	type DiffLine,
	type FileId,
	type FlattenedFile,
	type FlattenedHunk,
	type HunkId,
	type SyntaxToken,
	type WordDiffSegment,
	computeWordDiff,
	getFileStatusColor,
	getFileStatusIndicator,
	getLanguage,
	tokenizeLineSync,
} from "../../diff"

const DIFF_BG = {
	addition: "#132a13",
	deletion: "#2d1515",
	hunkHeader: "#1a1a2e",
	additionEmphasis: "#1a4a1a",
	deletionEmphasis: "#4a1a1a",
} as const

interface UnifiedDiffViewProps {
	files: FlattenedFile[]
	activeFileId?: FileId | null
	currentHunkId?: HunkId | null
}

/**
 * Renders a unified diff view (single column with +/- indicators).
 * File-at-a-time: if activeFileId is set, only renders that file.
 */
export function UnifiedDiffView(props: UnifiedDiffViewProps) {
	const { colors } = useTheme()

	const filesToRender = createMemo(() => {
		if (props.activeFileId) {
			const file = props.files.find((f) => f.fileId === props.activeFileId)
			return file ? [file] : []
		}
		return props.files
	})

	return (
		<box flexDirection="column">
			<For each={filesToRender()}>
				{(file) => (
					<FileSection file={file} currentHunkId={props.currentHunkId} />
				)}
			</For>
			<Show when={props.files.length === 0}>
				<text fg={colors().textMuted}>No changes</text>
			</Show>
		</box>
	)
}

interface FileSectionProps {
	file: FlattenedFile
	currentHunkId?: HunkId | null
}

function FileSection(props: FileSectionProps) {
	const { colors } = useTheme()

	return (
		<box flexDirection="column">
			<box
				backgroundColor={colors().backgroundElement}
				paddingLeft={1}
				paddingRight={1}
			>
				<text wrapMode="none">
					<span style={{ fg: getFileStatusColor(props.file.type) }}>
						{getFileStatusIndicator(props.file.type)}
					</span>{" "}
					<span style={{ fg: colors().text }}>{props.file.name}</span>
					<Show when={props.file.prevName}>
						<span style={{ fg: colors().textMuted }}>
							{" "}
							← {props.file.prevName}
						</span>
					</Show>
					<span style={{ fg: colors().textMuted }}> │ </span>
					<Show when={props.file.additions > 0}>
						<span style={{ fg: colors().success }}>
							+{props.file.additions}
						</span>
					</Show>
					<Show when={props.file.additions > 0 && props.file.deletions > 0}>
						<span style={{ fg: colors().textMuted }}> </span>
					</Show>
					<Show when={props.file.deletions > 0}>
						<span style={{ fg: colors().error }}>-{props.file.deletions}</span>
					</Show>
				</text>
			</box>

			<For each={props.file.hunks}>
				{(hunk) => (
					<HunkSection
						hunk={hunk}
						isCurrent={hunk.hunkId === props.currentHunkId}
						filename={props.file.name}
					/>
				)}
			</For>

			<text> </text>
		</box>
	)
}

interface HunkSectionProps {
	hunk: FlattenedHunk
	isCurrent: boolean
	filename: string
}

interface LineWithWordDiff {
	line: DiffLine
	wordDiff?: WordDiffSegment[]
}

function computeWordDiffsForHunk(lines: DiffLine[]): LineWithWordDiff[] {
	const result: LineWithWordDiff[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i]
		if (!line) {
			i++
			continue
		}

		if (line.type === "deletion") {
			const deletionStart = i
			while (i < lines.length && lines[i]?.type === "deletion") i++
			const additionStart = i
			while (i < lines.length && lines[i]?.type === "addition") i++

			const deletions = lines.slice(deletionStart, additionStart)
			const additions = lines.slice(additionStart, i)

			if (deletions.length === 1 && additions.length === 1) {
				const del = deletions[0]
				const add = additions[0]
				if (del && add) {
					const { old: oldSegs, new: newSegs } = computeWordDiff(
						del.content,
						add.content,
					)
					result.push({ line: del, wordDiff: oldSegs })
					result.push({ line: add, wordDiff: newSegs })
				}
			} else {
				for (const d of deletions) result.push({ line: d })
				for (const a of additions) result.push({ line: a })
			}
		} else {
			result.push({ line })
			i++
		}
	}

	return result
}

function HunkSection(props: HunkSectionProps) {
	const { colors } = useTheme()

	const linesWithWordDiff = createMemo(() =>
		computeWordDiffsForHunk(props.hunk.lines),
	)

	return (
		<box flexDirection="column">
			<box backgroundColor={DIFF_BG.hunkHeader} paddingLeft={1}>
				<text wrapMode="none">
					<span
						style={{
							fg: props.isCurrent ? colors().info : colors().textMuted,
						}}
					>
						{props.hunk.header}
					</span>
				</text>
			</box>

			<For each={linesWithWordDiff()}>
				{(item) => (
					<DiffLineView
						line={item.line}
						filename={props.filename}
						wordDiff={item.wordDiff}
					/>
				)}
			</For>
		</box>
	)
}

interface DiffLineViewProps {
	line: DiffLine
	filename: string
	wordDiff?: WordDiffSegment[]
}

const LINE_NUM_WIDTH = 5

interface TokenWithEmphasis extends SyntaxToken {
	emphasis?: boolean
}

function DiffLineView(props: DiffLineViewProps) {
	const { colors } = useTheme()

	const language = createMemo(() => getLanguage(props.filename))

	const lineBg = createMemo(() => {
		switch (props.line.type) {
			case "addition":
				return DIFF_BG.addition
			case "deletion":
				return DIFF_BG.deletion
			default:
				return undefined
		}
	})

	const emphasisBg = createMemo(() => {
		switch (props.line.type) {
			case "addition":
				return DIFF_BG.additionEmphasis
			case "deletion":
				return DIFF_BG.deletionEmphasis
			default:
				return undefined
		}
	})

	const emphasisType = createMemo(() =>
		props.line.type === "deletion" ? "removed" : "added",
	)

	const tokens = createMemo((): TokenWithEmphasis[] => {
		if (props.line.type === "hunk-header") {
			return [{ content: props.line.content, color: colors().info }]
		}

		if (!props.wordDiff) {
			const result = tokenizeLineSync(props.line.content, language())
			return result.map((t) => ({
				content: t.content,
				color: t.color ?? colors().text,
			}))
		}

		const result: TokenWithEmphasis[] = []
		for (const segment of props.wordDiff) {
			const segmentTokens = tokenizeLineSync(segment.text, language())
			const isEmphasis = segment.type === emphasisType()
			for (const token of segmentTokens) {
				result.push({
					content: token.content,
					color: token.color ?? colors().text,
					emphasis: isEmphasis,
				})
			}
		}
		return result
	})

	const oldLineNum = createMemo(() =>
		(props.line.oldLineNumber?.toString() ?? "").padStart(LINE_NUM_WIDTH, " "),
	)

	const newLineNum = createMemo(() =>
		(props.line.newLineNumber?.toString() ?? "").padStart(LINE_NUM_WIDTH, " "),
	)

	const oldLineNumColor = createMemo(() =>
		props.line.type === "deletion" ? colors().error : colors().textMuted,
	)

	const newLineNumColor = createMemo(() =>
		props.line.type === "addition" ? colors().success : colors().textMuted,
	)

	return (
		<box flexDirection="row" backgroundColor={lineBg()}>
			<text wrapMode="none">
				<span style={{ fg: oldLineNumColor() }}>{oldLineNum()}</span>
				<span style={{ fg: newLineNumColor() }}> {newLineNum()}</span>
				<span style={{ fg: colors().textMuted }}> │ </span>
				<For each={tokens()}>
					{(token) => (
						<span
							style={{
								fg: token.color,
								bg: token.emphasis ? emphasisBg() : undefined,
							}}
						>
							{token.content}
						</span>
					)}
				</For>
			</text>
		</box>
	)
}
