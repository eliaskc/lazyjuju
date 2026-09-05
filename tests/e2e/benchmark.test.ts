import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { prepareFixture } from "../../scripts/perf/fixture"
import { runScenario } from "../../scripts/perf/run"
import type { Settings } from "../../scripts/perf/types"

test("benchmark observer measures ready output and verifies all navigation panels", async () => {
    const root = mkdtempSync(join(tmpdir(), "kajji-benchmark-contract-"))
    try {
        const fixtureRoot = join(root, "fixture")
        const fixture = prepareFixture(fixtureRoot, {
            commits: 20,
            bookmarks: 30,
            files: 5,
            diffFiles: 2,
            diffLines: 100,
        })
        const settings: Settings = {
            scenarios: ["diff", "log", "bookmarks"],
            runs: 1,
            warmups: 0,
            steps: 3,
            intervalMs: 100,
            passes: 1,
            sampleMs: 0,
            cols: 120,
            rows: 36,
            diffInput: "line",
            layout: "unified",
            wrap: true,
        }
        // Contract checks only, not speed thresholds. Slow input keeps this
        // reliable when the other correctness workflows run concurrently.
        for (const scenario of settings.scenarios) {
            const result = await runScenario(
                resolve(import.meta.dir, "../.."),
                fixtureRoot,
                fixture,
                join(root, "run"),
                scenario,
                0,
                settings,
                process.execPath,
            )
            expect(result.startup.contentReadyOutputMs).toBeGreaterThanOrEqual(
                result.startup.firstOutputFrameMs!,
            )
            expect(result.startup.highlightedReadyOutputMs).toBeGreaterThanOrEqual(
                result.startup.contentReadyOutputMs!,
            )
            expect(result.startup.firstContentSampleMs).toBeUndefined()
            for (const burst of result.bursts) {
                expect(burst.visible).toHaveLength(2)
                expect(burst.metrics.sampledVisibleUpdateGapMaxMs).toBeUndefined()
                expect(burst.metrics.captureIntervalMaxMs).toBeUndefined()
            }
            expect(result.bursts).toHaveLength(2)
            expect(result.bursts[0]!.metrics.moved).toBe(3)
            expect(result.bursts[1]!.endPosition).toBe(result.bursts[0]!.startPosition)
            expect(result.bursts[0]!.metrics.visibleChanges).toBeGreaterThan(0)
            expect(
                result.trace.some((event) => event.kind === "frame" && event.state.diffReady),
            ).toBe(true)
        }
        const sampled = await runScenario(
            resolve(import.meta.dir, "../.."),
            fixtureRoot,
            fixture,
            join(root, "sampled"),
            "diff",
            0,
            { ...settings, sampleMs: 64 },
            process.execPath,
        )
        expect(sampled.bursts[0]!.visible.length).toBeGreaterThan(2)
        expect(sampled.bursts[0]!.metrics.sampledVisibleUpdateGapMaxMs).toBeGreaterThan(0)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}, 90000)
