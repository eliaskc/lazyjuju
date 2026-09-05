#!/usr/bin/env bun
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { cpus, hostname, release, tmpdir, totalmem } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { resolveTerminalControlBinary } from "@kitlangton/terminal-control"
import { aggregate, assertCompatible } from "./perf/analysis"
import { executableIdentity, harnessFingerprint } from "./perf/compatibility"
import { command, controlledConfig, hash, loadFixture, prepareFixture } from "./perf/fixture"
import {
    BenchmarkFailure,
    firstContentSampleMs,
    runScenario,
    startupReadySampleMs,
} from "./perf/run"
import { REPORT_VERSION, type Report, type Run, type Scenario, type Settings } from "./perf/types"

const root = resolve(import.meta.dir, "..")
const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
        help: { type: "boolean", short: "h" },
        fixture: { type: "string", default: ".kajji-benchmarks/fixtures/stress" },
        source: { type: "string" },
        revision: { type: "string" },
        commits: { type: "string", default: "300" },
        bookmarks: { type: "string", default: "500" },
        files: { type: "string", default: "10000" },
        "diff-files": { type: "string", default: "12" },
        "diff-lines": { type: "string", default: "1500" },
        runs: { type: "string", default: "5" },
        warmups: { type: "string", default: "1" },
        steps: { type: "string", default: "40" },
        "interval-ms": { type: "string", default: "16" },
        passes: { type: "string", default: "2" },
        "sample-ms": { type: "string", default: "0" },
        cols: { type: "string", default: "120" },
        rows: { type: "string", default: "36" },
        scenarios: { type: "string", default: "diff,log,bookmarks" },
        "diff-input": { type: "string", default: "line" },
        layout: { type: "string", default: "unified" },
        "no-wrap": { type: "boolean", default: false },
        bun: { type: "string", default: process.execPath },
        output: { type: "string" },
        all: { type: "boolean" },
    },
})
const action = positionals[0]
if (values.help || !action) {
    console.log(readFileSync(join(import.meta.dir, "perf/help.txt"), "utf8"))
    process.exit(0)
}
const integer = (key: keyof typeof values, min = 1) => {
    const result = Number(values[key])
    if (!Number.isSafeInteger(result) || result < min)
        throw new Error(`--${key} must be an integer >= ${min}`)
    return result
}
const important = (key: string) =>
    values.all ||
    /firstContentObservedMs|contentReadyOutputMs|highlightedReadyOutputMs|inputToOutputP95Ms|inputToOutputMaxMs|updateGapMaxMs|gapsOver100Ms|recoveryMs|peakRssMiB|schedulerLatenessMaxMs/.test(
        key,
    )

