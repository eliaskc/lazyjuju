# Performance benchmarking

Use the real TUI benchmark to compare application changes and Bun/OpenTUI updates.
It measures startup and sustained navigation in generated or copied repositories.
It is a local test, not a CI speed threshold. Investigation leads and confirmed
findings are tracked separately in [PERFORMANCE-FINDINGS.md](PERFORMANCE-FINDINGS.md).

The report format starts at version 1. It separates content readiness from
highlighting and defaults to start/end-only screen checks.

## Quick start

Prepare a reusable repository **once**, outside the measured interval:

```sh
bun bench:prepare
bun bench:tui --output .kajji-benchmarks/baseline.json
# Change the application or dependency, then repeat the same command options.
bun bench:tui --output .kajji-benchmarks/candidate.json
bun bench:compare .kajji-benchmarks/baseline.json .kajji-benchmarks/candidate.json
```

The default fixture has 300 revisions, 10,000 tracked small files, 500 local
bookmarks with remote references, and a tip diff with 12 files × 1,500 lines.
Some diff lines are long enough to wrap. The history is linear; it does **not**
simulate every graph shape found in a real repository.

Defaults: 120×36 cells, textual unified diff with wrapping, dark theme, 40 inputs
per direction at 16 ms intervals, two down/up passes, one excluded warmup and
five measured processes **per scenario**. Scenarios are diff, log, and bookmarks.
Startup is measured in every process, before selecting the scenario's panel.
Scenario order rotates between repetitions. No benchmark runs concurrently with
another benchmark in this harness. During each burst, the default `--sample-ms 0`
captures the screen only at the start and end. Input and native frame timing
remain continuous.

The first pass tests first visits within a process. Later passes revisit the same
positions and include the effects of warmed application caches. Do not pool them.
The warmup is a separate process: its application caches do not survive.

For a short installation check:

```sh
bun bench:prepare --fixture .kajji-benchmarks/fixtures/small \
  --commits 100 --bookmarks 150 --files 300 --diff-files 3 --diff-lines 500
bun bench:tui --fixture .kajji-benchmarks/fixtures/small \
  --runs 1 --warmups 0 --passes 1 --steps 20
```

A short run checks the harness. It does not establish a performance baseline.

## Use GoodMorning or another real repository

```sh
bun bench:prepare \
  --source ~/sleepcycle/mobile/GoodMorning \
  --revision YOUR_LARGE_DIFF_REVISION \
  --fixture .kajji-benchmarks/fixtures/goodmorning

bun bench:tui --fixture .kajji-benchmarks/fixtures/goodmorning \
  --output .kajji-benchmarks/goodmorning-baseline.json
```

`--revision` is optional. It selects a revision **in the copy only**. Without it,
the copied working-copy revision is selected. Select a revision with a large diff
for diff tests; an empty diff cannot provide a useful scrolling measurement.
Keep the source still while copying, and do not fetch, build, or edit it during
preparation if you want a consistent reference state.

Use the default endpoint checks for timing comparisons. For a separate diagnostic
run, add `--sample-ms 128` to observe screen changes during scrolling. Do not
compare the two modes as if only application performance had changed.

Preparation never runs jj/Git against the source. It copies working files,
ignored files, `.jj`, and `.git`, then snapshots only the copy. This preserves
uncommitted content. It can use substantial time and disk space. Working-tree
symlinks are not followed. Linked jj workspaces, linked Git worktrees, metadata
symlinks, absolute/external Git stores, and object alternates are rejected.

Each run uses another independent copy and a private home directory. Copies use
copy-on-write where supported, never hard links. There are no fetch, push,
update-check, editor, or hook commands in the scenario. Authentication is not
inherited by the app. User Kajji/jj configuration is not used. The benchmark sets
`revsets.log = "ancestors(@)"` so the selected fixture revision is first in the log,
and disables the filesystem monitor; these are deliberate
controlled settings, not a reproduction of your personal configuration.

Do not edit a prepared fixture. Its operation, working-copy ID, working-file
content hash (including ignored files), and configuration identify the workload.
File edits and changed operations cause rejection. To select a different revision
or change the repository, prepare a new fixture. Recreating the same synthetic
content produces a new jj operation identity; reuse the original fixture for A/B.

Reports contain timestamps, numeric state, revision IDs, key names, cell hashes, and version
metadata, not source text, screenshots, or recordings. The fixture **does contain
private source**. Keep `.kajji-benchmarks/` local and do not upload it. Failed
reports can contain error paths. Temporary run copies are removed after each run.

## Test the interaction that matters

