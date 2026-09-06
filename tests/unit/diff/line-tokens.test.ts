import { expect, test } from "bun:test"
import { prepareLineTokens, sliceTokens } from "../../../src/diff/line-tokens"
import {
    MAX_EMPHASIS_SEGMENTS,
    MAX_HIGHLIGHT_LINE_LENGTH,
} from "../../../src/diff/preparation-limits"
import { getTokenCacheStats, tokenizeLine, tokenizeLineSync } from "../../../src/diff/syntax"
import type { WordDiffSegment } from "../../../src/diff/word-diff"

test("long lines and excessive structural segments bypass all syntax preparation", async () => {
    let calls = 0
    const tokenize = (content: string) => {
        calls++
        return [{ content, color: "red" }]
    }
    const content = "x".repeat(2_000_000) + "END"
    const segments: WordDiffSegment[] = [{ text: content, type: "removed" }]
    const plain = prepareLineTokens(content + "\n", undefined, "removed", "white", tokenize)
    expect(plain).toEqual([{ content, color: "white", emphasis: undefined }])
    const emphasized = prepareLineTokens(content, segments, "removed", "white", tokenize)
    expect(emphasized).toEqual([{ content, color: "white", emphasis: true }])
    expect(sliceTokens(emphasized, 2_000_000, 3)).toEqual([
        { content: "END", color: "white", emphasis: true },
    ])
    const many = Array.from({ length: MAX_EMPHASIS_SEGMENTS + 1 }, (): WordDiffSegment => ({
        text: "x",
        type: "added",
    }))
    expect(prepareLineTokens("short", many, "added", "white", tokenize)).toHaveLength(1)
    expect(prepareLineTokens("short", segments, "added", "white", tokenize)).toHaveLength(1)
    expect(calls).toBe(0)
    const before = getTokenCacheStats()
    expect(tokenizeLineSync(content, "typescript", "ayu-dark")).toEqual([{ content }])
    expect(await tokenizeLine(content, "typescript", "ayu-dark")).toEqual([{ content }])
    expect(getTokenCacheStats()).toEqual(before)
})

test("normal syntax and structural emphasis compose and slice at token boundaries", () => {
    const segments: WordDiffSegment[] = [
        { text: "const ", type: "unchanged" },
        { text: "newName", type: "added" },
        { text: " = 1", type: "unchanged" },
    ]
    const tokens = prepareLineTokens("const newName = 1", segments, "added", "white", (content) => [
        { content, color: "blue" },
    ])
    expect(sliceTokens(tokens, 4, 10)).toEqual([
        { content: "t ", color: "blue", emphasis: false },
        { content: "newName", color: "blue", emphasis: true },
        { content: " ", color: "blue", emphasis: false },
    ])
    expect(sliceTokens(tokens, 50, 10)).toEqual([])
    expect(sliceTokens(tokens, 0, 0)).toEqual([])
    expect(prepareLineTokens("abc\n", undefined, "added", "white")).toEqual([
        { content: "abc", color: "white" },
    ])
    const atLimit = "x".repeat(MAX_HIGHLIGHT_LINE_LENGTH)
    expect(
        prepareLineTokens(atLimit, undefined, "added", "white", (content) => [
            { content, color: "blue" },
        ])[0]?.color,
    ).toBe("blue")
})
