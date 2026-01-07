# Syntax Highlighting Performance Issue

**STATUS: IN PROGRESS** - Navigation instant, reactivity mostly working, need worker for JIT/startup

## Problem Summary

Some commits caused 1-2 second hangs when navigating, despite having relatively small diffs. Root cause: Shiki syntax highlighting blocking the main thread.

## What We Fixed

### 1. JIT Warmup Issue

Shiki's first 2-3 calls take 500ms+ due to V8 JIT compilation:

```
Call 1: 535ms
Call 2: 479ms  
Call 3: 0.53ms  (JIT kicks in)
Call 4+: 0.2-0.5ms
```

We added warmup at startup (`src/diff/syntax.ts`):

```typescript
const warmupPatterns = [
  'const x = { a: 1, b: "test" }',
  'import { foo, bar } from "module"',
  "export function Component(props: Props) {",
  // ... more patterns
]

for (const lang of ["typescript", "tsx"]) {
  for (const pattern of warmupPatterns) {
    highlighter.codeToTokens(pattern, { lang, theme: "ayu-dark" })
  }
}
```

**Result**: Post-warmup tokenization is 0.2-0.5ms instead of 500ms+.

### 2. Async Scheduler

Created `src/diff/syntax-scheduler.ts`:
- Time-budgeted chunks (5ms)
- Generation counter for cancellation
- Progressive updates via SolidJS store

**Result**: Navigation is instant, syntax appears progressively.

## Remaining Issues

### 1. 2+ Second Startup Time

The warmup blocks startup:
```
[   0.057] spawn jj commands
[   2.248] commands complete (2.2s waiting for highlighter)
```

**Potential fixes**:
- Move warmup to background after first render
- Defer warmup until first diff view
- Use lazy initialization

### 2. Syntax Doesn't Load Until Scroll

Tokens don't appear until user scrolls (even slightly). The prefetch effect may not be triggering on initial render.

**Potential fixes**:
- Ensure prefetch fires on component mount
- Check if `visibleRows()` is populated before prefetch runs

## Research Findings

See companion documents:
- [research-opentui.md](./research-opentui.md) - OpenTUI uses Tree-Sitter in workers (no Shiki)
- [research-pierre-diffs.md](./research-pierre-diffs.md) - Pierre uses Shiki with worker pools

### Key Insight: OpenTUI Doesn't Use Shiki

OpenTUI uses **Tree-Sitter in a Web Worker** instead of Shiki:
- Incremental parsing (can parse diffs)
- WASM runs in worker thread
- No JIT warmup issues
- True non-blocking

This is fundamentally different from our Shiki approach.

## Options Going Forward

### Option A: Fix Current Shiki Approach
1. Defer warmup to after first render (fix startup)
2. Fix prefetch to trigger on mount (fix initial load)
3. Consider worker thread for tokenization

### Option B: Switch to Tree-Sitter
Follow OpenTUI's approach:
1. Use web-tree-sitter
2. Run in Web Worker
3. Incremental updates

### Option C: Hybrid
1. Show diff immediately without syntax
2. Background-load Tree-Sitter
3. Apply highlighting when ready

## Performance Results

Before:
- wzoossku: 1310ms render
- mowlkrmy: 308ms render
- Startup: ~100ms

After warmup fix:
- All commits: 5-15ms render
- Syntax appears progressively
- Startup: ~2.2s (REGRESSION)

## Files Changed

- `src/diff/syntax.ts` - Shiki highlighter with warmup
- `src/diff/syntax-scheduler.ts` - New async scheduler
- `src/components/diff/VirtualizedUnifiedView.tsx` - Uses scheduler
- `src/components/diff/VirtualizedSplitView.tsx` - Uses scheduler

## Profile Logs

See `.kajji-profiles/` for timing data:
- `2026-01-07T21-31-42_profile.log` - Latest with warmup (2.2s startup)
- `2026-01-07T20-58-41_sync-tokenization.log` - Original 1310ms hangs
- `2026-01-07T21-08-01_no-syntax-test.log` - Without syntax (instant)
