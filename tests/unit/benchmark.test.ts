import { describe, expect, test } from "bun:test"
import {
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
    assertCompatible,
    burstMetrics,
    contentReady,
    readinessProblem,
    startupFrames,
    position,
    ready,
    summarize,
} from "../../scripts/perf/analysis"
import { executableIdentity, harnessFingerprint } from "../../scripts/perf/compatibility"
import {
    assertSelfContained,
    controlledConfig,
    fingerprintTree,
    loadFixture,
    prepareFixture,
} from "../../scripts/perf/fixture"
import { parseProcessTree } from "../../scripts/perf/resources"
import {
    REPORT_VERSION,
    type Burst,
    type FrameEvent,
    type Report,
    type State,
} from "../../scripts/perf/types"
import { ConfigSchema } from "../../src/config/schema"

const loaded: State = {
    logReady: true,
    bookmarksReady: true,
    diffReady: true,
    syntaxReady: true,
    syntaxPending: 0,
}
const frame = (at: number, index: number): FrameEvent => ({
    kind: "frame",
    at,
    input: index,
    state: { ...loaded, logIndex: index },
})
const burst = (): Burst => ({
    sampleMs: 32,
    direction: "down",
    startedAt: 100,
    endedAt: 180,
    startPosition: 0,
    endPosition: 3,
    inputs: [100, 116, 132].map((sent) => ({ due: sent, sent, ack: sent + 1, direction: "down" })),
    visible: [100, 132, 164, 200].map((at, index) => ({
        requested: at - 2,
        at,
        hash: String(index),
    })),
    metrics: {},
})

