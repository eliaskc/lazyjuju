// Identifiers (stable IDs)
export {
	fileId,
	findFileById,
	findHunkById,
	getHunkIds,
	hunkId,
	lineAnchorKey,
	type FileId,
	type HunkId,
	type LineAnchor,
} from "./identifiers"

// Parser and utilities
export {
	fetchParsedDiff,
	flattenDiff,
	flattenFile,
	flattenHunk,
	formatHunkHeader,
	getDiffTotals,
	getFileStatusColor,
	getFileStatusIndicator,
	getLineNumWidth,
	getMaxLineNumber,
	parseDiffString,
	type DiffLine,
	type DiffLineType,
	type FlattenedFile,
	type FlattenedHunk,
	type ParseDiffOptions,
} from "./parser"

// Re-export @pierre/diffs types
export type {
	ChangeContent,
	ContextContent,
	FileDiffMetadata,
	Hunk,
	ParsedPatch,
} from "./parser"

// State types
export {
	createDiffState,
	type DiffActions,
	type DiffAnnotation,
	type DiffMode,
	type DiffState,
	type DiffViewStyle,
	type HunkSelection,
} from "./types"

// Word-level diff utilities
export {
	computeChangePairDiff,
	computeWordDiff,
	shouldComputeWordDiff,
	type WordDiffSegment,
} from "./word-diff"

// Syntax highlighting
export {
	getLanguage,
	initHighlighter,
	isHighlighterReady,
	tokenizeLine,
	tokenizeLineSync,
	type SyntaxToken,
} from "./syntax"

export type { SupportedLanguages } from "@pierre/diffs"

// Syntax cache
export {
	clearSyntaxCache,
	getSyntaxCacheSize,
	getSyntaxStats,
	resetSyntaxStats,
	tokenizeWithCache,
} from "./syntax-cache"

export {
	createSyntaxScheduler,
	getGlobalTokenizeStats,
	resetGlobalTokenizeStats,
	type SchedulerStats,
	type SyntaxBackend,
	type SyntaxScheduler,
	type SyntaxSchedulerOptions,
} from "./syntax-scheduler"

// Tree-sitter highlighter (native, fast)
export {
	getLoadedLanguages as getTreeSitterLanguages,
	getTreeSitterStats,
	initTreeSitter,
	isTreeSitterReady,
	tokenizeWithTreeSitter,
	tokenizeWithTreeSitterSync,
	type TreeSitterLanguage,
} from "./tree-sitter-highlighter"

// Unified highlighter API
export {
	clearHighlighterCache,
	configureHighlighter,
	getHighlighterBackend,
	getHighlighterStats,
	initHighlighter as initUnifiedHighlighter,
	isHighlighterReady as isUnifiedHighlighterReady,
	resetHighlighterStats,
	tokenize as tokenizeUnified,
	tokenizeSync as tokenizeSyncUnified,
	type HighlighterBackend,
	type HighlighterConfig,
	type HighlighterStats,
} from "./syntax-highlighter"

// Virtualization
export {
	findRowIndexByFileId,
	findRowIndexByHunkId,
	flattenToRows,
	getVisibleRange,
	type DiffRow,
	type DiffRowType,
	type ViewportState,
} from "./virtualization"
