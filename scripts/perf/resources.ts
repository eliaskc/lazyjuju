export interface ProcessTreeSample {
    at: number
    kajjiRssMiB: number
    treeRssMiB: number
    processCount: number
    sampleCostMs: number
}

export function parseProcessTree(
    text: string,
    rootPid: number,
): Omit<ProcessTreeSample, "at" | "sampleCostMs"> | null {
    const processes = new Map<number, { parent: number; rss: number }>()
    for (const line of text.split("\n")) {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/)
        if (match)
            processes.set(Number(match[1]), { parent: Number(match[2]), rss: Number(match[3]) })
    }
    if (!processes.has(rootPid)) return null
    const pids = new Set([rootPid])
    let changed = true
    while (changed) {
        changed = false
        for (const [pid, process] of processes) {
            if (!pids.has(pid) && pids.has(process.parent)) {
                pids.add(pid)
                changed = true
            }
        }
    }
    return {
        kajjiRssMiB: processes.get(rootPid)!.rss / 1024,
        treeRssMiB: [...pids].reduce((sum, pid) => sum + processes.get(pid)!.rss, 0) / 1024,
        processCount: pids.size,
    }
}

export function sampleResources(pid: number) {
    const samples: ProcessTreeSample[] = []
    let stopped = false
    let errors = 0
    let active: ReturnType<typeof Bun.spawn> | undefined
    let wake: (() => void) | undefined
    const task = (async () => {
        while (!stopped) {
            const startedAt = performance.timeOrigin + performance.now()
            const process = Bun.spawn(["ps", "-axo", "pid=,ppid=,rss="], {
                stdout: "pipe",
                stderr: "ignore",
            })
            active = process
            const timeout = setTimeout(() => process.kill(), 2000)
            try {
                const text = await new Response(process.stdout).text()
                const exit = await process.exited
                const at = performance.timeOrigin + performance.now()
                const result = exit === 0 ? parseProcessTree(text, pid) : null
                if (result) samples.push({ at, ...result, sampleCostMs: at - startedAt })
                else if (exit !== 0 && !stopped) errors++
            } finally {
                clearTimeout(timeout)
                active = undefined
            }
            if (!stopped)
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, 250)
                    wake = () => {
                        clearTimeout(timer)
                        resolve()
                    }
                })
        }
    })().catch(() => {
        errors++
        stopped = true
    })
    return {
        samples,
        async stop() {
            stopped = true
            wake?.()
            active?.kill()
            await task
            return { samples, errors }
        },
    }
}
