export interface CommentLineRange {
	oldStart: number
	oldCount: number
	newStart: number
	newCount: number
}

export interface CommentEntry {
	id: string
	text: string
	author: string
	type: string
	createdAt: string
	replyTo?: string | null
}

export interface CommentAnchorHunk {
	id: string
	type: "hunk"
	filePath: string
	lineRange: CommentLineRange
	contextLines: string[]
	comments: CommentEntry[]
	stale?: boolean
}

export interface CommentAnchorLine {
	id: string
	type: "line"
	filePath: string
	lineNumber: number
	side?: "new" | "old"
	contextLines: string[]
	comments: CommentEntry[]
	stale?: boolean
}

export type CommentAnchor = CommentAnchorHunk | CommentAnchorLine

export interface RevisionCommentsV2 {
	commitHash: string
	anchors: CommentAnchor[]
}

export interface CommentsStateV2 {
	version: 2
	revisions: Record<string, RevisionCommentsV2>
}

export interface CommentAnchorV1 {
	filePath: string
	lineRange: CommentLineRange
	contextLines: string[]
}

export interface HunkCommentsV1 {
	anchor: CommentAnchorV1
	comments: CommentEntry[]
	stale?: boolean
}

export interface RevisionCommentsV1 {
	commitHash: string
	hunks: Record<string, HunkCommentsV1>
}

export interface CommentsStateV1 {
	version: 1
	revisions: Record<string, RevisionCommentsV1>
}

export type CommentsState = CommentsStateV2
