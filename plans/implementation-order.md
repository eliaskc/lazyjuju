# Implementation Order - lazierjj

> Getting to a runnable prototype as fast as possible
> 
> **Goal**: See the log, scroll around, view diffs (read-only)

This document outlines the order of implementation to get a working prototype quickly. It does NOT duplicate the full feature specifications in `lazyjj-plan.md` - refer there for detailed behavior, keybindings, and design decisions.

---

## Phase 1: Hello World TUI
**Target: < 1 hour | Validates toolchain**

### 1.1 Project Scaffolding
- [ ] Initialize with `bun create tui --template solid` OR manual setup
- [ ] Create `package.json` with dependencies:
  - `@opentui/core`, `@opentui/solid`, `solid-js`
  - `babel-preset-solid`, `@babel/core`, `@babel/preset-typescript`
- [ ] Create `tsconfig.json` with `jsxImportSource: "@opentui/solid"`
- [ ] Create `bunfig.toml` with `preload = ["@opentui/solid/preload"]`
- [ ] Create `biome.json` for linting

### 1.2 Minimal Entry Point
- [ ] `src/index.tsx` - renders a box with "lazierjj" text
- [ ] Verify `bun run src/index.tsx` shows something on screen
- [ ] Add `q` keybinding to quit (validates input handling works)

### 1.3 Scripts
- [ ] `package.json` scripts: `dev`, `check`, `lint`, `lint:fix`

**Milestone**: Can run `bun dev`, see text, press `q` to quit.

---

## Phase 2: Commander Foundation
**Target: 1-2 hours | jj CLI abstraction**

### 2.1 Executor
- [ ] `src/commander/executor.ts` - wrapper to run jj commands via `Bun.spawn`
- [ ] Handle: stdout, stderr, exit code
- [ ] Pass `--color always` flag for ANSI output

### 2.2 Types
- [ ] `src/commander/types.ts` - define `Commit` interface:
  ```typescript
  interface Commit {
    changeId: string
    commitId: string
    lines: string[]      // Raw display lines (with ANSI)
    isWorkingCopy: boolean
    immutable: boolean
  }
  ```

### 2.3 Log Parser (Prefix Injection)
- [ ] `src/commander/log.ts` - implements jjui-style prefix injection
- [ ] Template: `"__LJ__" ++ change_id.short() ++ "__LJ__" ++ commit_id.short() ++ "__LJ__" ++ immutable ++ "__LJ__" ++ <builtin_template>`
- [ ] Parser extracts metadata, groups lines by commit
- [ ] Returns `Commit[]` array

### 2.4 Unit Tests
- [ ] `tests/unit/commander/log.test.ts` - snapshot tests for parser
- [ ] Test with sample jj output (mock, don't need real repo)

**Milestone**: Can parse jj log output into structured data.

---

## Phase 3: Log Panel MVP
**Target: 1-2 hours | First real UI**

### 3.1 Basic App Structure
- [ ] `src/App.tsx` - root component with full-terminal box
- [ ] Use `useTerminalDimensions()` from @opentui/solid

### 3.2 State Management
- [ ] `src/context/sync.tsx` - holds log data
  - `commits: Commit[]` signal
  - `selectedIndex: number` signal  
  - `loadLog()` function that calls commander

### 3.3 Log Panel Component
- [ ] `src/components/panels/LogPanel.tsx`
- [ ] Scrollable box showing commit lines
- [ ] Highlight selected commit (different background)
- [ ] Working copy (`@`) marker visible

### 3.4 Navigation
- [ ] `j` / `k` to move selection up/down
- [ ] `g` / `G` for top/bottom
- [ ] Selection wraps or stops at bounds

**Milestone**: See real jj log, navigate with j/k, quit with q.

---

## Phase 4: Two-Panel Layout + Diff
**Target: 2-3 hours | Core UX**

### 4.1 Layout Component
- [ ] `src/components/Layout.tsx` - flexbox two-column layout
- [ ] Left: Log panel (~35% width)
- [ ] Right: Main area (~65% width)
- [ ] Use hardcoded ratio for now

### 4.2 Diff Commander
- [ ] `src/commander/diff.ts` - runs `jj diff -r <change_id> --color always`
- [ ] Returns raw ANSI string (no parsing needed)

### 4.3 Main Area Component  
- [ ] `src/components/panels/MainArea.tsx`
- [ ] Scrollable box showing diff output
- [ ] Renders ANSI colors from jj

### 4.4 Selection → Diff Wiring
- [ ] When selected commit changes, fetch and display its diff
- [ ] Show loading state while fetching

### 4.5 Focus Management
- [ ] `Tab` to switch focus between Log and MainArea
- [ ] Visual indicator of which panel is focused (border color?)
- [ ] `j/k` scrolls focused panel

**Milestone**: Two panels, select commit on left → see diff on right.

---

## Phase 5: Status Bar + Polish
**Target: 1 hour | Usability**

### 5.1 Status Bar
- [ ] `src/components/StatusBar.tsx` - bottom row
- [ ] Shows context-sensitive keybinding hints
- [ ] Different hints based on focused panel

### 5.2 Additional Navigation
- [ ] `Ctrl+d` / `Ctrl+u` for page down/up in MainArea
- [ ] Scroll position indicator (optional)

### 5.3 Error Handling
- [ ] Show error if not in jj repo
- [ ] Show error if jj command fails

**Milestone**: Polished read-only experience.

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

1. **ANSI rendering**: OpenTUI should handle ANSI natively, but need to verify
2. **Diff toggle (`v`)**: Defer until basic diff works
3. **Mouse support**: Defer to post-prototype
4. **Refresh (`R`)**: Add in Phase 5 or defer

