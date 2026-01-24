import { useDialog } from "../context/dialog"
import { FooterHints } from "./FooterHints"

export function DialogHints() {
	const dialog = useDialog()

	const hints = () => {
		const base = dialog.hints()
		if (base.length === 0) return []
		return base
	}

	return <FooterHints hints={hints()} />
}
