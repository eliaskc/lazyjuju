// Rows contain commit ID, space-separated parent IDs, then remote bookmark names.
// NUL separators are safe for Git branch names.
export function nearestRemoteAncestorBookmarks(output: string, head: string): string[] {
    const rows = output
        .trimEnd()
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\0"))
    const graph = new Map(
        rows.map(([id, parents, ...names]) => [
            id ?? "",
            { parents: parents?.split(" ").filter(Boolean) ?? [], names },
        ]),
    )
    const start = rows[0]?.[0]
    if (!start) return []
    const visited = new Set([start])
    let frontier = graph.get(start)?.parents ?? []
    while (frontier.length > 0) {
        const next: string[] = []
        const names = new Set<string>()
        for (const id of frontier) {
            if (visited.has(id)) continue
            visited.add(id)
            const row = graph.get(id)
            for (const name of row?.names ?? []) {
                if (name && name !== head) names.add(name)
            }
            next.push(...(row?.parents ?? []))
        }
        if (names.size > 0) return [...names].sort()
        frontier = next
    }
    return []
}
