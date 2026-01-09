/**
 * Syntax highlighting scheduler with multi-backend support
 *
 * Supports:
 * - tree-sitter: Native C parser (~10x faster)
 * - shiki: JS-based, via web worker (original implementation)
 *
 * Features:
 * - Request batching and deduplication
 * - Generation tracking for stale request invalidation
 * - LRU cache with configurable size
 * - Performance tracing
 */

import type { SupportedLanguages } from "@pierre/diffs"
import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { tracer } from "../utils/tracer"
import type { SyntaxToken } from "./syntax"

export type SyntaxBackend = "tree-sitter" | "shiki" | "auto"

const DEFAULT_CACHE_SIZE = 1000
const MAX_LINE_LENGTH = 500
const BATCH_DELAY_MS = 5 // Batch requests within this window

interface TokenizeRequest {
	type: "tokenize"
	id: string
	key: string
	content: string
	language: string
}

interface BatchTokenizeRequest {
	type: "batch"
	items: Array<{
		id: string
		key: string
		content: string
		language: string
	}>
}

interface TokenizeResponse {
	type: "tokens"
	id: string
	key: string
	tokens: SyntaxToken[]
	durationMs?: number
}

interface BatchTokenizeResponse {
	type: "batch-complete"
	results: Array<{
		id: string
		key: string
		tokens: SyntaxToken[]
		durationMs: number
	}>
	totalDurationMs: number
}

interface ReadyResponse {
	type: "ready"
	backend?: string
	loadedLanguages?: string[]
}

interface ErrorResponse {
	type: "error"
	id?: string
	error: string
}

type WorkerResponse =
	| TokenizeResponse
	| BatchTokenizeResponse
	| ReadyResponse
	| ErrorResponse

interface PendingRequest {
	key: string
	generation: number
	startTime: number
	resolve: (tokens: SyntaxToken[]) => void
}

export interface SyntaxSchedulerOptions {
	cacheSize?: number
	backend?: SyntaxBackend
	enableTracing?: boolean
	batchingEnabled?: boolean
}

export interface SchedulerStats {
	backend: string
	generation: number
	pendingCount: number
	storeSize: number
	tokensProcessed: number
	workerReady: boolean
	avgTokenizeMs: number
	totalTokenizeMs: number
}

// Shared state across all schedulers
let sharedWorker: Worker | null = null
let workerReady = false
let workerBackend: string = "unknown"
let workerReadyPromise: Promise<void> | null = null
const pendingRequests = new Map<string, PendingRequest>()
let requestIdCounter = 0
const schedulerCallbacks = new Set<(response: WorkerResponse) => void>()
const queuedPrefetches: Array<() => void> = []

// Performance tracking
let totalTokenizeMs = 0
let tokenizeCount = 0

// Request batching
let batchTimeout: ReturnType<typeof setTimeout> | null = null
let batchQueue: Array<{
	id: string
	key: string
	content: string
	language: string
}> = []

function getWorker(backend: SyntaxBackend): Worker {
	if (sharedWorker) return sharedWorker

	// Determine which worker to use
	const workerPath =
		backend === "tree-sitter" || backend === "auto"
			? "./syntax-worker-treesitter.ts"
			: "./syntax-worker.ts"

	sharedWorker = new Worker(new URL(workerPath, import.meta.url).href, {
		type: "module",
	})

	sharedWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
		const response = e.data

		if (response.type === "ready") {
			workerReady = true
			workerBackend =
				"backend" in response ? (response.backend ?? "shiki") : "shiki"

			// Flush queued prefetches
			for (const fn of queuedPrefetches) {
				fn()
			}
			queuedPrefetches.length = 0
			return
		}

		if (response.type === "error") {
			console.error(`[SyntaxWorker:${workerBackend}] Error:`, response.error)

			// If tree-sitter failed, could fall back to shiki worker
			// For now, just log the error
			return
		}

		// Dispatch to all registered callbacks
		for (const callback of schedulerCallbacks) {
			callback(response)
		}
	}

	sharedWorker.onerror = (e) => {
		console.error("[SyntaxWorker] Worker error:", e)
	}

	return sharedWorker
}

