import { expect, test } from "bun:test"
import type { FileId } from "../../src/diff/identifiers"
import {
    buildDiffLayoutIndex,
    findDiffScrollAnchorRowIndex,
    getCurrentDiffPosition,
    getCurrentDiffScrollAnchor,
    getFileScrollTailHeight,
} from "../../src/diff/virtualization"

// Layout preparation is measured separately from scroll-only updates. These
// are function microbenchmarks, not input-to-output or whole-TUI measurements.
for (const count of [100_000, 500_000]) {
    for (const mode of ["deleted", "mixed"] as const) {
        test(`indexed ${mode} diff scroll, ${count} display rows`, () => {
            const rows = Array.from({ length: count }, (_, i) => ({
                row: {
                    fileId: `file-${Math.floor(i / 1000)}` as FileId,
                    type: i % 1000 === 0 ? "file-header" : "content",
                    hunkId: i % 1000 === 0 ? null : `hunk-${Math.floor(i / 1000)}`,
                },
                oldLine: i % 1000 === 0 ? undefined : i % 1000,
                newLine: mode === "deleted" || i % 1000 === 0 ? undefined : i % 1000,
            }))
            const start = performance.now()
            const layout = buildDiffLayoutIndex(
                rows,
                (row) => row.newLine,
                (row) => row.oldLine,
            )
            const buildMs = performance.now() - start
            const update = (n: number) => {
                const top = (n * 977) % count
                const focus = top + 15
                const position = getCurrentDiffPosition(layout, top, focus)
                const anchor = getCurrentDiffScrollAnchor(layout, top, focus)
                const restored = anchor ? findDiffScrollAnchorRowIndex(layout, anchor) : null
                getFileScrollTailHeight(layout, 30, 10)
                if (!position || restored === null) throw new Error("missing scroll position")
            }
            for (let n = 0; n < 1000; n++) update(n)
            const samples: number[] = []
            for (let batch = 0; batch < 20; batch++) {
                const start = performance.now()
                for (let n = 0; n < 1000; n++) update(batch * 1000 + n)
                samples.push((performance.now() - start) / 1000)
            }
            samples.sort((a, b) => a - b)
            const median = samples[10]!
            console.log(
                `${mode} ${count}: build=${buildMs.toFixed(2)}ms, median update=${median.toFixed(4)}ms, p95 batch mean=${samples[18]!.toFixed(4)}ms`,
            )
            // Generous threshold; operation-count and reactive tests are the
            // deterministic gate against full-layout work on each scroll.
            expect(median).toBeLessThan(0.1)
        })
    }
}
