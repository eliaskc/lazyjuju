# Performance improvement plan

Status: P01 implemented and measured. P02–P16 remain open.

Investigated on 2026-09-06 against `4faaf28f` (clean working copy).
See [BENCHMARKING.md](BENCHMARKING.md) for measurement rules and
[PERFORMANCE-FINDINGS.md](PERFORMANCE-FINDINGS.md) for earlier observations.
This document is the implementation checklist. Do not create GitHub issues from
it unless requested.

## Goal and order

Make processing, component creation, and rendering depend on visible content
where possible, rather than on all loaded content. Give the current selection
priority over obsolete requests. Keep repeated visits fast without unbounded
memory growth.

The order below is a recommendation based on **expected total benefit in daily
use**, not benefit per unit of implementation effort. It assumes frequent
revision navigation in large repositories. It is not a measured ranking of
completed alternatives. Very large diffs can make P02–P04 more important than
P01. Expensive working-tree scans can make P05 the largest improvement.

**Correctness gate:** fix the dropped-input part of P08 before using pagination
runs to compare performance. Fewer applied inputs must never count as a speed
improvement. This gate can be done before the impact-ranked work below.

## Ordered checklist

Mark an item complete only after its acceptance checks pass. If a proposed
change is rejected after measurement, record that decision instead of marking
an optimization as delivered.

- [x] **P01 — Coordinated, cancellable, cached detail loading**
- [ ] **P02 — Virtualize log, bookmark, file, and summary lists**
- [ ] **P03 — Remove full-diff work from scroll updates**
- [ ] **P04 — Limit word-diff and wrapped-row preparation to needed content**
- [ ] **P05 — Coordinate working-copy snapshots and repository reads**
- [ ] **P06 — Reduce first-use syntax cost; compare regex engines**
- [ ] **P07 — Parse and publish bookmark streams incrementally**
- [ ] **P08 — Preserve log movement and improve pagination**
- [ ] **P09 — Target syntax updates and prioritize visible requests**
- [ ] **P10 — Remove quadratic file-tree construction**
- [ ] **P11 — Stream large diffs through a bounded preparation pipeline**
- [ ] **P12 — Reuse diff information when loading the file panel**
- [ ] **P13 — Separate PR metadata loading from bookmark stream updates**
- [ ] **P14 — Measure and reduce work before the first UI frame**
- [ ] **P15 — Bound structural-diff processing**
- [ ] **P16 — Close benchmark and fast-input coverage gaps**

P16 is also a requirement throughout the work: add the relevant regression test
with each change, rather than waiting until the end.

## Evidence and limits

### Live TUI checks

The investigation used Bun 1.4.1 on macOS arm64. These were single diagnostic
runs, not a statistical baseline. They launched the source application through
the benchmark harness, not the installed compiled release. Prepared fixtures
and OS filesystem caches were warm; these were not cold-disk measurements.

| Check | Observation |
| --- | --- |
| Small-fixture log, 80 Down inputs at 16 ms | All 80 inputs were sent and received; selection moved from 0 to 69. Final loaded count was 101. Maximum sender lateness was 1.37 ms. The run failed correctly. |
| Stress-fixture startup | Content ready at 1,580 ms; highlighting ready at 2,330 ms; gap 750 ms. Initial loaded log count was 100, despite an initial limit of 50. |
| Stress-fixture diff, 40 Down inputs at 16 ms | All 40 positions applied; input-to-output p95 was 18.2 ms; maximum position-update gap was 19.7 ms. This short test passed. |

The stress fixture had 300 revisions, 500 local bookmarks with remote entries,
10,000 tracked files, and a tip diff of 12 files × 1,500 lines. Tracked-file count
is not changed-file count. The passing short diff test does not establish
performance across file boundaries or on much larger diffs.

Commands used, for existing prepared fixtures:

```sh
bun bench:tui --fixture .kajji-benchmarks/fixtures/feedback-small \
  --scenarios log --runs 1 --warmups 0 --passes 1 \
  --steps 80 --interval-ms 16 --output /tmp/kajji-perf-audit-log.json

bun bench:tui --fixture .kajji-benchmarks/fixtures/stress \
  --scenarios diff --runs 1 --warmups 0 --passes 1 \
  --steps 40 --interval-ms 16 --output /tmp/kajji-perf-audit-diff.json
```

Use the preparation guide if these local fixtures do not exist. Recreating a
fixture does not reproduce its original operation identity.

### Focused microbenchmarks

