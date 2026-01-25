import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { execute } from "../commander/executor"
import { writeFileAtomic } from "../utils/atomic-write"
import type {
	CommentAnchorHunk,
	CommentsState,
	CommentsStateV1,
	CommentsStateV2,
	RevisionCommentsV1,
} from "./types"

const COMMENTS_VERSION = 2
const STATE_DIR = join(homedir(), ".local", "state", "kajji")
const REPOS_DIR = join(STATE_DIR, "repos")

export function migrateCommentsState(state: CommentsStateV1): CommentsStateV2 {
	const revisions: CommentsStateV2["revisions"] = {}
	for (const [changeId, revision] of Object.entries(state.revisions)) {
		const anchors: CommentAnchorHunk[] = []
		const hunks = (revision as RevisionCommentsV1).hunks
		for (const [id, hunk] of Object.entries(hunks)) {
			anchors.push({
				id,
				type: "hunk",
				filePath: hunk.anchor.filePath,
				lineRange: hunk.anchor.lineRange,
				contextLines: hunk.anchor.contextLines,
				comments: hunk.comments,
				stale: hunk.stale,
			})
		}
		revisions[changeId] = {
			commitHash: revision.commitHash,
			anchors,
		}
	}

	return {
		version: 2,
		revisions,
	}
}

export async function resolveRepoRoot(cwd = process.cwd()): Promise<string> {
	const result = await execute(["root"], { cwd })
	if (!result.success) {
		throw new Error(result.stderr.trim() || "Not a jj repository")
	}
	const root = result.stdout.trim()
	if (!root) {
		throw new Error("Unable to resolve jj root")
	}
	return root
}

function hashRepoPath(path: string): string {
	return createHash("sha256").update(path).digest("hex")
}

function getCommentsPath(repoRoot: string): string {
	return join(REPOS_DIR, hashRepoPath(repoRoot), "comments.json")
}

export function readComments(repoRoot: string): CommentsState {
	const commentsPath = getCommentsPath(repoRoot)
	if (!existsSync(commentsPath)) {
		return { version: COMMENTS_VERSION, revisions: {} }
	}
	try {
		const content = readFileSync(commentsPath, "utf-8")
		const parsed = JSON.parse(content) as CommentsStateV2 | CommentsStateV1
		if (parsed && parsed.version === 2) {
			return parsed
		}
		if (parsed && parsed.version === 1) {
			const migrated = migrateCommentsState(parsed)
			writeFileAtomic(commentsPath, JSON.stringify(migrated, null, 2))
			return migrated
		}
		return { version: COMMENTS_VERSION, revisions: {} }
	} catch {
		return { version: COMMENTS_VERSION, revisions: {} }
	}
}

export function writeComments(repoRoot: string, state: CommentsState): void {
	const commentsPath = getCommentsPath(repoRoot)
	writeFileAtomic(commentsPath, JSON.stringify(state, null, 2))
}
