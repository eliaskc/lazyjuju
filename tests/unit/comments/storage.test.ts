import { describe, expect, test } from "bun:test"
import { migrateCommentsState } from "../../../src/comments/storage"
import type { CommentsStateV1 } from "../../../src/comments/types"

describe("migrateCommentsState", () => {
	test("converts v1 hunks into v2 anchors", () => {
		const input: CommentsStateV1 = {
			version: 1,
			revisions: {
				abc123: {
					commitHash: "def456",
					hunks: {
						h1: {
							anchor: {
								filePath: "src/app.ts",
								lineRange: {
									oldStart: 1,
									oldCount: 1,
									newStart: 1,
									newCount: 2,
								},
								contextLines: ["const value = 1"],
							},
							comments: [
								{
									id: "cmt_1",
									text: "note",
									author: "human",
									type: "feedback",
									createdAt: "2025-01-01T00:00:00Z",
									replyTo: null,
								},
							],
							stale: true,
						},
					},
				},
			},
		}

		const output = migrateCommentsState(input)

		expect(output.version).toBe(2)
		const revision = output.revisions.abc123
		expect(revision?.anchors).toHaveLength(1)
		const anchor = revision?.anchors[0]
		expect(anchor?.type).toBe("hunk")
		expect(anchor?.id).toBe("h1")
		expect(anchor?.filePath).toBe("src/app.ts")
		expect(anchor?.comments).toHaveLength(1)
		expect(anchor?.stale).toBe(true)
	})
})
