import type { KeybindInfo } from "./types"

export function parse(key: string): KeybindInfo[] {
	if (key === "none") return []

	return key.split(",").map((combo) => {
		const parts = combo.toLowerCase().split("+")
		const info: KeybindInfo = {
			ctrl: false,
			meta: false,
			shift: false,
			name: "",
		}

		for (const part of parts) {
			switch (part) {
				case "ctrl":
					info.ctrl = true
					break
				case "alt":
				case "meta":
				case "option":
					info.meta = true
					break
				case "shift":
					info.shift = true
					break
				case "esc":
					info.name = "escape"
					break
				default:
					info.name = part
					break
			}
		}

		return info
	})
}

export function match(a: KeybindInfo, b: KeybindInfo): boolean {
	return (
		a.name === b.name &&
		a.ctrl === b.ctrl &&
		a.meta === b.meta &&
		a.shift === b.shift
	)
}

export function keybindToString(info: KeybindInfo): string {
	const parts: string[] = []

	if (info.ctrl) parts.push("ctrl")
	if (info.meta) parts.push("alt")
	if (info.shift) parts.push("shift")
	if (info.name) {
		if (info.name === "delete") parts.push("del")
		else if (info.name === "escape") parts.push("esc")
		else parts.push(info.name)
	}

	return parts.join("+")
}

export function fromParsedKey(evt: {
	name?: string
	ctrl?: boolean
	meta?: boolean
	shift?: boolean
}): KeybindInfo {
	let name = evt.name ?? ""
	if (name === "return") name = "enter"

	return {
		name,
		ctrl: evt.ctrl ?? false,
		meta: evt.meta ?? false,
		shift: evt.shift ?? false,
	}
}
