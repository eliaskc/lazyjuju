import { type ScrollBoxRenderable, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import type { Commit } from "../../commander/types"
import { useCommand } from "../../context/command"
import { useFocus } from "../../context/focus"
import { useSync } from "../../context/sync"
import { colors } from "../../theme"

const syntaxStyle = SyntaxStyle.fromStyles({
	keyword: { fg: colors.purple } as never,
	"keyword.import": { fg: colors.purple } as never,
	string: { fg: colors.success } as never,
	comment: { fg: colors.textMuted } as never,
	number: { fg: colors.orange } as never,
	boolean: { fg: colors.orange } as never,
	constant: { fg: colors.orange } as never,
	function: { fg: colors.primary } as never,
	"function.call": { fg: colors.primary } as never,
	constructor: { fg: colors.warning } as never,
	type: { fg: colors.warning } as never,
	operator: { fg: colors.info } as never,
	variable: { fg: colors.text } as never,
	property: { fg: colors.info } as never,
	bracket: { fg: colors.text } as never,
	punctuation: { fg: colors.text } as never,
	default: { fg: colors.text } as never,
})

interface FileDiff {
	filename: string
	content: string
	filetype: string
}

const EXTENSION_TO_FILETYPE: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	py: "python",
	rs: "rust",
	go: "go",
	md: "markdown",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	css: "css",
	html: "html",
}

function parseFileDiffs(diffText: string): FileDiff[] {
	if (!diffText) return []

	const fileDiffs: FileDiff[] = []
	const sections = diffText.split(/(?=diff --git )/)

	for (const section of sections) {
		if (!section.trim()) continue

		const match = section.match(/^diff --git a\/(.+?) b\//)
		if (!match?.[1]) continue

		const filename = match[1]
		const ext = filename.split(".").pop() ?? ""

		fileDiffs.push({
			filename,
			content: section,
			filetype: EXTENSION_TO_FILETYPE[ext] ?? "text",
		})
	}

	return fileDiffs
}

function CommitHeader(props: { commit: Commit }) {
	return (
		<box flexDirection="column" flexShrink={0} marginBottom={1}>
			<text>
				{"Change: "}
				<span style={{ fg: colors.primary }}>{props.commit.changeId}</span>
			</text>
			<text>
				{"Commit: "}
				<span style={{ fg: colors.primary }}>{props.commit.commitId}</span>
			</text>
			<text>
				{"Author: "}
				<span style={{ fg: colors.warning }}>{props.commit.author}</span>
				{` <${props.commit.authorEmail}>`}
			</text>
			<text>
				{"Date:   "}
				<span style={{ fg: colors.success }}>{props.commit.timestamp}</span>
			</text>
			<text> </text>
			<text fg={colors.text}>
				{"    "}
				{props.commit.description}
			</text>
		</box>
	)
}

function FileDiffSection(props: {
	fileDiff: FileDiff
	view: "unified" | "split"
}) {
	return (
		<box
			flexDirection="column"
			backgroundColor={colors.backgroundSecondary}
			marginBottom={1}
		>
			<box paddingLeft={1} paddingTop={1} paddingBottom={1}>
				<text fg={colors.text}>{props.fileDiff.filename}</text>
			</box>
			<diff
				diff={props.fileDiff.content}
				view={props.view}
				filetype={props.fileDiff.filetype}
				syntaxStyle={syntaxStyle}
				showLineNumbers
				wrapMode="wrap"
				addedContentBg="#20303b"
				removedContentBg="#37222c"
				contextContentBg={colors.backgroundSecondary}
				lineNumberFg={colors.textMuted}
				lineNumberBg={colors.backgroundSecondary}
				addedLineNumberBg="#1b2b34"
				removedLineNumberBg="#2d1f26"
				addedSignColor={colors.success}
				removedSignColor={colors.error}
				width="100%"
			/>
		</box>
	)
}

export function MainArea() {
	const { selectedCommit, diff, diffLoading, diffError, terminalWidth } =
		useSync()
	const focus = useFocus()
	const command = useCommand()

	let scrollRef: ScrollBoxRenderable | undefined

	const isFocused = () => focus.is("diff")

	const fileDiffs = createMemo(() => parseFileDiffs(diff() ?? ""))

	const diffView = createMemo<"unified" | "split">(() =>
		terminalWidth() > 150 ? "split" : "unified",
	)

	command.register(() => [
		{
			id: "diff.page_up",
			title: "Page up",
			keybind: "nav_page_up",
			context: "diff",
			category: "Navigation",
			onSelect: () => scrollRef?.scrollBy(-0.5, "viewport"),
		},
		{
			id: "diff.page_down",
			title: "Page down",
			keybind: "nav_page_down",
			context: "diff",
			category: "Navigation",
			onSelect: () => scrollRef?.scrollBy(0.5, "viewport"),
		},
	])

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			height="100%"
			border
			borderColor={isFocused() ? colors.borderFocused : colors.border}
			title="[3]─Diff"
			paddingTop={0}
			paddingBottom={0}
			paddingLeft={0}
			paddingRight={0}
			overflow="hidden"
			gap={0}
		>
			<Show when={diffLoading()}>
				<text>Loading diff...</text>
			</Show>
			<Show when={diffError()}>
				<text>Error: {diffError()}</text>
			</Show>
			<Show when={!diffLoading() && !diffError()}>
				<scrollbox ref={scrollRef} focused={isFocused()} flexGrow={1}>
					<Show when={selectedCommit()} keyed>
						{(commit: Commit) => <CommitHeader commit={commit} />}
					</Show>
					<Show when={fileDiffs().length > 0}>
						<For each={fileDiffs()}>
							{(fileDiff) => (
								<FileDiffSection fileDiff={fileDiff} view={diffView()} />
							)}
						</For>
					</Show>
					<Show when={fileDiffs().length === 0 && diff()}>
						<diff
							diff={diff() ?? ""}
							view={diffView()}
							syntaxStyle={syntaxStyle}
							showLineNumbers
							wrapMode="wrap"
							addedContentBg="#20303b"
							removedContentBg="#37222c"
							contextContentBg={colors.backgroundSecondary}
							lineNumberFg={colors.textMuted}
							lineNumberBg={colors.backgroundSecondary}
							addedLineNumberBg="#1b2b34"
							removedLineNumberBg="#2d1f26"
							addedSignColor={colors.success}
							removedSignColor={colors.error}
							width="100%"
						/>
					</Show>
					<Show when={!diff()}>
						<text>No changes in this commit.</text>
					</Show>
				</scrollbox>
			</Show>
		</box>
	)
}
