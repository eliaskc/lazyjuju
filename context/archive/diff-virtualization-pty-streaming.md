# Diff Virtualization

**Status**: ✅ Complete  
**Priority**: High  
**Goal**: Reduce 16s diff load time to <100ms first frame

---

## Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Time to first data | ~1100ms | **55ms** | **20x faster** |
| Diff load + parse | ~2.2s | **158ms** | **14x faster** |

Note: The original 16s included rendering overhead (solved separately with `ghostty-terminal`).

**Solution**: Native PTY streaming via `Bun.Terminal` API (Bun 1.3.5+)

---

## Problem Analysis

Profiling a 53k line diff revealed:

| Stage | Time | % of Total |
|-------|------|------------|
| `jj diff` command | 1.1s | 6.7% |
| ANSI parsing (ptyToJson) | 0.85s | 5.2% |
| **Rendering 10k `<text>` elements** | **14.4s** | **88%** |
| **Total** | **16.3s** | |

The 100-line limit "works" by limiting render elements, but:
- Still parses ALL 53k lines (~800ms wasted)
- Still waits for full command output (~1.1s blocked)

---

## Solution: Use `<ghostty-terminal>` Component

**Key discovery**: `ghostty-opentui` already provides `<ghostty-terminal>` which:
- Renders ANSI as a **single component** (not thousands of `<text>` elements)
- Has `limit` parameter that limits at **Zig level** (before JSON parsing)
- Provides `getScrollPositionForLine()` for scroll-to-line
- Supports `highlights` for search results

### Benchmarks (from ghostty-opentui)

| Input Size | No Limit | With `limit=100` | Speedup |
|------------|----------|------------------|--------:|
| 10K lines  | 557ms    | 3.2ms            | **174x** |
| 20K lines  | 1,869ms  | 6.4ms            | **292x** |

### New Architecture

```
BEFORE (current):
jj diff ──► ptyToJson ──► For each line ──► <text> element ──► 14s render

AFTER (ghostty-terminal):
jj diff ──► <ghostty-terminal ansi={diff} limit={100}/> ──► ~10ms render
```

---

## Implementation Phases

### Phase 0: Replace AnsiText with ghostty-terminal (CURRENT)

**Goal**: Eliminate 14s rendering overhead with minimal code change.

**Changes**:
- Register `<ghostty-terminal>` component via `extend()`
- Replace `<AnsiText>` with `<ghostty-terminal>` in MainArea
- Use `limit` prop for fast initial render

```tsx
// In index.tsx or App.tsx - register once
import { extend } from "@opentui/solid"
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer"
extend({ "ghostty-terminal": GhosttyTerminalRenderable })

// In MainArea.tsx - replace AnsiText
<ghostty-terminal 
  ansi={diff() ?? ""} 
  cols={mainAreaWidth()}
  limit={200}  // Fast initial render, increase as needed
/>
```

**Expected improvement**: 16s → ~2s (command + basic parsing)

---

### Phase 1: Streaming stdout (if needed)

**Goal**: Show first frame before `jj diff` completes.

Only needed if Phase 0 isn't fast enough. Stream stdout and show initial content immediately.

**Saves**: ~1s (first frame after ~50 lines received)

---

### Phase 2: Progressive limit increase (if needed)

**Goal**: Start with small limit, increase as user scrolls.

```tsx
const [limit, setLimit] = createSignal(100)

// On scroll near bottom, increase limit
const onScrollNearEnd = () => setLimit(l => l + 500)

<ghostty-terminal ansi={diff()} limit={limit()} />
```

---

### ARCHIVED: Original DiffBuffer Approach

The original plan involved a custom `DiffBuffer` class for manual virtualization.
This is no longer needed since `<ghostty-terminal>` handles it internally.

<details>
<summary>Click to expand original DiffBuffer design</summary>

```typescript
interface DiffBuffer {
  lines: TerminalLine[]
  parsedCount: number
  totalCount: number | null
  streaming: boolean
  rawTail: string
  getLines(start: number, count: number): TerminalLine[]
  parseMore(count: number): Promise<void>
}
```

</details>

---

## Impact Summary (Revised)

| Phase | Effort | Expected Result |
|-------|--------|-----------------|
| **Phase 0** | Low | 16s → ~2s (eliminate element creation overhead) |
| Phase 1 | Medium | ~2s → ~100ms first frame (streaming) |
| Phase 2 | Low | Smooth scrolling for huge diffs |

---

## OpenTUI ScrollBox API (Resolved)

Research confirmed scrollbox capabilities:

| Feature | Supported | How |
|---------|-----------|-----|
| Get scroll position | Yes | `scrollRef?.scrollTop` |
| Set scroll position | Yes | `scrollRef.scrollTop = N` or `scrollRef.scrollTo(N)` |
| Get viewport height | Yes | `scrollRef?.viewport.height` |
| Scroll callbacks | **No** | Must track in keybind handlers |
| Dynamic content | Yes | Automatic with `stickyScroll` |

