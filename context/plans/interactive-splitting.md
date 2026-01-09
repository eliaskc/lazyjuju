# Interactive Splitting

**Status**: Planning  
**Priority**: Medium  
**Depends on**: [Custom Diff Renderer](./custom-diff-renderer.md) Phases 1-2

---

## Concept

Split the current commit into two commits by selecting which changes stay vs. move to a new commit.

**Key insight:** Unlike lazygit (which has two panes for staged/unstaged because git has a staging area), jj has no staging area. We use a **single-view with selection markers** approach.

---

## Single-View Selection Model

Instead of moving hunks between two panes, mark hunks in place:

```
┌─ Split abc123 ─────────────────────────────────────────────────────┐
│                                                                    │
│ src/auth.ts                                                        │
│                                                                    │
│ @@ -10,6 +10,8 @@ function validate()                    [KEEP]    │
│    function validate(input) {                                      │
│ +    if (!input) throw new Error('required')                       │
│ +    if (typeof input !== 'string') throw new Error('type')        │
│    }                                                               │
│                                                                    │
│ @@ -25,4 +27,6 @@ function process()               ► [SPLIT]    │
│    function process(data) {                                        │
│ -    return data                                                   │
│ +    const validated = validate(data)                              │
│ +    return transform(validated)                                   │
│    }                                                               │
│                                                                    │
│ Space: toggle | j/k: navigate | Enter: confirm | Esc: cancel       │
└────────────────────────────────────────────────────────────────────┘
```

**Why single-view:**
- jj doesn't have incremental staging - split is a single operation
- Simpler mental model: marking, not moving
- Same pattern as @pierre/diffs' `diffAcceptRejectHunk()`
- Consistent with view mode (same renderer)

---

## Why Splitting Before PR Review

Splitting only needs **hunk-level** identification:
- File ID: path (or rename path)
- Hunk ID: `path + @@ coords`
- Toggle state per hunk

PR review needs **line-level** anchoring for GitHub API:
- `(path, side: LEFT|RIGHT, line)` to match GitHub comment coordinates
- More complex row mapping layer

Since splitting is simpler, it comes first (Phase 3). PR review (Phase 4) adds the line-level infrastructure on top.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Keep** | Changes stay in current commit (default) |
| **Split** | Changes move to new child commit |

> Note: Avoiding "staged/unstaged" since jj doesn't have a staging area.

---

## State Management (Stable IDs)

**Critical:** Selection state must use stable identifiers, not array indices.

```typescript
import { fileId, hunkId, type HunkId } from '../diff/identifiers'

interface SplitModeState {
  active: boolean
  revision: string
  
  // Parsed diff data
  files: FileDiffMetadata[]
  
  // Selection state keyed by STABLE hunk ID
  // (not `${fileIndex}-${hunkIndex}` which breaks with filtering/sorting)
  hunkSelections: Map<string, 'keep' | 'split'>
  
  // Navigation (by stable ID)
  currentFileId: string | null
  currentHunkId: string | null
  mode: 'file' | 'hunk'
}

// Hunk ID format: `${path}:${deletionStart},${deletionCount}:${additionStart},${additionCount}`
// This survives file reordering, filtering, etc.

function toggleHunk(state: SplitModeState, id: string): SplitModeState {
  const current = state.hunkSelections.get(id) ?? 'keep'
  const newSelections = new Map(state.hunkSelections)
  newSelections.set(id, current === 'keep' ? 'split' : 'keep')
  return { ...state, hunkSelections: newSelections }
}
```

---

## Interaction Modes

### File Mode (default entry point)

Mark whole files to keep or split:

```
─[2]─Files───────────────────────
▼ /
  ▼ src/
    M  main.ts        [SPLIT]
    M  utils.ts       [KEEP]
    A  new-file.ts    [KEEP]
```

- `Space` toggles file between Keep/Split
- `Enter` drills into hunk mode for granular selection

### Hunk Mode

Select individual hunks within a file:

```
┌─ src/main.ts ──────────────────────────────────────────────────────┐
│                                                                    │
│ @@ -10,6 +10,8 @@ function foo()                     ► [KEEP]    │
│    function foo() {                                                │
│ +    // added line 1                                               │
│ +    // added line 2                                               │
│    }                                                               │
│                                                                    │
│ @@ -25,4 +27,6 @@ function bar()                       [SPLIT]    │
│    function bar() {                                                │
│ -    return old                                                    │
│ +    return new                                                    │
│    }                                                               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate hunks |
| `Space` | Toggle hunk Keep/Split |
| `a` | Mark all hunks as Split |
| `A` | Mark all hunks as Keep |
| `Escape` | Return to file tree |

### Line Mode (future)

Select individual lines within a hunk. More complex, deferred.

---

## Visual Indicators

### Hunk Status Badge

```
[KEEP]   - Default, stays in current commit (muted color)
[SPLIT]  - Will move to new commit (accent color)
```

### Current Selection

```
► [KEEP]   - Cursor on this hunk
  [SPLIT]  - Other hunk
