# kajji Agent Guidelines

Follow the Boy Scout rule:
- For minor things, just improve them
- For larger improvements, lift them to the user OR add them directly to `context/PROJECT.md`
- If you see a lack of testing in an area, offer to add

## Build/Test Commands

- **Install**: `bun install`
- **Dev**: `bun dev` (runs TUI)
- **Test**: `bun test` (runs all tests)
- **Typecheck**: `bun check` (tsc --noEmit)
- **Lint**: `bun lint` (biome check)
- **Lint fix**: `bun lint:fix` (biome check --write)

## OpenTUI Documentation

Before working on TUI component tasks, check the OpenTUI repo:
- **Docs**: https://github.com/sst/opentui/tree/main/packages/solid
- **Examples**: https://github.com/sst/opentui/tree/main/packages/solid/examples

Or fetch directly:
```bash
curl -s https://raw.githubusercontent.com/sst/opentui/refs/heads/main/packages/solid/README.md
```

## Code Style

- **Runtime**: Bun with TypeScript
- **Framework**: OpenTUI (Solid.js-based TUI framework)
- **Formatting**: Biome - tabs, no semicolons
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Imports**: Relative imports for local modules
- **Types**: Define interfaces in separate types.ts files when shared

## Bun

- **NEVER** run `bun src/index.tsx` directly - TUI apps will hang. Ask the user to run it manually.
- **NEVER** use `require()` - always use ESM imports at file top
- Use `bun add` to install packages, not `npm install`

## Solid.js

This project uses Solid.js, NOT React. Key differences:

- **State**: Use `createSignal`, not `useState`
  ```tsx
  const [value, setValue] = createSignal("initial")
  ```
- **Reading signals**: Must call as functions: `value()`, not `value`
  ```tsx
  // WRONG: <text>{value}</text>
  // CORRECT: <text>{value()}</text>
  ```
- **Mount effects**: Use `onMount`, not `useEffect`
  ```tsx
  onMount(() => {
    loadData()
  })
  ```
- **Input handling**: `<input>` uses `onInput`, receives string value not event
  ```tsx
  <input onInput={(value) => setValue(value)} />
  ```
- **No dependency arrays**: Solid tracks dependencies automatically - no `useEffect` deps needed

## Architecture

- **Entry**: `src/index.tsx` - renders root App component
- **Commander**: `src/commander/` - jj CLI wrappers and output parsers
- **Components**: `src/components/` - TUI components (panels, modals)
- **Context**: `src/context/` - SolidJS context providers (state management)
- **Keybind**: `src/keybind/` - Keybind registry and parser
- **Theme**: `src/theme/` - Theme definitions and presets (lazygit, opencode)
- **Utils**: `src/utils/` - Shared utilities (file tree, double-click detection)

## Testing

- **Unit tests**: `tests/unit/` - mirrors src structure
- **Benchmarks**: `tests/bench/` - performance tests with threshold assertions
- Run all: `bun test`
- Run benchmarks: `bun test tests/bench/`

## Key Patterns

### Focus System (`src/context/focus.tsx`)
Panels have modes like `log.revisions`, `log.files`, `bookmarks.list`, `bookmarks.commits`. Commands register for specific contexts and only activate when that context matches.

### Command Registry (`src/App.tsx`)
Commands are registered with `context`, `type`, and `visibility`. The keybind system routes key presses to the appropriate command based on current focus.

### Dialog System (`src/context/dialog.tsx`)
Modal stack with backdrop overlay. Dialogs push/pop from stack. Theme-aware styling.

### Prefix Injection (Log Parsing)
We inject unique prefixes into `jj log` template output to reliably parse multi-line entries. See `src/commander/log.ts`.

## Project Context & Plans

The `context/` folder contains project documentation:

### Primary Doc
- **`context/PROJECT.md`** - Features, plans, and known issues (single source of truth)

### Detailed Plans
- **`context/plans/configuration.md`** - Config system design
- **`context/plans/keybindings.md`** - Context-aware keybinds, status bar visibility
- **`context/plans/diff-viewing.md`** - Side-by-side diffs, layout modes, difftastic
- **`context/plans/diff-virtualization.md`** - Large diff performance (PTY streaming, lazy loading)
- **`context/plans/multi-select.md`** - Visual mode for batch operations
- **`context/plans/interactive-splitting.md`** - File/hunk-level jj split
- **`context/plans/github-stacking.md`** - Stacked PR creation and management
- **`context/plans/release-flows.md`** - npm, Homebrew, compiled binaries