**Implication for virtualization**: Since there are no scroll callbacks, we track scroll position in our keybind handlers (already done in MainArea.tsx). The `scrollTop` signal in MainArea can drive which lines to render.

**Architecture decision**: Keep scroll state in MainArea (current location), pass it to a new `VirtualizedDiff` component that manages which lines to display.

## Open Questions

- [ ] **Incremental parsing**: Can we parse ANSI line-by-line, or does ptyToJson need full content? (Need to test)

---

## Test Coverage

### Existing Tests (Good)

| File | Coverage |
|------|----------|
| `commander/diff.test.ts` | fetchDiff args, errors, ANSI passthrough |
| `commander/executor.test.ts` | execute function, cwd, env, exit codes |
| `bench/parsing.bench.test.ts` | ptyToJson performance benchmarks |

### Missing Tests (Need to Add)

**Before Phase 1 (DiffBuffer)**:
- [ ] `DiffBuffer.getLines()` returns correct lines for range
- [ ] `DiffBuffer.getLines()` parses on demand (not upfront)  
- [ ] `DiffBuffer` handles empty content
- [ ] `DiffBuffer` handles single line
- [ ] `DiffBuffer` handles content without trailing newline
- [ ] `DiffBuffer` line count accuracy

**Before Phase 2 (Virtual Rendering)**:
- [ ] Viewport calculation from scroll position
- [ ] Edge case: scroll past end of content
- [ ] Edge case: content shorter than viewport

**Before Phase 3 (Streaming)**:
- [ ] `DiffBuffer.appendRaw()` handles streaming chunks
- [ ] `DiffBuffer.appendRaw()` with partial lines (no trailing newline)
- [ ] `streamExecute()` yields chunks correctly
- [ ] `streamExecute()` handles command errors mid-stream

**Before Phase 4 (Background Parsing)**:
- [ ] `DiffBuffer.parseChunk()` respects chunk size limits
- [ ] Background parsing yields to event loop
- [ ] Parsing progress reporting

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/AnsiText.tsx` | Replace with virtualized renderer |
| `src/context/sync.tsx` | Add streaming diff loading |
| `src/commander/executor.ts` | Add `streamExecute()` |
| `src/commander/diff.ts` | Add `streamDiff()` |
| **NEW** `src/utils/diff-buffer.ts` | DiffBuffer implementation |
| **NEW** `tests/unit/utils/diff-buffer.test.ts` | Unit tests |

---

## Next Steps

1. **Write DiffBuffer tests first** (TDD approach)
2. **Implement DiffBuffer** (Phase 1)
3. **Benchmark** to verify ~800ms saved
4. **Write virtual rendering tests**
5. **Implement VirtualizedDiff component** (Phase 2)
6. **Benchmark** to verify rendering time eliminated
7. **Continue to Phase 3-4** as needed

## Final Implementation (Jan 2026)

### Root Cause Discovery

`jj diff` buffers all output when stdout is a pipe (not a TTY). This is Rust's default behavior for pipes (~8KB buffer). The command completes in ~60ms but we don't receive data until the entire output is buffered.

### Solution: PTY Streaming

Using `Bun.spawn()` with the `terminal` option creates a pseudo-terminal, which:
1. Makes `jj` think it's connected to a real terminal
2. Forces line-buffered output instead of block-buffered
3. First chunk arrives in ~55ms instead of ~1100ms

### Files Changed

| File | Change |
|------|--------|
| `src/commander/executor.ts` | Added `executePTYStreaming()` using Bun.Terminal |
| `src/commander/diff.ts` | Added `streamDiffPTY()` with `--no-pager` flag |
| `src/context/sync.tsx` | Updated `loadDiff()` to use PTY streaming |

### Key Code

```typescript
// executor.ts - PTY streaming with Bun 1.3.5+
const proc = Bun.spawn(["jj", ...args], {
  terminal: {
    cols: 120,
    rows: 50,
    data(_terminal, data) {
      const chunk = data.toString()
      callbacks.onChunk(stdout += chunk, lineCount)
    },
  },
})
```

### Platform Support

| Platform | Status |
|----------|--------|
| macOS | ✅ Works |
| Linux | ✅ Should work (untested) |
| Windows | ❌ Not supported (Bun.Terminal is POSIX-only) |

For Windows, falls back to regular pipe streaming (slower but functional).

---

## References

- **lazygit**: Uses streaming stdout with `ViewBufferManager` ([tasks.go](https://github.com/jesseduffield/lazygit/blob/master/pkg/tasks/tasks.go))
- **jjui**: No virtualization, loads full diff into bubbletea viewport
- **lazyjj**: No virtualization, uses ratatui `Paragraph::scroll()`
- **Bun.Terminal**: https://bun.sh/blog/bun-v1.3.5#bun-terminal-api-for-pseudo-terminal-pty-support