### Large diffs and file boundaries

The short line-scroll scenario is precise, but it covers a small region. Use a
long page-scroll run to cross file boundaries in the default large fixture:

```sh
bun bench:tui --scenarios diff --diff-input page --steps 300 \
  --output .kajji-benchmarks/diff-pages.json
bun bench:tui --scenarios diff --diff-input wheel --steps 300 \
  --output .kajji-benchmarks/diff-wheel.json
bun bench:tui --scenarios diff --layout split --cols 200 --steps 200 \
  --output .kajji-benchmarks/diff-split.json
```

`--diff-input line` sends `j`/`k`; `page` sends Ctrl+D/Ctrl+U; `wheel` sends real
SGR terminal wheel events at the center of the detail viewport. Terminal Control
1.2.1's typed mouse API has no wheel action, so wheel input uses its byte-write
API. It does not call a Kajji scroll method. Wheel acceleration is the app's own
behavior, not simulated trackpad momentum.

Use `--no-wrap` to test horizontal clipping instead of wrapping. Engine is fixed
to textual for these tests; structural and jj-formatter timing are not covered.
Choose a step count which fits the diff. Page/wheel step sizes can differ, so
these modes report actual movement but do not claim one response per input.
Their completion check uses a 400 ms position-quiet window; that window is **not**
added to the reported recovery time.

### Fast log and bookmark navigation

```sh
bun bench:tui --scenarios log,bookmarks --interval-ms 8
bun bench:tui --scenarios log --steps 80 --interval-ms 16
bun bench:tui --scenarios bookmarks --steps 160 --interval-ms 16
```

The default 40-step test stays within the initial log page. Longer runs also test
pagination. The fixture must have enough revisions/bookmarks. A run that reaches
a boundary or loses input is rejected rather than looking artificially fast.
The `.failed.json` report keeps the failed input schedule and frame trace.
Lower `--steps` for a baseline which excludes pagination; do not silently change
the baseline settings when comparing a candidate.

These scenarios change selection as a keyboard user does. They include the
associated detail requests, cancellation, parsing, syntax work, and rendering.
They do not isolate just the list drawing code.

## Measurements and boundaries

Two observers measure different things:

1. An opt-in application observer listens to OpenTUI's `frame` event, emitted
   after a successful native render. It records panel positions, stream readiness,
   diff readiness, syntax readiness/pending requests, and renderer FPS settings.
   It also timestamps input at the start of key dispatch. It never requests a
   frame or paces application input handling.
2. Terminal Control captures the actual emulated screen without an idle wait. It
   hashes only the target viewport, including cell styles. Selection changes can
   change backgrounds without changing text. Unrelated panel updates cannot
   satisfy the visible-movement check.

**Timing mode (`--sample-ms 0`, default):** exactly two screen captures per burst,
before input starts and after the final ready state. This checks visible change,
not visible update cadence. No periodic capture shares the input driver during
scrolling or recovery. Visible-gap and capture-interval metrics are omitted.

**Diagnostic mode (`--sample-ms 128`, for example):** also capture during the
burst. Visible-gap metrics are approximate diagnostics only. Capture and input
still share a driver; this mode has more observer interference. A second client
is not assumed to provide an independent session worker.

OpenTUI's event is an **output-frame boundary**, not proof that a physical terminal
has displayed pixels. The visible sampler provides independent checks, not exact
per-key display timestamps. Semantic snapshots are not substituted for screen
observations: semantic state alone would not prove that output was visible.

### Startup

Time starts immediately before the launch request to the already running driver.
This includes driver launch processing, a small PID/exec shell wrapper, Bun,
preload/imports, repository checks, and UI creation.

| Metric | Definition |
| --- | --- |
| `launchReturnedMs` | Driver launch request completed; not UI readiness |
| `firstContentObservedMs` | First nonblank terminal snapshot; an upper bound on first content paint |
| `firstContentLowerMs` | Previous blank snapshot request, or launch start |
| `firstContentUncertaintyMs` | Width of that observation interval |
| `firstOutputFrameMs` | First native output-frame event; can be blank |
| `logLoadedOutputMs` | First output frame after the initial log page stream completes |
| `bookmarksLoadedOutputMs` | First output frame after the bookmark stream completes, including empty lists |
| `diffLoadedOutputMs` | First output frame after the selected diff is supplied successfully, including empty diffs |
| `contentReadyOutputMs` | First output frame where log, bookmarks, and the selected fixture diff are loaded together, regardless of highlighting |
| `highlightedReadyOutputMs` | First output frame with that content loaded and the syntax worker ready with no pending token requests |
| `highlightingAfterContentMs` | Gap between those frames; not an isolated measurement of worker boot |
| `contentReadyObservedUpperMs`, `highlightedReadyObservedUpperMs` | Screen observations after each readiness milestone with panel headings present; include trace polling delay |

