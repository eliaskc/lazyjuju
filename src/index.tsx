import { render, useKeyboard, useRenderer } from "@opentui/solid"

function App() {
	const renderer = useRenderer()

	useKeyboard((evt) => {
		if (evt.name === "q") {
			renderer.destroy()
			process.exit(0)
		}
	})

	return (
		<box alignItems="center" justifyContent="center" flexGrow={1}>
			<ascii_font font="tiny" text="lazierjj" />
		</box>
	)
}

render(() => <App />)
