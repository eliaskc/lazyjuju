# Diff Row Virtualization

**Status**: Planning  
**Priority**: High  
**Goal**: Reduce custom diff render time from ~620ms (1246 lines) to <50ms  
**Depends on**: None (can be done before or in parallel with custom-diff-renderer.md Phase 2+)

---

## Problem

Profiling shows custom diff rendering is slow:

| Lines | Time (minimal mode) | Per-line |
|-------|---------------------|----------|
| 381   | ~550ms              | ~1.4ms   |
| 516   | ~470ms              | ~0.9ms   |
| 1246  | ~620ms              | ~0.5ms   |

The bottleneck is **TUI element creation** - each line creates multiple `<text>` and `<span>` elements.
Syntax highlighting adds another ~0.28ms/line on top.

The existing `ghostty-terminal limit={1000}` works for passthrough mode but doesn't help custom mode
which needs parsed structure for features like:
- Word-diff highlighting
- Hunk navigation
- Interactive splitting (hunk selection)
- PR review (line-level annotations)

---

## Solution: Row-Level Virtualization

Only render visible rows plus a buffer, using spacers to preserve scroll height.

### Key Insight

A diff with 1246 lines but only ~40 visible rows should render ~60-80 elements (visible + overscan),
not 1246+ elements. This changes O(total_lines) to O(viewport_size).

**Expected improvement**: 620ms → ~30-50ms (12-20x faster)

---

## Architecture

### 1. Flattened Row Model

Convert parsed diff into a flat `DiffRow[]` array where each row is one terminal line:

```typescript
type RowType = 
  | 'file-header'
  | 'hunk-header'
  | 'context'
  | 'addition'
  | 'deletion'
  | 'empty'          // placeholder in split view

interface DiffRow {
  type: RowType
  content: string
  
  // Stable identifiers (NOT array indices)
  fileId: string           // path or "oldPath->newPath" for renames
  hunkId: string | null    // "fileId:delStart,delCount:addStart,addCount"
  
  // Line numbers
  oldLineNumber?: number   // LEFT side
  newLineNumber?: number   // RIGHT side
  
  // For PR review annotations
  side: 'LEFT' | 'RIGHT' | null  // null for context (both sides)
  
  // Pre-computed for fast lookup
  rowIndex: number         // position in flat array
}

function flattenToRows(files: FlattenedFile[]): DiffRow[] {
  const rows: DiffRow[] = []
  let rowIndex = 0
  
  for (const file of files) {
    rows.push({
      type: 'file-header',
      content: file.path,
      fileId: file.fileId,
      hunkId: null,
      side: null,
      rowIndex: rowIndex++,
    })
    
    for (const hunk of file.hunks) {
      rows.push({
        type: 'hunk-header',
        content: hunk.header,
        fileId: file.fileId,
        hunkId: hunk.hunkId,
        side: null,
        rowIndex: rowIndex++,
      })
      
      for (const line of hunk.lines) {
        rows.push({
          type: line.type,
          content: line.content,
          fileId: file.fileId,
          hunkId: hunk.hunkId,
          oldLineNumber: line.oldLineNumber,
          newLineNumber: line.newLineNumber,
          side: line.type === 'deletion' ? 'LEFT' : 
                line.type === 'addition' ? 'RIGHT' : null,
          rowIndex: rowIndex++,
        })
      }
    }
  }
  
  return rows
}
```

### 2. Viewport Calculation

Track scroll position and compute visible range:

```typescript
interface ViewportState {
  scrollTop: number       // from scrollRef.scrollTop (already tracked in MainArea)
  viewportHeight: number  // from scrollRef.viewport.height
  totalRows: number       // rows.length
}

const OVERSCAN = 10  // extra rows above/below viewport

function getVisibleRange(viewport: ViewportState): { start: number; end: number } {
  const start = Math.max(0, viewport.scrollTop - OVERSCAN)
  const end = Math.min(
    viewport.totalRows,
    viewport.scrollTop + viewport.viewportHeight + OVERSCAN
  )
  return { start, end }
}
```

### 3. Spacer-Based Virtualization

Use empty boxes to represent offscreen content, preserving scroll height:

```tsx
function VirtualizedDiffView(props: {
  rows: DiffRow[]
  scrollTop: number
  viewportHeight: number
}) {
  const range = createMemo(() => 
    getVisibleRange({
      scrollTop: props.scrollTop,
      viewportHeight: props.viewportHeight,
      totalRows: props.rows.length,
    })
  )
  
  const visibleRows = createMemo(() => 
    props.rows.slice(range().start, range().end)
  )
  
  return (
    <>
      {/* Top spacer - represents rows above viewport */}
      <box height={range().start} />
      
      {/* Visible rows only */}
      <For each={visibleRows()}>
        {(row) => <DiffRowView row={row} />}
      </For>
      
      {/* Bottom spacer - represents rows below viewport */}
      <box height={props.rows.length - range().end} />
    </>
  )
}
```

### 4. Lazy Syntax Highlighting

