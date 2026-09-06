import { describe, expect, test } from "bun:test"
import {
    buildWrappedSplitRows,
    flattenToSplitRows,
} from "../../../src/components/diff/VirtualizedSplitView"
import { buildWrappedRows } from "../../../src/components/diff/VirtualizedUnifiedView"
import type { FileId } from "../../../src/diff/identifiers"
import { expandTabs, type DiffLine, type FlattenedFile } from "../../../src/diff/parser"
import {
    MAX_HIGHLIGHT_LINE_LENGTH,
    MAX_WORD_DIFF_CACHE_BYTES,
    MAX_WORD_DIFF_CACHE_ENTRIES,
} from "../../../src/diff/preparation-limits"
import { buildRowWindow } from "../../../src/diff/row-window"
import {
    buildDiffLayoutIndex,
    flattenToRows,
    getCurrentDiffPosition,
    getCurrentDiffScrollAnchor,
    findDiffScrollAnchorRowIndex,
    getVisibleRange,
} from "../../../src/diff/virtualization"
import { createWordDiffCache, computeWordDiff } from "../../../src/diff/word-diff"

function file(lines: DiffLine[]): FlattenedFile {
    return {
        fileId: "test" as FileId,
        name: "test.ts",
        type: "change",
        additions: 1,
        deletions: 1,
        hunks: [{ hunkId: "hunk", oldStart: 1, newStart: 1, oldLines: 1, newLines: 1, lines }],
    }
}
const line = (content: string, type: DiffLine["type"] = "context", n = 1): DiffLine => ({
    content,
    type,
    hunkId: "hunk",
    oldLineNumber: type === "addition" ? undefined : n,
    newLineNumber: type === "deletion" ? undefined : n,
})

