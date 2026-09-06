/** Row offsets are independent of scrolling. The final offset is the total height. */
export function buildRowOffsets<T>(items: readonly T[], height: (item: T) => number): number[] {
    const offsets = [0]
    for (const item of items) {
        offsets.push(offsets[offsets.length - 1]! + Math.max(1, Math.ceil(height(item))))
    }
    return offsets
}

export function rowAtOffset(offsets: readonly number[], position: number): number {
    let low = 0
    let high = Math.max(0, offsets.length - 1)
    while (low < high) {
        const middle = (low + high + 1) >>> 1
        if (offsets[middle]! <= position) low = middle
        else high = middle - 1
    }
    return low
}

export function listWindow(
    offsets: readonly number[],
    scrollTop: number,
    viewportHeight: number,
    overscan = 8,
) {
    const count = Math.max(0, offsets.length - 1)
    const total = offsets[count] ?? 0
    const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - viewportHeight)))
    const from = Math.max(0, top - overscan)
    const to = Math.min(total, top + Math.max(1, viewportHeight) + overscan)
    const start = Math.min(count, rowAtOffset(offsets, from))
    const end = Math.min(count, rowAtOffset(offsets, Math.max(0, to - 1)) + 1)
    return { start, end, before: offsets[start] ?? 0, after: total - (offsets[end] ?? 0), from, to }
}