These measured isolated functions, not full application response time.
Measurements below are medians after warmup unless stated otherwise. Scripts
and raw reports were temporary files under `/tmp/kajji-perf-audit*`; they are not
a permanent test suite. Rebuild these cases as tests under P16 before relying on
them for future comparisons.

| Case | Observation |
| --- | --- |
| 10,000 synthetic bookmark rows in 16 KiB chunks | Current cumulative parse: 175 ms. Parse only new complete lines: 2.8 ms. Excludes state updates and rendering. |
| Offset work for 100,000 / 500,000 wrapped rows | Hunk offsets, file offsets, and trailing-space calculation: 2.9 / 12.4 ms per call sequence. |
| Deletion-only position lookup, 100,000 / 500,000 rows | 6.9 / 31.8 ms per lookup. The fixture had 1,000 rows per file and no new-side line numbers. |
| One changed-line pair, 500 / 1,000 unrelated words on each side | Word diff: 44.7 / 181.8 ms. This is a difficult input, not a typical source line. |
| Parse and flatten 50,000 / 200,000 added TypeScript lines | 7.0 / 25.9 ms. Excludes wrapping, word differences, components, syntax, and terminal output. |
| Build a tree with 10,000 / 20,000 sibling files | 158 / 580 ms. Flat ordering also built the tree and took 163 / 590 ms. |

### Regex-engine experiment

Shiki performs syntax highlighting. It uses TextMate grammars and a regex engine
to obtain tokens, then applies theme colours. Oniguruma is a candidate **regex
engine within Shiki**, not a replacement syntax highlighter.

A temporary copy of `src/diff/syntax-worker.ts` changed the JavaScript regex
engine to Shiki's Oniguruma/WASM engine. Languages and themes were unchanged.
Each engine was tested with three fresh workers. Each worker processed 100
unique TypeScript lines, then another 100 unique lines after initialization.
The OS cache was not cleared; this was not a randomized full-app A/B test.

| Stage | Current JavaScript engine | Oniguruma candidate |
| --- | --- | --- |
| Worker creation to ready | 92–97 ms | 96–103 ms |
| Ready to first TypeScript token response | 623–636 ms | 28–33 ms |
| Ready to first 100 token responses | 711–724 ms | 35–40 ms |
| Next 100 token responses | 4.8–5.4 ms | 4.2–5.3 ms |

This is a strong first-use lead. It does **not** prove a 600 ms reduction in
whole-app startup, explain all languages, or validate compiled binary support.
No engine change was made in the repository.

## P01 — Coordinated, cancellable, cached detail loading

**Expected benefit:** largest general improvement to repeated revision browsing.

**Finding:** `MainArea` starts textual diff requests without an abort signal.
Selection changes reject old results but do not stop their subprocesses.
`parseDiffString()` runs before the stale-result check. Commit-description and
several file/filter/visual-range reads also use request tokens without cancelling
obsolete work. There is no reusable completed-diff/description cache in these
selection paths. The existing process service already supports interruption.

**Change:**
- [x] Cancel obsolete diff and description requests on selection change and cleanup.
- [x] Check request identity before parsing or publishing results.
- [x] Keep selection immediate; coordinate and bound expensive detail requests.
- [x] Add size-bounded caches and share in-flight reads for repeated targets.
- [x] Use resolved full commit IDs and relevant options as cache keys. Do not use
  change IDs or mutable bookmark names alone. Define refresh/repository-change
  invalidation for symbolic targets and multi-revision selections.
- [x] Apply cancellation to file, filter-preview, and visual-range reads where
  their results are no longer needed. Keep intentional range caching bounded.

**Accept when:** rapid A → B → C navigation does not parse or publish obsolete
results; old children are reaped; revisiting unchanged content avoids repeated
work; changed working-copy/bookmark targets remain correct; memory stays bounded.
Compare first visits and revisits separately, including final detail recovery.

**Start at:** `src/components/panels/MainArea.tsx` (diff fetch effect),
`src/context/sync.tsx` (details, file reads, visual ranges),
`src/components/panels/LogPanel.tsx` (filter previews),
`src/application/client.ts`, `src/process/app-process.ts`.

## P02 — Virtualize log, bookmark, file, and summary lists

**Finding:** the log, operation log, bookmarks, file tree, and diff file-stat
summary create components for all loaded entries. Increasing a display limit is
not virtualization. OpenTUI's viewport culling limits visible render work but
does not remove already-created Solid components and renderables. `AnsiText`
parses its complete input before any `maxLines` limit and can mount all lines.

