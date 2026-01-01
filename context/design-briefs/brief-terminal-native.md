# Design Brief: Terminal-Native / Minimal

**Goal**: Blend seamlessly into the user's terminal. Feel like a native extension of their shell, not an "app" that takes over.

---

## Your Task

Redesign lazyjuju to follow the lazygit/lazyjj aesthetic. The app should disappear into the user's terminal setup, using their colors and feeling like a natural CLI tool.

---

## Current State

Reference these images in `context/` to see the current design:

- **`context/main.png`** - Main view with log panel (left) and diff area (right)
- **`context/help-modal.png`** - Help modal overlay with keybindings
- **`context/file-tree.png`** - File tree view with folder hierarchy

---

## What You CAN Redesign

- Panel labels (position, format, what info they show)
- Focus state visualization (borders, backgrounds, colors)
- Selection highlighting in lists
- Commit log appearance (layout, colors, information density)
- Help modal design (layout, grouping, styling)
- Status bar design
- File tree styling (icons, colors, indentation)
- Color palette (within your design direction)
- Typography choices (bold, dim, colors)
- Border styles
- Spacing and density

## What Stays FIXED

- Overall layout: left side panels, right main area
- Basic panel structure (Log, Bookmarks, Main/Diff area)
- Keybindings and functionality

---

## Design Direction: Terminal-Native

### Reference: lazygit / lazyjj Aesthetics

**Color Philosophy**:

- Use terminal defaults wherever possible
- Minimal custom colors - only for essential differentiation
- ANSI colors (0-15) that respect user's terminal theme
- lazygit uses: Green (active), Blue (selection), Red (errors), Yellow (branches), Cyan (search)
- lazyjj uses a single highlight color: `#323264` (slate/purple)

**Panel Labels**:

- Position: On the top border, left-aligned
- Format: Include jump keys when not focused, e.g., `1 Status`, `2 Files`, `3 Log`
- When focused: Just the name, e.g., `Status`
- Padded with spaces: `Log` not `Log`

**Focus States**:

- Active panel: **Green bold border** (lazygit standard)
- Inactive panel: Default/gray border
- Selection in unfocused panel: Bold text only (no background) to avoid confusion

**Selection Highlighting**:

- Focused list: Solid background color across entire line (Blue in lazygit, Slate in lazyjj)
- Keep it simple - one selection style

**Commit Log**:

- Dense, single-line entries (lazygit style) OR
- 2-line entries for breathing room (lazyjj style)
- Show: graph, hash (short), date, author (initials), message
- Author colors: Unique color per author helps track contributions

**Status Bar**:

- Bottom of screen, single line
- Blue text for shortcuts
- Format: `j Next · k Previous · enter View files · ? Help · q Quit`

**Modals/Popups**:

- Centered, minimal border
- Same border style as panels
- No backdrop/dimming (or very subtle)
- Multi-column keybinding layout in help

**Typography**:

- Bold for headers and active states
- Dim/gray for secondary info (hashes, timestamps)
- No fancy formatting - just terminal basics

**Overall Feel**: Fast, dense, informational. Tool that gets out of your way.

---

## Key Files to Modify

- `src/theme/colors.ts` - Color token definitions
- `src/components/Layout.tsx` - Panel structure and borders
- `src/components/panels/LogPanel.tsx` - Commit log appearance
- `src/components/panels/MainArea.tsx` - Diff area header
- `src/components/panels/BookmarksPanel.tsx` - Bookmark list
- `src/components/panels/FileTreePanel.tsx` - File tree styling
- `src/components/modals/HelpModal.tsx` - Help overlay
- `src/components/StatusBar.tsx` - Bottom status bar

---

## Be Bold

- Try new approaches, don't just tweak colors
- Rethink how information is displayed
- Make it feel native to the terminal
- Document your changes with comments explaining design decisions
