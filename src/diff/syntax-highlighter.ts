/**
 * Unified syntax highlighting abstraction
 *
 * Supports multiple backends:
 * - tree-sitter: Native C parser, fastest (~10x faster)
 * - shiki: JS-based, more accurate highlighting
 *
 * Automatically falls back to shiki if tree-sitter is unavailable.
 */

import type { SupportedLanguages } from "@pierre/diffs"
import { tracer } from "../utils/tracer"
import type { SyntaxToken } from "./syntax"

export type HighlighterBackend = "tree-sitter" | "shiki" | "none"

export interface HighlighterConfig {
	preferredBackend: HighlighterBackend
	fallbackEnabled: boolean
	maxLineLength: number
}

export interface HighlighterStats {
	backend: HighlighterBackend
	ready: boolean
	tokensProcessed: number
	avgTokenizeMs: number
	totalTokenizeMs: number
	cacheHits: number
	cacheMisses: number
}

const DEFAULT_CONFIG: HighlighterConfig = {
	preferredBackend: "tree-sitter",
	fallbackEnabled: true,
	maxLineLength: 1000,
}

let config: HighlighterConfig = { ...DEFAULT_CONFIG }
let currentBackend: HighlighterBackend = "none"
let initPromise: Promise<void> | null = null

// Stats tracking
let stats = {
	tokensProcessed: 0,
	totalTokenizeMs: 0,
	cacheHits: 0,
	cacheMisses: 0,
}

// Simple LRU cache for tokenized lines
const TOKEN_CACHE_SIZE = 2000
const tokenCache = new Map<string, SyntaxToken[]>()
const cacheOrder: string[] = []

function getCacheKey(content: string, language: string): string {
	return `${language}:${content}`
}

function getFromCache(key: string): SyntaxToken[] | undefined {
	const tokens = tokenCache.get(key)
	if (tokens) {
		stats.cacheHits++
		// Move to end (most recently used)
		const idx = cacheOrder.indexOf(key)
		if (idx > -1) {
			cacheOrder.splice(idx, 1)
			cacheOrder.push(key)
		}
		return tokens
	}
	stats.cacheMisses++
	return undefined
}

function setInCache(key: string, tokens: SyntaxToken[]): void {
	if (tokenCache.has(key)) {
		tokenCache.set(key, tokens)
		return
	}

	// Evict oldest if at capacity
	while (cacheOrder.length >= TOKEN_CACHE_SIZE) {
		const oldest = cacheOrder.shift()
		if (oldest) tokenCache.delete(oldest)
	}

	tokenCache.set(key, tokens)
	cacheOrder.push(key)
}

// Backend-specific modules (lazy loaded)
let treeSitterModule: typeof import("./tree-sitter-highlighter") | null = null
let shikiModule: {
	getSharedHighlighter: (options: {
		themes: string[]
		langs: SupportedLanguages[]
	}) => Promise<{
		codeToTokens: (
			code: string,
			options: { lang: SupportedLanguages; theme: string },
		) => { tokens: Array<Array<{ content: string; color?: string }>> }
		getLoadedLanguages: () => string[]
	}>
} | null = null

async function loadTreeSitter(): Promise<boolean> {
	try {
		treeSitterModule = await import("./tree-sitter-highlighter")
		const success = await treeSitterModule.initTreeSitter()
		return success
	} catch {
		treeSitterModule = null
		return false
	}
}

async function loadShiki(): Promise<boolean> {
	try {
		shikiModule = await import("@pierre/diffs")
		return true
	} catch {
		shikiModule = null
		return false
	}
}