**Change:**
- [ ] Render visible slices with spacers and bounded overscan.
- [ ] Use row-height prefix sums for variable-height log/operation-log entries.
  Replace per-selection summation of preceding entry heights.
- [ ] Virtualize or collapse large file-stat summaries without hiding access to files.
- [ ] Cover the jj-formatter path, not only the custom diff views.
- [ ] Preserve unchanged row identity across stream batches and refreshes.
- [ ] Cache stable display widths/ANSI parsing where useful. Do not parse or
  recrop every offscreen row on horizontal movement.

**Accept when:** mounted row counts remain proportional to viewport size as
loaded data grows. Test keyboard/mouse movement, resize, horizontal scrolling,
filtering, multi-selection, graph gutters, and file-tree collapse. Measure
component counts, memory, update time, and first visible output.

**Start at:** `src/components/panels/{LogPanel,BookmarksPanel,MainArea}.tsx`,
`src/components/{FileTreeList,AnsiText}.tsx`.

## P03 — Remove full-diff work from scroll updates

**Finding:** both virtualized views combine layout indexing and scroll-position
reporting in one effect. Reading `scrollTop` makes scrolling rebuild hunk offsets,
file offsets, and file offsets again for trailing space. Deletion-only position
lookup can search all rows for a new-side number before trying the old side.

**Change:**
- [ ] Memoize layout indexes independently of scroll position.
- [ ] Share file offsets with trailing-space calculation.
- [ ] Bound position/anchor lookup to the current file; index line locations and
  record whether each side exists.
- [ ] Reuse hunk navigation indexes instead of rebuilding flattened hunk lists.

**Accept when:** scroll-only updates do not rebuild layout indexes. Test deleted,
added, binary, empty, and multi-file diffs, split/unified modes, sticky headers,
and anchor restoration. Measure per-update work as total row count increases.

**Start at:** `src/components/diff/Virtualized{Unified,Split}View.tsx`,
`src/diff/virtualization.ts`.

## P04 — Limit word-diff and wrapped-row preparation to needed content

**Finding:** split view computes word differences for every positional
addition/deletion pair before selecting visible rows. Both views allocate an
object for every wrapped display row. Very long lines can make a small number
of source lines produce a large layout and expensive token work.

**Change:**
- [ ] Compute and cache word emphasis near the viewport, not for the whole diff.
- [ ] Add an explicit work/length limit and whole-line fallback for difficult pairs.
- [ ] Store compact wrap counts/prefix sums; construct visible wrapped rows on demand.
- [ ] Define long-line limits for tokenization and token slicing as well as word diff.
- [ ] Measure fixed overscan of 50 rows on each side before changing it. Keep
  enough overscan for fast wheel/page movement without processing unnecessary content.

**Accept when:** unrelated long lines do not block input; width changes do not
allocate every display row; total height and navigation stay correct. Test
wrapping, no-wrap, tabs, Unicode, split alignment, and structural emphasis.

**Start at:** `src/components/diff/VirtualizedSplitView.tsx` (`buildAlignedRows`),
`src/components/diff/VirtualizedUnifiedView.tsx` (`buildWrappedRows`),
`src/diff/word-diff.ts`.

## P05 — Coordinate working-copy snapshots and repository reads

**Finding:** bootstrap waits for repository checks before rendering. Mount then
starts another refresh-state inspection. Each focused refresh poll runs three
jj commands, including `status`, every two seconds. Many read commands do not
use `--ignore-working-copy`. Actual repeated scan cost remains unmeasured.

**Change:**
- [ ] Measure command/snapshot time in a large working tree, both unchanged and
  after external edits, with and without the user's filesystem monitor setup.
- [ ] Share bootstrap results with initial synchronization.
- [ ] Snapshot when needed, then coordinate consistent snapshot-free reads where safe.
- [ ] Combine refresh requests; investigate event-driven checks with polling as fallback.
- [ ] Preserve stale-workspace detection, Git synchronization, focus refresh, and
  external-change detection. Do not disable snapshots globally.

**Accept when:** startup and idle command/scan counts fall, changes still appear
promptly, and concurrent repository operations do not produce mixed-state views.
Record both application and subprocess cost.

**Start at:** `src/repository-bootstrap.ts`, `src/context/sync.tsx`,
`src/commander/jj.ts` (`refreshState`, `checkWorkingCopy`).

## P06 — Reduce first-use syntax cost; compare regex engines

**Finding:** the isolated experiment above places the major TypeScript delay
inside first token processing, not worker creation alone.

