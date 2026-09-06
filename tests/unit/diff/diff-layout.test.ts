import { describe, expect, test } from "bun:test"
import type { FileId } from "../../../src/diff/identifiers"
import {
    buildDiffLayoutIndex,
    buildHunkNavigationIndex,
    findDiffScrollAnchorRowIndex,
    getAdjacentHunkFromRow,
    getCurrentDiffPosition,
    getCurrentDiffScrollAnchor,
    getFileRowOffsets,
    getFileScrollTailHeight,
    getHunkRowOffsets,
} from "../../../src/diff/virtualization"

interface Row {
    row: { fileId: FileId; type: string; hunkId: string | null }
    newLine?: number
    oldLine?: number
}
const indexRows = (rows: Row[]) =>
    buildDiffLayoutIndex(
        rows,
        (row) => row.newLine,
        (row) => row.oldLine,
    )

// Independent linear reference: retain the original nearest-row and tie rules.
function nearest(rows: Row[], top: number, focus: number, side: "new" | "old" | "either") {
    const fileId = rows[Math.min(rows.length - 1, Math.max(0, Math.floor(top)))]?.row.fileId
    const center = Math.min(rows.length - 1, Math.max(0, Math.floor(focus)))
    return rows
        .map((row, index) => ({ row, index }))
        .filter(
            ({ row }) =>
                row.row.fileId === fileId &&
                (side === "new"
                    ? row.newLine !== undefined
                    : side === "old"
                      ? row.oldLine !== undefined
                      : row.newLine !== undefined || row.oldLine !== undefined),
        )
        .sort(
            (a, b) => Math.abs(a.index - center) - Math.abs(b.index - center) || b.index - a.index,
        )[0]
}

function fixture(): Row[] {
    const rows: Row[] = []
    for (let f = 0; f < 12; f++) {
        const fileId = `file-${f}` as FileId
        const push = (type: string, newLine?: number, oldLine?: number) =>
            rows.push({
                row: {
                    fileId,
                    type,
                    hunkId:
                        type === "content"
                            ? `${f}:${Math.floor((newLine ?? oldLine ?? 0) / 7)}`
                            : null,
                },
                newLine,
                oldLine,
            })
        push("file-header")
        if (f % 4 === 3) {
            // Binary and empty files have no line locations.
            if (f % 8 === 3) for (let i = 0; i < 9; i++) push("binary-preview")
        } else {
            for (let n = 1; n <= 23; n++) {
                if (n % 7 === 0) push("gap")
                for (let wrap = 0; wrap < 1 + (n % 3); wrap++) {
                    push(
                        "content",
                        f % 4 === 0 || n % 5 === 0 ? undefined : n,
                        f % 4 === 1 || n % 6 === 0 ? undefined : n + 10,
                    )
                }
            }
        }
        if (f < 11) push("file-gap")
    }
    return rows
}