describe("compact wrapped rows", () => {
    test("allocates only requested rows, reuses overlap, and releases past windows", () => {
        let calls = 0
        const window = buildRowWindow(
            [1, 2],
            () => 1_000_000,
            (row, wrap) => ({ row, wrap, call: ++calls }),
        )
        expect(window.length).toBe(2_000_000)
        expect(window.spans.length).toBe(2)
        expect(window.offsets.length).toBe(3)
        expect(calls).toBe(0)
        expect(window.at(1_500_000)?.row).toBe(2)
        expect(calls).toBe(0)
        const first = window.slice(500, 600)
        const next = window.slice(550, 650)
        expect(calls).toBe(150)
        expect(next[0]).toBe(first[50])
        window.slice(1_500_000, 1_500_100)
        expect(window.slice(500, 501)[0]).not.toBe(first[0])
        expect(window.slice(2_000_000, 2_000_100)).toEqual([])
    })

    test("unified layout and anchors use source spans, not millions of display objects", () => {
        const rows = flattenToRows([
            file([line("x".repeat(2_000_000)), line("end", "addition", 2)]),
        ])
        const wrapped = buildWrappedRows(rows, 1, true)
        expect(wrapped.spans.length).toBe(3)
        expect(wrapped.length).toBe(2_000_004)
        let visits = 0
        const layout = buildDiffLayoutIndex(
            wrapped.spans,
            ({ row }) => {
                visits++
                return row.newLineNumber
            },
            ({ row }) => row.oldLineNumber,
            (span) => span.height,
        )
        expect(visits).toBe(3)
        expect(layout.totalRows).toBe(wrapped.length)
        expect(layout.hunkOffsets.get("hunk")).toBe(1)
        const top = 1_900_000
        expect(getCurrentDiffPosition(layout, top)?.lineNumber).toBe(1)
        const anchor = getCurrentDiffScrollAnchor(layout, top)!
        expect(findDiffScrollAnchorRowIndex(layout, anchor)).toBe(1)
        const visible = getVisibleRange({
            scrollTop: top,
            viewportHeight: 30,
            totalRows: wrapped.length,
        })
        expect(wrapped.slice(visible.start, visible.end)).toHaveLength(130)
        const reflow = buildWrappedRows(rows, 200, true)
        expect(reflow.spans).toHaveLength(3)
        expect(reflow.length).toBe(10_002)
    })

    test("retains text, tab expansion, Unicode, final-newline and empty-line semantics", () => {
        const contents = ["", "\n", expandTabs("é\tλ\tvalue\n"), "😀中é end\n"]
        for (const content of contents) {
            const rows = flattenToRows([file([line(content)])])
            for (const width of [1, 3, 20]) {
                const wrapped = buildWrappedRows(rows, width, true)
                const pieces = wrapped
                    .slice(1, wrapped.length)
                    .flatMap((row) =>
                        row.type === "content"
                            ? [row.row.content.slice(row.lineStart, row.lineStart + row.lineLength)]
                            : [],
                    )
                expect(pieces.join("")).toBe(content.replace(/\n$/, ""))
                expect(wrapped.length).toBe(
                    1 + Math.max(1, Math.ceil(content.replace(/\n$/, "").length / width)),
                )
            }
            const noWrap = buildWrappedRows(rows, 10, false)
            expect(noWrap.length).toBe(2)
            expect(noWrap.slice(1, 2)[0]).toMatchObject({ lineStart: 0, isWrapped: false })
        }
    })

    test("split preparation defers all word diffs until requested and caches visits/reflow", () => {
        const lines: DiffLine[] = []
        for (let i = 0; i < 1000; i++)
            lines.push(
                line(`old value ${i}`, "deletion", i + 1),
                line(`new value ${i}`, "addition", i + 1),
            )
        const rows = flattenToSplitRows([file(lines)])
        const cache = createWordDiffCache()
        const wrapped = buildWrappedSplitRows(rows, 100, 200, true, cache)
        expect(cache.stats().entries).toBe(0)
        expect(rows).toHaveLength(1001)
        wrapped.at(500)
        expect(cache.stats().entries).toBe(0)
        const visible = wrapped.slice(1, 6)
        expect(cache.stats().entries).toBe(5)
        const emphasis = visible[0]!.row.leftWordDiff
        wrapped.slice(500, 505)
        expect(wrapped.slice(1, 2)[0]!.row.leftWordDiff).toBe(emphasis)
        const narrow = buildWrappedSplitRows(rows, 5, 10, true, cache)
        expect(narrow.slice(1, 2)[0]!.row.leftWordDiff).toBe(emphasis)
        expect(cache.stats().entries).toBe(10)
    })

    test("split alignment retains exhausted sides, empty lines, and one-sided full-width rows", () => {
        const rows = flattenToSplitRows([
            file([line("abcdefghij\n", "deletion"), line("xy\n", "addition")]),
        ])
        const wrapped = buildWrappedSplitRows(rows, 4, 10, true)
        expect(wrapped.length).toBe(4)
        expect(wrapped.slice(1, 4)).toMatchObject([
            { layout: "split", leftStart: 0, leftLength: 4, rightStart: 0, rightLength: 2 },
            { layout: "split", leftStart: 4, leftLength: 4, rightStart: null, rightLength: 0 },
            { layout: "split", leftStart: 8, leftLength: 2, rightStart: null, rightLength: 0 },
        ])
        expect(buildWrappedSplitRows(rows, 4, 10, false).slice(1, 2)).toMatchObject([
            { layout: "split", leftLength: 3, rightLength: 2, leftWrapped: false },
        ])
        const oneSide = flattenToSplitRows([file([line("abcdefghij", "addition")])])
        expect(buildWrappedSplitRows(oneSide, 4, 10, true).length).toBe(2)
        expect(buildWrappedSplitRows(oneSide, 4, 10, true).slice(1, 2)[0]).toMatchObject({
            layout: "unified",
            lineLength: 10,
        })
    })

    test("structural alignment and neutral/emphasized lines never trigger textual pairing", () => {
        const left = line("old name", "deletion")
        const right = line("new name", "addition")
        right.wordDiff = [
            { text: "new", type: "added" },
            { text: " name", type: "unchanged" },
        ]
        const structural = file([left, right])
        structural.hunks[0]!.alignedRows = [
            { left, right },
            { left, right: null },
        ]
        const rows = flattenToSplitRows([structural])
        const cache = createWordDiffCache()
        const wrapped = buildWrappedSplitRows(rows, 4, 10, true, cache)
        const visible = wrapped.slice(1, wrapped.length)
        expect(cache.stats().entries).toBe(0)
        expect(visible[0]!.row.rightWordDiff).toBe(right.wordDiff)
        expect(visible[0]!.row.leftWordDiff).toBeUndefined()
        expect(visible.at(-1)!.row.right).toBeNull()
    })
})

describe("bounded word diff", () => {
    test("difficult pairs use whole-line fallback and preserve all text", () => {
        for (const size of [500, 1000, 10_000]) {
            const old = Array.from({ length: size }, (_, i) => `a${i}`).join(" ")
            const next = Array.from({ length: size }, (_, i) => `b${i}`).join(" ")
            expect(computeWordDiff(old, next)).toEqual({
                old: [{ text: old, type: "removed" }],
                new: [{ text: next, type: "added" }],
            })
        }
    })

    test("LRU bounds entries/estimated bytes and excludes oversized keys", () => {
        const cache = createWordDiffCache()
        const first = cache.get("old", "new")
        expect(cache.get("old", "new")).toBe(first)
        for (let i = 0; i < 1000; i++)
            cache.get(`${i}: ${"a ".repeat(1500)}`, `${i}: ${"b ".repeat(1500)}`)
        expect(cache.stats().entries).toBeLessThanOrEqual(MAX_WORD_DIFF_CACHE_ENTRIES)
        expect(cache.stats().bytes).toBeLessThanOrEqual(MAX_WORD_DIFF_CACHE_BYTES)
        expect(cache.get("old", "new")).not.toBe(first)
        const before = cache.stats()
        cache.get("x".repeat(MAX_HIGHLIGHT_LINE_LENGTH + 1), "y")
        expect(cache.stats()).toEqual(before)
    })
})