Only tokenize visible lines, with LRU cache:

```typescript
const syntaxCache = new Map<string, SyntaxToken[]>()
const CACHE_MAX_SIZE = 500

function tokenizeWithCache(content: string, language: string): SyntaxToken[] {
  const key = `${language}\0${content}`
  
  if (syntaxCache.has(key)) {
    return syntaxCache.get(key)!
  }
  
  const tokens = tokenizeLineSync(content, language)
  
  // LRU eviction
  if (syntaxCache.size >= CACHE_MAX_SIZE) {
    const firstKey = syntaxCache.keys().next().value
    syntaxCache.delete(firstKey)
  }
  
  syntaxCache.set(key, tokens)
  return tokens
}
```

### 5. Word-Diff Optimization

Current problem: word-diff tokenizes per-segment, exploding work.

Fix: tokenize full line once, overlay emphasis ranges:

```typescript
interface EmphasisRange {
  start: number
  end: number
  type: 'added' | 'removed'
}

function applyWordDiffEmphasis(
  tokens: SyntaxToken[],
  emphasis: EmphasisRange[]
): SyntaxToken[] {
  // Split tokens at emphasis boundaries
  // Apply bg color to emphasized segments
  // Return new token array
}
```

---

## Integration with Future Features

### Interactive Splitting

Virtualization preserves stable `hunkId` on each row:
- Selection state keyed by `hunkId` (Map<string, 'keep' | 'split'>)
- Visual indicators render based on `row.hunkId` lookup
- Navigation jumps to hunkId → find row index → scroll to position

### PR Review

Virtualization preserves `LineAnchor` coordinates:
- Annotations keyed by `${path}:${side}:${line}`
- When row is visible, lookup annotations and render inline
- Comment input modal uses row's anchor coordinates

### File-at-a-Time Mode

Virtualization is **per-file** when in file-at-a-time mode:
- Smaller row arrays (single file vs entire commit)
- Even faster rendering
- Natural fit for PR review UX

For "full commit diff" mode, virtualization handles the full array.

---

## Implementation Phases

### Phase 1: Row Flattening (Low effort)
- [ ] Create `flattenToRows(files: FlattenedFile[]): DiffRow[]`
- [ ] Add stable IDs to each row
- [ ] Unit tests for flattening

### Phase 2: Basic Virtualization (Medium effort)
- [ ] Track viewport state in MainArea (extend existing scroll tracking)
- [ ] Implement `VirtualizedDiffView` component with spacers
- [ ] Render only visible rows
- [ ] Benchmark: target <50ms for 1246 lines

### Phase 3: Lazy Highlighting (Low effort)
- [ ] Add LRU cache for syntax tokens
- [ ] Only tokenize visible rows
- [ ] Benchmark: measure cache hit rate

### Phase 4: Word-Diff Fix (Low effort)
- [ ] Refactor to tokenize full line once
- [ ] Overlay emphasis ranges on tokens
- [ ] Benchmark word-diff heavy diffs

### Phase 5: Navigation Integration (Medium effort)
- [ ] Hunk navigation → scroll to row index
- [ ] File navigation → recalculate rows for new file
- [ ] Ensure stable IDs survive navigation

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/diff/parser.ts` | Add `flattenToRows()` export |
| `src/diff/types.ts` | Add `DiffRow` interface |
| `src/diff/syntax.ts` | Add LRU cache, `tokenizeWithCache()` |
| `src/diff/word-diff.ts` | Refactor to return `EmphasisRange[]` |
| **NEW** `src/components/diff/VirtualizedDiffView.tsx` | Virtualized renderer |
| `src/components/diff/UnifiedDiffView.tsx` | Use virtualized renderer |
| `src/components/diff/SplitDiffView.tsx` | Use virtualized renderer |
| `src/components/panels/MainArea.tsx` | Pass viewport state to diff views |

---

## Testing

### Unit Tests
- `flattenToRows()` produces correct row count
- Stable IDs are consistent across flattening
- `getVisibleRange()` edge cases (scroll=0, scroll at end, small viewport)
- LRU cache eviction

### Benchmarks
- Render time for 500/1000/2000 line diffs
- Cache hit rate during scroll
- Memory usage with cache

### Visual Tests
- Scroll behavior (no jumps or flicker)
- Navigation to offscreen hunks
- Split vs unified view switching

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| OpenTUI spacer behavior unknown | Test with minimal POC first |
| Scroll position drift | Use stable row heights (1 line = 1 unit) |
| Cache memory growth | LRU with reasonable max size (500 entries) |
| Hunk navigation breaks | Maintain row index lookup by hunkId |

---

## References

- Oracle recommendation (session 2026-01-07)
- [lazygit ViewBufferManager](https://github.com/jesseduffield/lazygit/blob/master/pkg/tasks/tasks.go)
- [react-window](https://github.com/bvaughn/react-window) - Similar concept for React
- Archived: `context/archive/diff-virtualization-pty-streaming.md` (solved different problem)
