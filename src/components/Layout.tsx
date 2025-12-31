import type { JSX } from "solid-js"
import { colors } from "../theme"
import { StatusBar } from "./StatusBar"

interface LayoutProps {
	top: JSX.Element
	bottom: JSX.Element
	right: JSX.Element
}

export function Layout(props: LayoutProps) {
	return (
		<box
			flexGrow={1}
			flexDirection="column"
			width="100%"
			height="100%"
			backgroundColor={colors.background}
			paddingLeft={1}
			paddingRight={1}
			paddingTop={1}
			paddingBottom={0}
			gap={0}
		>
			<box flexGrow={1} flexDirection="row" width="100%" gap={0}>
				<box
					flexGrow={1}
					flexBasis={0}
					height="100%"
					flexDirection="column"
					gap={0}
				>
					<box flexGrow={3} flexBasis={0}>
						{props.top}
					</box>
					<box flexGrow={1} flexBasis={0}>
						{props.bottom}
					</box>
				</box>
				<box flexGrow={2} flexBasis={0} height="100%">
					{props.right}
				</box>
			</box>
			<StatusBar />
		</box>
	)
}
