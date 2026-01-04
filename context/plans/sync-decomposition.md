# Sync Context Decomposition

> Split the 876-line sync.tsx into focused, single-responsibility contexts.

## Current State

`sync.tsx` handles too many concerns:
- Commit log state (loading, selection, navigation)
- Bookmark state (list, drill-down views, navigation)
- Diff state (content, streaming, loading)
- File tree state (for both log and bookmarks)
- Auto-refresh (polling, focus detection)
- Terminal dimensions
- View mode transitions

## Proposed Structure

```
src/context/
  log.tsx        — commit log state
  bookmarks.tsx  — bookmark state + drill-down views
  diff.tsx       — diff loading + streaming
  refresh.tsx    — auto-refresh orchestration
  layout.tsx     — terminal size, panel ratios, breakpoints
  focus.tsx      — (existing) panel/context focus
  theme.tsx      — (existing) theme state
```

### log.tsx (~150 lines)

Commit log data and selection:

```tsx
interface LogContextValue {
  commits: () => Commit[]
  selectedIndex: () => number
  setSelectedIndex: (i: number) => void
  selectedCommit: () => Commit | undefined
  selectPrev/Next/First/Last: () => void
  loading: () => boolean
  error: () => string | null
  loadLog: () => Promise<void>
  
  // File tree (when drilling into commit)
  viewMode: () => "log" | "files"
  fileTree: () => FileTreeNode | null
  flatFiles: () => FlatFileNode[]
  selectedFileIndex: () => number
  selectedFile: () => FlatFileNode | undefined
  enterFilesView: () => Promise<void>
  exitFilesView: () => void
  toggleFolder: (path: string) => void
  // file navigation...
}
```

### bookmarks.tsx (~200 lines)

Bookmark list + drill-down (commits → files):

```tsx
interface BookmarkContextValue {
  bookmarks: () => Bookmark[]
  selectedBookmarkIndex: () => number
  selectedBookmark: () => Bookmark | undefined
  // bookmark navigation...
  loadBookmarks: () => Promise<void>
  jumpToBookmarkCommit: () => number | null
  
  // Drill-down state
  viewMode: () => "list" | "commits" | "files"
  activeBookmarkName: () => string | null
  
  // Commits view
  commits: () => Commit[]
  selectedCommitIndex: () => number
  selectedCommit: () => Commit | undefined
  enterCommitsView: () => Promise<void>
  // commit navigation...
  
  // Files view
  fileTree: () => FileTreeNode | null
  flatFiles: () => FlatFileNode[]
  selectedFileIndex: () => number
  selectedFile: () => FlatFileNode | undefined
  enterFilesView: () => Promise<void>
  exitView: () => void
  toggleFolder: (path: string) => void
  // file navigation...
}
```

### diff.tsx (~150 lines)

Diff loading and streaming:

```tsx
interface DiffContextValue {
  diff: () => string | null
  diffLoading: () => boolean
  diffError: () => string | null
  diffLineCount: () => number
}
```

Internally subscribes to:
- `useLog().selectedCommit()` / `useLog().selectedFile()`
- `useBookmarks().selectedCommit()` / `useBookmarks().selectedFile()`
- `useFocus().panel()` to know which source to use
- `useLayout().mainAreaWidth()` for column count

### refresh.tsx (~100 lines)

Auto-refresh orchestration:

```tsx
interface RefreshContextValue {
  refresh: () => Promise<void>
  refreshCounter: () => number
}
```

Handles:
- Focus-based refresh (on window focus)
- Polling (2s focused, 30s unfocused)
- Op log ID change detection
- Calls `log.loadLog()`, `bookmarks.loadBookmarks()`, re-fetches files if in file view

### layout.tsx (~80 lines)

Terminal dimensions and responsive layout:

```tsx
interface LayoutContextValue {
  terminalWidth: () => number
  terminalHeight: () => number
  layoutRatio: () => { left: number; right: number }
  mainAreaWidth: () => number
  isNarrow: () => boolean  // for help modal, etc.
}
```

Breakpoints:
- `< 100`: narrow (1-column help modal)
- `< 150`: medium (50/50 panel split in revisions view)
- `>= 150`: wide (40/60 panel split)

## Dependencies

```
layout ← focus
diff ← log, bookmarks, focus, layout
refresh ← log, bookmarks
```

No circular dependencies. Each context has clear inputs.

## Migration Strategy

1. **Extract layout.tsx first** (smallest, no sync.tsx deps)
2. **Extract refresh.tsx** (isolates polling logic)
3. **Extract diff.tsx** (isolates streaming complexity)
4. **Split log.tsx and bookmarks.tsx** (biggest change, do together)
5. **Delete sync.tsx**

Each step should be independently testable. Keep sync.tsx working until final deletion.

## Shared Patterns

### File Tree State

Both log and bookmarks have identical file tree patterns. Extract to shared hook:

```tsx
function useFileTreeState() {
  const [files, setFiles] = createSignal<FileChange[]>([])
  const [fileTree, setFileTree] = createSignal<FileTreeNode | null>(null)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [collapsedPaths, setCollapsedPaths] = createSignal<Set<string>>(new Set())
  
  const flatFiles = createMemo(() => ...)
  const selectedFile = () => flatFiles()[selectedIndex()]
  const toggleFolder = (path: string) => ...
  // navigation helpers...
  
  return { files, setFiles, fileTree, setFileTree, flatFiles, selectedFile, ... }
}
```

### Selection Navigation

Generic selection helpers used everywhere:

```tsx
function useListSelection<T>(items: () => T[]) {
  const [index, setIndex] = createSignal(0)
  const selected = () => items()[index()]
  const selectPrev = () => setIndex(i => Math.max(0, i - 1))
  const selectNext = () => setIndex(i => Math.min(items().length - 1, i + 1))
  const selectFirst = () => setIndex(0)
  const selectLast = () => setIndex(Math.max(0, items().length - 1))
  return { index, setIndex, selected, selectPrev, selectNext, selectFirst, selectLast }
}
```

## Open Questions

- Should `activeCommit()` (the commit shown in diff, regardless of panel) live in diff.tsx or stay separate?
- Should `commitDetails` (subject, body, stats) be part of log/bookmarks or diff?
- How to handle the view mode ↔ focus context sync (currently an effect in sync.tsx)?
