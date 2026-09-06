/** Compact source-row spans. No object is allocated for an offscreen display row. */
export interface RowSpan<Row> {
    row: Row
    height: number
}

export function buildRowWindow<Row, Wrapped>(
    rows: readonly Row[],
    getHeight: (row: Row) => number,
    materialize: (row: Row, wrapIndex: number) => Wrapped,
) {
    const spans: RowSpan<Row>[] = []
    const offsets = new Float64Array(rows.length + 1)
    for (const [index, row] of rows.entries()) {
        const height = Math.max(1, getHeight(row))
        spans.push({ row, height })
        offsets[index + 1] = offsets[index]! + height
    }
    const length = offsets[rows.length]!
    let cachedStart = 0
    let cached: Wrapped[] = []

    const sourceIndex = (displayIndex: number) => {
        let low = 0
        let high = rows.length
        while (low < high) {
            const mid = (low + high) >>> 1
            if (offsets[mid + 1]! <= displayIndex) low = mid + 1
            else high = mid
        }
        return low
    }

    return {
        spans,
        offsets,
        length,
        // Metadata lookup must not prepare emphasis or allocate a wrapped row.
        at(index: number) {
            if (index < 0 || index >= length) return undefined
            return spans[sourceIndex(index)]
        },
        slice(start: number, end: number): Wrapped[] {
            start = Math.max(0, Math.floor(start))
            end = Math.min(length, Math.ceil(end))
            const result: Wrapped[] = []
            let source = sourceIndex(start)
            for (let index = start; index < end; index++) {
                while (offsets[source + 1]! <= index) source++
                const wrapped =
                    cached[index - cachedStart] ??
                    materialize(rows[source]!, index - offsets[source]!)
                result.push(wrapped)
            }
            // Preserve overlap identity without retaining previous viewport rows.
            cachedStart = start
            cached = result
            return result
        },
    }
}

/** Exclude the parser's terminal newline without scanning/copying the line. */
export function lineContentLength(content: string): number {
    return content.length - (content.endsWith("\n") ? 1 : 0)
}
