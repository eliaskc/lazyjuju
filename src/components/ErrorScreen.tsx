import { useKeyboard } from "@opentui/solid"
import { For, Show, createSignal } from "solid-js"
import { useTheme } from "../context/theme"
import { type ParsedJjError, parseJjError } from "../utils/error-parser"
import { BorderBox } from "./BorderBox"
import { FooterHints } from "./FooterHints"
import { WaveBackground } from "./WaveBackground"

export interface ErrorScreenProps {
	error: string
	onRetry: () => void | Promise<void>
	onFix?: () => Promise<void>
	onQuit: () => void
}

export function ErrorScreen(props: ErrorScreenProps) {
	const { colors, style } = useTheme()
	const [isFixing, setIsFixing] = createSignal(false)
	const [isRetrying, setIsRetrying] = createSignal(false)
	const [attempts, setAttempts] = createSignal(1)

	const isLoading = () => isFixing() || isRetrying()

	const parsedError = (): ParsedJjError => parseJjError(props.error)

	const canFix = () => parsedError().fixCommand !== null && props.onFix

	type Action = "fix" | "retry"
	const [selectedAction, setSelectedAction] = createSignal<Action>(
		canFix() ? "fix" : "retry",
	)

	const handleFix = async () => {
		if (!props.onFix) return
		setIsFixing(true)
		try {
			await props.onFix()
			setAttempts((n) => n + 1)
		} finally {
			setIsFixing(false)
		}
	}

	const handleRetry = async () => {
		setIsRetrying(true)
		try {
			await Promise.resolve(props.onRetry())
			setAttempts((n) => n + 1)
		} finally {
			setIsRetrying(false)
		}
	}

	useKeyboard((evt) => {
		if (isLoading()) return

		if (evt.name === "q") {
			evt.preventDefault()
			evt.stopPropagation()
			props.onQuit()
		} else if (evt.name === "r") {
			evt.preventDefault()
			evt.stopPropagation()
			handleRetry()
		} else if (evt.name === "f" && canFix()) {
			evt.preventDefault()
			evt.stopPropagation()
			handleFix()
		} else if (evt.name === "j" || evt.name === "down") {
			evt.preventDefault()
			evt.stopPropagation()
			if (canFix()) {
				setSelectedAction((a) => (a === "fix" ? "retry" : "fix"))
			}
		} else if (evt.name === "k" || evt.name === "up") {
			evt.preventDefault()
			evt.stopPropagation()
			if (canFix()) {
				setSelectedAction((a) => (a === "fix" ? "retry" : "fix"))
			}
		} else if (evt.name === "return" || evt.name === "enter") {
			evt.preventDefault()
			evt.stopPropagation()
			if (selectedAction() === "fix" && canFix()) {
				handleFix()
			} else {
				handleRetry()
			}
		}
	})

	return (
		<box flexGrow={1} width="100%" height="100%">
			<WaveBackground peakColor={colors().error} peakOpacity={0.7} />
			<Show when={true}>
				<box
					position="absolute"
					left={0}
					top={0}
					width="100%"
					height="100%"
					flexGrow={1}
					flexDirection="column"
					justifyContent="center"
					alignItems="center"
				>
					{/* Error modal */}
					<box flexDirection="column" alignItems="center" gap={1}>
						<BorderBox
							border
							borderStyle={style().panel.borderStyle}
							borderColor={colors().error}
							backgroundColor={colors().background}
							width={70}
							topLeft={<text fg={colors().error}>Error</text>}
						>
							<box flexDirection="column" padding={1}>
								{/* Error title with attempt counter */}
								<text fg={colors().error}>
									{attempts() > 1
										? `${parsedError().title} [${attempts()}]`
										: parsedError().title}
								</text>
								<box height={1} />

								{/* Hints */}
								<Show when={parsedError().hints.length > 0}>
									<For each={parsedError().hints}>
										{(hint) => (
											<text fg={colors().warning} wrapMode="word">
												{hint}
											</text>
										)}
									</For>
									<box height={1} />
								</Show>

								{/* URLs */}
								<Show when={parsedError().urls.length > 0}>
									<text fg={colors().textMuted}>More info:</text>
									<For each={parsedError().urls}>
										{(url) => (
											<text fg={colors().primary} wrapMode="none">
												{url}
											</text>
										)}
									</For>
									<box height={1} />
								</Show>

								{/* Actions */}
								<Show when={canFix()}>
									<box
										backgroundColor={
											selectedAction() === "fix" && !isLoading()
												? colors().selectionBackground
												: undefined
										}
									>
										<text
											fg={
												isLoading()
													? colors().textMuted
													: selectedAction() === "fix"
														? colors().primary
														: colors().textMuted
											}
										>
											{isFixing() ? "Running..." : parsedError().fixCommand}
										</text>
									</box>
								</Show>

								<box
									backgroundColor={
										selectedAction() === "retry" && !isLoading()
											? colors().selectionBackground
											: undefined
									}
								>
									<text
										fg={
											isLoading()
												? colors().textMuted
												: selectedAction() === "retry"
													? colors().primary
													: colors().textMuted
										}
									>
										{isRetrying() ? "Retrying..." : "retry"}
									</text>
								</box>
							</box>
						</BorderBox>
						<FooterHints
							hints={[
								{ key: "enter", label: "run" },
								{ key: "q", label: "quit" },
							]}
							boxed
						/>
					</box>
				</box>
			</Show>
		</box>
	)
}
