# Interactive Splitting

**Status**: Planning  
**Priority**: Medium  
**Goal**: Lazygit-style interactive `jj split` with hunk-level granularity

---

## Concept

Split the current commit into two commits by selecting which changes stay vs. move to a new commit. Two interaction modes:

1. **File mode** (default) — Mark whole files to keep or split off
2. **Hunk mode** — Enter a file to select individual hunks/lines

This replaces shelling out to `jj split --interactive` with a native TUI experience.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Keep** | Changes stay in current commit |
| **Split** | Changes move to new child commit |

> Note: Avoiding "staged/unstaged" since jj doesn't have a staging area. The UX mirrors lazygit but terminology reflects jj's model.

---

## File Mode

When a commit is selected and user initiates split (`S`):

- File tree shows all modified files
- Each file can be marked: **Keep** (default) or **Split**
- Main area shows full diff with title indicating state:
  - `─ Keep in abc123 ─` or `─ Split to new commit ─`
- `Space` toggles file between Keep/Split
- `Enter` drills into hunk mode for granular selection

### Visual Indicators

```
─[2]─Files────────────────────
▼ /
  ▼ src/
    M  main.ts        [SPLIT]
    M  utils.ts       [KEEP]
    A  new-file.ts    [KEEP]
```

Files marked for split show `[SPLIT]` badge (or different color/icon).

---

## Hunk Mode

Press `Enter` on a file to enter hunk-level splitting:

### Layout

Main area splits into two panes:

```
┌─ Keep in abc123 ──────────────┬─ Split to new commit ──────────┐
│ @@ -10,6 +10,8 @@             │ @@ -25,4 +25,6 @@              │
│  function foo() {             │  function bar() {              │
│    return 1                   │ +  const x = 1                 │
│ +  // added line              │ +  const y = 2                 │
│  }                            │  }                             │
│                               │                                │
│ ▌@@ -20,3 +22,5 @@  ◄─cursor │                                │
│  const a = 1                  │                                │
│ +const b = 2                  │                                │
└───────────────────────────────┴────────────────────────────────┘
```

### Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Move cursor between hunks |
| `J` / `K` | Move cursor between lines within hunk (future) |
| `Tab` | Switch focus between Keep/Split panes |
| `Space` | Move hunk at cursor to other pane |
| `a` | Move all hunks to Split pane |
| `A` | Move all hunks to Keep pane |
| `Escape` | Exit hunk mode, return to file tree |

### Cursor Behavior

- Cursor highlights current hunk (distinct background color)
- When hunk is moved, cursor stays in same pane, moves to next hunk
- If pane becomes empty, cursor auto-switches to other pane

---

## Workflow

1. Select commit in log/bookmarks
2. Press `S` to enter split mode
3. File tree shows changed files, main area shows "Split Preview"
4. Mark files with `Space` or drill into files with `Enter`
5. In hunk mode: select granular changes, `Escape` to return
6. Press `Enter` (or `S` again) to confirm and execute split
7. Modal prompt for new commit description (or use first line of original)

### Confirmation Modal

```
┌─ Split abc123 ──────────────────────────────────────────────────┐
│                                                                 │
│  Splitting 2 files (3 hunks) into new commit                    │
│                                                                 │
│  Description for new commit:                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ extracted helper functions                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Enter] Confirm    [Escape] Cancel                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## jj Integration

### Commands Used

```bash
# Get diff for file
jj diff -r @- --git <file>

# Execute split with selected paths
jj split -r <rev> <file1> <file2> ...

# For hunk-level: may need to use jj restore + jj split creatively
# or leverage jj split --interactive with pre-selected hunks
```

### Hunk-Level Implementation

jj's `split` command is file-granular. For hunk-level:

**Option A**: Shell out to `jj split -i` with pre-navigation (complex)

**Option B**: Implement via restore + split sequence:
1. `jj restore --from @- <paths>` to temporarily remove changes
2. Manually re-apply selected hunks (patch application)
3. `jj split` at file level

**Option C**: Generate a patch file and apply selectively (most control)

> Implementation TBD — file-level splitting is MVP, hunk-level is stretch goal.

---

## State Management

```typescript
interface SplitModeState {
  active: boolean
  revision: string  // Commit being split
  fileSelections: Map<string, 'keep' | 'split'>
  hunkSelections: Map<string, HunkSelection[]>  // Per-file hunk states
  focusedPane: 'keep' | 'split'
  cursorPosition: { file: string; hunk: number }
}

interface HunkSelection {
  hunkIndex: number
  target: 'keep' | 'split'
}
```

---

## Edge Cases

- **Empty split**: If no changes marked for split, show error/warning
- **All changes split**: Original commit becomes empty — warn user
- **Conflicts**: If commit has conflicts, disable split (jj constraint)
- **Working copy**: Can only split the working copy commit (@ or @-)

---

## Keybindings Summary

| Context | Key | Action |
|---------|-----|--------|
| Log/Bookmarks | `S` | Enter split mode for selected commit |
| Split file tree | `Space` | Toggle file Keep/Split |
| Split file tree | `Enter` | Enter hunk mode for file |
| Split file tree | `S` / `Enter` | Confirm and execute split |
| Split file tree | `Escape` | Cancel split mode |
| Hunk mode | `j` / `k` | Navigate hunks |
| Hunk mode | `Tab` | Switch panes |
| Hunk mode | `Space` | Move hunk to other pane |
| Hunk mode | `Escape` | Return to file tree |

---

## Implementation Phases

### Phase 1: File-Level Split (MVP)
- [ ] Split mode entry (`S` on commit)
- [ ] File tree with Keep/Split marking
- [ ] Preview of what will be split
- [ ] Execute `jj split` with selected files
- [ ] Description modal for new commit

### Phase 2: Hunk-Level Split
- [ ] Split-pane layout in main area
- [ ] Hunk parsing from diff output
- [ ] Cursor navigation within panes
- [ ] Move hunks between panes
- [ ] Hunk-level split execution (TBD approach)

### Phase 3: Line-Level Split (Future)
- [ ] Line-by-line selection within hunks
- [ ] Visual line highlighting
- [ ] Partial hunk splitting

---

## Prior Art

- **lazygit**: Two-pane staged/unstaged with hunk/line selection
- **jj split --interactive**: Built-in TUI, file-level selection
- **git add -p**: Hunk-by-hunk staging (CLI-based)

→ [Back to PROJECT.md](../PROJECT.md)
