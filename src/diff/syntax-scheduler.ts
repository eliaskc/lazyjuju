import type { SupportedLanguages } from "@pierre/diffs"
import { batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PROFILE_ENABLED, profileLog } from "../utils/profiler"
import { tokenizeLineSync, type SyntaxToken } from "./syntax"

const DEFAULT_BUDGET_MS = 5
const DEFAULT_CACHE_SIZE = 500
const MAX_LINE_LENGTH = 500

interface TokenJob {
	key: string
	content: string
	language: SupportedLanguages
	generation: number
	priority: "high" | "low"
}

interface SyntaxSchedulerOptions {
	budgetMs?: number
	cacheSize?: number
}

interface SchedulerStats {
	generation: number
	highQueueSize: number
	lowQueueSize: number
	inFlightSize: number
	storeSize: number
	chunksProcessed: number
	tokensProcessed: number
	skippedStale: number
}

export function createSyntaxScheduler(options: SyntaxSchedulerOptions = {}) {
	const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
	const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE

	const [tokenStore, setTokenStore] = createStore<
		Record<string, SyntaxToken[]>
	>({})
	const storeKeys: string[] = []
	let generation = 0
	const [version, setVersion] = createSignal(0)
	const highQueue: TokenJob[] = []
	const lowQueue: TokenJob[] = []
	const inFlight = new Set<string>()
	let isRunning = false
	let scheduledId: ReturnType<typeof setTimeout> | null = null
	let chunksProcessed = 0
	let tokensProcessed = 0
	let skippedStale = 0

	const yieldToLoop = () =>
		new Promise<void>((resolve) => {
			if (typeof globalThis.setImmediate !== "undefined") {
				globalThis.setImmediate(resolve)
			} else {
				setTimeout(resolve, 0)
			}
		})

	const processChunk = async () => {
		const chunkStart = performance.now()
		const currentGen = generation
		const results: Array<{ key: string; tokens: SyntaxToken[] }> = []

		while (performance.now() - chunkStart < budgetMs) {
			const job = highQueue.shift() ?? lowQueue.shift()
			if (!job) break

			if (job.generation !== currentGen) {
				inFlight.delete(job.key)
				skippedStale++
				continue
			}

			if (tokenStore[job.key]) {
				inFlight.delete(job.key)
				continue
			}

			if (job.content.length > MAX_LINE_LENGTH) {
				const plainTokens: SyntaxToken[] = [{ content: job.content }]
				results.push({ key: job.key, tokens: plainTokens })
				inFlight.delete(job.key)
				continue
			}

			const tokens = tokenizeLineSync(job.content, job.language)
			results.push({ key: job.key, tokens })
			inFlight.delete(job.key)
			tokensProcessed++
		}

		if (results.length > 0) {
			const prevVersion = version()
			batch(() => {
				for (const { key, tokens } of results) {
					if (generation !== currentGen) continue

					if (storeKeys.length >= cacheSize && !tokenStore[key]) {
						const oldest = storeKeys.shift()
						if (oldest) {
							setTokenStore(oldest, undefined as unknown as SyntaxToken[])
						}
					}

					setTokenStore(key, tokens)
					if (!storeKeys.includes(key)) {
						storeKeys.push(key)
					}
				}
				setVersion((v) => v + 1)
			})
			console.log(
				`[Scheduler] batch done: ${results.length} tokens, version ${prevVersion} -> ${version()}`,
			)
			chunksProcessed++
		}

		if (highQueue.length > 0 || lowQueue.length > 0) {
			await yieldToLoop()
			if (generation === currentGen) {
				await processChunk()
			}
		} else {
			isRunning = false
			if (PROFILE_ENABLED) {
				profileLog("syntax-scheduler-done", {
					generation: currentGen,
					chunksProcessed,
					tokensProcessed,
					skippedStale,
				})
			}
		}
	}

	const scheduleProcessing = () => {
		if (isRunning) return
		isRunning = true

		if (scheduledId !== null) {
			clearTimeout(scheduledId)
		}

		scheduledId = setTimeout(() => {
			scheduledId = null
			processChunk()
		}, 0)
	}

	return {
		/**
		 * Bump generation to cancel in-flight work.
		 * Call when viewport changes significantly.
		 */
		bumpGeneration() {
			generation++
			highQueue.length = 0
			lowQueue.length = 0
			inFlight.clear()

			if (PROFILE_ENABLED) {
				profileLog("syntax-scheduler-bump", { generation })
			}
		},

		/**
		 * Clear the entire store. Call on commit change.
		 */
		clearStore() {
			generation++
			highQueue.length = 0
			lowQueue.length = 0
			inFlight.clear()
			storeKeys.length = 0
			setTokenStore(reconcile({}))
			chunksProcessed = 0
			tokensProcessed = 0
			skippedStale = 0
		},

		/**
		 * Request tokenization for lines. Results available via getTokens().
		 * @param priority "high" for visible rows, "low" for prefetch
		 */
		prefetch(
			items: Array<{
				key: string
				content: string
				language: SupportedLanguages
			}>,
			priority: "high" | "low" = "high",
		) {
			const currentGen = generation
			const queue = priority === "high" ? highQueue : lowQueue

			for (const item of items) {
				if (tokenStore[item.key] || inFlight.has(item.key)) continue

				inFlight.add(item.key)
				queue.push({
					key: item.key,
					content: item.content,
					language: item.language,
					generation: currentGen,
					priority,
				})
			}

			if (queue.length > 0) {
				scheduleProcessing()
			}
		},

		get store() {
			return tokenStore
		},

		/**
		 * Reactive signal that increments when tokens are added.
		 * Use in createMemo to force re-evaluation when store updates.
		 */
		version,

		getTokens(key: string): SyntaxToken[] | undefined {
			return tokenStore[key]
		},

		makeKey(content: string, language: SupportedLanguages): string {
			return `${language}\0${content}`
		},

		getStats(): SchedulerStats {
			return {
				generation,
				highQueueSize: highQueue.length,
				lowQueueSize: lowQueue.length,
				inFlightSize: inFlight.size,
				storeSize: storeKeys.length,
				chunksProcessed,
				tokensProcessed,
				skippedStale,
			}
		},
	}
}

export type SyntaxScheduler = ReturnType<typeof createSyntaxScheduler>