describe("benchmark measurements", () => {
    test("nearest-rank percentiles preserve tail events", () => {
        const summary = summarize([1, 2, 3, 4, 100])
        expect(summary).toEqual({ count: 5, median: 3, p95: 100, p99: 100, min: 1, max: 100 })
        expect(() => summarize([])).toThrow()
        expect(() => summarize([NaN])).toThrow()
    })

    test("readiness requires completed streams, diff, and syntax", () => {
        expect(ready(loaded)).toBe(true)
        for (const key of ["logReady", "bookmarksReady", "diffReady", "syntaxReady"])
            expect(ready({ ...loaded, [key]: false })).toBe(false)
        expect(ready({ ...loaded, syntaxPending: 1 })).toBe(false)
        expect(ready({ ...loaded, diffError: true })).toBe(false)
        expect(ready({})).toBe(false)
        expect(() => position({}, "log")).toThrow()
    })

    test("content readiness is independent of highlighting and requires simultaneous loaded state", () => {
        expect(contentReady({ ...loaded, syntaxReady: false, syntaxPending: 20 })).toBe(true)
        const events: FrameEvent[] = [
            { ...frame(10, 0), state: { ...loaded, diffRevision: "wrong" } },
            { ...frame(20, 0), state: { ...loaded, diffRevision: "r", diffReady: false } },
            { ...frame(30, 0), state: { ...loaded, diffRevision: "r", logReady: false } },
            { ...frame(40, 0), state: { ...loaded, diffRevision: "r", syntaxReady: false } },
            { ...frame(50, 0), state: { ...loaded, diffRevision: "r", syntaxPending: 2 } },
            { ...frame(60, 0), state: { ...loaded, diffRevision: "r" } },
        ]
        const milestones = startupFrames(events, "r")
        expect(milestones.content?.at).toBe(40)
        expect(milestones.highlighted?.at).toBe(60)
        expect(readinessProblem({ ...loaded, syntaxReady: false })).toContain("syntax worker")
        expect(readinessProblem({ ...loaded, syntaxPending: 2 })).toContain("2 syntax requests")
        expect(readinessProblem(undefined)).toContain("observer contract")
    })

    test("endpoint captures validate movement without claiming visible timing", () => {
        const input = burst()
        input.sampleMs = 0
        input.visible = [input.visible[0]!, input.visible.at(-1)!]
        const metrics = burstMetrics(input, [frame(180, 3)], "log", true)
        expect(metrics.visibleChanges).toBe(1)
        expect(metrics.captureCostP95Ms).toBe(2)
        expect(metrics.sampledVisibleUpdateGapMaxMs).toBeUndefined()
        expect(metrics.captureIntervalMaxMs).toBeUndefined()
        expect(metrics.inputToOutputMaxMs).toBe(80)
        input.visible[1]!.hash = input.visible[0]!.hash
        expect(() => burstMetrics(input, [frame(180, 3)], "log", true)).toThrow("visibly change")
    })

    test("assigns inputs to frames that contain their position; counts coalescing", () => {
        const metrics = burstMetrics(
            burst(),
            [frame(133, 2), frame(170, 3), frame(180, 3), frame(500, 3)],
            "log",
            true,
        )
        expect(metrics.inputToOutputP95Ms).toBe(38)
        expect(metrics.coalescedInputs).toBe(1)
        expect(metrics.updateGapMaxMs).toBe(37)
        expect(metrics.recoveryMs).toBe(48)
    })

    test("does not count idle frames as scrolling or omit a long first response", () => {
        const input = burst()
        input.endedAt = 350
        const metrics = burstMetrics(
            input,
            [frame(110, 0), frame(120, 0), frame(350, 3)],
            "log",
            true,
        )
        expect(metrics.updateGapMaxMs).toBe(250)
        expect(metrics.gapsOver100Ms).toBe(1)
        expect(metrics.outputUpdates).toBe(1)
    })

    test("rejects missed keys, missing visual changes, and clock mismatch", () => {
        expect(() =>
            burstMetrics({ ...burst(), endPosition: 2 }, [frame(180, 2)], "log", true),
        ).toThrow("expected 3 movement")
        const invisible = burst()
        invisible.visible.forEach((sample) => {
            sample.hash = "same"
        })
        expect(() => burstMetrics(invisible, [frame(180, 3)], "log", true)).toThrow(
            "visibly change",
        )
        expect(() => burstMetrics(burst(), [frame(110, 3)], "log", true)).toThrow("clock")
    })

    test("wheel/page measurements do not claim per-input latency", () => {
        const metrics = burstMetrics(
            { ...burst(), endPosition: 20 },
            [{ ...frame(180, 0), state: { ...loaded, diffPosition: 20 } }],
            "diff",
            false,
        )
        expect(metrics.inputToOutputP95Ms).toBeUndefined()
        expect(metrics.moved).toBe(20)
    })

    test("rejects incompatible reports, including driver and workload changes", () => {
        const report = {
            version: REPORT_VERSION,
            compatibility: {
                fixture: "a",
                settings: { steps: 40 },
                terminalControl: "binary-a",
                harness: "v1",
                driverBun: "1.4.1",
            },
            aggregate: { metric: summarize([1]) },
        } as unknown as Report
        expect(() => assertCompatible(report, structuredClone(report))).not.toThrow()
        for (const key of ["fixture", "terminalControl", "harness", "driverBun"] as const) {
            const other = structuredClone(report)
            other.compatibility[key] = "changed"
            expect(() => assertCompatible(report, other)).toThrow("Incompatible")
        }
        const other = structuredClone(report)
        other.compatibility.settings.steps = 80
        expect(() => assertCompatible(report, other)).toThrow("settings")
        expect(() =>
            assertCompatible(
                { ...report, version: REPORT_VERSION + 1 } as unknown as Report,
                report,
            ),
        ).toThrow()
    })

    test("resource samples include descendants, not other processes", () => {
        expect(parseProcessTree("3 2 1024\n1 0 2048\n2 1 4096\n9 0 99999\n", 1)).toEqual({
            kajjiRssMiB: 2,
            treeRssMiB: 7,
            processCount: 3,
        })
        expect(parseProcessTree("2 0 400", 1)).toBeNull()
    })

    test("benchmark config is valid rather than silently falling back to defaults", () => {
        const config = ConfigSchema.parse(controlledConfig)
        expect(config.diff.layout).toBe("unified")
        expect(config.diff.engine).toBe("textual")
        expect(config.autoUpdatesDisabled).toBe(true)
    })
})

