import { appendFile } from "node:fs/promises"
import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from "@opentui/core"

// No timers, listeners, state reads, or file writes in normal use. Keep this
// observer independent of scheduling: it must never request an extra frame.
const benchmarkEnabled = !!process.env.KAJJI_BENCHMARK_TRACE
export type BenchmarkState = Record<string, number | string | boolean | null>
const readers = new Set<() => BenchmarkState>()

export function registerBenchmarkState(read: () => BenchmarkState): () => void {
    if (!benchmarkEnabled) return () => {}
    readers.add(read)
    return () => readers.delete(read)
}

export function benchmarkRegion(
    prefix: string,
    scroll: ScrollBoxRenderable | undefined,
): BenchmarkState {
    const view = scroll?.viewport
    return {
        [`${prefix}X`]: view?.x ?? 0,
        [`${prefix}Y`]: view?.y ?? 0,
        [`${prefix}Width`]: view?.width ?? 0,
        [`${prefix}Height`]: view?.height ?? 0,
    }
}

export function attachBenchmark(renderer: CliRenderer): () => Promise<void> {
    const path = process.env.KAJJI_BENCHMARK_TRACE
    if (!path) return async () => {}
    const now = () => performance.timeOrigin + performance.now()
    let events: object[] = []
    let input = 0
    let expected = now() + 100
    let observerFlushMs = 0
    let observerWriteMs = 0
    let pendingWrite = Promise.resolve()
    let writeError: unknown
    const emit = (event: object) => events.push(event)
    const frame = () => {
        const at = now()
        const state = Object.assign(
            { targetFps: renderer.targetFps, maxFps: renderer.maxFps },
            ...Array.from(readers, (read) => read()),
        )
        emit({ kind: "frame", at, input, state })
    }
    const key = (event: KeyEvent) => {
        emit({ kind: "key", at: now(), input: ++input, key: event.name })
    }
    const flush = () => {
        if (!events.length) return
        const startedAt = performance.now()
        const data = events.map((event) => JSON.stringify(event)).join("\n") + "\n"
        events = []
        // Preserve event order without blocking the application's event loop on
        // filesystem I/O. Shutdown must await the complete queue before exit.
        pendingWrite = pendingWrite.then(async () => {
            if (writeError) return
            const writeStartedAt = performance.now()
            try {
                await appendFile(path, data, { mode: 0o600 })
            } catch (error) {
                writeError = error
            }
            observerWriteMs = performance.now() - writeStartedAt
        })
        observerFlushMs = performance.now() - startedAt
    }
    const sample = () => {
        const at = now()
        emit({
            kind: "resource",
            at,
            observerFlushMs,
            observerWriteMs,
            eventLoopDelayMs: Math.max(0, at - expected),
            rssMiB: process.memoryUsage.rss() / 1048576,
            cpu: process.cpuUsage(),
        })
        expected = at + 100
        flush()
    }
    renderer.on("frame", frame)
    renderer.keyInput.prependListener("keypress", key)
    const timer = setInterval(sample, 100)
    timer.unref()
    let stopped: Promise<void> | undefined
    const stop = () => {
        if (stopped) return stopped
        clearInterval(timer)
        renderer.off("frame", frame)
        renderer.keyInput.off("keypress", key)
        renderer.off("destroy", onDestroy)
        sample()
        stopped = pendingWrite.then(() => {
            if (writeError) throw writeError
        })
        return stopped
    }
    const onDestroy = () => {
        // runTui also awaits stop and reports a failed write through its exit
        // status. Attach a handler now to avoid an unhandled rejection meanwhile.
        void stop().catch(() => {})
    }
    renderer.on("destroy", onDestroy)
    return stop
}