if (action === "prepare") {
    const fixture = prepareFixture(
        resolve(values.fixture!),
        {
            commits: integer("commits", 2),
            bookmarks: integer("bookmarks"),
            files: integer("files"),
            diffFiles: integer("diff-files"),
            diffLines: integer("diff-lines"),
        },
        values.source ? resolve(values.source) : undefined,
        values.revision,
    )
    console.log(
        `Fixture prepared: ${resolve(values.fixture!)}\nIdentity: ${fixture.id}\nKeep this fixture unchanged for comparisons.`,
    )
} else if (action === "compare") {
    if (positionals.length !== 3)
        throw new Error("Usage: bun bench:compare BASELINE.json CANDIDATE.json")
    const baseline = JSON.parse(readFileSync(resolve(positionals[1]!), "utf8")) as Report
    const candidate = JSON.parse(readFileSync(resolve(positionals[2]!), "utf8")) as Report
    assertCompatible(baseline, candidate)
    console.log("Per-run metric medians; brackets show min–max across process runs.")
    console.log(`Bun: ${baseline.metadata.bunVersion} -> ${candidate.metadata.bunVersion}`)
    console.log(
        `OpenTUI: ${JSON.stringify(baseline.metadata.openTui)} -> ${JSON.stringify(candidate.metadata.openTui)}\n`,
    )
    for (const [name, before] of Object.entries(baseline.aggregate)) {
        if (!important(name)) continue
        const after = candidate.aggregate[name]!
        const delta = before.median
            ? `${((after.median / before.median - 1) * 100).toFixed(1)}%`
            : "n/a"
        const overlap = before.min <= after.max && after.min <= before.max
        console.log(
            `${name}\n  ${before.median.toFixed(2)} [${before.min.toFixed(2)}–${before.max.toFixed(2)}] -> ${after.median.toFixed(2)} [${after.min.toFixed(2)}–${after.max.toFixed(2)}]  ${delta}${overlap ? "  ranges overlap" : ""}`,
        )
    }
    console.log(
        "\nPositive percentages mean larger values, not always worse. Repeat A/B/A runs before drawing conclusions. Use --all for all metrics.",
    )
} else if (action === "run") {
    const scenarios = values.scenarios!.split(",") as Scenario[]
    if (
        !scenarios.length ||
        new Set(scenarios).size !== scenarios.length ||
        scenarios.some((s) => !["diff", "log", "bookmarks"].includes(s))
    )
        throw new Error("Invalid --scenarios")
    const diffInput = values["diff-input"] as Settings["diffInput"]
    if (!["line", "page", "wheel"].includes(diffInput)) throw new Error("Invalid --diff-input")
    const layout = values.layout as Settings["layout"]
    if (!["unified", "split"].includes(layout)) throw new Error("Invalid --layout")
    const settings: Settings = {
        scenarios,
        diffInput,
        layout,
        wrap: !values["no-wrap"],
        runs: integer("runs"),
        warmups: integer("warmups", 0),
        steps: integer("steps"),
        intervalMs: integer("interval-ms"),
        passes: integer("passes"),
        sampleMs: integer("sample-ms", 0),
        cols: integer("cols", 80),
        rows: integer("rows", 24),
    }
    const fixtureRoot = resolve(values.fixture!)
    const fixture = loadFixture(fixtureRoot)
    const bun = values.bun!.includes("/") ? resolve(values.bun!) : Bun.which(values.bun!)
    if (!bun || !existsSync(bun)) throw new Error("Cannot find requested Bun binary")
    const version = (name: string) =>
        JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8"))
            .version as string
    const jj = executableIdentity("jj")
    const git = executableIdentity("git")
    const jjVersion = command(root, [jj.path, "--version"])
    const gitVersion = command(root, [git.path, "--version"])
    const createdAt = new Date().toISOString()
    // Snapshot before recording @, then reject edits made during a run.
    const codeDiffHash = hash(command(root, ["jj", "diff", "--git"]))
    const lockHash = hash(readFileSync(join(root, "bun.lock")))
    const { runs: _runs, warmups: _warmups, ...workload } = settings
    const report: Report = {
        version: REPORT_VERSION,
        createdAt,
        compatibility: {
            fixture: fixture.id,
            settings: workload,
            config: hash(
                JSON.stringify({
                    kajji: controlledConfig,
                    jjRevset: "ancestors(@)",
                    fsmonitor: "none",
                }),
            ),
            platform: `${process.platform}-${process.arch}-${release()}-${hash(hostname()).slice(0, 12)}`,
            cpu: `${cpus()[0]?.model}:${cpus().length}`,
            jj: `${jjVersion}:${jj.sha256}`,
            git: `${gitVersion}:${git.sha256}`,
            terminalControl: hash(readFileSync(resolveTerminalControlBinary())),
            driverBun: `${Bun.version}:${hash(readFileSync(process.execPath))}`,
            harness: harnessFingerprint(root),
        },
        metadata: {
            tools: { jj: { ...jj, version: jjVersion }, git: { ...git, version: gitVersion } },
            observation: {
                mode: settings.sampleMs === 0 ? "endpoints" : "periodic",
                firstContentSampleMs,
                startupReadySampleMs: settings.sampleMs || startupReadySampleMs,
            },
            revision: command(root, [
                "jj",
                "--ignore-working-copy",
                "log",
                "-r",
                "@",
                "--no-graph",
                "-T",
                "commit_id",
            ]),
            diffHash: codeDiffHash,
            bunVersion: command(root, [bun, "--version"]),
            bunBinaryHash: hash(readFileSync(bun)),
            driverBunVersion: Bun.version,
            openTui: { core: version("@opentui/core"), solid: version("@opentui/solid") },
            lockHash,
            terminalControlVersion: version("@kitlangton/terminal-control"),
            terminalControlBinaryVersion: command(root, [
                resolveTerminalControlBinary(),
                "--version",
            ]),
            totalMemoryGiB: totalmem() / 1073741824,
            settings,
            fixture,
            cachePolicy:
                "fresh process and independent repository copy; jj status primes snapshot metadata before launch; filesystem caches uncontrolled; warmup runs excluded",
            measurement:
                "native output-frame events plus sampled terminal cells; not physical terminal presentation",
        },
        runs: [],
        aggregate: {},
    }
    const output = resolve(
        values.output ?? join(root, ".kajji-benchmarks", `${createdAt.replace(/[:.]/g, "-")}.json`),
    )
    if (existsSync(output)) throw new Error(`Report already exists: ${output}`)
    const temporary = mkdtempSync(join(tmpdir(), "kajji-perf-"))
    try {
        for (let iteration = -settings.warmups; iteration < settings.runs; iteration++) {
            // Rotate scenario order across repetitions to reduce order bias.
            const offset = (iteration + settings.warmups) % scenarios.length
            const order = [...scenarios.slice(offset), ...scenarios.slice(0, offset)]
            for (const scenario of order) {
                console.log(
                    `${iteration < 0 ? "Warmup" : `Run ${iteration + 1}/${settings.runs}`} ${scenario}: preparing independent copy...`,
                )
                const run: Run = await runScenario(
                    root,
                    fixtureRoot,
                    fixture,
                    join(temporary, "run"),
                    scenario,
                    iteration,
                    settings,
                    bun,
                    { jj: jj.path, git: git.path },
                )
                console.log(
                    `  Content ready: ${run.startup.contentReadyOutputMs!.toFixed(1)} ms; highlighted: ${run.startup.highlightedReadyOutputMs!.toFixed(1)} ms; first-pass down max update gap: ${run.bursts[0]!.metrics.updateGapMaxMs!.toFixed(1)} ms`,
                )
                if (iteration >= 0) report.runs.push(run)
            }
        }
        if (
            hash(command(root, ["jj", "diff", "--git"])) !== codeDiffHash ||
            hash(readFileSync(join(root, "bun.lock"))) !== lockHash ||
            hash(readFileSync(bun)) !== report.metadata.bunBinaryHash ||
            hash(readFileSync(jj.path)) !== jj.sha256 ||
            hash(readFileSync(git.path)) !== git.sha256
        ) {
            throw new Error(
                "Application code, dependencies, or target Bun changed during the benchmark",
            )
        }
        loadFixture(fixtureRoot)
        report.aggregate = aggregate(report.runs)
        mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
        writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" })
        console.log(`\nValid report: ${output}`)
    } catch (error) {
        // A failed workload must not produce a report which looks comparable.
        const failure = `${output}.${process.pid}-${Date.now()}.failed.json`
        mkdirSync(dirname(failure), { recursive: true, mode: 0o700 })
        writeFileSync(
            failure,
            JSON.stringify(
                {
                    version: REPORT_VERSION,
                    valid: false,
                    metadata: report.metadata,
                    compatibility: report.compatibility,
                    completedRuns: report.runs,
                    error: String(error),
                    diagnostic: error instanceof BenchmarkFailure ? error.diagnostic : undefined,
                },
                null,
                2,
            ) + "\n",
            { mode: 0o600 },
        )
        console.error(`Invalid run. Diagnostic report: ${failure}`)
        console.error(String(error))
        process.exitCode = 1
    } finally {
        rmSync(temporary, { recursive: true, force: true })
    }
} else {
    throw new Error(`Unknown benchmark command: ${action}`)
}