**Change:**
- [ ] Compare Oniguruma with the current JavaScript engine and other maintained,
  Shiki-compatible choices if available. Do not assume arbitrary regex engines
  can execute TextMate grammars correctly.
- [ ] Review upstream archive/maintenance status, known vulnerabilities, and the
  supported Shiki/WASM integration. The archive concern is not automatic rejection,
  but a maintained wrapper does not remove engine maintenance risk.
- [ ] Test first use of representative languages and pathological long lines.
- [ ] Verify token output, themes, error fallback, worker startup, and compiled
  binaries on supported platforms. Measure binary size and memory as well as time.
- [ ] Separately test lazy language/theme loading or targeted warmup if needed.
  The worker currently imports about 30 language modules and both themes.
  Earlier broad warmup did not help; do not restore it without new evidence.

**Accept when:** repeated full-app comparisons show a useful first-highlight
improvement without correctness, packaging, maintenance, or repeated-use regressions.
Record the chosen engine and rejected alternatives. Adoption of Oniguruma is not
pre-decided.

**Start at:** `src/diff/syntax-worker.ts`, `src/diff/syntax.ts`, `scripts/build.ts`.

## P07 — Parse and publish bookmark streams incrementally

**Finding:** `streamBookmarks` reparses all complete output on each chunk, then
parses the full output again at completion. This creates new objects for earlier
rows. State updates repeatedly copy/filter lists; refresh merging rebuilds the
previous-entry index each time. Bookmark limits restrict display, not loading.

**Change:**
- [ ] Keep only an incomplete-line buffer; append parsed complete records.
- [ ] Publish on a bounded cadence, with prompt first content and a final flush.
- [ ] Retain stable objects for unchanged entries. Reuse refresh indexes.
- [ ] Memoize local/remote lists, counts, selected-name indexes, and display maps.
- [ ] Avoid replacing the entire visible list when only its tail changes.

**Accept when:** parsing work grows approximately with input bytes, not with the
sum of all prefixes. Test arbitrary chunk boundaries, final lines without a
newline, empty lists, remote-only entries, deletion, and local/remote consistency
mid-refresh. Include refresh costs, not only initial parsing.

**Start at:** `src/commander/jj.ts` (`streamBookmarks`),
`src/commander/bookmarks.ts`, `src/context/sync.tsx`, `src/context/sync-bookmarks.ts`,
`src/components/panels/BookmarksPanel.tsx`.

## P08 — Preserve log movement and improve pagination

**Finding:** normal Down navigation returns while `logLoadingMore()` is true,
even with loaded rows available. The live test lost 11 requested positions.
Prefetch can replace an unfinished initial stream. Each next page reruns the
whole prefix with a limit increased by 50. Operation-log pagination also reloads
a growing prefix. New objects can cause existing rows to be recreated.

**Change:**
- [ ] Keep movement within loaded rows active during loading.
- [ ] Preserve requested movement at a page boundary; handle end-of-history,
  errors, direction changes, and filter changes explicitly.
- [ ] Separate initial stream completion from prefetch state and eligibility.
- [ ] Retain unchanged row objects when updating pages.
- [ ] Investigate incremental paging or a longer-lived stream. If jj graph
  semantics require prefix replacement, document that constraint and measure
  alternatives such as larger/adaptive pages rather than claiming true paging.

**Accept when:** delayed-page tests preserve all intended movement. Test merges,
elided revisions, divergent changes, mutable history, filters, and graph
continuity. Startup must not cancel and restart useful work unnecessarily.
Do not score runs that lose input.

**Start at:** `src/context/sync.tsx` (`loadLog`, `loadMoreLog`),
`src/components/panels/LogPanel.tsx` (`selectNextCommit`, prefetch, operation log),
`src/commander/jj.ts` (`streamLogPage`).

## P09 — Target syntax updates and prioritize visible requests

**Finding:** every token response increments one global signal. All mounted
memos that read it can recompute, including rows whose tokens did not change.
Requests are per line or word-emphasis segment; pending work has no viewport
priority or selection generation. The completed-token cache is bounded, but
that does not bound pending work.

**Change:**
- [ ] Batch token requests/responses and notify only affected content.
- [ ] Prioritize viewport content over overscan and obsolete selections.
- [ ] Bound the pending queue and discard obsolete queued work.
- [ ] Measure full-line tokenization with emphasis applied afterward, rather
  than separate syntax requests for each emphasis fragment.
- [ ] Define ready/error/timeout handling so failed workers do not leave pending
  requests or readiness checks stuck indefinitely.

