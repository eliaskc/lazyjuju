import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import {
	For,
	Show,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js"
import { useDialog } from "../../context/dialog"
import { useTheme } from "../../context/theme"
import { getRepoPath } from "../../repo"
import { createDoubleClickDetector } from "../../utils/double-click"
import type { RecentRepo } from "../../utils/state"
import { formatRelativeTime, getRecentRepos } from "../../utils/state"
import { BorderBox } from "../BorderBox"

interface RecentReposModalProps {
	onSelect: (path: string) => void
}

export function RecentReposModal(props: RecentReposModalProps) {
	const { colors, style } = useTheme()
	const dialog = useDialog()
	const currentPath = getRepoPath()
	const repos = getRecentRepos().filter((r) => r.path !== currentPath)

	const [selectedIndex, setSelectedIndex] = createSignal(0)

	let scrollRef: ScrollBoxRenderable | undefined
	const [scrollTop, setScrollTop] = createSignal(0)

	const scrollToIndex = (index: number) => {
		if (!scrollRef || repos.length === 0) return

		const margin = 1
		const refAny = scrollRef as unknown as Record<string, unknown>
		const viewportHeight =
			(typeof refAny.height === "number" ? refAny.height : null) ??
			(typeof refAny.rows === "number" ? refAny.rows : null) ??
			8
		const currentScrollTop = scrollTop()

		const visibleStart = currentScrollTop
		const visibleEnd = currentScrollTop + viewportHeight - 1
		const safeStart = visibleStart + margin
		const safeEnd = visibleEnd - margin

		let newScrollTop = currentScrollTop
		if (index < safeStart) {
			newScrollTop = Math.max(0, index - margin)
		} else if (index > safeEnd) {
			newScrollTop = Math.max(0, index - viewportHeight + margin + 1)
		}

		if (newScrollTop !== currentScrollTop) {
			scrollRef.scrollTo(newScrollTop)
			setScrollTop(newScrollTop)
		}
	}

	createEffect(() => {
		scrollToIndex(selectedIndex())
	})

	// Trigger re-render of timestamps every 30 seconds
	const [timestampTick, setTimestampTick] = createSignal(0)
	onMount(() => {
		const interval = setInterval(() => setTimestampTick((t) => t + 1), 30000)
		onCleanup(() => clearInterval(interval))
	})

	const getTimestamp = (isoDate: string) => {
		timestampTick()
		return formatRelativeTime(isoDate)
	}

	const selectRepo = (path: string) => {
		dialog.close()
		props.onSelect(path)
	}

	useKeyboard((evt) => {
		if (evt.name === "j" || evt.name === "down") {
			evt.preventDefault()
			setSelectedIndex((i) => Math.min(repos.length - 1, i + 1))
		} else if (evt.name === "k" || evt.name === "up") {
			evt.preventDefault()
			setSelectedIndex((i) => Math.max(0, i - 1))
		} else if (evt.name === "return" || evt.name === "enter") {
			evt.preventDefault()
			const repo = repos[selectedIndex()]
			if (repo) selectRepo(repo.path)
		} else if (evt.name && /^[1-9]$/.test(evt.name)) {
			evt.preventDefault()
			const index = Number.parseInt(evt.name, 10) - 1
			const repo = repos[index]
			if (repo) selectRepo(repo.path)
		}
	})

	return (
		<BorderBox
			border
			borderStyle={style().panel.borderStyle}
			borderColor={colors().borderFocused}
			backgroundColor={colors().background}
			width={70}
			height={Math.min(repos.length + 4, 14)}
			topLeft={<text fg={colors().borderFocused}>Recent repositories</text>}
		>
			<Show
				when={repos.length > 0}
				fallback={
					<box padding={1}>
						<text fg={colors().textMuted}>No recent repositories</text>
					</box>
				}
			>
				<scrollbox
					ref={scrollRef}
					flexGrow={1}
					paddingLeft={1}
					paddingRight={1}
					scrollbarOptions={{ visible: false }}
				>
					<For each={repos}>
						{(repo, index) => {
							const isSelected = () => index() === selectedIndex()
							const num = index() + 1
							const displayPath = repo.path.replace(
								new RegExp(`^${process.env.HOME}`),
								"~",
							)
							const handleDoubleClick = createDoubleClickDetector(() =>
								selectRepo(repo.path),
							)
							return (
								<box
									flexDirection="row"
									backgroundColor={
										isSelected() ? colors().selectionBackground : undefined
									}
									onMouseDown={() => {
										setSelectedIndex(index())
										handleDoubleClick()
									}}
								>
									<text wrapMode="none">
										<span
											style={{
												fg: isSelected()
													? colors().primary
													: colors().textMuted,
											}}
										>
											{num}.{" "}
										</span>
										<span
											style={{
												fg: isSelected() ? colors().text : colors().textMuted,
											}}
										>
											{displayPath}
										</span>
									</text>
									<box flexGrow={1} />
									<text fg={colors().textMuted}>
										{getTimestamp(repo.lastOpened)}
									</text>
								</box>
							)
						}}
					</For>
				</scrollbox>
			</Show>
		</BorderBox>
	)
}