describe("diff layout index", () => {
    test("matches linear position and anchor rules across files, gaps, wrapping, and absent sides", () => {
        const rows = fixture()
        const layout = indexRows(rows)
        expect(layout.fileOffsets).toEqual(getFileRowOffsets(rows))
        expect(layout.hunkOffsets).toEqual(getHunkRowOffsets(rows))
        for (let top = -1; top <= rows.length + 1; top += 1.5) {
            for (const delta of [-40, 0, 10, 100]) {
                const focus = top + delta
                const fileId =
                    rows[Math.min(rows.length - 1, Math.max(0, Math.floor(top)))]!.row.fileId
                const position =
                    nearest(rows, top, focus, "new") ?? nearest(rows, top, focus, "old")
                expect(getCurrentDiffPosition(layout, top, focus)).toEqual({
                    fileId,
                    lineNumber: position?.row.newLine ?? position?.row.oldLine,
                })
                const anchor = nearest(rows, top, focus, "either")
                expect(getCurrentDiffScrollAnchor(layout, top, focus)).toEqual(
                    anchor
                        ? {
                              fileId,
                              newLineNumber: anchor.row.newLine,
                              oldLineNumber: anchor.row.oldLine,
                              viewportOffset: anchor.index - top,
                          }
                        : null,
                )
            }
        }
    })

    test("anchor restoration uses both numbers when present and the first wrapped row", () => {
        const rows = fixture()
        const layout = indexRows(rows)
        for (const source of rows) {
            for (const side of ["both", "new", "old", "neither"]) {
                const anchor = {
                    fileId: source.row.fileId,
                    newLineNumber: side === "both" || side === "new" ? source.newLine : undefined,
                    oldLineNumber: side === "both" || side === "old" ? source.oldLine : undefined,
                    viewportOffset: 4,
                }
                const expected = rows.findIndex(
                    (row) =>
                        row.row.fileId === anchor.fileId &&
                        (anchor.newLineNumber === undefined ||
                            anchor.newLineNumber === row.newLine) &&
                        (anchor.oldLineNumber === undefined ||
                            anchor.oldLineNumber === row.oldLine),
                )
                expect(findDiffScrollAnchorRowIndex(layout, anchor)).toBe(expected)
            }
        }
        expect(
            findDiffScrollAnchorRowIndex(layout, {
                fileId: "missing" as FileId,
                viewportOffset: 0,
            }),
        ).toBeNull()
        expect(
            findDiffScrollAnchorRowIndex(layout, {
                fileId: rows[0]!.row.fileId,
                oldLineNumber: 900,
                viewportOffset: 0,
            }),
        ).toBeNull()
        const paired: Row[] = [
            {
                row: { fileId: "pair" as FileId, type: "content", hunkId: "pair" },
                newLine: 2,
                oldLine: 1,
            },
            {
                row: { fileId: "pair" as FileId, type: "content", hunkId: "pair" },
                newLine: 2,
                oldLine: 3,
            },
        ]
        expect(
            findDiffScrollAnchorRowIndex(indexRows(paired), {
                fileId: "pair" as FileId,
                newLineNumber: 2,
                oldLineNumber: 3,
                viewportOffset: 0,
            }),
        ).toBe(1)
    })

    test("restores split replacement anchors in unified rows", () => {
        const fileId = "replacement" as FileId
        const rows: Row[] = [
            { row: { fileId, type: "content", hunkId: "replacement" }, oldLine: 1 },
            { row: { fileId, type: "content", hunkId: "replacement" }, newLine: 2 },
        ]
        const anchor = { fileId, oldLineNumber: 1, newLineNumber: 2, viewportOffset: 0 }
        expect(findDiffScrollAnchorRowIndex(indexRows(rows), anchor)).toBe(1)
        expect(findDiffScrollAnchorRowIndex(indexRows(rows.slice(0, 1)), anchor)).toBe(0)
    })

    test("empty layouts have no position, anchor, or tail", () => {
        const layout = indexRows([])
        expect(getCurrentDiffPosition(layout, 0)).toBeNull()
        expect(getCurrentDiffScrollAnchor(layout, 0)).toBeNull()
        expect(getFileScrollTailHeight(layout, 30, 100)).toBe(0)
    })

    test("scroll queries do not read source rows and use logarithmic line lookups", () => {
        const fileId = "deleted" as FileId
        const rows = Array.from({ length: 100_000 }, (_, n): Row => ({
            row: { fileId, type: "content", hunkId: "hunk" },
            oldLine: n + 1,
        }))
        const layout = indexRows(rows)
        let reads = 0
        const file = layout.filesById.get(fileId)!
        const countReads = <T>(array: T[]) =>
            new Proxy(array, {
                get(target, key, receiver) {
                    if (typeof key === "string" && /^\d+$/.test(key)) reads++
                    return Reflect.get(target, key, receiver)
                },
            })
        file.lines = countReads(file.lines)
        file.oldLines = countReads(file.oldLines)
        rows.length = 0 // The index owns only source positions, not the row collection.
        for (let i = 0; i < 100; i++) {
            expect(getCurrentDiffPosition(layout, i * 900)?.lineNumber).toBe(i * 900 + 1)
            expect(getCurrentDiffScrollAnchor(layout, i * 900)?.oldLineNumber).toBe(i * 900 + 1)
        }
        expect(reads).toBeLessThan(4_000)
        expect(file.newLines).toHaveLength(0)
    })

    test("wrap spans do not allocate a line index entry per display row", () => {
        const row: Row = {
            row: { fileId: "long" as FileId, type: "content", hunkId: "h" },
            newLine: 1,
        }
        const layout = indexRows(Array(100_000).fill(row))
        expect(layout.files[0]!.lines).toHaveLength(1)
        expect(getCurrentDiffScrollAnchor(layout, 80_000, 80_010)?.viewportOffset).toBe(10)
        expect(
            findDiffScrollAnchorRowIndex(layout, {
                fileId: row.row.fileId,
                newLineNumber: 1,
                viewportOffset: 10,
            }),
        ).toBe(0)
    })

    test("hunk indexes exclude absent hunks and retain strict directional boundaries", () => {
        const files = [{ hunks: [{ hunkId: "a" }, { hunkId: "missing" }, { hunkId: "b" }] }]
        const navigation = buildHunkNavigationIndex(
            files,
            new Map([
                ["a", 2],
                ["b", 8],
            ]),
        )
        expect(getAdjacentHunkFromRow(navigation, 2, -1)).toBeUndefined()
        expect(getAdjacentHunkFromRow(navigation, 2, 1)?.hunkId).toBe("b")
        expect(getAdjacentHunkFromRow(navigation, 8, 1)).toBeUndefined()
        expect(getAdjacentHunkFromRow(navigation, 8, -1)?.hunkId).toBe("a")
        expect(getAdjacentHunkFromRow([], 0, 1)).toBeUndefined()
        files.length = 0
        expect(getAdjacentHunkFromRow(navigation, 0, 1)).toBe(navigation[0])
    })
})