```

### File Status (in file tree)

```
M  main.ts       [2/3 SPLIT]  - 2 of 3 hunks marked for split
M  utils.ts      [KEEP]       - All hunks staying
M  new.ts        [SPLIT]      - All hunks splitting
```

---

## Workflow

1. **Select commit** in log/bookmarks
2. **Press `S`** to enter split mode
3. **File tree** shows changed files with split status
4. **Navigate files** with `j`/`k`, toggle with `Space`
5. **Drill into file** with `Enter` for hunk-level selection
6. **Toggle hunks** with `Space`, return with `Escape`
7. **Confirm** with `Enter` (or `S` again)
8. **Enter description** for new commit in modal
9. **Execute** `jj split`

---

## Confirmation Modal

```
┌─ Split abc123 ──────────────────────────────────────────────────┐
│                                                                 │
│  Splitting 2 files (3 hunks) to new commit                      │
│                                                                 │
│  Description for new commit:                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ extracted helper functions                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Original commit will keep: 1 file (2 hunks)                    │
│                                                                 │
│  [Enter] Confirm    [Escape] Cancel                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## jj Integration

### Execution Strategy

jj's `split` command is file-granular. For hunk-level splitting:

**Option A: File-level only (MVP)**

If all hunks in a file are marked the same way, use file paths:

```bash
jj split -r <rev> <files-to-split...>
```

**Option B: Patch application (hunk-level)**

For mixed hunks within a file:
1. Generate patch for hunks marked as "split"
2. Apply patch to create the split content
3. Use `jj restore` + `jj split` combination

**Option C: Interactive passthrough**

Fall back to `jj split -i` with pre-selection (complex).

**Decision:** Start with Option A (file-level), add Option B later.

### Commands

```bash
# Get diff for parsing
jj diff -r <rev> --git --no-color

# Execute file-level split
jj split -r <rev> <file1> <file2> ...

# Set description for new commit
jj describe -r <new-rev> -m "message"
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| **Empty split** | No hunks marked → show error, stay in split mode |
| **All split** | All hunks marked → warn that original becomes empty |
| **Conflicts** | Commit has conflicts → disable split |
| **Immutable** | Immutable commit → show confirmation for `--ignore-immutable` |

---

## Keybindings Summary

| Context | Key | Action |
|---------|-----|--------|
| Log/Bookmarks | `S` | Enter split mode |
| Split file tree | `Space` | Toggle file Keep/Split |
| Split file tree | `Enter` | Enter hunk mode |
| Split file tree | `S` or `Enter` | Confirm split (when ready) |
| Split file tree | `Escape` | Cancel split mode |
| Hunk mode | `j` / `k` | Navigate hunks |
| Hunk mode | `Space` | Toggle hunk Keep/Split |
| Hunk mode | `a` | Mark all Split |
| Hunk mode | `A` | Mark all Keep |
| Hunk mode | `Escape` | Return to file tree |

---

## Implementation Phases

### Phase 1: File-Level Split (MVP)
- [ ] Split mode entry (`S` on commit)
- [ ] File tree with Keep/Split marking
- [ ] Toggle with `Space`
- [ ] Confirmation modal with description
- [ ] Execute `jj split` with selected files

### Phase 2: Hunk-Level Display
- [ ] Drill into file with `Enter`
- [ ] Hunk view with Keep/Split badges (reuses PR review row model)
- [ ] Navigate hunks with `j`/`k`
- [ ] Toggle hunks with `Space`

### Phase 3: Hunk-Level Execution
- [ ] Patch generation for mixed-hunk files
- [ ] Execute hunk-level split
- [ ] Handle edge cases

### Phase 4: Line-Level (Future)
- [ ] Line selection within hunks
- [ ] Visual line highlighting
- [ ] Partial hunk splitting

---

## Prior Art Comparison

| Tool | Approach | Why Different |
|------|----------|---------------|
| **lazygit** | Two panes (staged/unstaged) | Git has staging area - each pane shows real diff |
| **jj split -i** | Built-in TUI | File-level selection only |
| **git add -p** | Hunk-by-hunk prompts | Sequential, not visual |
| **@pierre/diffs** | accept/reject hunks | Same pattern - marks on single diff |

kajji's approach is closest to @pierre/diffs: mark hunks in place, execute once.

---

## CLI Integration

→ See [cli.md](./cli.md) for `kajji split` command.

```bash
# List hunks with addressable IDs
kajji changes <rev>
# Output: h1, h2, h3...

# Split specific hunks
kajji split <rev> --first h1,h3 --first-message "Add validation"
```

---

## References

- [Custom Diff Renderer](./custom-diff-renderer.md) - Same renderer, split mode enabled
- [@pierre/diffs](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs) - `diffAcceptRejectHunk()` pattern
- [lazygit staging](https://github.com/jesseduffield/lazygit/blob/master/pkg/gui/controllers/helpers/staging_helper.go) - Different model (git staging)
