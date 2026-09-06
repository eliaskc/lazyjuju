import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { VirtualizedSplitView } from "../../../src/components/diff/VirtualizedSplitView"
import { VirtualizedUnifiedView } from "../../../src/components/diff/VirtualizedUnifiedView"
import { ThemeProvider } from "../../../src/context/theme"
import type { FileId, HunkId } from "../../../src/diff/identifiers"
import type { DiffLine, FlattenedFile } from "../../../src/diff/parser"
import type { DiffPosition, DiffScrollAnchor } from "../../../src/diff/virtualization"

function fixture(): FlattenedFile[] {
    return ["deletion", "addition", "context"].map((type, f) => {
        const hunkId = `hunk-${f}`
        const lines: DiffLine[] = Array.from({ length: 40 }, (_, n) => ({
            type: type as DiffLine["type"],
            content: `marker-${f}-${n} ${"x".repeat(110)}`,
            oldLineNumber: type === "addition" ? undefined : n + 1,
            newLineNumber: type === "deletion" ? undefined : n + 1,
            hunkId,
        }))
        return {
            fileId: `file-${f}` as FileId,
            name: `file-${f}.txt`,
            type: "change",
            additions: type === "addition" ? 40 : 0,
            deletions: type === "deletion" ? 40 : 0,
            hunks: [{ hunkId, lines, oldStart: 1, oldLines: 40, newStart: 1, newLines: 40 }],
        }
    })
}

for (const View of [VirtualizedUnifiedView, VirtualizedSplitView]) {
    test(`${View.name} keeps layout callbacks independent of scrolling and restores anchors after reflow`, async () => {
        const [files, setFiles] = createSignal(fixture())
        const [top, setTop] = createSignal(0)
        const [left, setLeft] = createSignal(0)
        const [width, setWidth] = createSignal(70)
        const [height, setHeight] = createSignal(12)
        const [leading, setLeading] = createSignal(0)
        const [wrap, setWrap] = createSignal(true)
        const [active, setActive] = createSignal<FileId | null>(null)
        const [restore, setRestore] = createSignal<DiffScrollAnchor | null>(null)
        let hunkCalls = 0
        let fileCalls = 0
        let tailCalls = 0
        let restoreCalls = 0
        let hunkOffsets = new Map<HunkId, number>()
        let fileOffsets = new Map<FileId, number>()
        let position: DiffPosition | null = null
        let anchor: DiffScrollAnchor | null = null
        let restoredRow: number | null = null
        let tail = -1
        const setup = await testRender(
            () => (
                <ThemeProvider>
                    <View
                        files={files()}
                        activeFileId={active()}
                        scrollTop={top()}
                        scrollLeft={left()}
                        viewportWidth={width()}
                        viewportHeight={height()}
                        leadingContentHeight={leading()}
                        wrapEnabled={wrap()}
                        scrollAnchor={restore()}
                        onHunkRowOffsets={(value) => {
                            hunkCalls++
                            hunkOffsets = value
                        }}
                        onFileRowOffsets={(value) => {
                            fileCalls++
                            fileOffsets = value
                        }}
                        onScrollTailHeight={(value) => {
                            tailCalls++
                            tail = value
                        }}
                        onCurrentPositionChange={(value) => {
                            position = value
                        }}
                        onCurrentScrollAnchorChange={(value) => {
                            anchor = value
                        }}
                        onScrollAnchorRowChange={(value) => {
                            restoreCalls++
                            restoredRow = value
                        }}
                    />
                </ThemeProvider>
            ),
            { width: 70, height: 12 },
        )
        try {
            await setup.renderOnce()
            expect(setup.captureCharFrame()).toContain("file-0.txt")
            expect(hunkCalls).toBe(1)
            expect(fileCalls).toBe(1)
            const originalHunks = hunkOffsets
            const originalFiles = fileOffsets
            const initialTailCalls = tailCalls
            const initialRestoreCalls = restoreCalls
            for (let n = 1; n <= 30; n++) {
                setTop(n)
                await setup.renderOnce()
            }
            setLeft(5)
            await setup.renderOnce()
            expect(hunkOffsets).toBe(originalHunks)
            expect(fileOffsets).toBe(originalFiles)
            expect(hunkCalls).toBe(1)
            expect(fileCalls).toBe(1)
            expect(tailCalls).toBe(initialTailCalls)
            expect(restoreCalls).toBe(initialRestoreCalls)
            expect(position!.fileId).toBe("file-0")
            expect(position!.lineNumber).toBeGreaterThan(1)
            expect(anchor!.oldLineNumber).toBeDefined()
            expect(anchor!.newLineNumber).toBeUndefined()

            const saved = anchor!
            setRestore(saved)
            await setup.renderOnce()
            const wideRow = restoredRow!
            setWidth(40)
            setup.resize(40, 12)
            await setup.renderOnce()
            expect(hunkCalls).toBe(2)
            expect(restoredRow!).toBeGreaterThan(wideRow)
            const reflowedRow = restoredRow!
            setTop(reflowedRow - saved.viewportOffset)
            await setup.renderOnce()
            expect(anchor!.oldLineNumber).toBe(saved.oldLineNumber)
            expect(hunkCalls).toBe(2)

            setHeight(20)
            setLeading(6)
            await setup.renderOnce()
            expect(hunkCalls).toBe(2)
            expect(tailCalls).toBeGreaterThan(initialTailCalls)
            setRestore(null)
            setWrap(false)
            await setup.renderOnce()
            expect(hunkCalls).toBe(3)
            expect(hunkOffsets.get("hunk-1")).toBe(43)
            setTop(fileOffsets.get("file-1" as FileId)!)
            await setup.renderOnce()
            expect(position!.fileId).toBe("file-1")
            expect(anchor!.newLineNumber).toBeDefined()
            setLeft(10)
            await setup.renderOnce()
            expect(hunkCalls).toBe(3)
            setActive("file-2" as FileId)
            setTop(0)
            await setup.renderOnce()
            expect(fileOffsets.size).toBe(1)
            expect(hunkOffsets.get("hunk-2")).toBe(1)
            expect(tail).toBe(0)

            const binaryId = "binary" as FileId
            const emptyId = "empty" as FileId
            setActive(null)
            setFiles([
                ...fixture(),
                {
                    fileId: binaryId,
                    name: "image.png",
                    type: "change",
                    isBinary: true,
                    hunks: [],
                    additions: 0,
                    deletions: 0,
                },
                {
                    fileId: emptyId,
                    name: "empty.txt",
                    type: "change",
                    hunks: [],
                    additions: 0,
                    deletions: 0,
                },
            ])
            await setup.renderOnce()
            setTop(fileOffsets.get(binaryId)! + 1)
            await setup.renderOnce()
            expect<DiffPosition | null>(position).toEqual({
                fileId: binaryId,
                lineNumber: undefined,
            })
            expect(anchor).toBeNull()
            setTop(fileOffsets.get(emptyId)!)
            await setup.renderOnce()
            expect<DiffPosition | null>(position).toEqual({
                fileId: emptyId,
                lineNumber: undefined,
            })
            expect(anchor).toBeNull()
            expect(tail).toBe(19)
            setFiles([])
            await setup.renderOnce()
            expect(hunkOffsets.size).toBe(0)
            expect(fileOffsets.size).toBe(0)
            expect(position).toBeNull()
            expect(anchor).toBeNull()
            expect(setup.captureCharFrame()).toContain("No changes")
        } finally {
            setup.renderer.destroy()
        }
    }, 15_000)
}
