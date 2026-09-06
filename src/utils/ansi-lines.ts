import { ptyToJson } from "ghostty-opentui"
import { profile } from "./profiler"

export interface AnsiSpan {
    text: string
    fg?: string | null
    bg?: string | null
    flags?: number
    width?: number
}
export interface AnsiLine {
    spans: AnsiSpan[]
}

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 512
const cache = new Map<string, { lines: AnsiLine[]; bytes: number }>()
let retainedBytes = 0

/** Bounded reuse for rows which leave and re-enter the viewport. Colours resolve at render time. */
export function parseAnsiLines(content: string, cols = 9999): AnsiLine[] {
    if (!content) return []
    const key = `${cols}\0${content}`
    const cached = cache.get(key)
    if (cached) {
        cache.delete(key)
        cache.set(key, cached)
        return cached.lines
    }
    const end = profile("ptyToJson parse")
    const lines = ptyToJson(content, { cols, rows: 1 }).lines
    end(`${lines.length} lines from ${content.length} chars`)
    const bytes =
        key.length * 2 +
        lines.reduce(
            (sum, line) =>
                sum + 64 + line.spans.reduce((n, span) => n + 96 + span.text.length * 2, 0),
            0,
        )
    if (bytes <= MAX_BYTES) {
        while (cache.size && (retainedBytes + bytes > MAX_BYTES || cache.size >= MAX_ENTRIES)) {
            const oldest = cache.keys().next().value!
            retainedBytes -= cache.get(oldest)!.bytes
            cache.delete(oldest)
        }
        cache.set(key, { lines, bytes })
        retainedBytes += bytes
    }
    return lines
}
