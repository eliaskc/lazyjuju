import {
    REPORT_VERSION,
    type Burst,
    type FrameEvent,
    type Report,
    type Scenario,
    type State,
    type Summary,
    type TraceEvent,
} from "./types"

export function summarize(values: number[]): Summary {
    if (!values.length || values.some((value) => !Number.isFinite(value))) {
        throw new Error("Cannot summarize empty or non-finite measurements")
    }
    const sorted = values.toSorted((a, b) => a - b)
    const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1]!
    return {
        count: sorted.length,
        median: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
        min: sorted[0]!,
        max: sorted.at(-1)!,
    }
}

export function position(state: State, scenario: Scenario): number {
    const value =
        state[
            scenario === "diff" ? "diffPosition" : scenario === "log" ? "logIndex" : "bookmarkIndex"
        ]
    if (typeof value !== "number") throw new Error(`Missing ${scenario} position`)
    return value
}

export function contentReady(state: State): boolean {
    return (
        state.logReady === true &&
        state.bookmarksReady === true &&
        state.diffReady === true &&
        !state.loadError &&
        !state.diffError
    )
}

// Interaction runs start and finish with highlighted content, but highlighting
// is a separate startup milestone, not part of the headline content-ready time.
export function ready(state: State): boolean {
    return contentReady(state) && state.syntaxReady === true && state.syntaxPending === 0
}

export function startupFrames(events: TraceEvent[], revision: string) {
    const output = frames(events)
    return {
        content: output.find(
            (frame) => frame.state.diffRevision === revision && contentReady(frame.state),
        ),
        highlighted: output.find(
            (frame) => frame.state.diffRevision === revision && ready(frame.state),
        ),
    }
}

export function readinessProblem(state: State | undefined): string {
    if (!state) return "No output-frame events received; check the renderer observer contract"
    if (state.loadError || state.diffError) return "Application reported a content loading error"
    const pending = ["logReady", "bookmarksReady", "diffReady"].filter((key) => state[key] !== true)
    if (pending.length) return `Content is not ready: ${pending.join(", ")}`
    if (state.syntaxReady !== true)
        return "Content is loaded, but the syntax worker has not reported readiness; initialization may have failed or stalled"
    if (state.syntaxPending !== 0)
        return `Content is loaded, but ${state.syntaxPending} syntax requests remain pending`
    return "Content and highlighting are ready; check the expected selection, focus, and visible screen"
}

export function frames(events: TraceEvent[]): FrameEvent[] {
    return events.filter((event): event is FrameEvent => event.kind === "frame")
}

