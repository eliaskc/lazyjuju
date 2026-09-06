import { isDeepStrictEqual } from "node:util"

/** Retain only the current collection; no historical rows or unbounded key cache. */
export function retainEqualItems<T>(
    previous: readonly T[],
    next: readonly T[],
    key: (item: T) => string,
): readonly T[] {
    const byKey = new Map(previous.map((item) => [key(item), item]))
    return next.map((item) => {
        const old = byKey.get(key(item))
        return old !== undefined && isDeepStrictEqual(old, item) ? old : item
    })
}