**Accept when:** completing one token request does not update unrelated rows;
rapid scrolling keeps the queue and memory bounded; visible syntax completes
promptly. Test theme changes, repeated content, worker failure, and revisits.

**Start at:** `src/diff/syntax.ts`, `src/diff/syntax-worker.ts`, both virtualized views.

## P10 — Remove quadratic file-tree construction

**Finding:** every insertion searches `children` by name. Large sibling groups
therefore require quadratic work. Flat path ordering unnecessarily builds,
sorts, compresses, and flattens the tree first.

**Change:**
- [ ] Use child-name indexes during construction, then retain ordered child arrays.
- [ ] Sort paths directly in flat mode, preserving established ordering semantics.
- [ ] Reuse path indexes for file selection and navigation where appropriate.

**Accept when:** large sibling groups no longer show quadratic construction cost;
ordering, directory compression, status, binary flags, and selection remain correct.

**Start at:** `src/utils/file-tree.ts`, `src/context/sync.tsx`,
`src/components/panels/MainArea.tsx` (`orderedFiles`).

## P11 — Stream large diffs through a bounded preparation pipeline

**Finding:** textual diffs are collected as complete strings before parsing.
The process stream has bounded event backpressure, but also retains full stdout.
Parsing, flattening, maximum-width/line-number scans, ordering, and row preparation
run before the relevant content is available. Virtual rendering alone does not
bound those costs or the size of buffered results.

**Change:**
- [ ] Measure stage time and retained bytes before choosing workers versus chunked work.
- [ ] Investigate file/hunk-level streaming, early publication of usable files,
  and worker-based parsing with request-generation checks.
- [ ] Compute shared statistics during preparation instead of repeated full scans.
- [ ] Add an output-retention policy for stream consumers that do not need full
  stdout; preserve required command diagnostics and bounded stderr information.
- [ ] Bound intermediate data and caches by size, not only number of entries.

**Accept when:** large diffs show useful content before all processing finishes,
input remains responsive, and memory does not multiply with obsolete requests.
Test chunk boundaries, binary files, renames, malformed output, process failure,
cancellation, and final counts. Do not publish an incomplete hunk as complete.

**Start at:** `src/process/app-process.ts`, `src/commander/jj.ts` (`readDiff`),
`src/diff/parser.ts`, `src/components/panels/MainArea.tsx`.

## P12 — Reuse diff information when loading the file panel

**Finding:** `jjFiles()` runs a summary command and a complete Git-format diff
in parallel. The second result is used to identify binary files. The detail panel
can already have requested and parsed that same diff. File mode currently loads
the full displayed diff rather than restricting it to the selected path.

**Change:**
- [ ] Share file metadata/binary detection with the matching detail result or cache.
- [ ] Deduplicate in-flight reads for the same resolved target.
- [ ] Evaluate selected-file-first loading for very large changes, without losing
  whole-diff navigation, statistics, or correct binary/rename information.

**Accept when:** entering file mode does not regenerate an available full diff;
metadata stays consistent across refreshes and selection changes.

**Start at:** `src/commander/jj.ts` (`readFiles`), `src/context/sync.tsx`,
`src/components/panels/MainArea.tsx`.

## P13 — Separate PR metadata loading from bookmark stream updates

**Finding:** the metadata effect reads bookmark names on each stream update and
restarts the request. The service resolves the repository and constructs one
GraphQL query for all heads, with two query fields per head. No query-size
batching or reusable metadata cache was found in this path. Network impact was
not measured; the benchmark disables authenticated network work.

**Change:**
- [ ] Trigger from meaningful name-set changes or settled stream batches, not
  every new bookmark object array.
- [ ] Cache repository identity and PR metadata with explicit refresh rules.
- [ ] Bound query size/concurrency; prioritize displayed heads and fetch only
  missing/stale metadata. Keep optional network work off the local-content path.

**Accept when:** local bookmark streaming does not repeatedly restart equivalent
requests; thousands of heads do not create an unbounded query; metadata remains
correct after push, fetch, and PR changes. Test with mocked delayed responses.

**Start at:** `src/context/sync.tsx` (PR metadata effect),
`src/commander/github-service.ts` (`listPullRequestsByHead`).

## P14 — Measure and reduce work before the first UI frame

**Finding/lead:** `tui.tsx` imports the app, terminal integration, startup/mock
screens, and highlighting before inspection/rendering. Panels statically import
many dialogs. Parser/language helpers use the broad `@pierre/diffs` entry point.
The source launch also pays the Solid preload cost. No import-by-import timing
or production-binary comparison was completed, so these are investigation leads,
not proven dominant costs.

