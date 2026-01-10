declare const self: Worker

import {
	type DiffsHighlighter,
	type SupportedLanguages,
	getSharedHighlighter,
} from "@pierre/diffs"

// Message types
export type WorkerRequest =
	| { type: "init" }
	| {
			type: "tokenize"
			id: number
			content: string
			language: SupportedLanguages
	  }

export type WorkerResponse =
	| { type: "ready" }
	| {
			type: "tokens"
			id: number
			tokens: Array<{ content: string; color?: string }>
	  }
	| { type: "error"; id: number; message: string }

// Languages to load and warm up
const COMMON_LANGS: SupportedLanguages[] = [
	// Web/JS ecosystem
	"typescript",
	"tsx",
	"javascript",
	"jsx",
	"json",
	"html",
	"css",
	// Config/docs
	"markdown",
	"yaml",
	"toml",
	"bash",
	// Systems languages
	"c",
	"cpp",
	"rust",
	"go",
	"zig",
	// JVM/mobile
	"java",
	"kotlin",
	"scala",
	"swift",
	"objective-c",
	// Scripting
	"python",
	"ruby",
	"php",
	"lua",
	"elixir",
	// Functional
	"haskell",
	// Data/infra
	"sql",
	"dockerfile",
	"hcl",
]

// Note: We previously had warmup code that pre-tokenized sample code for each language.
// Testing showed it didn't noticeably improve first-highlight latency, but it did delay
// the "ready" signal, making the first file's highlights appear slower. Removed.

let highlighter: DiffsHighlighter | null = null

async function init() {
	highlighter = await getSharedHighlighter({
		themes: ["ayu-dark"],
		langs: COMMON_LANGS,
	})

	self.postMessage({ type: "ready" } satisfies WorkerResponse)
}

function tokenize(id: number, content: string, language: SupportedLanguages) {
	if (!highlighter) {
		self.postMessage({
			type: "error",
			id,
			message: "Highlighter not initialized",
		} satisfies WorkerResponse)
		return
	}

	try {
		const loadedLangs = highlighter.getLoadedLanguages()
		if (!loadedLangs.includes(language)) {
			// Language not loaded, return plain
			self.postMessage({
				type: "tokens",
				id,
				tokens: [{ content }],
			} satisfies WorkerResponse)
			return
		}

		const result = highlighter.codeToTokens(content, {
			lang: language,
			theme: "ayu-dark",
		})

		const tokens: Array<{ content: string; color?: string }> = []
		for (const line of result.tokens) {
			for (const token of line) {
				tokens.push({
					content: token.content,
					color: token.color,
				})
			}
		}

		self.postMessage({ type: "tokens", id, tokens } satisfies WorkerResponse)
	} catch {
		self.postMessage({
			type: "tokens",
			id,
			tokens: [{ content }],
		} satisfies WorkerResponse)
	}
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const msg = event.data

	switch (msg.type) {
		case "init":
			init()
			break
		case "tokenize":
			tokenize(msg.id, msg.content, msg.language)
			break
	}
}