export async function initHighlighter(
	overrideConfig?: Partial<HighlighterConfig>,
): Promise<HighlighterBackend> {
	if (initPromise) {
		await initPromise
		return currentBackend
	}

	if (overrideConfig) {
		config = { ...config, ...overrideConfig }
	}

	initPromise = (async () => {
		const trace = tracer.startTrace("highlighter-init")

		// Try preferred backend first
		if (config.preferredBackend === "tree-sitter") {
			const tsSpan = trace.startSpan("try-tree-sitter")
			const tsSuccess = await loadTreeSitter()
			tsSpan.addMetadata({ success: tsSuccess })
			tsSpan.end()

			if (tsSuccess) {
				currentBackend = "tree-sitter"
				trace.addMetadata({ backend: "tree-sitter" })
				trace.end()
				return
			}

			// Fallback to shiki
			if (config.fallbackEnabled) {
				const shikiSpan = trace.startSpan("fallback-shiki")
				const shikiSuccess = await loadShiki()
				shikiSpan.addMetadata({ success: shikiSuccess })
				shikiSpan.end()

				if (shikiSuccess) {
					currentBackend = "shiki"
				}
			}
		} else if (config.preferredBackend === "shiki") {
			const shikiSpan = trace.startSpan("try-shiki")
			const shikiSuccess = await loadShiki()
			shikiSpan.addMetadata({ success: shikiSuccess })
			shikiSpan.end()

			if (shikiSuccess) {
				currentBackend = "shiki"
				trace.addMetadata({ backend: "shiki" })
				trace.end()
				return
			}

			// Fallback to tree-sitter
			if (config.fallbackEnabled) {
				const tsSpan = trace.startSpan("fallback-tree-sitter")
				const tsSuccess = await loadTreeSitter()
				tsSpan.addMetadata({ success: tsSuccess })
				tsSpan.end()

				if (tsSuccess) {
					currentBackend = "tree-sitter"
				}
			}
		}

		trace.addMetadata({ backend: currentBackend })
		trace.end()
	})()

	await initPromise
	return currentBackend
}

export function getHighlighterBackend(): HighlighterBackend {
	return currentBackend
}

export function isHighlighterReady(): boolean {
	return currentBackend !== "none"
}

export async function tokenize(
	content: string,
	language: string,
): Promise<SyntaxToken[]> {
	// Skip long lines
	if (content.length > config.maxLineLength) {
		return [{ content }]
	}

	// Check cache
	const cacheKey = getCacheKey(content, language)
	const cached = getFromCache(cacheKey)
	if (cached) {
		return cached
	}

	const start = performance.now()
	let tokens: SyntaxToken[]

	try {
		if (currentBackend === "tree-sitter" && treeSitterModule) {
			tokens = await treeSitterModule.tokenizeWithTreeSitter(content, language)
		} else if (currentBackend === "shiki" && shikiModule) {
			// Use shiki
			const highlighter = await shikiModule.getSharedHighlighter({
				themes: ["ayu-dark"],
				langs: [language as SupportedLanguages],
			})
			const result = highlighter.codeToTokens(content, {
				lang: language as SupportedLanguages,
				theme: "ayu-dark",
			})
			tokens = result.tokens.flat().map((t) => ({
				content: t.content,
				color: t.color,
			}))
		} else {
			tokens = [{ content }]
		}
	} catch {
		tokens = [{ content }]
	}

	const elapsed = performance.now() - start
	stats.tokensProcessed++
	stats.totalTokenizeMs += elapsed

	// Cache result
	setInCache(cacheKey, tokens)

	return tokens
}

export function tokenizeSync(
	content: string,
	language: string,
): SyntaxToken[] {
	// Skip long lines
	if (content.length > config.maxLineLength) {
		return [{ content }]
	}

	// Check cache
	const cacheKey = getCacheKey(content, language)
	const cached = getFromCache(cacheKey)
	if (cached) {
		return cached
	}

	const start = performance.now()
	let tokens: SyntaxToken[]

	try {
		if (currentBackend === "tree-sitter" && treeSitterModule) {
			tokens = treeSitterModule.tokenizeWithTreeSitterSync(content, language)
		} else {
			// Shiki doesn't have sync API, return plain
			tokens = [{ content }]
		}
	} catch {
		tokens = [{ content }]
	}

	const elapsed = performance.now() - start
	stats.tokensProcessed++
	stats.totalTokenizeMs += elapsed

	// Cache result
	setInCache(cacheKey, tokens)

	return tokens
}

export function getHighlighterStats(): HighlighterStats {
	return {
		backend: currentBackend,
		ready: currentBackend !== "none",
		tokensProcessed: stats.tokensProcessed,
		avgTokenizeMs:
			stats.tokensProcessed > 0
				? stats.totalTokenizeMs / stats.tokensProcessed
				: 0,
		totalTokenizeMs: stats.totalTokenizeMs,
		cacheHits: stats.cacheHits,
		cacheMisses: stats.cacheMisses,
	}
}

export function clearHighlighterCache(): void {
	tokenCache.clear()
	cacheOrder.length = 0
}

export function resetHighlighterStats(): void {
	stats = {
		tokensProcessed: 0,
		totalTokenizeMs: 0,
		cacheHits: 0,
		cacheMisses: 0,
	}
}

export function configureHighlighter(
	newConfig: Partial<HighlighterConfig>,
): void {
	config = { ...config, ...newConfig }
}