**Change:**
- [ ] Measure preload, module evaluation, repository inspection, UI construction,
  first content, and first highlighting separately for source and compiled builds.
- [ ] Defer optional screens/dialogs/integrations where measurements justify it.
- [ ] Investigate supported narrow dependency exports or upstream changes; do not
  depend on unexported internal paths without an explicit compatibility decision.
- [ ] Consider an early UI shell while inspection runs, preserving error/recovery flows.

**Accept when:** first output and useful-content readiness improve in repeated
runs, not merely move the same delay to the first interaction. Keep CLI commands
and supported installation paths working.

**Start at:** `src/index.tsx`, `src/tui.tsx`, `src/App.tsx`, `bin/kajji`,
`src/diff/{parser,syntax}.ts`, `scripts/build.ts`.

## P15 — Bound structural-diff processing

**Finding/lead:** the structural path first obtains the textual diff, materializes
both sides, copies trees, runs directory-mode Difftastic, parses complete JSON,
and reads matching file pairs through `Promise.all`. This can produce large
concurrent reads and retained data. No structural-engine benchmark was run.
It already cancels subprocess work when selection changes; preserve that support.

**Change:**
- [ ] Measure tree materialization/copying, Difftastic, JSON validation, file reads,
  flattening, memory, and cancellation separately.
- [ ] Bound file-read/preparation concurrency and check selection identity during work.
- [ ] Evaluate result reuse, supported file restrictions, and early per-file upgrades.
  Retain textual fallback and rename normalization.

**Accept when:** large structural diffs have bounded intermediate work and prompt
cancellation, with correct fallback, alignment, emphasis, and temporary-file cleanup.

**Start at:** `src/commander/structural-diff.ts`, `src/diff/structural/`,
`src/components/panels/MainArea.tsx` (structural upgrade).

## P16 — Close benchmark and fast-input coverage gaps

- [ ] Add regression tests for obsolete request cancellation and early stale checks.
- [ ] Add delayed-page tests that assert every requested movement, without idle waits.
- [ ] Add full-diff scroll-index, deletion-only lookup, long-line word-diff,
  many-sibling tree, and incremental bookmark parser benchmarks.
- [ ] Repair syntax microbenchmarks: `initHighlighter()` returns before worker
  readiness, and `tokenizeLineSync()` measures immediate fallback/cache access.
  Wait for actual results; test unique content and separate first use from reuse.
- [ ] Measure mounted row counts, pending requests, buffered bytes, and subprocess
  lifetimes so rendering and data-loading costs can be distinguished.
- [ ] Cover file-boundary scrolling, large summaries, remote-only bookmark lists,
  branching history, and split/no-wrap modes.
- [ ] Add structural/jj-formatter, compiled-startup, external-change, and network
  scenarios where relevant. Current textual source-launch tests do not cover them.
- [ ] Retain immediate text-plus-Enter and first-cursor tests. Add immediate-input
  tests for other editors/palette and rapid layout transitions. Earlier intermittent
  failures remain leads, not confirmed common performance causes.
- [ ] Keep screen capture/trace overhead fixed for comparisons. Periodic captures
  can delay the sender. Never treat a failed or lower-work run as a speed gain.

Existing safeguards worth retaining: scoped child-process cancellation, bounded
stream event queues, the bounded completed-token cache, log stream publication
throttling, and separate content/highlighting readiness metrics.

## Completion record

For each item, append a short record here when it is implemented or rejected:

- Item ID and decision.
- Changes made, or reason for rejection/deferral.
- Tests and exact benchmark configuration.
- Before/after startup, tail latency, recovery, completed work, and memory as applicable.
- Regressions checked, remaining limits, and local evidence location.

Use repeated A → B → A runs on the same prepared fixture for performance claims.
Keep private fixtures and reports local. Do not add source content from copied
repositories to these documents. Run relevant unit/E2E checks and type/lint checks
for code changes; do not run them concurrently with timed benchmarks.

### P01 — Implemented, 2026-09-06

**Decision:** retain the change. Detail recovery improves substantially during
rapid revision navigation. Startup is slower in these runs; this is an explicit
trade-off, not a startup improvement.

**Changes:**
- `ApplicationClient` shares in-flight detail reads. At most four reads run at
  once, including process cleanup. At most 32 reads wait; newer queued reads
  start first, and overflow cancels the oldest queued read.
