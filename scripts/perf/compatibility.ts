import { readFileSync, realpathSync } from "node:fs"
import { join } from "node:path"
import { hash } from "./fixture"

export function executableIdentity(name: string, path = process.env.PATH) {
    const executable = Bun.which(name, { PATH: path })
    if (!executable) throw new Error(`Cannot find ${name} executable`)
    const resolved = realpathSync(executable)
    return { path: resolved, sha256: hash(readFileSync(resolved)) }
}

// Keep executable CLI policy covered. Usage text lives in help.txt, which is
// deliberately excluded; changing instructions must not reset a baseline.
export function harnessFingerprint(root: string): string {
    return hash(
        [
            "scripts/benchmark.ts",
            "scripts/perf/analysis.ts",
            "scripts/perf/compatibility.ts",
            "scripts/perf/fixture.ts",
            "scripts/perf/run.ts",
            "scripts/perf/resources.ts",
            "scripts/perf/types.ts",
            "src/utils/benchmark.ts",
        ]
            .map((path) => readFileSync(join(root, path), "utf8"))
            .join("\n"),
    )
}