Use **`contentReadyOutputMs` as the headline startup metric**. It means initial
local content, not all repository history, offscreen highlighting, or optional
network metadata. The readiness conditions must hold in the same output frame;
the metric is not the maximum of independent earlier load timestamps.

Interaction tests still start after highlighting is ready and include final
syntax catch-up in recovery. A failed or stalled worker invalidates the run;
the error identifies initialization or pending tokenization rather than reporting
a generic startup failure. It does not silently count plain text as highlighted.

Startup screen observation remains enabled even in endpoint mode: 16 ms before
first content, then 32 ms when `--sample-ms 0`, otherwise the requested interval.
These constants are metadata, not aggregated performance metrics. First-content
timestamps cannot resolve sub-sample changes.

### Scrolling

Inputs have absolute deadlines. The sender does **not** wait for input
acknowledgements, screen changes, or an idle interval before the next input.

| Metric | Definition |
| --- | --- |
| `inputToOutputP50/P95/P99/MaxMs` | For line navigation, send → first output frame that includes the requested position |
| `inputQueueP95/MaxMs` | Send → application key handler, when the complete key sequence can be matched |
| `coalescedInputs` | Inputs represented together in frames; not automatically dropped input |
| `updateGapP95/MaxMs` | Time between output frames with actual target-position changes, including the initial response |
| `gapsOver50/100/250Ms` | Count of long position-update gaps |
| `recoveryMs` | Last input → first ready output frame at the final position |
| `sampledVisibleUpdateGapP95/MaxMs` | Diagnostic mode only: sampled cell-change gaps; approximate, can include syntax/style changes |
| `moved`, `outputUpdates`, `visibleChanges` | Work and observable progress checks, not lower-is-better scores |
| `schedulerLatenessP95/MaxMs` | Actual send minus planned send time |
| `sendAckP95Ms` | Driver acknowledgement cost, not application latency |
| `captureIntervalP95/MaxMs` | Diagnostic mode only: visible observer resolution |
| `captureCostP95Ms` | Screen request cost, including endpoint captures |
| `eventLoopDelayMaxMs` | Delay of a 100 ms application timer during the burst; diagnostic only |

Idle frames do not count as progress. The settled idle tail is excluded from
output-update gaps. Recovery includes the final detail and syntax catch-up.
Multiple inputs can be represented by one frame; that is recorded explicitly.
Keyboard runs must move exactly the requested number of positions in the correct
direction. Page/wheel checks are weaker: positive directional movement and
visible change are required, but exact input-to-position attribution is absent.

Frame gaps reflect both renderer pacing and stalls. A 33 ms gap is not itself a
regression in a renderer targeting 30 FPS. The trace records target/max FPS.
Subprocess and controller timestamps use `performance.timeOrigin + now()` on the
same machine. The analysis rejects materially negative input/frame ordering;
do not use these measurements to claim sub-millisecond differences.

A sender more than `max(20 ms, input interval)` late invalidates the run. Do not
lower the input rate only for a slow candidate. If the sampler falls behind,
inspect its interval/cost metrics before interpreting visible gaps.

### Resources and observer cost

The application samples RSS, cumulative process CPU, and event-loop delay every
100 ms. An external asynchronous `ps` sampler measures Kajji and descendant RSS
at approximately 250 ms intervals. It does not synchronously stop input sending.
It reads the process table once to discover descendants. A narrower query is not
yet used: its extra descendant-discovery queries need measurement before they
can be assumed cheaper.

`peakRssMiB` is sampled Kajji RSS; `peakTreeRssMiB` includes observed descendants.
`cpuMs` is Kajji CPU time, **not** summed subprocess CPU. `rssGrowthMiB` compares
the sample near full UI readiness with the ending sample; growth is not proof of
a leak. Cache and allocator retention are expected. Short-lived children and
short memory peaks can fall between samples. Raw resource samples, sample errors,
and sample costs are retained.

The observer has a cost. Application events are buffered and written every
100 ms. Writes are asynchronous and drained before shutdown. `observerFlushMaxMs`
measures serialization/enqueue cost; `observerWriteMaxMs` measures asynchronous
write wall time, which is not time spent blocking the application. Screen sampling
and `ps` consume additional CPU. Keep these settings fixed in an A/B comparison.
For an observer-sensitivity check, repeat with `--sample-ms 64` or `128`. This is
a different workload and is not accepted as a direct comparison. No physical
terminal rendering cost, thermal state, or total observer tax is inferred.

