# Focus Modes: Log vs Diff

**Status**: Planning
**Priority**: High
**Goal**: Make kajji excellent for both jj manipulation AND diff viewing

---

## Overview

Two layout modes that shift emphasis between log operations and diff viewing:

| Mode | Log Panel | Diff Panel | Command Log |
|------|-----------|------------|-------------|
| **Log Mode** (default) | 50% width | 50% width | Visible |
| **Diff Mode** | Narrow sidebar | Expanded | Hidden |

---

## Log Mode (Default)

The current default layout, optimized for commit manipulation:

- **50/50 split** between log and diff panels
- Full log view with graph, descriptions, bookmarks
- Command log visible at bottom
- All jj operations easily accessible

---

## Diff Mode

Expanded diff view for focused code review:

- **Log sidebar**: `max(20%, 30 cols)` — narrow but still full log view
- **Diff panel**: Takes remaining width
- **Command log**: Hidden (more vertical space for diff)
- **Mode indicator**: Bottom corner, shows current mode + keybind

### Sidebar Details

Start with narrow full log (same view, just squeezed). If this looks bad:
- Consider condensed list view (like bookmarks commits)
- Trade-off: loses bookmark markers and graph

---

## Triggers

### To Diff Mode

| Trigger | Notes |
|---------|-------|
| Enter file tree | `log.files`, `bookmarks.files` |
| Focus diff panel | Tab to diff, click on diff |
| `Ctrl+X` | Manual toggle |

### To Log Mode

| Trigger | Notes |
|---------|-------|
| Focus log panel | Tab to log, click on log |
| Exit file tree | Back to `log.revisions` |
| `Ctrl+X` | Manual toggle |

---

## Mode Indicator

Show current mode + keybind hint in bottom corner (left or right TBD).

Example: `DIFF MODE · Ctrl+X`

### Styling TBD

Want to tune this during implementation:
- Show only diff mode indicator? Or both modes?
- Prominent vs subtle styling
- If prominent, make it a visual treat (nice styling, not just text)
- May want different prominence for each mode

---

## Implementation Notes

### Remove Passthrough Diff Mode

- Delete passthrough/ANSI diff rendering code
- Custom renderer only — simpler, one code path
- Can re-add as config option if users request

### Simplify Layout Logic

Current `layout.tsx` has responsive breakpoints. With explicit focus modes:
- May be able to remove auto-switching logic
- User controls layout via focus mode, not terminal width
- Width-based logic only for split vs unified diff view

### State Management

```typescript
type FocusMode = 'log' | 'diff'

// In app state or context
const [focusMode, setFocusMode] = createSignal<FocusMode>('log')

// Auto-switch logic
createEffect(() => {
  const mode = currentMode() // log.files, log.revisions, etc.
  if (mode.includes('.files')) {
    setFocusMode('diff')
  }
})

// Or track which panel has focus
createEffect(() => {
  if (focusedPanel() === 'diff') {
    setFocusMode('diff')
  } else if (focusedPanel() === 'log') {
    setFocusMode('log')
  }
})
```

### Layout Calculation

```typescript
function getPanelWidths(focusMode: FocusMode, terminalWidth: number) {
  if (focusMode === 'log') {
    return { log: '50%', diff: '50%' }
  } else {
    const logWidth = Math.max(Math.floor(terminalWidth * 0.2), 30)
    return { log: logWidth, diff: terminalWidth - logWidth }
  }
}
```

---

## Open Questions

1. **Indicator placement**: Bottom-left or bottom-right? (Status bar already has content)
2. **Indicator styling**: How prominent? What makes it a "treat"?
3. **Transition**: Instant switch or animate width change?
4. **Narrow log**: Does it look acceptable at 30 cols? May need testing.

---

## Related

- Diff viewing improvements (same panel, different concern)
- Status bar layout (indicator placement)
- Keybind system (registering Ctrl+X)
