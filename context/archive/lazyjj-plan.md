# lazierjj - A Modern TUI for Jujutsu

> A polished TUI for [jj (Jujutsu)](https://github.com/martinvonz/jj) built with [OpenTUI](https://github.com/sst/opentui) + SolidJS, inspired by [lazygit](https://github.com/jesseduffield/lazygit)

**Command:** `lj`

---

## Table of Contents

1. [Project Goals](#project-goals)
2. [Architecture Decisions](#architecture-decisions)
3. [Layout & Navigation](#layout--navigation)
4. [Views & Interactions](#views--interactions)
5. [Operations & Keybindings](#operations--keybindings)
6. [Modals & Dialogs](#modals--dialogs)
7. [Command Mode](#command-mode-)
8. [Search & Filter](#search--filter)
9. [Configuration](#configuration)
10. [Diff Rendering](#diff-rendering)
11. [GitHub Integration](#github-integration)
12. [Agent-Friendly Development](#agent-friendly-development)
13. [Post-MVP Features](#post-mvp-features)
14. [File Structure](#file-structure)
15. [References](#references)

---

## Project Goals

1. **First-class diff viewing** - Side-by-side diffs via difftastic or user's configured diff tool
2. **Lazygit-level polish** - Smooth UX, context-sensitive keybindings, mouse support
3. **Native jj experience** - Respect jj's config, use jj's graph output, feel native to jj users
4. **Editor integration** - Suspend TUI to open $EDITOR at specific line in diff
5. **Streamlined PR workflow** - Reduce friction from "changes on machine" to PR

---

## Architecture Decisions

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Framework** | OpenTUI + SolidJS | Production-proven (opencode uses it), more features (Portal, Dynamic), better examples |
| **Runtime** | Bun | Native TS execution, fast startup, OpenTUI's target runtime |
| **Language** | TypeScript (strict) | Type safety, ecosystem alignment |
| **Config format** | TOML | Match jj's config format, read from `[lazierjj]` section in jj config |
| **Config validation** | Zod | Schema validation with defaults, great error messages for agents |
| **Diff engine** | jj's configured tool | Shell out to `jj diff`, display ANSI output verbatim |
| **Linting/Formatting** | Biome | Fast, single tool, instant feedback |
| **Testing** | Bun test + snapshot tests | Fast feedback loops for agent development |

### Why SolidJS over React?

- **Production-proven**: opencode (complex TUI) uses Solid
- **More features**: Portal (modals), Dynamic, extra hooks we'll need
- **SST's choice**: Bugs get found and fixed in Solid first
- **Better examples**: 15+ examples vs 3-4 for React
- **Simpler mental model**: Signals are more natural for reactive terminal state

### Why Not Neovim Plugin?

Considered but rejected in favor of standalone TUI:
- Broader audience (not limited to Neovim users)
- Complete design control
- Can match lazygit polish exactly
- Editor integration still possible via $EDITOR suspend

### Graph Parsing Strategy

**Approach**: jjui-style prefix injection (not lazyjj-style line-index mapping)

**Why**: lazyjj assumes exactly 2 lines per commit (`builtin_log_compact`). Supporting custom user templates later would require a full rewrite. jjui's prefix injection works with any template — more work upfront, zero rewrite later.

**How it works**:

```
# We inject a metadata prefix into jj's template:
"__LJ__" ++ change_id.short() ++ "__LJ__" ++ commit_id.short() ++ "__LJ__ " ++ <rest_of_template>

# Output becomes:
__LJ__abc123__LJ__def456__LJ__ ○ feat: add feature
                               │  description continues here  
__LJ__ghi789__LJ__jkl012__LJ__ ○ fix: bug
```

**Parser logic**:
1. Scan each line for `__LJ__` prefix
2. If found: extract change_id and commit_id, start new commit entry
3. If not found: append line to current commit entry
4. Result: array of `{ changeId, commitId, lines[] }` where each entry = one commit (regardless of how many terminal lines it spans)

**MVP simplification**: Use `builtin_log_compact` template but still use the prefix parser. This gives predictable output for testing while building a parser that's already template-agnostic. Custom template support is a config flag flip later.

---

## Layout & Navigation

### Panel Structure

```
┌─────────────────────────────────────┬──────────────────────────────────────────┐
│ [1] Log / Oplog ([ ] to cycle)      │                                          │
│ ┌─────────────────────────────────┐ │                                          │
│ │ ○ abc123 feat: add feature      │ │        Main Detail Area (~60%+)          │
│ │ ○ def456 fix: bug fix           │ │                                          │
│ │ @ ghi789 wip                    │ │   - Shows DIFF when commit/file selected │
│ │ ○ jkl012 docs: update readme    │ │   - Shows LOG when bookmark selected     │
│ └─────────────────────────────────┘ │                                          │
├─────────────────────────────────────┤                                          │
│ [2] Bookmarks                       │                                          │
│ ┌─────────────────────────────────┐ │                                          │
│ │ main (PR #123)                  │ │                                          │
│ │ feature/foo                     │ │                                          │
│ └─────────────────────────────────┘ │                                          │
├─────────────────────────────────────┼──────────────────────────────────────────┤
│                                     │ Command Log (expandable)                 │
│                                     │ > jj new                                 │
│                                     │ > jj describe -m "..."                   │
└─────────────────────────────────────┴──────────────────────────────────────────┘
│ Status bar: context-sensitive keybinding hints                                  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Panel Behavior

- **Left side**: Stacked panels (Log, Bookmarks)
- **Right side**: Main detail area (diff or log) + Command Log below
- **Focus-based expansion**: Focused panel expands, others shrink (like lazygit's stash panel)
- **Sub-tabs**: `[` and `]` cycle within a panel (Log ↔ Oplog)
- **Command Log**: Under main area, expands when focused or after running `:` command

### Navigation

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle focus: Log → Bookmarks → Main Area → Command Log → Log |
| `[` / `]` | Cycle sub-tabs within panel (Log ↔ Oplog) |
| `j` / `k` | Move selection (in list) or scroll (in main area when focused) |
| `Ctrl+d` / `Ctrl+u` | Page down/up (when main area focused) |
| `g` / `G` | Jump to top/bottom |
| `Enter` | Drill into commit (morphs Log panel to File Tree) |
| `Escape` | Return to previous view (File Tree → Log) |
| `1-4` | Jump directly to panel |

### Mouse Support

- **Click**: Focus panel, select item
- **Scroll**: Scroll within panel
- **Double-click**: Primary action for context
  - On commit: Edit that commit (`jj edit`)
  - On file: Open in editor
  - On bookmark: Show log for that bookmark

---

## Views & Interactions

### Log View (Primary)

- Runs `jj log --color always` with injected prefix markers (see Graph Parsing Strategy)
- Parses output to map terminal lines → commits (supports multi-line commit entries)
- Shows: change ID, commit ID, author, description, bookmarks
- Working copy (`@`) highlighted and focused on startup
- `Enter` on commit → morphs panel to File Tree for that commit

### File Tree View

- Appears when drilling into a commit via `Enter`
- Hierarchical tree grouped by directory (collapsible folders)
- **Expanded by default** (all folders open)
- Shows file status (A/M/D) with colors
- `Escape` returns to Log view
- Selecting a file shows its diff in main area

### Bookmarks Panel ✅

- List of local and remote bookmarks
- **Drill-down navigation**: Bookmark list → commit log → file tree (morphing panel pattern)
- Selecting a bookmark shows its commits, selecting a commit shows its files
- File tree with folder collapse/expand, file status colors (A/M/D)
- Back navigation with Escape at each level
- `Enter` on commit in that log → jumps to that commit in main Log panel

**Bookmark Operations (planned):**
| Key | Action |
|-----|--------|
| `c` | Create bookmark (at selected commit in Log, or prompt if in Bookmarks panel) |
| `d` | Delete bookmark |
| `r` | Rename bookmark |
| `t` | Track remote bookmark |
| `T` | Untrack |
| `m` | Move bookmark to different commit |

### Main Detail Area

- **When commit selected**: Shows full diff (format depends on configured diff tool)
- **When bookmark selected**: Shows log for that bookmark
- **When file selected**: Shows diff for that specific file
- `v` toggles between unified and side-by-side diff
- Tab-focusable for scrolling with j/k, Ctrl+d/u

### Oplog View (Sub-tab of Log)

- `[` / `]` cycles to Oplog from Log
- Shows jj operation history
- Select operation and press key to restore (no confirmation since explicit action)

### Command Log Panel

- Shows commands executed this session (session-only, not persisted)
- Output always expanded inline
- Auto-expands and focuses after running `:` command
- Expands when focused (like other panels)

---

## Operations & Keybindings

### Core jj Operations (MVP)

| Key | Operation | Confirmation? |
|-----|-----------|---------------|
| `n` | `jj new` - Create new change | No |
| `e` | `jj edit` - Edit selected change | No |
| `d` | `jj describe` - Edit description | Opens modal |
| `s` | `jj squash` - Squash into parent | No |
| `a` | `jj abandon` - Abandon change | **Yes** |
| `Space` | `jj edit` - Same as `e` | No |
| `u` | `jj undo` - Undo last operation | **Yes** (shows what will be undone) |
| `Ctrl+r` | `jj redo` - Redo | No |
| `r` | `jj rebase` - Rebase onto (opens target picker modal) | No |
| `S` | `jj split` - Split commit (shells out to jj's interactive split) | No |

### Special Handling

- **Immutable commits**: If user tries to edit immutable, show modal asking to confirm force-edit
- **Undo in Oplog**: No confirmation needed (explicit action)

### Rebase Target Picker

When pressing `r`, a modal opens to select rebase target:

```
┌─ Rebase abc123 onto... ─────────────────────────────────────────────────┐
│  ▸ main (default)                                                       │
│  ▸ Bookmarks                                                            │
│      feature/foo                                                        │
│      feature/bar                                                        │
│  ▸ Recent commits                                                       │
│      def456 - fix: something                                            │
│      ghi789 - feat: other thing                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Default**: `main` (or trunk bookmark) at top
- **Sections**: Bookmarks and Recent commits are collapsible
- **Focus behavior**: Section expands when focused, collapses when unfocused
- Filter with `/` to search across all options

### Terminal Handoff

Some operations shell out and take over the terminal:
- `jj split` (interactive split UI)
- `$EDITOR` (describe in editor, open file)
- Unknown commands via `:` command mode

**Behavior**: Suspend TUI → run command → show "press enter to continue..." → resume TUI

This ensures users can read output/errors before the TUI redraws.

### Remote Operations (MVP)

| Key | Operation |
|-----|-----------|
| `f` | `jj git fetch` |
| `P` | `jj git push` |
| `C` | Create PR (via `gh pr create`) |

### Navigation & UI

| Key | Action |
|-----|--------|
| `q` | Quit (immediate, no confirmation) |
| `Ctrl+c` | Quit |
| `?` | Show help panel (searchable, multi-column like jjui) |
| `/` | Start filter mode (filters by description + change ID) |
| `:` | Command mode (run arbitrary jj commands) |
| `R` | Manual refresh |
| `o` | Open file in $EDITOR at current line / Open PR link in browser |
| `v` | Toggle unified/side-by-side diff (in main area) |
| `y` | Yank menu (copy change ID, commit ID, description, etc.) |

### Yank Menu (`y`)

Opens menu to copy:
- Change ID (short)
- Commit ID (full)
- Description
- PR URL (if linked)

Uses OSC52 for SSH compatibility, falls back to system clipboard.

---

## Modals & Dialogs

### Modal Behavior

- **Dim everything else** when modal is open (like opencode)
- **Keybinds shown on modal border**
- Stack-based (can have nested modals)

### Describe Modal (Commit Message)

```
┌─ Describe change abc123 ────────────────── Enter: save | Tab: switch | Ctrl+s: save | Esc: cancel ─┐
│ ┌─ Subject ────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ feat: add new feature                                                                            │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Body ───────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                                                  │ │
│ │                                                                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Subject line**: Single line, Enter saves and exits
- **Body**: Multiline, Enter = newline, Tab switches fields
- **Ctrl+s**: Save from either field
- **Pre-fills** with existing description when editing

### Confirmation Modal

```
┌─ Undo ──────────────────────────────────────────────── y: Yes | n: No ─┐
│ Are you sure you want to undo 'describe abc123'?                        │
│                                                                         │
│                                                  [Yes]  [No]            │
└─────────────────────────────────────────────────────────────────────────┘
```

Used for:
- Abandon (always)
- Undo (except when in Oplog view)
- Force-edit of immutable commits

### Error Modal

- jj command failures show in a modal
- User must dismiss to continue
- Ensures errors are seen

### Help Modal (`?`)

- **Searchable** - `/` to filter keybindings
- **Multi-column layout** grouped by category (like jjui)
- Categories: UI, Revisions, Details, Preview, Git, Bookmarks, Oplog, etc.

---

## Command Mode (`:`)

- `:` opens command input at bottom of screen
- Run arbitrary jj commands (no autocomplete for MVP)
- Output appears in Command Log panel
- After running command, Command Log panel auto-expands and focuses

---

## Search & Filter

- `/` starts filter mode
- Filters by: description + change ID
- Real-time filtering as you type
- `Escape` clears filter
- Revset filtering: Post-MVP

---

## Configuration

### Location Priority

1. `[lazierjj]` section in jj's config (`~/.jjconfig.toml` or `.jj/repo/config.toml`)
2. Standalone `~/.config/lazierjj/config.toml` (fallback, respects XDG_CONFIG_HOME)

### Example Config

```toml
# In ~/.jjconfig.toml
[lazierjj]
# Diff settings - if set, uses jj diff --tool <this>; otherwise jj uses its own config
diff_tool = "difft"  # optional: "difft", "delta", etc.

# Keybindings (full customization from MVP)
[lazierjj.keybinds]
quit = "q"
new = "n"
edit = "e"
describe = "d"
squash = "s"
abandon = "a"
undo = "u"
redo = "ctrl+r"
rebase = "r"
split = "S"
create_pr = "C"
fetch = "f"
push = "P"
help = "?"
filter = "/"
command = ":"
refresh = "R"
open = "o"
toggle_diff_view = "v"
yank = "y"
# ... all keybindings configurable

# UI behavior
[lazierjj.ui]
side_panel_width = 0.35
```

### Theming

- Inherit colors from jj config and terminal
- No custom theming for MVP (respects existing setup)
- No Nerd Font icons (keep it simple)

---

## Diff Rendering

### How It Works

We shell out to `jj diff` and display the output in a scrollable viewport. Side-by-side rendering is delegated to external tools (difftastic, delta) configured by the user.

**Current state (MVP)**: Using `--color never` and displaying plain text. OpenTUI cannot render raw ANSI escape codes.

**Future enhancement**: Parse ANSI SGR codes from `jj diff --color always` output and convert to OpenTUI styled `<span>` elements. This preserves user's diff tool choice while enabling colored output. See `implementation-order.md` for detailed approach.

### Resolution Order

1. **lazierjj config** - If `diff_tool` is set in `[lazierjj]`, use `jj diff --tool <configured>`
2. **jj default** - Otherwise, run `jj diff` (jj uses its own `ui.diff.tool` config or falls back to `--color-words`)

### Toggle (`v` key)

Cycles through: configured tool → `--color-words` → `--git` (unified patch format)

### Width Handling

- Pass `COLUMNS` env var set to panel width before running `jj diff`
- This lets external tools (difftastic, delta) format to the correct width
- Horizontal scrolling supported for wide side-by-side output

---

## Editor Integration

- `o` key opens file in `$EDITOR`
- Opens at the currently viewed line in diff (not just file start)
- Suspends TUI, opens editor, resumes TUI on editor exit

---

## GitHub Integration

### MVP Features

- **Create PR**: Action to create PR via `gh` CLI with sensible defaults
- **Open PR**: `o` on bookmark/commit opens PR link in browser (via `gh pr view --web`)

### Post-MVP

- View PR status indicator in bookmark list (PR number, open/merged/closed)
- Log indication showing PR association
- Stacked PRs support
- PR review integration
- CI status display

---

## Startup Behavior

### In jj Repo
- Start with focus on working copy (`@`)
- Show Log panel + Bookmarks panel + Main diff area + Command Log

### Outside jj Repo
1. Offer to initialize (`jj init` or `jj git init`)
2. Show recent repos list if available

### Version Check
- Check jj version on startup
- Warn if version is too old but try to work anyway

---

## Status Bar

- Context-sensitive keybinding hints
- Changes based on focused panel
- Examples:
  - Log focused: `n:new e:edit d:describe a:abandon s:squash r:rebase`
  - Bookmarks focused: `c:create d:delete r:rename t:track m:move`
  - Main area focused: `j/k:scroll v:toggle-view o:open`

---

## Loading & Progress

- Show progress/spinner in the relevant panel during operations
- Manual refresh with `R` key (auto-refresh is post-MVP)

---

## Agent-Friendly Development

### Project Structure for Agents

```
lazierjj/
├── CLAUDE.md              # Symlinked to AGENTS.md - project context for AI agents
├── AGENTS.md              # Primary agent instructions file
├── src/                   # Small, focused files (~200 LOC max)
├── tests/                 # Comprehensive test suite
└── ...
```

### CLAUDE.md / AGENTS.md Contents

The agent context file should include:
- Project overview and goals
- Tech stack and key dependencies
- File structure explanation
- Common commands (test, lint, build, run)
- Architecture patterns used
- Naming conventions
- How to add new features (templates/patterns to follow)

### Fast Feedback Loops

| Command | Purpose | Target Time |
|---------|---------|-------------|
| `bun test` | Run all tests | < 5s |
| `bun test:watch` | Watch mode for TDD | Instant feedback |
| `bun check` | Type check | < 3s |
| `bun lint` | Lint + format check | < 2s |
| `bun lint:fix` | Auto-fix lint issues | < 2s |
| `bun build` | Build for production | < 10s |

### Type-Checked Boundaries

- **Zod schemas** for all external data (config, jj command output)
- **Strict TypeScript** - `"strict": true`, no `any`
- Errors point directly to the problem (good for agent debugging)

### Modular File Structure

- **~200 LOC max per file** - Easier for agents to reason about
- **Single responsibility** - One component/function per file where sensible
- **Predictable naming** - `ComponentName.tsx`, `use-hook-name.ts`, `action-name.ts`
- **Index re-exports** - Clean imports, agents can find what they need

### Conventional Patterns

```typescript
// Components: PascalCase, default export
// src/components/panels/LogPanel.tsx
export default function LogPanel() { ... }

// Hooks: camelCase with use prefix, named export
// src/hooks/use-keyboard.ts
export function useKeyboard() { ... }

// Actions: camelCase, named exports
// src/actions/jj.ts
export async function editCommit(changeId: string) { ... }

// Types: PascalCase, in types.ts or co-located
// src/types.ts
export interface Commit { ... }
```

### Testing Strategy

```
tests/
├── unit/              # Pure function tests (fast)
│   ├── config/
│   ├── commander/     # jj output parsing
│   └── utils/
├── component/         # Component rendering tests
│   └── panels/
├── integration/       # Full flow tests
│   └── workflows/
└── snapshots/         # UI snapshot tests
```

- **Snapshot tests** for UI components (catch unintended changes)
- **Unit tests** for all parsing logic (jj output is complex)
- **Integration tests** for critical workflows
- **No flaky tests** - Deterministic, no timing-dependent assertions

### CI/CD

```yaml
# .github/workflows/ci.yml
- bun install
- bun check        # Type check
- bun lint         # Lint
- bun test         # Tests
- bun build        # Build
```

All steps must pass. Clear error output for agent debugging.

---

## Post-MVP Features

### Immediate Priorities (UI/UX Polish)
- **Theme system revamp**: Custom themes or use terminal colors
- **Modal/dialog consistency**: Ensure dialogs feel consistent with the rest of the app
- **Panel labels inside border**: Move `[1] Log` labels to sit on/inside the border line (like lazygit's title on border)
- **Panel width tuning**: Make log and bookmark panels slightly wider to fit standard-length log messages
- **Help modal fixes**:
  - Fix search input not visually appearing (filtering works)
  - `?` should toggle (also close) the help modal
- **Design review**: Overall look and feel pass
- **Rich commit details**: Show full commit message (subject + body) with `--stat` or `--summary` at top (like lazygit's patch view with file change counts)
- **Performance audit**: Significant lag when navigating commits in bookmarks tab (diff rendering/ANSI parsing likely culprit). Static analysis first, then profiling.
- **Mouse support**: Click to focus panels, scroll, double-click for primary action

### Tier 1 (High Priority)
- Auto-refresh on filesystem changes
- Command mode autocomplete (jj subcommands, change IDs, bookmark names)
- GitHub PR status indicator in bookmark list
- `D` to open describe in `$EDITOR` (full editor instead of inline modal)
- `jj duplicate` (keybind TBD — `Ctrl+d` conflicts with page-down)
- Conflict visualization and basic handling
- Revset filtering in log view
- Command palette (Ctrl+P) - already have infrastructure from command registration
- Recent repos tracking and switching
- Multi-select for batch operations (`v` for visual mode)

### Tier 2 (Medium Priority)
- Commit graph rendering (custom, not jj's ASCII)
- Interactive rebase UI
- Worktree/workspace support
- Custom commands (user-defined shortcuts)
- Stacked PRs support
- Conventional commit prefix autocomplete

### Tier 3 (Nice to Have)
- Lane highlighting (dim unrelated branches, highlight selected commit's ancestry)
- Full theme customization
- Animations/transitions (OpenTUI Timeline)
- Multiple repo management
- Bisect support
- Onboarding/tutorial for first-time users

### Future Considerations
- Large repo optimization (10k+ commits - pagination, lazy loading)
- Colocated git repos (special handling)
- Leader key support (avoid terminal conflicts)

---

## File Structure

```
lazierjj/
├── CLAUDE.md                    # Symlink to AGENTS.md
├── AGENTS.md                    # Agent context and instructions
├── README.md                    # User-facing documentation
├── package.json
├── tsconfig.json
├── biome.json                   # Linting/formatting config
├── bunfig.toml
├── src/
│   ├── index.tsx                # Entry point
│   ├── App.tsx                  # Root component, provider stack
│   ├── types.ts                 # Shared types
│   ├── config/
│   │   ├── schema.ts            # Zod schema for config
│   │   ├── loader.ts            # Load from jj config + fallback
│   │   └── defaults.ts          # Default values
│   ├── context/                 # SolidJS context providers
│   │   ├── route.tsx            # Simple signal-based routing
│   │   ├── sync.tsx             # Data synchronization & state
│   │   ├── keybind.tsx          # Keybinding parser & handler
│   │   ├── command.tsx          # Command palette registry
│   │   └── dialog.tsx           # Modal stack manager
│   ├── commander/               # jj CLI abstraction
│   │   ├── executor.ts          # jj CLI wrapper
│   │   ├── types.ts             # Commit, FileChange, etc.
│   │   ├── log.ts               # jj log parsing
│   │   ├── diff.ts              # jj diff (with difft cascade)
│   │   ├── files.ts             # jj status/files
│   │   ├── bookmarks.ts         # jj bookmark
│   │   ├── operations.ts        # jj op log
│   │   └── version.ts           # Version check
│   ├── components/
│   │   ├── Layout.tsx           # Main layout
│   │   ├── StatusBar.tsx        # Context-sensitive hints
│   │   ├── CommandInput.tsx     # : command mode
│   │   ├── panels/
│   │   │   ├── LogPanel.tsx     # Log + Oplog (sub-tabs)
│   │   │   ├── BookmarksPanel.tsx
│   │   │   ├── FileTreePanel.tsx
│   │   │   ├── MainArea.tsx     # Diff/Log detail view
│   │   │   └── CommandLog.tsx   # Command history
│   │   └── modals/
│   │       ├── DescribeModal.tsx
│   │       ├── ConfirmModal.tsx
│   │       ├── ErrorModal.tsx
│   │       ├── HelpModal.tsx
│   │       └── YankMenu.tsx
│   ├── hooks/
│   │   ├── use-keyboard.ts
│   │   ├── use-terminal-size.ts
│   │   └── use-auto-scroll.ts
│   ├── actions/
│   │   ├── jj.ts                # jj operations (new, edit, etc.)
│   │   ├── navigation.ts        # Cursor, focus, panel switching
│   │   ├── clipboard.ts         # OSC52 + system clipboard
│   │   └── github.ts            # PR operations via gh CLI
│   └── utils/
│       ├── parse-graph.ts       # Parse jj log --graph output
│       └── parse-diff.ts        # Parse diff output
├── tests/
│   ├── unit/
│   ├── component/
│   ├── integration/
│   └── snapshots/
└── scripts/
    └── dev.ts                   # Development helpers
```

---

## Dependencies

```json
{
  "dependencies": {
    "@opentui/core": "^0.1.x",
    "@opentui/solid": "^0.1.x",
    "solid-js": "^1.x",
    "zod": "^3.x",
    "smol-toml": "^1.x"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.x",
    "typescript": "^5.x",
    "bun-types": "latest"
  }
}
```

---

## SolidJS Quick Reference

For developers familiar with React:

```
React                    →  Solid
useState()               →  createSignal()
useMemo()                →  createMemo()
useEffect()              →  createEffect()
useCallback()            →  (not needed)
useContext()             →  useContext()
{condition && <X/>}      →  <Show when={condition}><X/></Show>
{items.map(...)}         →  <For each={items}>{item => ...}</For>
{a ? <A/> : <B/>}        →  <Switch><Match when={a}><A/></Match>...</Switch>
```

Key differences:
- Components run once (not on every render)
- Signals are reactive primitives (like Vue refs)
- No dependency arrays needed
- Fine-grained reactivity (only what changes updates)

---

## References

- [lazygit](https://github.com/jesseduffield/lazygit) - Gold standard git TUI, UX inspiration
- [lazyjj](https://github.com/Cretezy/lazyjj) - Existing Rust TUI for jj
- [jjui](https://github.com/idursun/jjui) - Another jj TUI, help panel reference
- [OpenTUI](https://github.com/sst/opentui) - Modern TypeScript TUI framework
- [opencode](https://github.com/sst/opencode) - Reference OpenTUI + Solid implementation
- [jj (Jujutsu)](https://github.com/martinvonz/jj) - Git-compatible VCS
- [difftastic](https://github.com/Wilfred/difftastic) - Structural diff tool