function initWorker(backend: SyntaxBackend): Promise<void> {
	if (workerReady) return Promise.resolve()
	if (workerReadyPromise) return workerReadyPromise

	const worker = getWorker(backend)

	workerReadyPromise = new Promise((resolve) => {
		const checkReady = () => {
			if (workerReady) {
				resolve()
			} else {
				setTimeout(checkReady, 10)
			}
		}

		worker.postMessage({ type: "init" })
		checkReady()
	})

	return workerReadyPromise
}

function flushBatch(): void {
	if (batchQueue.length === 0) return

	const worker = sharedWorker
	if (!worker) return

	const items = batchQueue
	batchQueue = []
	batchTimeout = null

	const request: BatchTokenizeRequest = {
		type: "batch",
		items,
	}

	worker.postMessage(request)
}

function queueBatchRequest(item: {
	id: string
	key: string
	content: string
	language: string
}): void {
	batchQueue.push(item)

	if (!batchTimeout) {
		batchTimeout = setTimeout(flushBatch, BATCH_DELAY_MS)
	}
}

export function createSyntaxScheduler(options: SyntaxSchedulerOptions = {}) {
	const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE
	const backend = options.backend ?? "auto"
	const enableTracing = options.enableTracing ?? tracer.isEnabled()
	const batchingEnabled = options.batchingEnabled ?? true

	// Initialize worker
	initWorker(backend)

	const [tokenStore, setTokenStore] = createStore<
		Record<string, SyntaxToken[]>
	>({})
	const storeKeys: string[] = []
	let generation = 0
	const [version, setVersion] = createSignal(0)
	const inFlight = new Set<string>()
	let tokensProcessed = 0
	let schedulerTokenizeMs = 0

	const handleResponse = (response: WorkerResponse) => {
		// Handle single token response
		if (response.type === "tokens") {
			const pending = pendingRequests.get(response.id)
			if (!pending) return

			pendingRequests.delete(response.id)
			inFlight.delete(pending.key)

			// Track timing
			const elapsed = response.durationMs ?? performance.now() - pending.startTime
			totalTokenizeMs += elapsed
			schedulerTokenizeMs += elapsed
			tokenizeCount++

			if (pending.generation !== generation) {
				return // Stale request
			}

			batch(() => {
				// Evict oldest if at capacity
				if (storeKeys.length >= cacheSize && !tokenStore[pending.key]) {
					const oldest = storeKeys.shift()
					if (oldest) {
						setTokenStore(oldest, undefined as unknown as SyntaxToken[])
					}
				}

				setTokenStore(pending.key, response.tokens)
				if (!storeKeys.includes(pending.key)) {
					storeKeys.push(pending.key)
				}
				setVersion((v) => v + 1)
			})

			tokensProcessed++
		}

		// Handle batch response
		if (response.type === "batch-complete") {
			const trace = enableTracing
				? tracer.startTrace("batch-response")
				: null

			batch(() => {
				for (const result of response.results) {
					const pending = pendingRequests.get(result.id)
					if (!pending) continue

					pendingRequests.delete(result.id)
					inFlight.delete(pending.key)

					totalTokenizeMs += result.durationMs
					schedulerTokenizeMs += result.durationMs
					tokenizeCount++

					if (pending.generation !== generation) {
						continue // Stale
					}

					// Evict oldest if at capacity
					if (storeKeys.length >= cacheSize && !tokenStore[pending.key]) {
						const oldest = storeKeys.shift()
						if (oldest) {
							setTokenStore(oldest, undefined as unknown as SyntaxToken[])
						}
					}

					setTokenStore(pending.key, result.tokens)
					if (!storeKeys.includes(pending.key)) {
						storeKeys.push(pending.key)
					}

					tokensProcessed++
				}

				setVersion((v) => v + 1)
			})

			if (trace) {
				trace.addMetadata({
					itemCount: response.results.length,
					totalDurationMs: response.totalDurationMs,
				})
				trace.end()
			}
		}
	}

	schedulerCallbacks.add(handleResponse)

	return {
		/**
		 * Bump the generation to invalidate all pending requests
		 */
		bumpGeneration() {
			generation++
			inFlight.clear()

			if (enableTracing) {
				tracer.time("syntax-scheduler-bump", () => {}, { generation })
			}
		},

		/**
		 * Clear all cached tokens
		 */
		clearStore() {
			generation++
			inFlight.clear()
			storeKeys.length = 0
			setTokenStore(reconcile({}))
			tokensProcessed = 0
			schedulerTokenizeMs = 0
		},

		/**
		 * Prefetch tokens for a list of items
		 */
		prefetch(
			items: Array<{
				key: string
				content: string
				language: SupportedLanguages | string
			}>,
			priority: "high" | "low" = "high",
		) {
			const doPrefetch = () => {
				const trace = enableTracing
					? tracer.startTrace("syntax-prefetch")
					: null

				const currentGen = generation
				let queued = 0
				let skipped = 0
				let longLines = 0

				for (const item of items) {
					// Skip if already cached or in flight
					if (tokenStore[item.key] || inFlight.has(item.key)) {
						skipped++
						continue
					}

					// Skip long lines - store plain text instead
					if (item.content.length > MAX_LINE_LENGTH) {
						longLines++
						batch(() => {
							setTokenStore(item.key, [{ content: item.content }])
							if (!storeKeys.includes(item.key)) {
								storeKeys.push(item.key)
							}
							setVersion((v) => v + 1)
						})
						continue
					}

					inFlight.add(item.key)
					const id = `req_${requestIdCounter++}`

					pendingRequests.set(id, {
						key: item.key,
						generation: currentGen,
						startTime: performance.now(),
						resolve: () => {},
					})

					if (batchingEnabled) {
						queueBatchRequest({
							id,
							key: item.key,
							content: item.content,
							language: item.language,
						})
					} else {
						const worker = getWorker(backend)
						const request: TokenizeRequest = {
							type: "tokenize",
							id,
							key: item.key,
							content: item.content,
							language: item.language,
						}
						worker.postMessage(request)
					}

					queued++
				}

				if (trace) {
					trace.addMetadata({
						total: items.length,
						queued,
						skipped,
						longLines,
						priority,
					})
					trace.end()
				}
			}

			if (workerReady) {
				doPrefetch()
			} else {
				queuedPrefetches.push(doPrefetch)
			}
		},

		/**
		 * Get the token store (reactive)
		 */
		get store() {
			return tokenStore
		},

		/**
		 * Version signal for reactivity
		 */
		version,

		/**
		 * Get tokens for a specific key
		 */
		getTokens(key: string): SyntaxToken[] | undefined {
			return tokenStore[key]
		},

		/**
		 * Create a cache key from content and language
		 */
		makeKey(content: string, language: string): string {
			return `${language}\0${content}`
		},

		/**
		 * Get scheduler statistics
		 */
		getStats(): SchedulerStats {
			return {
				backend: workerBackend,
				generation,
				pendingCount: pendingRequests.size,
				storeSize: storeKeys.length,
				tokensProcessed,
				workerReady,
				avgTokenizeMs:
					tokenizeCount > 0 ? schedulerTokenizeMs / tokenizeCount : 0,
				totalTokenizeMs: schedulerTokenizeMs,
			}
		},

		/**
		 * Check if the worker is ready
		 */
		isReady(): boolean {
			return workerReady
		},

		/**
		 * Get the active backend name
		 */
		getBackend(): string {
			return workerBackend
		},

		/**
		 * Cleanup when scheduler is no longer needed
		 */
		dispose() {
			schedulerCallbacks.delete(handleResponse)
		},
	}
}

export type SyntaxScheduler = ReturnType<typeof createSyntaxScheduler>

/**
 * Get global tokenization stats
 */
export function getGlobalTokenizeStats(): {
	totalMs: number
	count: number
	avgMs: number
} {
	return {
		totalMs: totalTokenizeMs,
		count: tokenizeCount,
		avgMs: tokenizeCount > 0 ? totalTokenizeMs / tokenizeCount : 0,
	}
}

/**
 * Reset global stats
 */
export function resetGlobalTokenizeStats(): void {
	totalTokenizeMs = 0
	tokenizeCount = 0
}
