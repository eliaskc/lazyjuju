# Design Brief: Monochrome + Single Accent

**Goal**: Middle ground between terminal-native and branded. Clean, modern, professional. Distinctive but not overwhelming.

---

## Your Task

Redesign lazierjj with a monochrome palette plus ONE accent color. Everything is grayscale except for a single pop color used strategically for focus, selection, and important actions.

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

## Design Direction: Monochrome + Accent

### Color Philosophy

Pick ONE accent color and use grayscale for everything else.

**Suggested Accent Options** (pick one):

- Cyan: `#4ECDC4` - Cool, techy, our current accent
- Orange: `#FF6B35` - Warm, energetic, stands out
- Green: `#00D9A5` - Fresh, modern, easy on eyes
- Blue: `#3B82F6` - Classic, professional, trustworthy

### Grayscale Palette

| Token          | Hex                    | Usage                       |
| -------------- | ---------------------- | --------------------------- |
| Background     | `#0a0a0a` or `#000000` | Pure/near black             |
| Surface        | `#1a1a1a`              | Elevated elements, cards    |
| Border         | `#333333`              | Default borders             |
| Text Primary   | `#ffffff`              | Main content                |
| Text Secondary | `#a0a0a0`              | Secondary info (~60% white) |
| Text Muted     | `#666666`              | Tertiary info (~40% white)  |

### Where Accent Appears (sparingly)

- Focused panel border
- Selected item indicator (line or subtle background tint)
- Interactive elements when active
- Key keybindings in help modal
- Working copy indicator
- Important status messages

### Where Accent Does NOT Appear

- General text
- Inactive elements
- All backgrounds
- Borders (except focused)
- Secondary information

### Panel Design

- Clean, thin borders
- Gray `#333333` when inactive
- Accent color when focused
- Labels: White text, minimal styling
- Generous but not excessive spacing

### Focus States

- Border changes to accent color
- Keep background unchanged or very subtle shift
- Clear but not loud

### Selection Highlighting

- Subtle: Just the accent color on left edge (vertical bar)
- Or: Very slight background tint toward accent
- Text stays white/gray

### Typography

- Bold for focused/active headers only
- Hierarchy through opacity (100% → 60% → 40%)
- No colored text except accent for special cases

### Modals/Popups

- Dark background `#1a1a1a`
- Thin border in gray or accent
- Subtle backdrop dimming
- Accent only on focused/interactive elements

### Status Bar

- Muted, doesn't draw attention
- Gray text with accent for current mode/state

### Diff Handling (exception to monochrome)

Diffs need color to be useful:

- Additions: Muted green `#4ade80` or tint toward accent
- Deletions: Muted red `#f87171`
- Keep them desaturated to fit the aesthetic

### Overall Feel

GitHub dark mode, Linear app, Vercel dashboard. Professional, modern, restrained. The single accent color makes focus states pop without visual noise.

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

- Commit to the constraint - resist adding more colors
- Let the accent color be special by using it rarely
- Focus on typography and spacing for hierarchy
- Document your changes with comments explaining design decisions
