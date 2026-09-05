# Performance findings and investigation leads

This is a local findings list, not an issue tracker or a claim that every cause
is known. See [BENCHMARKING.md](BENCHMARKING.md) for measurement methods.
No GitHub issues have been filed for these entries.

## Fixed: immediate bookmark submission used stale text

- **Evidence:** With the bookmark input focused, sending `immediate-submit\r`
  in one terminal input packet created the generated `push-…` bookmark instead
  of `immediate-submit`. This reproduced in the live E2E test.
- **Cause in Kajji:** `BookmarkNameModal.handleSave` read a signal populated by
  content-change notifications, rather than the current editable buffer. Enter
  can be handled before that notification updates the signal.
- **Change:** Read `inputRef.plainText` at submission, with the signal as a
  fallback when there is no renderable. The same no-wait test now passes.
- **Regression coverage:** `submits bookmark text and Enter in one input packet`
  in `tests/e2e/workflows.test.ts`. There is deliberately no paint/idle wait
  between the text and Enter. Other input modals have not been audited here.

## Open: fast log pagination did not preserve all requested movement

- **Evidence from early harness validation:** An 80-key downward run on the
  small generated fixture advanced 76 positions. The final log contained 101
  revisions, so there was room for the requested position. The run was rejected.
- **Lead:** Page loading may temporarily clamp navigation against a partial list.
  This has not been independently established as the cause. It is also not proof
  that every reported log stutter has the same cause.
- **Next check:** Repeat with `--sample-ms 0`. Record the loaded
  count, selected index, page request/cancellation times, and input receipt around
  the page boundary. Compare requests with applied movement, not just FPS.
- **Starting command:**

  ```sh
  bun bench:tui --fixture .kajji-benchmarks/fixtures/small \
    --scenarios log --steps 80 --interval-ms 16
  ```

  Prepare the small fixture as described in the benchmark guide. Initial page
  prefetch varies with timing, so this command is not guaranteed to reproduce
  the failure on every run. A failed report is evidence, not a smoothness score.

## Open: initial streamed log data can trigger a replacement page request

- **Evidence:** Startup traces from the large fixture contained 100 loaded log
  entries rather than the initial 50. Code inspection of `loadMoreLog` in
  `src/context/sync.tsx` shows that it increments the stream token, cancels the
  current stream, and requests `logLimit + 50`. A partial initial batch can cause
  the viewport's prefetch logic to call this before `loadLog` completes.
- **Lead:** Cancellation and replacement can add startup work. The extra cost
  and whether the prefetch is useful for the visible viewport are not measured
  separately yet.
- **Next check:** Record both command lifetimes and first visible rows. Test
  delaying prefetch until initial-page completion without delaying visible data
  or causing navigation to stop at a page boundary.
- The readiness observer recognizes successful replacement-page completion.
  That corrects the measurement contract; it does not fix the extra work.

## Open: highlighting adds a separate startup delay

- **Evidence:** A review run reported log/bookmarks/diff loaded around 0.9–1.0 s,
  with the highlighted state ready around 1.67 s. This is one workload, not a
  general 700 ms worker-boot measurement.
- **Measurement:** The harness reports `contentReadyOutputMs` and
  `highlightedReadyOutputMs` separately. `highlightingAfterContentMs` is the
  gap between those output frames.
- **Next check:** Separate worker creation, module loading, initialization,
  first token request, token completion, and output. Test first visits and
  warmed visits separately before choosing an optimization.

## Open: log navigation has substantial detail recovery in GoodMorning

- **Evidence from early reference runs with periodic screen sampling:** At a 16 ms key interval, log
  input-to-output p95 was about 79–102 ms and final detail/highlighting recovery
  was about 2.2–3.3 s. These were two runs, not a stable statistical baseline.
- **Next check:** Establish endpoint-mode baselines on the same copied
  revision. Separate subprocess wait, obsolete requests, parsing, and rendering
  before changing caches or cancellation.
- Reports remain private under `.kajji-benchmarks/`; source content is not copied
  into this document. Keep observation settings fixed when comparing runs.

## Open: other immediate-input and rapid-layout races

- Earlier functional tests failed intermittently around modal focus, palette
  filtering, and rapid layout changes. Completed-state waits made the intended
  functional workflows reliable, but did not prove the fast paths correct.
- The new first-visible-cursor test passes for the bookmark modal. The immediate
  submission test exposed and now guards the fixed bug above. Neither establishes
  correctness for all modals or all repeated transitions.
- **Next check:** Add immediate-input tests for the palette and other editors,
  and a separate rapid-layout-toggle test. Do not add waits to such tests merely
  to make them pass.

## Measurement finding: periodic screen reads interfere with input

- In GoodMorning, runs with 32 ms screen polling made the sender late.
  A 128 ms diagnostic interval passed the same 16 ms input schedule.
- Trace-file writes also had long wall times under load. They are asynchronous
  and drained at shutdown; serialization and write time are reported separately.
- The harness defaults to start/end-only captures during each burst. Native frame
  and input timing remain continuous. Periodic screen reads are a separate
  diagnostic mode, not an application optimization.
- Input and screen capture still use the same Terminal Control driver. A second
  client must not be assumed to remove shared worker or lock contention.
