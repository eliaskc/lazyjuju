import { type InputRenderable, RGBA } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { Show, createSignal, onMount } from "solid-js"
import { useDialog } from "../../context/dialog"
import { useTheme } from "../../context/theme"

interface BookmarkNameModalProps {
	title: string
	initialValue?: string
	placeholder?: string
	onSave: (name: string) => void
}

export function BookmarkNameModal(props: BookmarkNameModalProps) {
	const dialog = useDialog()
	const { colors, style } = useTheme()

	const [name, setName] = createSignal(props.initialValue ?? "")
	const [error, setError] = createSignal<string | null>(null)

	let inputRef: InputRenderable | undefined

	const focusInputAtEnd = (ref: InputRenderable | undefined) => {
		if (!ref) return
		ref.focus()
		ref.cursorPosition = ref.value.length
	}

	onMount(() => {
		setTimeout(() => focusInputAtEnd(inputRef), 1)
	})

	const handleSave = () => {
		const trimmed = name().trim()
		if (!trimmed) {
			setError("Name cannot be empty")
			return
		}
		if (/\s/.test(trimmed)) {
			setError("Name cannot contain spaces")
			return
		}
		dialog.close()
		props.onSave(trimmed)
	}

	useKeyboard((evt) => {
		if (evt.name === "escape") {
			evt.preventDefault()
			dialog.close()
		}
	})

	return (
		<box flexDirection="column" width="50%" gap={0}>
			<box
				flexDirection="column"
				border
				borderStyle={style().panel.borderStyle}
				borderColor={colors().borderFocused}
				backgroundColor={colors().background}
				height={3}
				padding={0}
				title={props.title}
			>
				<input
					ref={inputRef}
					value={props.initialValue ?? ""}
					placeholder={props.placeholder}
					onInput={(value) => {
						setName(value)
						setError(null)
					}}
					onSubmit={handleSave}
					cursorColor={colors().primary}
					textColor={colors().text}
					focusedTextColor={colors().text}
					focusedBackgroundColor={RGBA.fromInts(0, 0, 0, 0)}
					flexGrow={1}
				/>
			</box>
			<Show when={error()}>
				<box paddingLeft={1}>
					<text fg={colors().error}>{error()}</text>
				</box>
			</Show>
		</box>
	)
}
