# jjui Analysis

> Reference: https://github.com/idursun/jjui
> Tech: Go, Bubble Tea (Charm)
> Relevance: **HIGH** - Most mature jj TUI, excellent UX patterns

---

## Keybinding Architecture

### Hierarchical KeyMappings

jjui uses Go generics for flexible key configuration:

```go
// Same struct works for config strings AND runtime bindings
type KeyMappings[T any] struct {
    Up      T `toml:"up"`
    Down    T `toml:"down"`
    Select  T `toml:"select"`
    Back    T `toml:"back"`
    
    // Nested modes for context-specific keys
    Rebase   rebaseModeKeys[T]   `toml:"rebase"`
    Bookmark bookmarkModeKeys[T] `toml:"bookmark"`
    Diff     diffModeKeys[T]     `toml:"diff"`
}

type rebaseModeKeys[T any] struct {
    Start    T `toml:"start"`
    Abort    T `toml:"abort"`
    Continue T `toml:"continue"`
}
```

### Context-Sensitive Key Handling

Keys are handled in priority order:

1. **Overlay check** - Leader menu, password prompt, or help overlay
2. **Global state** - Error or loading states have special handlers
3. **Active view** - Finally passed to focused component

```go
func (m *MainUI) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    // 1. Overlay intercepts first
    if m.overlay != nil {
        return m.overlay.Update(msg)
    }
    
    // 2. Global state handlers
    if m.state == common.Error {
        if key.Matches(msg, m.keys.Cancel) {
            return m.clearError()
        }
    }
    
    // 3. Active view handles
    return m.activeView.Update(msg)
}
```

### Multi-Key Sequences (Leader)

Supports Vim-style leader sequences for complex commands.

---

## Theming System

### CSS-like Palette with Selectors

jjui uses a **selector-based palette** with inheritance:

```go
// Usage in components
style := palette.Get("menu selected")  // Inherits from "menu"
style := palette.Get("diff added")     // Inherits from "diff"
```

### Inheritance Logic

```go
func (p *Palette) Get(selector string) lipgloss.Style {
    // "a b c" inherits from "a", then "a b", then "a b c"
    fields := strings.Fields(selector)
    finalStyle := lipgloss.NewStyle()
    
    currentSelector := ""
    for _, field := range fields {
        currentSelector = strings.TrimSpace(currentSelector + " " + field)
        if style, ok := p.styles[currentSelector]; ok {
            finalStyle = finalStyle.Inherit(style)
        }
    }
    return finalStyle
}
```

### TOML Theme Configuration

```toml
# default_dark.toml
[styles]
background = "#1a1b26"
text = "#c0caf5"

[styles.menu]
fg = "#7aa2f7"

[styles."menu selected"]
bg = "#283457"
bold = true

[styles.diff]
# base style for all diff content

[styles."diff added"]
fg = "#9ece6a"

[styles."diff removed"]
fg = "#f7768e"
```

---

## Notable Architectural Patterns

### ViewNode Tree Layout

Instead of string concatenation, jjui uses a **render tree**:

```go
type ViewNode struct {
    Frame    Rect        // Position and size
    Children []ViewNode
    Content  string
}
```

Components have explicit bounds, enabling:
- Precise mouse hit testing
- Responsive resizing
- Manual buffer rendering to specific regions

### MainContext (Shared State)

```go
type MainContext struct {
    SelectedItem   *Item           // What cursor is on
    CheckedItems   map[string]bool // Multi-select with space
    CurrentRevset  string
}

// Components use context for command templates
func (c *MainContext) Replacements() map[string]string {
    return map[string]string{
        "$change_id": c.SelectedItem.ChangeId,
        "$commit_id": c.SelectedItem.CommitId,
        "$bookmark":  c.SelectedItem.Bookmark,
    }
}
```

### Frame Pacing (120 FPS Cap)

Debounces renders to prevent CPU spikes:

```go
func (w *wrapper) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    if _, ok := msg.(frameTickMsg); ok {
        w.render = true
        return w, nil
    }
    
    // Schedule render tick if not already pending
    if !w.scheduledNextFrame {
        w.scheduledNextFrame = true
        return w, tea.Tick(8*time.Millisecond, func(t time.Time) tea.Msg {
            return frameTickMsg{}
        })
    }
    return w, cmd
}
```

---

## Key Takeaways for lazierjj

1. **Selector-based palette** - `palette.get("panel selected")` with inheritance
2. **Nested key modes** - Group keys by context (rebase, bookmark, diff)
3. **Placeholder replacements** - `$change_id`, `$commit_id` in custom commands
4. **Frame pacing** - Cap at 120 FPS to prevent CPU spikes
5. **Priority-based key handling** - Overlays > Global > View
6. **Multi-select** - Track checked items for batch operations
