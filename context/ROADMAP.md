# lazierjj - Roadmap

> Features planned for implementation, ordered by priority.
> 
> For current state, see [STATUS.md](./STATUS.md).
> For original design vision, see [archive/lazyjj-plan.md](./archive/lazyjj-plan.md).

---

## Next Up

These are the definite next priorities. Work on these first.

### Core Operations

The essential jj operations to make lazierjj actually useful for daily work.

| Key | Operation | Behavior |
|-----|-----------|----------|
| `n` | `jj new` | Create new change. No confirmation. |
| `e` | `jj edit` | Edit selected change. No confirmation. |
| `d` | `jj describe` | Opens describe modal (see below). |
| `s` | `jj squash` | Squash into parent. No confirmation. |
| `a` | `jj abandon` | Abandon change. **Requires confirmation.** |

#### Describe Modal

```
┌─ Describe change abc123 ──────────── Enter: save | Tab: switch | Esc: cancel ─┐
│ ┌─ Subject ──────────────────────────────────────────────────────────────────┐ │
│ │ feat: add new feature                                                      │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Body ─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                            │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Subject line**: Single line, Enter saves and exits
- **Body**: Multiline, Enter = newline, Tab switches fields
- **Pre-fills** with existing description when editing
- Use OpenTUI `<input>` component

#### Confirmation Modal

```
┌─ Abandon ─────────────────────────────────────────── y: Yes | n: No ─┐
│ Are you sure you want to abandon abc123?                              │
│ "feat: my commit message"                                             │
│                                                                       │
│                                              [Yes]  [No]              │
└───────────────────────────────────────────────────────────────────────┘
```

- Show commit description in confirmation
- `y` or Enter on Yes = confirm
- `n` or Escape = cancel

#### Error Handling

- jj command failures show in error modal
- User must dismiss to continue (ensures errors are seen)
- Show full error output from jj

---

### Theme System

Expand theming to support terminal-native colors and named themes.

#### Phase 1: Two Themes (MVP)

**System Theme** - Adapts to user's terminal colors (like opencode):
- Uses `none` for text/background to inherit terminal defaults
- Generates grayscale from terminal's background color for contrast
- Uses ANSI colors (0-15) for UI elements - respects terminal palette
- Best for users who want lazierjj to match their terminal

**OpenCode Theme** - Our default hardcoded theme:
- Current color tokens (the OpenCode-inspired palette we have now)
- Explicit hex colors for everything

**Initial Implementation**:
- Toggle via code only (no UI yet)
- Export `currentTheme` signal from theme context
- Components read from theme context instead of hardcoded colors

#### Phase 2: Theme Switching (Later)

Requires command picker (`Ctrl+P` or `/theme`):
- List available themes
- Preview on hover (if feasible)
- Persist selection to config file

**Config persistence**:
- Store in `~/.config/lazierjj/config.toml` or jj config `[lazierjj]` section
- Load on startup, default to "system" or "opencode"

#### Phase 3: Theme Parity with OpenCode (Later)

Add popular themes from opencode:
- tokyonight, catppuccin, gruvbox, nord, everforest, etc.
- JSON-based theme definitions
- Custom theme loading from config directory

#### Reference

OpenCode theme system docs: https://opencode.ai/docs/themes/

Key patterns:
- Semantic tokens: primary, secondary, accent, error, warning, success, info
- Text tokens: text, textMuted
- Background tokens: background, backgroundPanel, backgroundElement
- Border tokens: border, borderActive, borderSubtle
- Diff tokens: diffAdded, diffRemoved, diffContext, etc.
- `"none"` value = use terminal default

---

### UI Polish

Quick wins that improve the experience.

#### Help Modal Toggle
- `?` should also close the help modal (currently only opens)
- Simple: check if help modal is open, close instead of open

#### Panel Labels on Border
- Move `[1] Log` style labels to sit on the border line (like lazygit)
- Currently labels are inside the panel

#### Panel Width Tuning
- Log and bookmark panels slightly wider
- Standard log messages often get cut off

---

### Mouse Support

- **Click**: Focus panel, select item
- **Scroll**: Scroll within panel
- **Double-click**: Primary action (edit commit, open file, etc.)

---

### Rich Commit Details

- Show full commit message (subject + body) in main area header
- Add `--stat` or `--summary` showing file change counts
- Like lazygit's patch view

---

### Auto-Refresh

- Watch filesystem for changes (file saves, external jj commands)
- Automatically refresh log and diff views
- Debounce to avoid excessive refreshes
- Visual indicator when refresh happens

---

### Create PR (`o`)

- `o` on a bookmark creates a PR for that branch
- Use `gh pr create --web` to open GitHub's PR creation page in browser
- Pre-fills branch name from selected bookmark
- If PR already exists, opens the existing PR instead

---

### Git Fetch (`f`)

- `f` runs `jj git fetch`
- Refresh log and bookmarks after completion
- Show brief status message (e.g., "Fetched from origin")

---

## Nice-to-Have

Features that would be valuable but aren't blocking daily use.

### Undo/Redo

| Key | Operation | Behavior |
|-----|-----------|----------|
| `u` | `jj undo` | Undo last operation. **Shows confirmation with what will be undone.** |
| `Ctrl+r` | `jj redo` | Redo. No confirmation. |

### Search & Filter (`/`)

- `/` starts filter mode (input appears in status bar area)
- Filters log by: description + change ID
- Real-time filtering as you type
- `Escape` clears filter and exits filter mode
- Matches highlighted in results

### Command Mode (`:`)

- `:` opens command input at bottom of screen
- Run arbitrary jj commands
- Output appears in a command log panel (or modal)
- History with up/down arrows (session only, not persisted)
- No autocomplete for initial implementation

### Rebase (`r`)

Opens target picker modal:

```
┌─ Rebase abc123 onto... ─────────────────────────────────────────────┐
│  > main                                                              │
│    feature/foo                                                       │
│    feature/bar                                                       │
│    def456 - fix: something                                           │
│    ghi789 - feat: other thing                                        │
└──────────────────────────────────────────────────────────────────────┘
```

- Default selection: main/trunk bookmark
- Filter with `/` to search
- Shows bookmarks + recent commits

### Split (`S`)

- Shells out to jj's interactive split
- Suspend TUI -> run `jj split` -> "press enter to continue" -> resume TUI

### Git Push (`P`)

- `P` runs `jj git push`
- Push current bookmark to remote
- Show status/error message

### Yank Menu (`y`)

Opens menu to copy:
- Change ID (short)
- Commit ID (full)  
- Description
- PR URL (if linked)

Uses OSC52 for SSH compatibility, falls back to system clipboard.

### Oplog View

- `[` / `]` cycles between Log and Oplog
- Shows jj operation history
- Select operation and press key to restore
- No confirmation needed (explicit action)

### Interactive Staging (Split View)

Inspired by lazygit's stage/unstage flow. Allows staging at hunk/line level within the TUI.

#### Main Area Behavior

**Single pane** when:
- Nothing staged (all changes unstaged)
- Everything staged (no unstaged changes)
- Shows the diff as normal

**Two panes (staged | unstaged)** when:
- Partial staging at file/folder level in file selector
- Left pane: staged changes, Right pane: unstaged changes
- Visual split in main area

#### Hunk-Level Staging

When pressing `Enter` on a file in the file tree:
- Cursor moves to the diff area (main area gets focus)
- Navigate between hunks with `j`/`k` or `n`/`N` (next/prev hunk)
- `Space` stages/unstages the current hunk
- `Tab` toggles focus between staged and unstaged panes
- `Escape` returns to file tree

#### Key Differences from Lazygit

We're taking inspiration, not copying exactly:
- jj doesn't have a staging area in the git sense - this would work with `jj split` or similar
- Need to figure out how this maps to jj's model (possibly `jj split -i` integration)
- May need to track "what user wants to include in current commit" as app state

#### How jjui Does It (Research)

jjui takes a hybrid approach:
- **File-level selection in TUI**: Users toggle files with Space, tracked as "checked items" in app state
- **Delegates hunk/line to jj**: For fine-grained selection, suspends TUI and runs `jj restore --interactive` or `jj split -i`, letting jj's `ui.diff-editor` handle it
- **Commands used**: `jj split -r <rev> <files>`, `jj restore -c <rev> --interactive`, `jj squash --interactive`

#### Our Approach (TBD)

Options:
1. **jjui-style**: File selection in TUI, delegate hunk-level to `jj split -i` (simpler, proven)
2. **Full in-TUI**: Build our own hunk selection UI with staged/unstaged panes (more work, better UX)
3. **Hybrid**: File selection + simple hunk toggle in TUI, fall back to jj for complex cases

Leaning toward option 1 for MVP, option 2/3 as enhancement later. The two-pane visual (staged | unstaged) could still work with file-level granularity initially.

---

## Future Ideas

Longer-term possibilities. Not planned for near-term.

- Command mode autocomplete
- PR status indicator in bookmark list
- Conflict visualization
- Revset filtering
- Command palette (Ctrl+P)
- Multi-select for batch operations
- Custom graph rendering
- Interactive rebase UI
- Stacked PRs support
- Large repo optimization (10k+ commits)

---

## Reference

For detailed design specs and rationale, see:
- [archive/lazyjj-plan.md](./archive/lazyjj-plan.md) - Original full specification
- [references/](./references/) - Analysis of jjui, lazyjj, opencode patterns