- A consumer can cancel without interrupting other consumers of the same read.
  When the last consumer cancels, the process scope is interrupted. A cancelled
  read cannot parse, publish, or populate the completed cache from a late result.
- Prepared textual diffs and descriptions use a shared LRU cache limited to
  32 MiB of estimated retained data and 128 entries. Oversized results are not
  retained. Prepared diffs reuse parsed and flattened rows, not just command output.
- Keys include repository path, full commit IDs, and read options. Visible
  multi-selection members use full commit IDs. Mutable symbols, change IDs,
  unresolved connectors, and range expressions have no completed-result cache;
  they are read again. Refresh, configuration changes, and repository mutations
  invalidate completed detail reads. Reads from an earlier cache generation
  cannot populate the new cache.
- File and filter reads share active requests but do not retain completed results.
  Completed file-metadata reuse remains P12; binary detection can return degraded
  metadata, which must not become a reusable cached result.
- File, filter-preview, applied-filter, and visual-range requests cancel when
  obsolete or on cleanup. Visual-range caching is limited to 32 entries and
  256 KiB of estimated retained IDs and keys. Its keys include full endpoints,
  loaded-list length, and refresh generation.
- The detail panel refreshes symbolic targets on repository refresh and includes
  formatter width in its request identity. Selection remains immediate.

**Validation:** `bun test` (406 tests), `bun test:e2e` (16 tests), `bun check`,
`bun bench:check`, and `bun lint`. New tests cover A → B → C and A → B → A,
late-result preparation, shared-consumer cancellation, queue limits, cache
size/count eviction, invalidation, mutable targets, read options, failures,
cleanup, and termination/reaping of a real child. Live TUI tests cover rapid
revision changes and external working-copy edits. Existing TUI tests cover
file navigation, resize, description changes, undo, and multi-selection.

**Measurement:** A1 → B1 → A2 → B2 on the same prepared `stress` fixture. A uses
the application source from `4faaf28f`; candidate files were backed up and
restored for A2. Bun 1.4.1, OpenTUI 0.5.10, and Terminal Control 1.2.1 were fixed.
Each group used one excluded warmup and three measured processes. No tests ran
concurrently with these measurements.

```sh
bun bench:tui --fixture .kajji-benchmarks/fixtures/stress \
  --scenarios log --runs 3 --warmups 1 --passes 2 \
  --steps 40 --interval-ms 16 --output /tmp/kajji-p01-GROUP.json
```

Defaults remained 120×36 cells, textual unified diff, wrapping, dark theme, and
endpoint-only screen captures. These runs exclude pagination. Each burst applied
all 40 requested positions, in both directions and both passes.

Per-group medians across the three measured processes:

| Metric | A1 | B1 | A2 | B2 |
| --- | ---: | ---: | ---: | ---: |
| Content ready, ms | 1,077 | 1,142 | 1,102 | 1,187 |
| Highlighted ready, ms | 1,785 | 1,875 | 1,800 | 1,944 |
| First-pass Down input-to-output p95, ms | 29.5 | 25.3 | 29.9 | 25.3 |
| First-pass Down final recovery, ms | 1,840 | 117 | 1,764 | 150 |
| First-pass Up final recovery, ms | 1,898 | 24 | 2,030 | 19 |
| Second-pass Down final recovery, ms | 2,070 | 19 | 2,016 | 21 |
| Second-pass Up final recovery, ms | 1,891 | 20 | 1,453 | 18 |
| Kajji peak RSS, MiB | 731 | 558 | 563 | 526 |
| Kajji plus descendants peak RSS, MiB | 1,782 | 594 | 1,639 | 578 |
| Maximum sampled process count, including Kajji | 69 | 4 | 68 | 5 |

Application-only RSS varied substantially. The repeat supports lower descendant
memory and process accumulation, not a general reduction in Kajji's own memory.
Process counts and RSS are sampled; short-lived children can be missed. Recovery
includes final detail and highlighting completion. First and repeated visits are
reported separately, and no failed or lower-work run is included.

**Limits:** the cache size is an estimate, not a heap limit. Large single results
and process output remain P11. Structural result caching and file-metadata reuse
are not included. The timed workload uses textual source launch and linear
history; it does not establish structural, compiled-startup, network, or
pagination performance. P08's input-correctness prerequisite remains open.
The final candidate also has a structural cleanup guard and no completed file
cache; neither changes this log-only textual workload.

