# Focus Modes

**Status**: MVP Complete  
**Priority**: High  
**Goal**: Make kajji excellent for log browsing, diff viewing, and future PR review

---

## Overview

Four layout modes that shift emphasis based on the current task:

| Mode | Layout | Command Log | Use Case |
|------|--------|-------------|----------|
| **Normal** | 50/50 log \| diff | Visible | Default, balanced |
| **Diff** | narrow log \| expanded diff | Hidden | Focused code review |
| **Log** | 75% log \| file tree | Hidden | Browsing history |
| **PR** | TBD | TBD | PR review (future) |

---

## Normal Mode (Default)

Current layout, optimized for commit manipulation:

- 50/50 split between log and diff panels
- Full log view with graph, descriptions, bookmarks
- Command log visible at bottom
- All jj operations easily accessible

---

## Diff Mode

Expanded diff view for focused code review:

- **Log sidebar**: `max(20%, 30 cols)` — narrow but functional, full height
- **Diff panel**: Takes remaining width
- **Command log**: Hidden
- **Bookmarks panel**: Hidden (log takes full left column height)
- Same log template, just narrower (truncation acceptable)

Inspired by lumen's full-screen diff with slim file tree.

---

## Log Mode (Future)

Expanded log view for browsing history:

- **Log panel**: 75% width
- **File tree panel**: 25% on right (shows files for selected commit)
- **Command log**: Hidden

When file tree is focused, transitions to 3-panel layout:
- Narrow log | file tree | diff

This gives focused file exploration without losing log context.

---

## PR Mode (Future)

PR review workflow. Layout TBD, likely:
- File picker on left (like bookmarks panel position)
- Diff on right (file-at-a-time)
- Inline comments rendered in diff

See [PR Management](./pr-management.md) for full spec.

---

## Mode Picker

`ctrl+x` opens an instant picker modal:

```
Mode
  [n] Normal
  [d] Diff
  [l] Log
  [p] PR
```

- Press letter directly to switch (n/d/l/p)
- Or j/k + enter
- Escape cancels

Two keystrokes total. Semantic letters avoid conflicts with tmux/zellij ctrl+hjkl.

**MVP**: With only Normal + Diff, `ctrl+x` toggles directly. Upgrade to picker when adding Log/PR modes.

---

## Auto-Switch

| Trigger | Action |
|---------|--------|
| Enter file tree | Switch to Diff mode, remember previous |
| Exit file tree (Escape) | Return to previous mode |
| Manual ctrl+x | Always works, updates previous |

**State:**
```typescript
const [currentMode, setCurrentMode] = createSignal<Mode>('normal')
const [previousMode, setPreviousMode] = createSignal<Mode>('normal')

function switchMode(mode: Mode) {
  setPreviousMode(currentMode())
  setCurrentMode(mode)
}

function returnToPreviousMode() {
  setCurrentMode(previousMode())
}
```

---

## Commit Header

Header content varies by context to maximize space:

| Context | Header Content |
|---------|----------------|
| Normal mode | Full: jj refLine, author, date, subject, body, file stats |
| Diff mode / File tree | Minimal: jj refLine + subject only (2 lines) |

Diff mode and file tree browsing need diff space more than commit metadata. The minimal header keeps context without eating space.

---

## Mode Indicator

Always visible in status bar (bottom-left):

```
NORMAL
```

Each mode has distinct styling:

| Mode | Style |
|------|-------|
| Normal | Muted text, no background (default state, doesn't demand attention) |
| Diff | Accent background + text color (cyan/blue) |
| Log | Different accent (e.g., yellow/orange) |
| PR | Different accent (e.g., green/magenta) |

Text is centered in a fixed-width box (width of "NORMAL"). The key is:
- Normal is visually quiet (blends with status bar)
- Other modes are more prominent with colored background (you're in a "special" state)
- Keybind discoverable via help (`?`)

---

## Implementation

### MVP Scope

1. Normal + Diff modes only
2. `ctrl+x` toggles between them
3. Diff mode: hide bookmarks panel + command log
4. Minimal commit header in Diff mode and file tree
5. Auto-switch on file tree entry
6. Previous mode tracking
7. Mode indicator in status bar

### Post-MVP: Layout Refactor

Before adding Log mode, refactor from two independent columns to a single grid component:

**Current structure:**
```
Left column (flex)         Right column (flex)
├── LogPanel (3)           ├── MainArea (1)
└── BookmarksPanel (1)     └── CommandLogPanel
```

**New structure:**
```tsx
<LayoutGrid mode={focusMode()}>
  // Single component controls all panel visibility and sizing
  // Mode-specific layouts defined in one place
</LayoutGrid>
```

**Why before Log mode:**
- Log mode needs 3 columns: `narrow log | file tree | diff`
- Awkward to bolt onto current two-column structure
- Single source of truth for all panel positions/sizes

### State Management

Add to layout context or create new mode context:

```typescript
type Mode = 'normal' | 'diff' | 'log' | 'pr'

interface ModeState {
  current: Mode
  previous: Mode
}
```

### Layout Calculation

```typescript
function getPanelWidths(mode: Mode, terminalWidth: number) {
  switch (mode) {
    case 'normal':
      return { log: '50%', diff: '50%' }
    case 'diff':
      const logWidth = Math.max(Math.floor(terminalWidth * 0.2), 30)
      return { log: logWidth, diff: terminalWidth - logWidth }
    case 'log':
      return { log: '75%', fileTree: '25%' }
    case 'pr':
      // TBD
  }
}
```

### Remove Passthrough Diff Mode

With focus modes, simplify by removing passthrough/ANSI diff rendering:
- Custom renderer only — one code path
- Can re-add as config option if users request

---

## Known Issues

1. **Previous mode not updated on manual switch while in file tree**: If in Diff mode → enter file tree → manually switch to Normal via ctrl+x → exit file tree → returns to Diff (should stay Normal). The `previousMode` tracking doesn't account for manual mode changes while in auto-switched state.

---

## Open Questions

1. **Log mode file tree**: New panel or reuse refs panel position?
2. **PR mode layout**: How much overlap with existing panels?
3. **Indicator styling**: Prominent vs subtle? Only non-normal modes?
4. **Transition**: Instant switch or subtle animation?

---

## Related

- [Diff Viewing](./diff-viewing.md) — Split/unified views within diff panel
- [PR Management](./pr-management.md) — PR mode details