### References
When unsure how to implement a jj TUI feature, check these repos and local analyses:

| Project | Repo | Local Analysis |
|---------|------|----------------|
| **jjui** (Go) | [idursun/jjui](https://github.com/idursun/jjui) | `context/references/reference-jjui.md` |
| **lazyjj** (Rust) | [Cretezy/lazyjj](https://github.com/Cretezy/lazyjj) | `context/references/reference-lazyjj.md` |
| **opencode** (TS) | [sst/opencode](https://github.com/sst/opencode) | `context/references/reference-opencode.md` |
| **OpenTUI** | [sst/opentui](https://github.com/sst/opentui) | `context/references/reference-opentui.md` |
| **critique** (TS) | [remorses/critique](https://github.com/remorses/critique) | — |

### Other
- **`context/llm-suggestions/`** - AI-generated improvement ideas (low priority)
- **`context/archive/`** - Historical docs (original spec, phase history)

## When to Update Documentation

Keep docs in sync with changes:

| Trigger | Action |
|---------|--------|
| **Implemented a feature** | Check off in `PROJECT.md` |
| **Major feature completed** | Update `README.md` (features list, keybindings) |
| **Found a bug** | Add to `PROJECT.md` under "Known Issues" |
| **New feature/goal** | Add checkbox to `PROJECT.md`, or create `plans/*.md` for complex features |
| **Design decision made** | Document in relevant `plans/*.md` file |
| **Discovered useful pattern** | Add to `references/` or this file |

**Don't update docs for**: Minor refactors, internal changes that don't affect features or plans.

## jj (Jujutsu) Workflow

This repo uses jj, not git directly:
- `jj st` - status
- `jj log` - commit history  
- `jj diff` - show changes
- `jj desc -m "msg"` - set commit message
- `jj new` - create new empty working copy
- `jj squash` - squash into parent

## OpenTUI Component Reference

### Layout & Containers
- **`<box>`**: Primary layout container (like div). Props: `flexDirection`, `flexGrow`, `padding`, `border`, `borderColor`, `backgroundColor`, `gap`
- **`<scrollbox>`**: Scrollable container. Props: `focused`, `stickyScroll`, `stickyStart="bottom"`, `scrollbarOptions={{ visible: true }}`

### Text & Styling
- **`<text>`**: Text display. Props: `fg`, `bg`, `content`
- **`<span>`**: Inline text styling. Props: `style={{ fg, bg, attributes }}`
- **`<b>`, `<i>`, `<u>`**: Bold, italic, underline wrappers
- **`TextAttributes`**: Import from `@opentui/core` for `UNDERLINE`, `BOLD`, etc.

### Specialized Components
- **`<diff>`**: Git diff rendering. Props: `diff`, `view="unified"|"split"`, `filetype`, `syntaxStyle`, `showLineNumbers`
- **`<code>`**: Syntax highlighted code. Props: `content`, `filetype`, `syntaxStyle`
- **`<input>`**: Text input field. Props: `focused`, `onInput`, `onSubmit`, `placeholder`, `ref`
  - `onInput` receives `(value: string)` NOT an event object
  - `onSubmit` fires on Enter key
  - Use `ref` for programmatic control (e.g., `inputRef.insertText(text)`)

### Hooks
- **`useKeyboard(callback)`**: Keyboard input handling
- **`useOnResize(callback)`**: Terminal resize handling

### ANSI Rendering (ghostty-opentui)
For rendering colored CLI output (like `jj diff --color always`):
```tsx
import { ptyToJson } from "ghostty-opentui"
// Parse ANSI to JSON structure with lines/spans
const data = ptyToJson(ansiString, { cols: 80, rows: 24 })
// data.lines[].spans[] contains { text, fg, bg, flags }
```

### Styling Patterns
```tsx
// Box with background and border
<box backgroundColor="#1a1b26" border borderColor="#4ECDC4" padding={1}>

// Text with foreground color
<text fg="#00ff00">Green text</text>

// Inline styled spans
<text>
  Normal <span style={{ fg: "#ff0000", bg: "#000" }}>red on black</span>
</text>

// Text attributes
<span style={{ attributes: TextAttributes.UNDERLINE, fg: "blue" }}>underlined</span>
```