**Local evidence:** `/tmp/kajji-p01-{a1,b1,a2,b2}.json`,
`/tmp/kajji-p01-comparison-final.txt`, `/tmp/kajji-p01-unit.log`, and
`/tmp/kajji-p01-e2e.log`. Reports and fixtures remain local.

### P01 — Effect service refactor, 2026-09-06

**Decision:** retain the Effect implementation. This changes ownership of
concurrency and cancellation, not P01's cache or selection policies.

- `src/application/detail-service.ts` defines the scoped `Details` service.
  It calls `Jj` effects directly. `ApplicationClient` converts results to
  Promises only at the UI boundary; it also maps interruption to `AbortError`.
- `RcMap` shares active reads and tracks consumers through scopes. Closing the
  last consumer scope interrupts the producer. Separate typed readers preserve
  result and error types without casts or a custom in-flight map.
- Four scoped workers consume a `TxPriorityQueue`. Deferred admission and
  completion signals preserve newest-first ordering, the 32-entry queue limit,
  and the requirement to finish child cleanup before reusing a worker slot.
  There are no manual Promise resolvers, abort listeners, consumer counts, or
  running-work counters in the coordinator.
- The byte-weighted completed cache remains explicit application policy. All
  typed readers share the same 32 MiB / 128-entry budget. Native `Cache` does
  not provide byte capacity or the required last-consumer cancellation rule.
  Pinned Effect source and current upstream source were inspected before choosing
  `RcMap`.
- Invalidation is an Effect. Mutation finalizers invalidate within the runtime;
  UI refresh waits for invalidation before starting replacement reads. Closing
  the application runtime closes the service and all its workers and lookups.

**Validation:** `bun test` (408 tests), `bun test:e2e` (16 tests), `bun check`,
`bun bench:check`, and `bun lint`. Coordination tests now use Effect fibers,
scopes, and Deferred signals instead of Promise resolvers or timed waits. Tests
include shared byte/count budgets, a shared worker pool across result types,
typed failures, defects, interruption, queue overflow, late preparation, and
shutdown. Real child termination and the existing TUI tests remain covered.
A formatting-only correction to the existing `skills-lock.json` was needed for
repository-wide lint.

**Measurement:** Promise A1 → Effect B1 → Promise A2, using the P01 Promise
source at `78d429e9` for both A groups. Same `stress` fixture and harness; one
excluded warmup and three measured processes per group. The candidate source
was backed up and restored for A2. Bun on PATH changed to 1.4.2 during the work,
so subsequent comparisons explicitly pinned both controller and target to
Bun 1.4.1. Effect remained 4.0.0-beta.98; OpenTUI and Terminal Control remained
0.5.10 and 1.2.1. No tests ran concurrently with measured benchmarks.

```sh
/Users/elias/.local/share/mise/installs/bun/1.4.1/bin/bun scripts/benchmark.ts run \
  --bun /Users/elias/.local/share/mise/installs/bun/1.4.1/bin/bun \
  --fixture .kajji-benchmarks/fixtures/stress --scenarios log \
  --runs 3 --warmups 1 --passes 2 --steps 40 --interval-ms 16 \
  --output /tmp/kajji-p01-effect-GROUP.json
```

All other settings match the P01 comparison above. Per-group process medians:

| Metric | Promise A1 | Effect B1 | Promise A2 |
| --- | ---: | ---: | ---: |
| Content ready, ms | 1,083 | 1,130 | 1,148 |
| Highlighted ready, ms | 1,786 | 1,817 | 1,829 |
| First-pass Down input-to-output p95, ms | 25.7 | 25.1 | 25.5 |
| First-pass Down final recovery, ms | 125 | 117 | 111 |
| First-pass Up final recovery, ms | 26 | 19 | 21 |
| Second-pass Down final recovery, ms | 17 | 18 | 23 |
| Second-pass Up final recovery, ms | 22 | 22 | 23 |
| Kajji peak RSS, MiB | 594 | 580 | 581 |
| Kajji plus descendants peak RSS, MiB | 656 | 643 | 617 |
| Maximum sampled process count, including Kajji | 5 | 5 | 5 |

Every burst applied all 40 requested positions. The results support preserving
P01's responsiveness, not a separate speed or memory improvement from Effect.
Startup ranges overlap; this comparison does not establish a new startup cost.
The original P01 measurement limits still apply.

**Local evidence:** `/tmp/kajji-p01-effect-{a1,b1,a2}.json`,
`/tmp/kajji-p01-effect-comparison.txt`, `/tmp/kajji-p01-effect-unit.log`, and
`/tmp/kajji-p01-effect-e2e.log`.
