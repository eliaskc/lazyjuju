import { describe, expect, test } from "bun:test"
import { parseAnsiLines } from "../../../src/utils/ansi-lines"
import { buildRowOffsets, listWindow, rowAtOffset } from "../../../src/utils/list-window"
import { retainEqualItems } from "../../../src/utils/stable-items"

describe("list windows", () => {
    test("indexes variable-height entries and exact boundaries", () => {
        const offsets = buildRowOffsets([2, 3, 1], (height) => height)
        expect(offsets).toEqual([0, 2, 5, 6])
        expect(rowAtOffset(offsets, 2)).toBe(1)
        expect(listWindow(offsets, 2, 3, 0)).toEqual({
            start: 1,
            end: 2,
            before: 2,
            after: 1,
            from: 2,
            to: 5,
        })
    })
    test("bounds rows regardless of loaded count and preserves total height", () => {
        for (const count of [100, 10_000, 100_000]) {
            const offsets = buildRowOffsets(Array.from({ length: count }), () => 1)
            for (const top of [0, 20, count / 2, count - 1]) {
                const window = listWindow(offsets, top, 30)
                expect(window.end - window.start).toBeLessThanOrEqual(46)
                expect(window.before + window.end - window.start + window.after).toBe(count)
            }
        }
    })
    test("handles empty lists and clamps after shrink or resize", () => {
        expect(listWindow([0], 900, 30)).toEqual({
            start: 0,
            end: 0,
            before: 0,
            after: 0,
            from: 0,
            to: 0,
        })
        expect(listWindow([0, 1, 2], 900, 30).start).toBe(0)
        expect(listWindow([0, 1, 2], 900, 30).end).toBe(2)
    })
    test("retains unchanged data, but updates changed graph and selection metadata", () => {
        const a = { id: "a", lines: ["graph"], current: true }
        const b = { id: "b", lines: ["other"], current: false }
        const next = retainEqualItems(
            [a, b],
            [
                { ...a, lines: [...a.lines] },
                { ...b, lines: ["new graph"] },
            ],
            (row) => row.id,
        )
        expect(next[0]).toBe(a)
        expect(next[1]).not.toBe(b)
        expect(retainEqualItems(next, [{ ...a, current: false }], (row) => row.id)[0]).not.toBe(a)
    })
    test("evicts old ANSI entries and does not retain oversized output", () => {
        const first = parseAnsiLines("eviction sentinel")
        for (let i = 0; i < 600; i++) parseAnsiLines(`eviction row ${i}`)
        expect(parseAnsiLines("eviction sentinel")).not.toBe(first)
        // The key alone exceeds the byte budget, independent of parser wrapping.
        const large = "x".repeat(1_100_000)
        expect(parseAnsiLines(large)).not.toBe(parseAnsiLines(large))
    })
    test("reuses ANSI parsing without losing state across lines", () => {
        const content = "\x1b[31mfirst\nsecond\x1b[0m"
        const lines = parseAnsiLines(content)
        expect(parseAnsiLines(content)).toBe(lines)
        expect(lines[1]?.spans[0]?.fg).toBe(lines[0]?.spans[0]?.fg)
        expect(parseAnsiLines(content, 4)).not.toBe(lines)
    })
})
