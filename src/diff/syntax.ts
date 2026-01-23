import { type SupportedLanguages, getFiletypeFromFileName } from "@pierre/diffs"
import { createSignal } from "solid-js"
import type { WorkerRequest, WorkerResponse } from "./syntax-worker"

export interface SyntaxToken {
	content: string
	color?: string
}

// Global reactive signal for highlighter readiness
const [highlighterReady, setHighlighterReady] = createSignal(false)
export { highlighterReady }

// Signal to trigger re-renders when new tokens arrive from worker
// Increment this to invalidate memos that depend on it
const [tokenVersion, setTokenVersion] = createSignal(0)
export { tokenVersion }

// Batched version updates - multiple worker responses within a frame only trigger one re-render
let pendingVersionBump = false
function bumpTokenVersion() {
	if (!pendingVersionBump) {
		pendingVersionBump = true
		// Use queueMicrotask to batch all token arrivals within the same event loop tick
		queueMicrotask(() => {
			setTokenVersion((v) => v + 1)
			pendingVersionBump = false
		})
	}
}

// Token cache: Map<"content:language", tokens>
const tokenCache = new Map<string, SyntaxToken[]>()

// Pending tokenization requests to avoid duplicates
const pendingRequests = new Set<string>()

// Request ID counter
let requestId = 0

// Worker instance
let worker: Worker | null = null

// Map request IDs to cache keys for when responses come back
const requestToCacheKey = new Map<number, string>()

function getCacheKey(content: string, language: SupportedLanguages): string {
	return `${language}:${content}`
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
	const msg = event.data

	switch (msg.type) {
		case "ready":
			setHighlighterReady(true)
			break

		case "tokens": {
			const cacheKey = requestToCacheKey.get(msg.id)
			if (cacheKey) {
				tokenCache.set(cacheKey, msg.tokens)
				requestToCacheKey.delete(msg.id)
				pendingRequests.delete(cacheKey)
				// Trigger re-render by incrementing version (batched)
				bumpTokenVersion()
			}
			break
		}

		case "error": {
			const cacheKey = requestToCacheKey.get(msg.id)
			if (cacheKey) {
				requestToCacheKey.delete(msg.id)
				pendingRequests.delete(cacheKey)
			}
			break
		}
	}
}

export function initHighlighter(): void {
	if (worker) return

	// Create worker using Bun's worker support
	try {
		const isBundled = import.meta.url.includes("/$bunfs/")
		const workerPaths = isBundled
			? [
					"./diff/syntax-worker.js",
					"./src/diff/syntax-worker.js",
					"./syntax-worker.js",
				]
			: ["./syntax-worker.ts"]
		let workerSpec: string | null = null
		for (const workerPath of workerPaths) {
			try {
				workerSpec =
					import.meta.resolve?.(workerPath) ??
					new URL(workerPath, import.meta.url).href
				break
			} catch {}
		}
		if (!workerSpec) {
			throw new Error("Unable to resolve syntax worker path")
		}
		worker = new Worker(workerSpec, {
			type: "module",
		})
	} catch (error) {
		return
	}

	worker.onmessage = handleWorkerMessage
	worker.onerror = (err) => {
		console.error("Syntax worker error:", err)
	}

	// Tell worker to initialize
	worker.postMessage({ type: "init" } satisfies WorkerRequest)
}

export function getLanguage(filename: string): SupportedLanguages {
	return getFiletypeFromFileName(filename)
}

/**
 * Request tokenization from worker.
 * Returns immediately - tokens will arrive async and trigger re-render via tokenVersion signal.
 */
function requestTokenization(
	content: string,
	language: SupportedLanguages,
	cacheKey: string,
): void {
	if (!worker || pendingRequests.has(cacheKey)) return

	pendingRequests.add(cacheKey)
	const id = requestId++
	requestToCacheKey.set(id, cacheKey)

	worker.postMessage({
		type: "tokenize",
		id,
		content,
		language,
	} satisfies WorkerRequest)
}

/**
 * Get tokens for a line synchronously.
 * Returns cached tokens if available, otherwise returns plain text and queues tokenization.
 * Components should depend on tokenVersion() to re-render when new tokens arrive.
 */
export function tokenizeLineSync(
	content: string,
	language: SupportedLanguages,
): SyntaxToken[] {
	const cacheKey = getCacheKey(content, language)

	// Check cache first
	const cached = tokenCache.get(cacheKey)
	if (cached) {
		return cached
	}

	// If highlighter ready, request tokenization from worker
	if (highlighterReady()) {
		requestTokenization(content, language, cacheKey)
	}

	// Return plain text for now
	return [{ content }]
}

/**
 * Async version - waits for tokenization to complete.
 * Prefer tokenizeLineSync for rendering.
 */
export async function tokenizeLine(
	content: string,
	language: SupportedLanguages,
): Promise<SyntaxToken[]> {
	const cacheKey = getCacheKey(content, language)

	// Check cache first
	const cached = tokenCache.get(cacheKey)
	if (cached) {
		return cached
	}

	// Wait for highlighter to be ready
	if (!highlighterReady()) {
		return [{ content }]
	}

	// Request and wait for result
	return new Promise((resolve) => {
		const id = requestId++
		requestToCacheKey.set(id, cacheKey)
		pendingRequests.add(cacheKey)

		// Set up one-time listener for this specific request
		const handler = (event: MessageEvent<WorkerResponse>) => {
			const msg = event.data
			if (msg.type === "tokens" && msg.id === id) {
				tokenCache.set(cacheKey, msg.tokens)
				requestToCacheKey.delete(id)
				pendingRequests.delete(cacheKey)
				resolve(msg.tokens)
			} else if (msg.type === "error" && msg.id === id) {
				requestToCacheKey.delete(id)
				pendingRequests.delete(cacheKey)
				resolve([{ content }])
			}
		}

		if (!worker) {
			resolve([{ content }])
			return
		}
		const w = worker

		// Temporarily add listener
		const originalHandler = w.onmessage
		w.onmessage = (event) => {
			originalHandler?.call(w, event)
			handler(event)
		}

		w.postMessage({
			type: "tokenize",
			id,
			content,
			language,
		} satisfies WorkerRequest)
	})
}

export function isHighlighterReady(): boolean {
	return highlighterReady()
}

/**
 * Clear the token cache (useful when changing themes)
 */
export function clearTokenCache(): void {
	tokenCache.clear()
	setTokenVersion((v) => v + 1)
}

/**
 * Pre-tokenize all lines in the given files.
 * Call this when files are loaded to warm the cache before the user scrolls.
 * This dispatches all unique lines to the worker in the background.
 */
export function pretokenizeFiles(
	files: Array<{
		name: string
		hunks: Array<{ lines: Array<{ content: string }> }>
	}>,
): void {
	if (!worker || !highlighterReady()) return

	// Collect all unique content+language pairs
	const toTokenize: Array<{ content: string; language: SupportedLanguages }> =
		[]

	for (const file of files) {
		const language = getLanguage(file.name)
		for (const hunk of file.hunks) {
			for (const line of hunk.lines) {
				// Strip trailing newline like tokenizeLineSync does
				const content = line.content.replace(/\n$/, "")
				if (!content) continue

				const cacheKey = getCacheKey(content, language)
				// Skip if already cached or pending
				if (tokenCache.has(cacheKey) || pendingRequests.has(cacheKey)) continue

				toTokenize.push({ content, language })
			}
		}
	}

	// Dispatch all tokenization requests
	for (const { content, language } of toTokenize) {
		const cacheKey = getCacheKey(content, language)
		requestTokenization(content, language, cacheKey)
	}
}