## Reproducible comparisons

- Keep the same machine, power mode, terminal dimensions, fixture, and settings.
  Stop builds, other benchmarks, and CPU-heavy applications. Keep the machine on
  power. The harness does not control thermal throttling.
- Use several runs and repeat **A → B → A**. A single run is not evidence.
- Separate first visits from repeated visits. Reports aggregate each per-run
  statistic independently; they do not pool all frames and call them independent
  trials. Percentiles use nearest-rank selection. With 40 inputs, p99 is the max.
- Compare startup, tail latency, long gaps, recovery, and work completed together.
  A lower median with longer stalls is not necessarily an improvement.
- Inspect raw `runs[].bursts[]` and `runs[].trace` to locate a long gap, then use
  profiling/microbenchmarks to find its cause. Do not use profiled runs as timing
  baselines.

Comparison rejects different fixture identities, viewport/input settings,
configuration, harness code, controller Bun version, Terminal Control binaries,
jj/Git executable identities, machine/OS, or metric sets. OpenTUI and the **target** Bun version
are intentionally allowed to differ and are recorded. Kajji revision, local diff
hash, lockfile hash, target Bun binary hash, and exact OpenTUI versions are also
recorded. A harness code change requires a new baseline, except usage text in
`scripts/perf/help.txt`. Executable CLI policy remains hashed.

PATH itself is not a compatibility field. The resolved jj/Git paths and versions
are recorded as metadata; binary content hashes and versions define compatibility.
Runs pin those executables in a private bin directory and reject changed binaries
at completion. Reordering PATH without changing the selected executable contents
does not invalidate a baseline. Use direct installed executables, not launcher
scripts which choose another binary by working directory. Kernel release remains
part of machine compatibility, so an OS update requires a new baseline.

The comparison prints per-run medians and min–max ranges. Range overlap is a
warning about variation, **not** a statistical significance test. Positive
percentages mean larger values; work counters are not lower-is-better metrics.
Use `bun bench:compare A.json B.json --all` for every metric.

### Compare Bun versions without changing the controller

Keep a fixed Bun executable for the benchmark script and vary `--bun`, which
selects only the application runtime:

```sh
/path/to/controller-bun scripts/benchmark.ts run --bun /path/to/bun-A \
  --output .kajji-benchmarks/bun-A.json
/path/to/controller-bun scripts/benchmark.ts run --bun /path/to/bun-B \
  --output .kajji-benchmarks/bun-B.json
```

For OpenTUI updates, keep Bun and the driver fixed, change the OpenTUI packages,
and repeat against the same fixture. Both installed OpenTUI package versions and
the lockfile hash are retained. Terminal Control is pinned to 1.2.1. Driver updates
can change measurement overhead and require a fresh baseline plus E2E checks.

### Cache policy

These are fresh-process, **prepared-working-copy** measurements, not cold-disk
measurements. Files are copied with timestamps preserved where possible. Before
timing, `jj status` refreshes copy-induced filesystem bookkeeping; the operation
must remain unchanged. Fixture content validation and copying also warm filesystem
caches. The harness never drops OS caches or claims cold startup. Measuring
startup immediately after a large external working-tree change needs a separate
fixture/scenario; this suite does not currently cover that condition.

## Validation and scope

```sh
bun test tests/unit/benchmark.test.ts
bun bench:check
bun check
bun test:e2e
```

Unit tests cover percentiles, readiness, coalesced input attribution, idle-gap
exclusion, invalid movement/clock/visual checks, comparison compatibility,
process-tree parsing, configuration validity, fixture edits, and copy isolation.
The E2E contract test covers endpoint and periodic capture modes, both readiness
milestones, and all three panels. Immediate-input tests also cover the first visible
modal cursor and text-plus-Enter in one packet. The existing idle waits test
completed-state correctness; they are not evidence that fast input is safe.
Use small live runs to check line, wheel, page, and split behavior after changing
the harness. Do not run E2E tests concurrently with measured benchmarks.

`bun test:bench` runs complementary parser/token/diff-data microbenchmarks. Despite the older “diff rendering” filename,
those tests do not measure sustained interaction with the complete terminal UI.

Current limits: linear synthetic history, textual diff engine, no actual trackpad
momentum, no remote-network scenarios, no physical-display timing, and no true
cold-cache or external-change startup test. Use a copied repository for graph and
file types which the synthetic fixture does not represent.
