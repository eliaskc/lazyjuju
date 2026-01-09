/**
 * Web Worker for tree-sitter based syntax highlighting
 *
 * This worker uses native tree-sitter bindings for ~10x faster
 * tokenization compared to the shiki-based worker.
 */

declare const self: Worker

import {
	getLoadedLanguages,
	initTreeSitter,
	isTreeSitterReady,
	tokenizeWithTreeSitterSync,
} from "./tree-sitter-highlighter"

interface TokenizeRequest {
	type: "tokenize"
	id: string
	key: string
	content: string
	language: string
}

interface InitRequest {
	type: "init"
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

type WorkerRequest = TokenizeRequest | InitRequest | BatchTokenizeRequest

interface SyntaxToken {
	content: string
	color?: string
}

interface TokenizeResponse {
	type: "tokens"
	id: string
	key: string
	tokens: SyntaxToken[]
	durationMs: number
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
	backend: "tree-sitter"
	loadedLanguages: string[]
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

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const request = e.data

	if (request.type === "init") {
		try {
			const success = await initTreeSitter()
			if (success) {
				const response: ReadyResponse = {
					type: "ready",
					backend: "tree-sitter",
					loadedLanguages: getLoadedLanguages(),
				}
				self.postMessage(response)
			} else {
				const response: ErrorResponse = {
					type: "error",
					error: "Tree-sitter initialization failed - grammars may not be installed",
				}
				self.postMessage(response)
			}
		} catch (err) {
			const response: ErrorResponse = {
				type: "error",
				error: err instanceof Error ? err.message : "Failed to initialize tree-sitter",
			}
			self.postMessage(response)
		}
		return
	}

	if (request.type === "tokenize") {
		const start = performance.now()

		if (!isTreeSitterReady()) {
			// Fall back to plain text
			const response: TokenizeResponse = {
				type: "tokens",
				id: request.id,
				key: request.key,
				tokens: [{ content: request.content }],
				durationMs: performance.now() - start,
			}
			self.postMessage(response)
			return
		}

		const tokens = tokenizeWithTreeSitterSync(request.content, request.language)
		const durationMs = performance.now() - start

		const response: TokenizeResponse = {
			type: "tokens",
			id: request.id,
			key: request.key,
			tokens,
			durationMs,
		}
		self.postMessage(response)
		return
	}

	if (request.type === "batch") {
		const batchStart = performance.now()

		const results = request.items.map((item) => {
			const start = performance.now()

			if (!isTreeSitterReady()) {
				return {
					id: item.id,
					key: item.key,
					tokens: [{ content: item.content }] as SyntaxToken[],
					durationMs: performance.now() - start,
				}
			}

			const tokens = tokenizeWithTreeSitterSync(item.content, item.language)
			return {
				id: item.id,
				key: item.key,
				tokens,
				durationMs: performance.now() - start,
			}
		})

		const response: BatchTokenizeResponse = {
			type: "batch-complete",
			results,
			totalDurationMs: performance.now() - batchStart,
		}
		self.postMessage(response)
	}
}
