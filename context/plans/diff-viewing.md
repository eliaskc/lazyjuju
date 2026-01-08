# Diff Viewing & Layout

**Status**: Planning (custom renderer)  
**Priority**: High  
**Depends on**: [Custom Diff Renderer](./custom-diff-renderer.md)

---

## Goals

First-class diff viewing with:
1. **Custom rendering** via `@pierre/diffs` for consistent interactive experience
2. **Flexible layouts** adapting to terminal size
3. **Escape hatch** to ANSI passthrough for difftastic/delta users

---

## Rendering Approach

### Primary: Custom Renderer

Use `@pierre/diffs` for parsing, build OpenTUI components for display.

**Why custom:**
- Same rendering in view mode and interactive modes (splitting, PR review)
- Hunk navigation, selection, annotations
- Word-level change highlighting
- Full control over theming

**Input:** `jj diff -r <rev> --git --no-color`

```typescript
import { parsePatchFiles } from '@pierre/diffs'

const rawDiff = await execute(['diff', '-r', rev, '--git', '--no-color'])
const patches = parsePatchFiles(rawDiff)
```

→ See [Custom Diff Renderer](./custom-diff-renderer.md) for full architecture.

### Fallback: ANSI Passthrough

For users who prefer external diff tools (difftastic, delta):

```typescript
// Toggle with 'd' keybind
const rawAnsi = await execute(['diff', '-r', rev, '--color', 'always'])
<ghostty-terminal ansi={rawAnsi} cols={width()} />
```

**Config:**
```toml
[diff]
renderer = "custom"  # or "passthrough"
passthrough_tool = "default"  # uses jj's ui.diff.tool, or "difft", "delta"
```

---

## Layout Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Half-width** | Diff in right panel (~60% width) | Default |
| **Full-width** | Diff expands to full terminal | Detailed review |
| **Unified** | Single-column inline diff | Narrow terminals |
| **Split** | Side-by-side old/new | Wide terminals |

### File Browsing Behavior

When browsing via files (log.files, bookmarks.files), the commit header should be hidden to maximize diff space. The user has already selected the file — the commit context is implicit.

### Panel Sizing

| Key | Action |
|-----|--------|
| `+` | Expand diff panel (half → full width) |
| `-` | Collapse diff panel (full → half width) |
| `=` | Reset to default width |

### View Style (within panel)

| Key | Action |
|-----|--------|
| `v` | Cycle: unified → split → unified |

### Auto-Switching

```
< 100 cols  → Force unified
100-140     → Default unified, allow split
> 140 cols  → Default split
```

---

## Focus Modes

**Current behavior:** Auto-switches layout when entering file view (log.files, bookmarks.files).

**Consideration:** Replace auto-switch with explicit focus modes:

| Mode | Focus | Description |
|------|-------|-------------|
| **Log mode** | Left panel | Default. Log/bookmarks panel is primary. |
| **Diff mode** | Right panel | Diff panel expands, log becomes secondary. |

**Keybind:** `Ctrl+X` (or similar) to swap between modes.

**Benefits:**
- Explicit user control over layout
- Avoids jarring auto-resize on file selection
- Pairs well with future PR integration — PR view could be another mode
- Modal pattern scales to full-screen tabs (log mode, diff mode, PR mode, etc.)

**Implementation notes:**
- Mode state stored in focus context
- Each mode defines panel proportions and which panel receives keyboard input
- Escape could return to log mode from diff mode

---

## Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Scroll lines |
| `[` / `]` | Previous / next hunk |
| `{` / `}` | Previous / next file |
| `n` / `N` | Next / previous change line |
| `g` / `G` | First / last position |
| `Ctrl+d/u` | Half-page scroll |

---

## Visual Features

### File Headers

```
┌─ src/auth.ts ───────────────────────────────────────────────────────┐
│ M  src/auth.ts                                            +15 -3    │
└─────────────────────────────────────────────────────────────────────┘
```

### Hunk Headers

```
@@ -10,6 +10,8 @@ function validate()
```

### Word-Level Highlighting

Within changed lines, highlight the specific characters that changed:

```
-    return true
+    return isValid(input)
           ^^^^^^^^^^^^^^ highlighted
```

Uses `diff` package's `diffWords()`.

### Current Hunk Indicator

```
  @@ -10,6 +10,8 @@ function validate()
     function validate(input) {
  -    return true
▌ +    return isValid(input)    ◄ cursor here
     }
```

---

## Implementation Phases

### Phase 1: Replace ANSI with Custom
- [ ] Add `@pierre/diffs` dependency
- [ ] Create unified view renderer
- [ ] Basic file/hunk headers
- [ ] Toggle to passthrough with `d`

### Phase 2: Enhanced Viewing
- [ ] Split (side-by-side) view
- [ ] Auto-switch based on width
- [ ] Word-level highlighting
- [ ] Syntax highlighting

### Phase 3: Navigation
- [ ] Hunk navigation (`[`/`]`)
- [ ] File navigation (`{`/`}`)
- [ ] Current hunk indicator

### Phase 4: Panel Sizing
- [ ] `+`/`-` panel expand/collapse
- [ ] Persist preference
- [ ] Horizontal scroll for wide diffs

---

## Config Options

```toml
[diff]
# Renderer choice
renderer = "custom"  # "custom" | "passthrough"

# Passthrough tool (when renderer = "passthrough" or user toggles)
passthrough_tool = "default"  # "default" | "difft" | "delta"

# Default view style
style = "auto"  # "auto" | "unified" | "split"

# Width thresholds for auto-switching
unified_max_width = 140
split_min_width = 100

# Features
word_highlighting = true
syntax_highlighting = true
show_line_numbers = true
```

---

## Integration Points

### With Interactive Splitting
→ [interactive-splitting.md](./interactive-splitting.md)

Same renderer, different mode. Hunk selection enabled.

### With PR Review
→ [pr-management.md](./pr-management.md)

Same renderer with annotations. Comments rendered inline.

### With AI Features
→ [ai-integration.md](./ai-integration.md)

**Note:** AI hunk selection is out of scope. External agents (Claude Code, Cursor) already provide change explanation. See AI Integration plan for scope decision.

---

## References

- [Custom Diff Renderer](./custom-diff-renderer.md) - Architecture details
- [@pierre/diffs](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs) - Parsing library
- [lumen](https://github.com/jnsahaj/lumen) - Rust CLI with beautiful diffs
