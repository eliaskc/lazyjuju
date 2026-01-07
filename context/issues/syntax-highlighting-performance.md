# Syntax Highlighting Performance Issue

## Problem Summary

Some commits cause 1-2 second hangs when navigating, despite having relatively small diffs (200-300 lines). The hangs are **not** caused by jj commands or diff parsing - those complete in 15-30ms. The issue is in the **Shiki syntax highlighting** during SolidJS render.

## Evidence

### Profile Data

| Commit | Lines | With Syntax | Without Syntax |
|--------|-------|-------------|----------------|
| wzoossku | 296 | 1310ms | 7.9ms |
| mowlkrmy | 308 | 308ms | 7.9ms |
| owtmxnol | 121 | 371ms | 6.6ms |
| vmsvklnk | 23 | 303ms | 4.5ms |
| kxttvmll | 1264 | 8.2ms | 7.0ms |

The pattern is **not correlated with diff size** - `kxttvmll` has 1264 lines but renders fast, while `vmsvklnk` has only 23 lines but takes 303ms.

### Key Observation

The slow commits always render fast on **second visit** (when tokens are cached). This confirms the issue is in **initial Shiki tokenization**, not in SolidJS rendering or cache lookups.

## Root Cause Analysis

### What We Know

1. **Shiki tokenization is the bottleneck** - Disabling it makes all commits instant
2. **Cache helps** - Second visits are fast because tokens are cached
3. **Specific content triggers slowness** - Not all commits are affected equally
4. **File type doesn't matter** - Both `.ts` and `.tsx` files can be slow or fast

### Suspected Causes

1. **Shiki grammar complexity** - Some token patterns may trigger expensive regex backtracking
2. **Language loading** - Shiki may be lazily loading grammars on first encounter of certain syntax
3. **Theme application** - Color resolution might be expensive for certain token types
4. **Line content** - Specific code patterns (long imports, complex JSX, etc.) may be slow to tokenize

### Files in Slow Commits

- `wzoossku`: Deletes `src/utils/prefetch.ts` (231 lines) and modifies `src/context/sync.tsx` (41 lines)
- `mowlkrmy`: Modifies `SplitDiffView.tsx` and `UnifiedDiffView.tsx` 
- `owtmxnol`: Modifies `SplitDiffView.tsx`

Common pattern: These commits touch diff view components, which have complex JSX templates.

## Attempted Fixes

### Fix 1: Deferred Tokenization with setTimeout (Failed)
Changed from synchronous tokenization to `setTimeout(..., 0)` per row.
**Result**: Still caused hangs because 50+ setTimeout callbacks fired back-to-back, blocking the event loop.

### Fix 2: Synchronous createMemo (Failed)
Changed to synchronous `createMemo` with caching.
**Result**: Cache helped second visits, but first visits still slow because Shiki itself is the bottleneck.

### Fix 3: Disable Syntax Highlighting (Works - Current State)
Temporarily disabled all syntax highlighting.
**Result**: All commits render in 5-16ms consistently. **Confirms Shiki is the problem.**

## Potential Solutions

### Option A: Chunked Background Tokenization
- Render immediately without syntax colors
- Tokenize lines in small batches (5-10 lines) with yielding between batches
- Update UI progressively as tokens become available
- **Pro**: Maintains perceived performance, eventually shows colors
- **Con**: Colors "pop in" after initial render, complex to implement

### Option B: Web Worker Tokenization
- Move Shiki to a Web Worker
- Main thread renders plain text immediately
- Worker tokenizes and sends results back
- **Pro**: True non-blocking, clean separation
- **Con**: Bun/Node worker setup complexity, data transfer overhead

### Option C: Pre-warm Cache on Idle
- When user pauses navigation, tokenize nearby commit diffs in background
- Store pre-tokenized results
- **Pro**: Fast when user navigates to pre-warmed commits
- **Con**: Doesn't help first navigation, memory overhead

### Option D: Simpler Highlighter
- Replace Shiki with a simpler/faster highlighter
- Consider highlight.js or custom minimal tokenizer
- **Pro**: Potentially much faster, less dependency
- **Con**: Worse highlighting quality, migration effort

### Option E: Hybrid Approach (Recommended)
1. Render immediately with plain text (instant)
2. Use `requestIdleCallback` (or polyfill) to tokenize during idle time
3. Batch updates to minimize re-renders
4. Cap tokenization budget per frame (~5ms)
5. Allow user to disable syntax highlighting in settings

## Implementation Priority

1. **Short term**: Re-enable syntax highlighting with chunked approach (Option E)
2. **Medium term**: Add setting to disable syntax highlighting for users who prefer speed
3. **Long term**: Consider Web Worker approach if chunking isn't smooth enough

## Profile Logs

See `.kajji-profiles/` for detailed timing data:
- `2026-01-07T20-58-41_sync-tokenization.log` - Shows 1310ms hang on wzoossku
- `2026-01-07T21-08-01_no-syntax-test.log` - Shows 7.9ms on same commit without syntax

## Current State

Syntax highlighting is **disabled** (temporary for testing). Code is in:
- `src/components/diff/VirtualizedUnifiedView.tsx` - Line 266
- `src/components/diff/VirtualizedSplitView.tsx` - Line 399

Both files have the tokenization commented out and return plain text tokens instead.