export function burstMetrics(
    burst: Burst,
    events: TraceEvent[],
    scenario: Scenario,
    exactSteps: boolean,
): Record<string, number> {
    const sign = burst.direction === "down" ? 1 : -1
    const moved = (burst.endPosition - burst.startPosition) * sign
    if (moved <= 0 || (exactSteps && moved !== burst.inputs.length)) {
        throw new Error(
            `${scenario} ${burst.direction}: expected ${exactSteps ? burst.inputs.length : "positive"} movement, got ${moved}. Boundary, wrong focus, or missed input; this run is invalid.`,
        )
    }
    const updates: FrameEvent[] = []
    let previous = burst.startPosition
    for (const frame of frames(events)) {
        if (frame.at < burst.startedAt || frame.at > burst.endedAt) continue
        const next = position(frame.state, scenario)
        if (next !== previous) {
            if ((next - previous) * sign < 0)
                throw new Error("Unexpected reverse movement during burst")
            updates.push(frame)
            previous = next
        }
    }
    if (!updates.length) throw new Error("No output frames with panel movement")
    // Include initial response and the final catch-up frame, but no settled idle tail.
    const gaps = updates.map((frame, i) => frame.at - (updates[i - 1]?.at ?? burst.startedAt))
    const result: Record<string, number> = {
        outputUpdates: updates.length,
        moved,
        updateGapP95Ms: summarize(gaps).p95,
        updateGapMaxMs: Math.max(...gaps),
        gapsOver50Ms: gaps.filter((gap) => gap > 50).length,
        gapsOver100Ms: gaps.filter((gap) => gap > 100).length,
        gapsOver250Ms: gaps.filter((gap) => gap > 250).length,
        recoveryMs: Math.max(0, burst.endedAt - burst.inputs.at(-1)!.sent),
        schedulerLatenessP95Ms: summarize(
            burst.inputs.map((input) => Math.max(0, input.sent - input.due)),
        ).p95,
        schedulerLatenessMaxMs: Math.max(
            ...burst.inputs.map((input) => Math.max(0, input.sent - input.due)),
        ),
        sendAckP95Ms: summarize(burst.inputs.map((input) => input.ack - input.sent)).p95,
    }
    if (exactSteps) {
        // A frame can represent multiple inputs. Assign each input to the first
        // output frame which includes its position, not merely the next frame.
        const latencies = burst.inputs.map((input, index) => {
            const target = burst.startPosition + sign * (index + 1)
            const frame = updates.find(
                (frame) => (position(frame.state, scenario) - target) * sign >= 0,
            )
            if (!frame || frame.at < input.sent - 2)
                throw new Error("Input/frame clock or position mismatch")
            return Math.max(0, frame.at - input.sent)
        })
        result.inputToOutputP50Ms = summarize(latencies).median
        result.inputToOutputP95Ms = summarize(latencies).p95
        result.inputToOutputP99Ms = summarize(latencies).p99
        result.inputToOutputMaxMs = Math.max(...latencies)
        result.coalescedInputs = burst.inputs.length - updates.length
        const key = burst.direction === "down" ? "j" : "k"
        const accepted = events.filter(
            (event) =>
                event.kind === "key" &&
                event.key === key &&
                event.at >= burst.startedAt - 2 &&
                event.at <= burst.endedAt,
        )
        if (accepted.length === burst.inputs.length) {
            result.inputQueueP95Ms = summarize(
                accepted.map((event, index) => Math.max(0, event.at - burst.inputs[index]!.sent)),
            ).p95
            result.inputQueueMaxMs = Math.max(
                ...accepted.map((event, index) =>
                    Math.max(0, event.at - burst.inputs[index]!.sent),
                ),
            )
        }
    }
    const visibleChanges = burst.visible.filter(
        (sample, i, all) => i > 0 && sample.hash !== all[i - 1]!.hash,
    )
    if (!visibleChanges.length) throw new Error("Target panel did not visibly change")
    result.visibleChanges = visibleChanges.length
    const visibleGaps = visibleChanges
        .filter((sample) => sample.at >= burst.startedAt)
        .map((sample, index, changes) => sample.at - (changes[index - 1]?.at ?? burst.startedAt))
    if (burst.sampleMs > 0 && visibleGaps.length) {
        result.sampledVisibleUpdateGapP95Ms = summarize(visibleGaps).p95
        result.sampledVisibleUpdateGapMaxMs = Math.max(...visibleGaps)
    }
    const captureIntervals = burst.visible
        .slice(1)
        .map((sample, i) => sample.at - burst.visible[i]!.at)
    if (burst.sampleMs > 0) {
        result.captureIntervalP95Ms = summarize(captureIntervals).p95
        result.captureIntervalMaxMs = Math.max(...captureIntervals)
    }
    result.captureCostP95Ms = summarize(
        burst.visible.map((sample) => sample.at - sample.requested),
    ).p95
    const delays = events.filter(
        (e) => e.kind === "resource" && e.at >= burst.startedAt && e.at <= burst.endedAt,
    )
    if (delays.length)
        result.eventLoopDelayMaxMs = Math.max(
            ...delays.map((e) => (e.kind === "resource" ? e.eventLoopDelayMs : 0)),
        )
    return result
}

export function aggregate(runs: Report["runs"]): Record<string, Summary> {
    const values: Record<string, number[]> = {}
    const add = (key: string, value: number) => (values[key] ??= []).push(value)
    for (const run of runs) {
        for (const [key, value] of Object.entries(run.startup))
            add(`${run.scenario}.startup.${key}`, value)
        for (const [key, value] of Object.entries(run.metrics)) add(`${run.scenario}.${key}`, value)
        run.bursts.forEach((burst, index) => {
            for (const [key, value] of Object.entries(burst.metrics))
                add(
                    `${run.scenario}.pass${Math.floor(index / 2) + 1}.${burst.direction}.${key}`,
                    value,
                )
        })
    }
    return Object.fromEntries(
        Object.entries(values).map(([key, samples]) => [key, summarize(samples)]),
    )
}

export function assertCompatible(baseline: Report, candidate: Report) {
    if (baseline.version !== REPORT_VERSION || candidate.version !== REPORT_VERSION)
        throw new Error(`Unsupported performance report version; expected ${REPORT_VERSION}`)
    if (
        !baseline.compatibility ||
        !candidate.compatibility ||
        !baseline.aggregate ||
        !candidate.aggregate ||
        !Object.keys(baseline.aggregate).length ||
        !Object.keys(candidate.aggregate).length
    ) {
        throw new Error("Only completed, non-empty benchmark reports can be compared")
    }
    if (
        Object.keys(baseline.compatibility).sort().join() !==
        Object.keys(candidate.compatibility).sort().join()
    ) {
        throw new Error("Compatibility fields differ; record a new baseline")
    }
    for (const key of Object.keys(baseline.compatibility) as (keyof Report["compatibility"])[]) {
        if (
            JSON.stringify(baseline.compatibility[key]) !==
            JSON.stringify(candidate.compatibility[key])
        ) {
            throw new Error(
                `Incompatible benchmark ${key}; run the same workload on the same machine`,
            )
        }
    }
    if (
        Object.keys(baseline.aggregate).sort().join() !==
        Object.keys(candidate.aggregate).sort().join()
    ) {
        throw new Error("Metric sets differ")
    }
}
