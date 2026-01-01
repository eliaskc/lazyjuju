# Implementation Order - lazyjuju

> Getting to a runnable prototype as fast as possible
> 
> **Goal**: See the log, scroll around, view diffs (read-only)

This document outlines the order of implementation to get a working prototype quickly. It does NOT duplicate the full feature specifications in `lazyjj-plan.md` - refer there for detailed behavior, keybindings, and design decisions.

---

## Phase 1: Hello World TUI ✅
**Target: < 1 hour | Validates toolchain**

### 1.1 Project Scaffolding
- [x] Initialize with `bun create tui --template solid` OR manual setup
- [x] Create `package.json` with dependencies
- [x] Create `tsconfig.json` with `jsxImportSource: "@opentui/solid"`
- [x] Create `bunfig.toml` with `preload = ["@opentui/solid/preload"]`
- [x] Create `biome.json` for linting

### 1.2 Minimal Entry Point
- [x] `src/index.tsx` - renders root App component
- [x] Verify `bun run src/index.tsx` shows something on screen
- [x] Add `q` keybinding to quit

### 1.3 Scripts
- [x] `package.json` scripts: `dev`, `check`, `lint`, `lint:fix`, `test`

**Milestone**: ✅ Can run `bun dev`, see text, press `q` to quit.

---

## Phase 2: Commander Foundation ✅
**Target: 1-2 hours | jj CLI abstraction**

### 2.1 Executor
- [x] `src/commander/executor.ts` - wrapper to run jj commands via `Bun.spawn`
- [x] Handle: stdout, stderr, exit code
- [x] `execute()` and `executeWithColor()` functions

### 2.2 Types
- [x] `src/commander/types.ts` - define `Commit` interface

### 2.3 Log Parser (Prefix Injection)
- [x] `src/commander/log.ts` - implements jjui-style prefix injection
- [x] Template injects `__LJ__` markers before `builtin_log_compact`
- [x] Parser extracts metadata, groups lines by commit
- [x] Working copy detected from `@` in graph gutter (like jjui)

### 2.4 Unit Tests
- [x] `tests/unit/commander/log.test.ts` - 6 tests passing

**Milestone**: ✅ Can parse jj log output into structured data.

**Learnings**:
- `self.working_copies()` doesn't work as expected in jj templates - detect from graph gutter instead
- OpenTUI cannot render ANSI escape codes - use `--color never` for now

---

## Phase 3: Log Panel MVP ✅
**Target: 1-2 hours | First real UI**

### 3.1 Basic App Structure
- [x] `src/App.tsx` - root component with keyboard handling
- [x] Uses `useKeyboard()` from @opentui/solid

### 3.2 State Management
- [x] `src/context/sync.tsx` - SolidJS context with signals
  - `commits: Commit[]` signal
  - `selectedIndex: number` signal  
  - `loadLog()`, `selectNext()`, `selectPrev()`, `selectFirst()`, `selectLast()`

### 3.3 Log Panel Component
- [x] `src/components/panels/LogPanel.tsx`
- [x] Shows commit lines with blue background on selected
- [x] Currently shows first line per commit (multi-line deferred)

### 3.4 Navigation
- [x] `j` / `k` / `down` / `up` to move selection
- [x] `g` / `G` for top/bottom
- [x] `q` to quit

**Milestone**: ✅ See real jj log, navigate with j/k, quit with q.

**Learnings**:
- OpenTUI `<text>` doesn't have backgroundColor - wrap in `<box>`
- ANSI codes from jj not rendered by OpenTUI - switched to `--color never`
- Multi-line commits cause selection highlight issues - showing single line for now

---

## Phase 4: Two-Panel Layout + Diff ✅
**Target: 2-3 hours | Core UX**

### 4.1 Layout Component
- [x] `src/components/Layout.tsx` - flexbox two-column layout
- [x] Left: Log panel (flexGrow=1)
- [x] Right: Main area (flexGrow=2)
- [x] Explicit `height="100%"` on all containers to fill terminal

### 4.2 Diff Commander
- [x] `src/commander/diff.ts` - runs `jj diff -r <change_id> --color always`
- [x] Returns raw ANSI string
- [x] `--ignore-working-copy` flag for performance

### 4.3 Main Area Component  
- [x] `src/components/panels/MainArea.tsx`
- [x] Shows diff output with ANSI colors via AnsiText component
- [x] Loading/error states
- [x] Commit header with metadata (Change, Commit, Author, Date)
- [x] Header included in scrollable content
- [x] Auto-hide scrollbar (shows only when needed)

### 4.4 Selection → Diff Wiring
- [x] `createEffect` in sync.tsx triggers loadDiff on selection change
- [x] diff/diffLoading/diffError signals in context
- [x] 100ms debounce on diff loading to prevent UI hangs during fast navigation
- [x] Stale request handling (ignore outdated diff results)

