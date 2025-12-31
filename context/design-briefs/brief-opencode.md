# Design Brief: OpenCode-Like / "OpenJJ"

**Goal**: Feel like part of the OpenCode family. Premium, distinctive, branded experience.

---

## Your Task

Redesign lazierjj to match the OpenCode aesthetic. The app should feel premium, cohesive, and have a distinctive identity with the signature peach-on-black look.

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

## Design Direction: OpenCode Aesthetic

### Color Palette (exact values from OpenCode)

| Token          | Hex       | Usage                                                  |
| -------------- | --------- | ------------------------------------------------------ |
| Background     | `#0a0a0a` | Deep black base                                        |
| Primary/Accent | `#fab283` | **Signature peach** - highlights, active states, links |
| Secondary      | `#5c9cf5` | Information, secondary highlights                      |
| Text           | `#eeeeee` | Primary content                                        |
| Text Muted     | `#808080` | Secondary info, timestamps                             |
| Border         | `#3c3c3c` | Default panel borders                                  |
| Border Focused | `#fab283` | Focused panel border (peach)                           |
| Success        | `#12c905` | Diff additions, success                                |
| Error          | `#fc533a` | Diff deletions, errors                                 |
| Warning        | `#fcd53a` | Warnings                                               |

### Additional Syntax Colors

| Token  | Hex       | Usage            |
| ------ | --------- | ---------------- |
| Purple | `#9d7cd8` | Headings         |
| Green  | `#7fd88f` | Code blocks      |
| Orange | `#f5a742` | Bold/strong text |

### Panel Design

- Thin borders using box-drawing characters
- Default border: subtle gray `#3c3c3c`
- Focused border: peach `#fab283` or bright white
- Labels colored in primary accent
- "Breathable" feel with proper spacing

### Focus States

- Border color change to peach `#fab283`
- Very clear visual distinction
- Can combine with subtle background shift

### Selection Highlighting

- Background shift to `#1e1e1e` or similar
- Can include leading indicator (e.g., `>`)
- Peach accent for selected text or borders

### Typography

- Headers: Bold or peach-colored
- Muted text: `#808080` for timestamps, hashes
- Code/technical: Could use green `#7fd88f`

### Modals/Popups

- Centered boxes that "float" over content
- Semi-transparent backdrop (dims background)
- Clear title bar with separator
- Peach accent for interactive elements

### Status Bar

- Minimalist, bottom of screen
- Muted text, small icons
- Doesn't compete with main content

### Syntax/Diff Highlighting

- Additions: Mint/Green `#12c905`
- Deletions: Red `#fc533a`
- Context: Default or slightly dimmed

### Overall Feel

Premium, cohesive, "glowing" peach on deep black. Distinctive brand identity. The peach `#fab283` against `#0a0a0a` creates a signature look.

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
- Make it feel like OpenCode's sibling app
- Use the peach accent strategically - not everywhere, but where it matters
- Document your changes with comments explaining design decisions
