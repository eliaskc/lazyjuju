import { type JSX, createContext, createSignal, useContext } from "solid-js"

const DEBOUNCE_MS = 150

interface LoadingContextValue {
	isLoading: () => boolean
	loadingText: () => string | null
	start: (text: string) => void
	stop: () => void
	run: <T>(text: string, fn: () => Promise<T>) => Promise<T>
}

const LoadingContext = createContext<LoadingContextValue>()

export function LoadingProvider(props: { children: JSX.Element }) {
	const [isLoading, setIsLoading] = createSignal(false)
	const [loadingText, setLoadingText] = createSignal<string | null>(null)
	let debounceTimer: ReturnType<typeof setTimeout> | null = null

	const start = (text: string) => {
		setLoadingText(text)
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			setIsLoading(true)
			debounceTimer = null
		}, DEBOUNCE_MS)
	}

	const stop = () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
		setIsLoading(false)
		setLoadingText(null)
	}

	const run = async <T,>(text: string, fn: () => Promise<T>): Promise<T> => {
		start(text)
		try {
			return await fn()
		} finally {
			stop()
		}
	}

	const value: LoadingContextValue = {
		isLoading,
		loadingText,
		start,
		stop,
		run,
	}

	return (
		<LoadingContext.Provider value={value}>
			{props.children}
		</LoadingContext.Provider>
	)
}

export function useLoading(): LoadingContextValue {
	const ctx = useContext(LoadingContext)
	if (!ctx) {
		throw new Error("useLoading must be used within LoadingProvider")
	}
	return ctx
}
