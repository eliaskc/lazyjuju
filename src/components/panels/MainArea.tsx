import type { ScrollBoxRenderable } from "@opentui/core"
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js"
import type { Commit } from "../../commander/types"
import { useCommand } from "../../context/command"
import { useFocus } from "../../context/focus"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import { AnsiText } from "../AnsiText"
import { Panel } from "../Panel"

const INITIAL_LIMIT = 1000
const LIMIT_INCREMENT = 200
const LOAD_THRESHOLD = 200

function CommitHeader(props: { commit: Commit }) {
	const { colors } = useTheme()

	return (
		<box flexDirection="column" flexShrink={0}>
			<text>
				{"Change: "}
				<span style={{ fg: colors().primary }}>{props.commit.changeId}</span>
			</text>
			<text>
				{"Commit: "}
				<span style={{ fg: colors().primary }}>{props.commit.commitId}</span>
			</text>
			<text>
				{"Author: "}
				<span style={{ fg: colors().warning }}>{props.commit.author}</span>
				{` <${props.commit.authorEmail}>`}
			</text>
			<text>
				{"Date:   "}
				<span style={{ fg: colors().success }}>{props.commit.timestamp}</span>
			</text>
			<text> </text>
			<AnsiText content={`    ${props.commit.description}`} wrapMode="none" />
			<text> </text>
		</box>
	)
}

export function MainArea() {
	const {
		selectedCommit,
		diff,
		diffLoading,
		diffError,
		diffLineCount,
		mainAreaWidth,
	} = useSync()
	const { colors } = useTheme()
	const focus = useFocus()
	const command = useCommand()

	let scrollRef: ScrollBoxRenderable | undefined

	const [scrollTop, setScrollTop] = createSignal(0)
	const [limit, setLimit] = createSignal(INITIAL_LIMIT)
	const [currentCommitId, setCurrentCommitId] = createSignal<string | null>(
		null,
	)

	createEffect(() => {
		const commit = selectedCommit()
		if (commit && commit.changeId !== currentCommitId()) {
			setCurrentCommitId(commit.changeId)
			setScrollTop(0)
			setLimit(INITIAL_LIMIT)
			scrollRef?.scrollTo(0)
		}
	})

	const loadMoreIfNeeded = () => {
		if (!scrollRef) return
		const viewportHeight = scrollRef.viewport?.height ?? 30
		const scrollHeight = scrollRef.scrollHeight ?? 0
		const currentScroll = scrollRef.scrollTop ?? 0

		const distanceFromBottom = scrollHeight - (currentScroll + viewportHeight)
		if (distanceFromBottom < LOAD_THRESHOLD && limit() < diffLineCount()) {
			setLimit((l) => Math.min(l + LIMIT_INCREMENT, diffLineCount()))
		}
	}

	onMount(() => {
		const pollInterval = setInterval(() => {
			if (scrollRef) {
				const currentScroll = scrollRef.scrollTop ?? 0
				if (currentScroll !== scrollTop()) {
					setScrollTop(currentScroll)
					loadMoreIfNeeded()
				}
			}
		}, 100)
		onCleanup(() => clearInterval(pollInterval))
	})

	const isFocused = () => focus.isPanel("detail")

	command.register(() => [
		{
			id: "detail.page_up",
			title: "Page up",
			keybind: "nav_page_up",
			context: "detail",
			type: "navigation",
			onSelect: () => scrollRef?.scrollBy(-0.5, "viewport"),
		},
		{
			id: "detail.page_down",
			title: "Page down",
			keybind: "nav_page_down",
			context: "detail",
			type: "navigation",
			onSelect: () => {
				scrollRef?.scrollBy(0.5, "viewport")
				loadMoreIfNeeded()
			},
		},
		{
			id: "detail.scroll_down",
			title: "Scroll down",
			keybind: "nav_down",
			context: "detail",
			type: "navigation",
			hidden: true,
			onSelect: () => {
				scrollRef?.scrollTo((scrollTop() || 0) + 1)
				setScrollTop((scrollTop() || 0) + 1)
				loadMoreIfNeeded()
			},
		},
		{
			id: "detail.scroll_up",
			title: "Scroll up",
			keybind: "nav_up",
			context: "detail",
			type: "navigation",
			hidden: true,
			onSelect: () => {
				const newPos = Math.max(0, (scrollTop() || 0) - 1)
				scrollRef?.scrollTo(newPos)
				setScrollTop(newPos)
			},
		},
	])

	return (
		<Panel title="Detail" hotkey="3" focused={isFocused()}>
			<Show when={diffLoading() && !diff()}>
				<text>Loading diff...</text>
			</Show>
			<Show when={diffError()}>
				<text>Error: {diffError()}</text>
			</Show>
			<Show when={diff() || (!diffLoading() && !diffError())}>
				<scrollbox
					ref={scrollRef}
					focused={isFocused()}
					flexGrow={1}
					scrollbarOptions={{
						trackOptions: {
							backgroundColor: colors().scrollbarTrack,
							foregroundColor: colors().scrollbarThumb,
						},
					}}
				>
					<Show when={selectedCommit()}>
						<CommitHeader commit={selectedCommit()!} />
					</Show>
					<Show when={diff()}>
						<ghostty-terminal
							ansi={diff() ?? ""}
							cols={mainAreaWidth()}
							limit={limit()}
						/>
					</Show>
					<Show when={!diff()}>
						<text>No changes in this commit.</text>
					</Show>
				</scrollbox>
			</Show>
		</Panel>
	)
}