### 4.5 Focus Management
- [x] `Tab` to switch focus between Log and MainArea
- [x] Visual indicator of which panel is focused (border color: cyan=#4ECDC4 when focused, gray=#444444 when not)
- [x] `j/k` scrolls focused panel (log selection when log focused, scrollbox handles diff when diff focused)
- [x] Use `<scrollbox>` for MainArea diff content (proper scrolling)

### 4.6 Additional Features
- [x] `Ctrl+Y` copy selection keybinding
- [x] Bold working copy indicator in log panel

**Milestone**: ✅ Two panels, select commit on left → see styled diff on right with metadata header.

**Notes**:
- Using flex ratios (1:2) for panel widths
- Must set explicit `height="100%"` on all flex containers to fill terminal viewport
- ANSI rendering solved with `ghostty-opentui` - parses ANSI to styled spans
- Focus indicated by border color (cyan when focused, gray when not)
- `focusedPanel` signal in sync context tracks which panel has focus
- Scrollbar auto-hides when content fits viewport (default OpenTUI behavior)

---

## Phase 5: Status Bar + Polish ✅
**Target: 1 hour | Usability**

### 5.1 Status Bar
- [x] `src/components/StatusBar.tsx` - bottom row
- [x] Shows context-sensitive keybinding hints
- [x] Different hints based on focused panel

### 5.2 Help Modal
- [x] `src/components/modals/HelpModal.tsx` - press `?` to open
- [x] Auto-generated from command registry
- [x] Grouped by category, multi-column layout
- [x] Search/filter functionality

### 5.3 Dialog System
- [x] `src/context/dialog.tsx` - modal stack management
- [x] Backdrop with semi-transparent overlay
- [x] Escape to close, render function pattern for context access

### 5.4 Theme System
- [x] `src/theme/colors.ts` - OpenCode-based semantic color tokens
- [x] Tokens: primary, background, backgroundSecondary, text, textMuted, border, borderFocused, etc.

### 5.5 Additional Features
- [x] Manual refresh with `R` key
- [ ] `Ctrl+d` / `Ctrl+u` for page down/up in MainArea (deferred)
- [ ] Scroll position indicator (optional, deferred)

**Milestone**: ✅ Polished read-only experience with help modal and theme system.

---

## Post-Prototype: Next Steps

After Phase 5, you'll have a usable read-only viewer. The next priorities would be:

1. **Actions** (new, edit, describe, squash, abandon)
2. **Bookmarks Panel** 
3. **Modals** (describe, confirm, error)
4. **Command Mode** (`:`)
5. **Config Loading** (from jjconfig.toml)

These are covered in detail in `lazyjj-plan.md`.

---

## File Creation Order

For reference, here's roughly the order files get created:

```
Phase 1:
  package.json, tsconfig.json, bunfig.toml, biome.json
  src/index.tsx

Phase 2:
  src/commander/executor.ts
  src/commander/types.ts
  src/commander/log.ts
  tests/unit/commander/log.test.ts

Phase 3:
  src/App.tsx
  src/context/sync.tsx
  src/components/panels/LogPanel.tsx

Phase 4:
  src/components/Layout.tsx
  src/commander/diff.ts
  src/components/panels/MainArea.tsx

Phase 5:
  src/components/StatusBar.tsx
  src/components/modals/HelpModal.tsx
  src/context/dialog.tsx
  src/context/focus.tsx
  src/context/command.tsx
  src/context/keybind.tsx
  src/keybind/parser.ts
  src/keybind/types.ts
  src/theme/colors.ts
```

---

## Commands Reference

```bash
# Development
bun dev              # Run the TUI
bun check            # Type check
bun lint             # Lint check
bun lint:fix         # Auto-fix lint issues
bun test             # Run tests

# Manual testing
bun run src/index.tsx
```

---

## Open Questions / Decisions Deferred

1. **ANSI rendering**: ❌ OpenTUI does NOT render ANSI - using `--color never` for now (see Future Enhancement below)
2. **Diff toggle (`v`)**: Defer until basic diff works
3. **Mouse support**: Defer to post-prototype
4. **Refresh (`R`)**: Add in Phase 5 or defer
5. **Graph characters**: Not rendered yet - jjui does this by parsing gutter separately
6. **Multi-line commits**: Deferred - showing single line per commit for now

---

## Phase 6: ANSI Rendering + Commit Metadata ✅
**Completed ahead of schedule!**

### 6.1 ANSI → OpenTUI Styled Rendering
- [x] `bun add ghostty-opentui` 
- [x] `src/components/AnsiText.tsx` - renders ANSI strings as styled spans
- [x] Uses `ptyToJson()` from ghostty-opentui to parse ANSI escape codes
- [x] Supports 256-color palette + RGB colors, bold, underline, etc.
- [x] Configurable `wrapMode` prop (word wrap for diffs, none for log)

### 6.2 Commit Metadata Parsing
- [x] Extended jj template to extract: author, email, timestamp, empty status
- [x] `src/commander/log.ts` - parse 9-field prefix with metadata
- [x] Timestamp formatted with timezone (`%Y-%m-%d %H:%M:%S %:z`)
- [x] Description uses jj's native ANSI styling via `label()` template functions
- [x] `empty` boolean field to detect empty commits
- [x] Tests updated for new template format (8 passing)

### 6.3 Lazygit-Style Commit Header
- [x] `CommitHeader` component in MainArea.tsx
- [x] Shows: Change ID, Commit ID, Author <email>, Date with timezone
- [x] Colored labels (orange for field names, blue for IDs, orange for author, green for date)
- [x] 4-space indented description line
- [x] Styled `(empty)` prefix for empty commits (cyan)
- [x] Styled `(no description set)` fallback (default terminal color)
- [x] Header placed inside scrollbox for unified scrolling with diff

### 6.4 Performance Optimizations
- [x] 100ms debounce on diff loading (prevents UI hangs during fast j/k navigation)
- [x] Stale request handling (currentDiffChangeId tracking)
- [x] `--ignore-working-copy` flag on diff command for faster execution

**Milestone**: ✅ Production-quality diff viewer with full ANSI color support and rich metadata display.

**References**:
- ghostty-opentui: https://github.com/remorses/ghostty-opentui
- critique (production example): https://github.com/remorses/critique
- Detailed research: `../opentui-research.md`

---

## Current State Summary (2025-12-31)

### ✅ What Works
- Full jj log display with ANSI colors, graph symbols, and metadata
- Two-panel layout (log left, diff right)
- Navigation: j/k (move selection), Tab (switch panels), 1/2/3 (jump to panel)
- Diff viewer with full ANSI color support (difftastic, delta, etc. all work!)
- Commit header with author, date, timezone, empty status
- Debounced diff loading (smooth navigation even with large diffs)
- Bold working copy indicator
- Auto-hiding scrollbar (shows only when needed)
- Copy selection with Ctrl+Y
- Proper text wrapping (word wrap in diff, no wrap in log)
- **Keymap registry architecture** (Option B from keyboard-architecture.md)
  - FocusProvider, KeybindProvider, CommandProvider
  - Commands register with metadata (id, title, keybind, context, category)
  - Config-based keybindings (hardcoded defaults, config file support ready)
- **Status bar** with context-sensitive keybinding hints
- **Help modal** (`?`) - auto-generated from command registry, searchable
- **Dialog system** with backdrop and modal stack
- **Theme system** with OpenCode-based semantic color tokens
- **Manual refresh** with `R` key
- **Bookmarks panel** with drill-down navigation:
  - Bookmark list → commit log → file tree (morphing panel pattern)
  - Full file tree with folder collapse/expand
  - Diff view for selected files
  - Back navigation with Escape

### 🎯 Read-Only Mode Complete!
We have a polished, production-quality read-only jj TUI viewer. All Phase 1-6 goals met + bookmarks!

### 🚧 What's Next (Phase 7: Core Operations)
- `n` - new commit
- `e` - edit commit
- `d` - describe commit (opens modal)
- `s` - squash into parent
- `a` - abandon commit

### 📦 Upcoming Priorities

#### UI/UX Polish
- **Theme system revamp**: Custom themes or use terminal colors
- **Modal/dialog consistency**: Ensure dialogs feel consistent with the rest of the app
- **Panel labels inside border**: Move `[1] Log` style labels to sit on/inside the border line (like lazygit's title placement on border)
- **Panel width tuning**: Make log and bookmark panels slightly wider to fit standard-length log messages
- **Help modal fixes**:
  - Fix search input not visually appearing (filtering works)
  - `?` should also close the help modal (toggle behavior)
- **Design review**: Overall look and feel pass

#### Main Area Enhancements
- **Rich commit details**: Show full commit message (subject + body) with `--stat` or `--summary` at the top (like lazygit's patch view showing file change counts)

#### Performance
- **Performance audit**: Significant lag when navigating commits in bookmarks tab
  - Likely culprit: diff rendering and/or ANSI parsing
  - Approach: Static analysis first, then profiling/benchmarking

#### Interactivity
- **Mouse support**: Click to focus panels, scroll, double-click for primary action

### 🐛 Known Issues
- Help modal has a small visual gap between border and outer edge (OpenTUI rendering quirk)
- Search input in help modal doesn't render visually (but filtering works)

