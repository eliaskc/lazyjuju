import type { ProcessTreeSample } from "./resources"

export type Scenario = "diff" | "log" | "bookmarks"
export type State = Record<string, number | string | boolean | null>
export interface FrameEvent {
    kind: "frame"
    at: number
    input: number
    state: State
}
export interface KeyEvent {
    kind: "key"
    at: number
    input: number
    key: string
}
export interface ResourceEvent {
    kind: "resource"
    at: number
    rssMiB: number
    eventLoopDelayMs: number
    observerFlushMs: number
    observerWriteMs: number
    cpu: { user: number; system: number }
}
export type TraceEvent = FrameEvent | KeyEvent | ResourceEvent
export interface InputSample {
    due: number
    sent: number
    ack: number
    direction: "down" | "up"
}
export interface VisibleSample {
    requested: number
    at: number
    hash: string
}
export interface Summary {
    count: number
    median: number
    p95: number
    p99: number
    min: number
    max: number
}
export interface Burst {
    sampleMs: number
    direction: "down" | "up"
    startedAt: number
    endedAt: number
    startPosition: number
    endPosition: number
    inputs: InputSample[]
    visible: VisibleSample[]
    metrics: Record<string, number>
}
export interface Run {
    scenario: Scenario
    iteration: number
    startup: Record<string, number>
    bursts: Burst[]
    trace: TraceEvent[]
    processTree: ProcessTreeSample[]
    metrics: Record<string, number>
}
export interface FixtureManifest {
    version: 1
    id: string
    kind: "synthetic" | "copy"
    operation: string
    workingCopy: string
    treeHash: string
    settings: Record<string, string | number>
}
export interface Settings {
    scenarios: Scenario[]
    runs: number
    warmups: number
    steps: number
    intervalMs: number
    passes: number
    sampleMs: number
    cols: number
    rows: number
    diffInput: "line" | "page" | "wheel"
    layout: "unified" | "split"
    wrap: boolean
}
export const REPORT_VERSION = 1

export interface Report {
    version: typeof REPORT_VERSION
    createdAt: string
    compatibility: {
        fixture: string
        settings: Omit<Settings, "runs" | "warmups">
        config: string
        platform: string
        cpu: string
        jj: string
        git: string
        terminalControl: string
        harness: string
        driverBun: string
    }
    metadata: Record<string, unknown>
    runs: Run[]
    aggregate: Record<string, Summary>
}
