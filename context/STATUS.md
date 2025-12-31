# lazierjj - Current Status

> Last updated: 2025-12-31

## What Works

### Core Viewing
- **Log panel** - Full jj log display with ANSI colors, graph symbols, metadata
- **Diff viewer** - Full ANSI color support (difftastic, delta, etc. all work)
- **Two-panel layout** - Log left, diff/detail right
- **Commit header** - Author, date, timezone, empty status, description

### Navigation
- `j`/`k` - Move selection / scroll
- `g`/`G` - Jump to top/bottom
- `Tab` - Switch focus between panels
- `1`/`2`/`3` - Jump directly to panel
- `Escape` - Back navigation in drill-down views

### Bookmarks Panel
- Bookmark list with drill-down navigation
- Bookmark -> commit log -> file tree (morphing panel pattern)
- File tree with folder collapse/expand
- File status colors (A/M/D)
- Diff view for selected files

### Infrastructure
- **Keybind system** - Registry architecture with config support ready
- **Command registry** - Commands register with metadata (id, title, keybind, context, category)
- **Dialog system** - Modal stack with backdrop
- **Theme system** - OpenCode-based semantic color tokens
- **Status bar** - Context-sensitive keybinding hints
- **Help modal** (`?`) - Auto-generated from command registry, searchable

### Utilities
- `R` - Manual refresh
- `Ctrl+Y` - Copy selection to clipboard
- Bold working copy indicator
- Auto-hiding scrollbar
- Debounced diff loading (smooth fast navigation)

---

## Known Issues

### Bugs
- **Diff doesn't update on panel focus change** - When viewing a diff from bookmarks panel (commit or file), switching focus back to log panel doesn't update the diff to show the log's selected commit. Diff should reflect the focused panel's selection.
- Help modal has small visual gap between border and outer edge (OpenTUI quirk)
- Search input in help modal doesn't render visually (filtering works though)

### Performance
- Noticeable lag when navigating commits in bookmarks tab
  - Likely culprit: diff rendering and/or ANSI parsing
  - Needs profiling

### UX Polish Needed
- `?` should toggle (also close) the help modal
- Panel labels should sit on/inside border line (like lazygit)
- Log and bookmark panels could be slightly wider

---

## Not Yet Implemented

See [ROADMAP.md](./ROADMAP.md) for planned features and priorities.

**Quick summary of major missing pieces:**
- Core operations (new, edit, describe, squash, abandon)
- Command mode (`:`)
- Search/filter (`/`)
- GitHub integration
- Mouse support