describe("benchmark compatibility identity", () => {
    test("PATH order and executable location do not change content identity", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-tools-"))
        try {
            const a = join(root, "a")
            const b = join(root, "b")
            mkdirSync(a)
            mkdirSync(b)
            for (const dir of [a, b])
                writeFileSync(join(dir, "test-jj"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
            const first = executableIdentity("test-jj", `${a}:${b}`)
            const second = executableIdentity("test-jj", `${b}:${a}`)
            expect(first.path).not.toBe(second.path)
            expect(first.sha256).toBe(second.sha256)
            writeFileSync(join(b, "test-jj"), "#!/bin/sh\nexit 1\n")
            expect(executableIdentity("test-jj", b).sha256).not.toBe(first.sha256)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    test("help edits preserve compatibility but executable CLI edits do not", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-hash-"))
        try {
            cpSync(resolve(import.meta.dir, "../../scripts"), join(root, "scripts"), {
                recursive: true,
            })
            mkdirSync(join(root, "src/utils"), { recursive: true })
            cpSync(
                resolve(import.meta.dir, "../../src/utils/benchmark.ts"),
                join(root, "src/utils/benchmark.ts"),
            )
            const before = harnessFingerprint(root)
            writeFileSync(join(root, "scripts/perf/help.txt"), "New instructions")
            expect(harnessFingerprint(root)).toBe(before)
            writeFileSync(join(root, "scripts/benchmark.ts"), "New executable policy")
            expect(harnessFingerprint(root)).not.toBe(before)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })
})

describe("benchmark observer lifecycle", () => {
    test("drains ordered asynchronous writes on destroy without requesting frames", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-observer-"))
        const path = join(root, "trace.jsonl")
        try {
            const result = Bun.spawnSync(
                [
                    process.execPath,
                    "-e",
                    `
                import { EventEmitter } from "node:events"
                import { attachBenchmark, registerBenchmarkState } from ${JSON.stringify(resolve(import.meta.dir, "../../src/utils/benchmark.ts"))}
                const renderer = new EventEmitter()
                renderer.keyInput = new EventEmitter()
                renderer.targetFps = 30
                renderer.maxFps = 60
                const unregister = registerBenchmarkState(() => ({ logReady: true }))
                const stop = attachBenchmark(renderer)
                renderer.emit("frame")
                renderer.keyInput.emit("keypress", { name: "j" })
                renderer.emit("frame")
                renderer.emit("destroy")
                await stop()
                await stop()
                unregister()
                if (renderer.listenerCount("frame") || renderer.keyInput.listenerCount("keypress")) throw new Error("Listeners retained")
            `,
                ],
                {
                    env: { ...process.env, KAJJI_BENCHMARK_TRACE: path },
                    stdout: "pipe",
                    stderr: "pipe",
                },
            )
            expect(result.stderr.toString()).toBe("")
            expect(result.success).toBe(true)
            const events = readFileSync(path, "utf8")
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line))
            expect(events.map((event) => event.kind)).toEqual(["frame", "key", "frame", "resource"])
            expect(events[0].state.logReady).toBe(true)
            expect(events[2].input).toBe(1)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    test("does not read state or touch the renderer when disabled", () => {
        const result = Bun.spawnSync(
            [
                process.execPath,
                "-e",
                `
            import { attachBenchmark, registerBenchmarkState } from ${JSON.stringify(resolve(import.meta.dir, "../../src/utils/benchmark.ts"))}
            const unregister = registerBenchmarkState(() => { throw new Error("State was read") })
            await attachBenchmark({})()
            unregister()
        `,
            ],
            { env: { ...process.env, KAJJI_BENCHMARK_TRACE: "" }, stdout: "pipe", stderr: "pipe" },
        )
        expect(result.stderr.toString()).toBe("")
        expect(result.success).toBe(true)
    })
})

describe("benchmark fixtures", () => {
    test("detects same-size edits and does not follow working-tree symlinks", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-unit-"))
        try {
            writeFileSync(join(root, "file"), "aaaa")
            symlinkSync("/nonexistent-target", join(root, "link"))
            const before = fingerprintTree(root)
            writeFileSync(join(root, "file"), "bbbb")
            expect(fingerprintTree(root)).not.toBe(before)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    test("prepares reusable fixtures and copies without changing the source", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-fixture-"))
        const options = { commits: 5, bookmarks: 8, files: 3, diffFiles: 2, diffLines: 10 }
        try {
            const source = join(root, "source")
            const manifest = prepareFixture(source, options)
            expect(loadFixture(source).id).toBe(manifest.id)
            const opHead = readFileSync(join(source, "fixture.json"), "utf8")
            const sourceHeads = readdirSync(join(source, "repo/.jj/repo/op_heads")).sort()
            const copied = prepareFixture(join(root, "copy"), options, join(source, "repo"))
            expect(copied.kind).toBe("copy")
            expect(readdirSync(join(source, "repo/.jj/repo/op_heads")).sort()).toEqual(sourceHeads)
            expect(readFileSync(join(source, "fixture.json"), "utf8")).toBe(opHead)
            expect(loadFixture(source).treeHash).toBe(manifest.treeHash)
            writeFileSync(join(source, "repo/history.ts"), "changed\n")
            expect(() => loadFixture(source)).toThrow("files changed")
            expect(() => prepareFixture(source, options)).toThrow("already exists")
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    }, 30000)

    test("rejects external Git metadata before any copy", () => {
        const root = mkdtempSync(join(tmpdir(), "kajji-bench-isolation-"))
        try {
            mkdirSync(join(root, "repo/.jj/repo/store"), { recursive: true })
            mkdirSync(join(root, "external"))
            writeFileSync(join(root, "repo/.jj/repo/store/git_target"), join(root, "external"))
            expect(() => assertSelfContained(join(root, "repo"))).toThrow("External Git")
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })
})
