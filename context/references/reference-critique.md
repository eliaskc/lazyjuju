# Critique vs Kajji Comparison

Reference for [critique](https://github.com/remorses/critique) - a beautiful TUI diff viewer.

---

## Summary Table

| Aspect | Critique | Kajji |
|--------|----------|-------|
| **Framework** | React + OpenTUI (`@opentui/react`) | SolidJS + OpenTUI (`@opentui/solid`) |
| **Diff Parsing** | `diff` (jsdiff) library | `@pierre/diffs` library |
| **Diff Rendering** | OpenTUI's built-in `<diff>` component | Custom components (`UnifiedDiffView`, `SplitDiffView`) |
| **Syntax Highlighting** | Tree-sitter via OpenTUI's `SyntaxStyle` | Custom tokenizer with Shiki (sync) |
| **ANSI Handling** | `ghostty-opentui` for web export only | `ghostty-opentui` + `<ghostty-terminal>` for passthrough mode |
| **Virtualization** | None (hard limit at 6000 lines) | Planned (file-at-a-time rendering, row virtualization) |
| **State Management** | Zustand (React) | SolidJS signals + context |
| **Theming** | 30+ JSON themes with dark/light variants | Theme context (lazygit/opencode presets) |
| **File Navigation** | Left/right arrows, dropdown picker | Keybinds in progress |

---

## 1. Overall Architecture

### Critique
- **Single file**: Most logic in `src/cli.tsx` (~1380 lines)
- **React hooks**: `useState`, `useEffect`, `useKeyboard`
- **Global state**: Zustand store with persistence to `~/.critique/state.json`
- **Key deps**: `@opentui/react`, `diff`, `ghostty-opentui`, `zustand`, `cac`

```
critique/
├── src/
│   ├── cli.tsx          # Main app (~1380 lines)
│   ├── dropdown.tsx     # File picker component
│   ├── themes.ts        # Theme loading system
│   ├── ansi-html.ts     # ANSI to HTML for web export
│   └── themes/          # 30+ JSON theme files
```

### Kajji
- **Modular structure**: Separate directories for concerns
- **SolidJS signals**: `createSignal`, `createMemo`, `onMount`
- **Context providers**: Focus, theme, dialog, data
- **Key deps**: `@opentui/solid`, `@pierre/diffs`, `ghostty-opentui`

```
kajji/src/
├── commander/           # jj CLI wrappers
├── components/
│   ├── diff/            # UnifiedDiffView, SplitDiffView
│   ├── panels/          # MainArea (diff container)
│   └── ...
├── context/             # SolidJS context providers
├── diff/                # Parsing, types, virtualization
└── ...
```

---

## 2. Diff Parsing

### Critique
Uses **`diff` (jsdiff)** library with `parsePatch()` / `formatPatch()`:

```typescript
// critique/src/cli.tsx:615
const { parsePatch, formatPatch } = await import("diff")
const files = parsePatch(gitDiff)

// Filter and sort
const filteredFiles = files.filter((file) => {
  const totalLines = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  return totalLines <= 6000  // Hard limit
})
const sortedFiles = filteredFiles.sort((a, b) => sizeOf(a) - sizeOf(b))
```

**Git command**: `git diff --no-prefix` (removes a/ b/ prefixes)

### Kajji
Uses **`@pierre/diffs`** library with `parsePatchFiles()`:

```typescript
// kajji/src/diff/parser.ts:31-49
import { parsePatchFiles } from "@pierre/diffs"

async function fetchParsedDiff(changeId: string): Promise<FileDiffMetadata[]> {
  const result = await execute([
    "diff", "-r", changeId, "--git", "--ignore-working-copy"
  ])
  return parseDiffString(result.stdout)
}

function parseDiffString(diffString: string): FileDiffMetadata[] {
  const patches = parsePatchFiles(diffString)
  return patches.flatMap((patch) => patch.files)
}
```

**jj command**: `jj diff -r <rev> --git --ignore-working-copy`

### Comparison

| Feature | Critique (`diff`) | Kajji (`@pierre/diffs`) |
|---------|-------------------|-------------------------|
| Format | jsdiff's `ParsedDiff` | `FileDiffMetadata` with hunks |
| Hunk content | `lines: string[]` with `+/-/ ` prefix | Structured `ContextContent` / `ChangeContent` |
| Additions/Deletions | Manual count from line prefix | `hunk.additionCount` / `hunk.deletionCount` |
| Rename detection | Via filename parsing | `file.type: "rename-pure" \| "rename-changed"` |

---

## 3. Diff Rendering

### Critique
Uses **OpenTUI's built-in `<diff>` component**:

```tsx
// critique/src/cli.tsx:225-253
<diff
  diff={diff}                              // Raw diff string
  view={view}                              // "split" | "unified"
  treeSitterClient={undefined}
  filetype={filetype}
  syntaxStyle={SyntaxStyle.fromStyles(syntaxTheme)}
  showLineNumbers
  wrapMode="wrap"
  addedContentBg={resolvedTheme.diffAddedBg}
  removedContentBg={resolvedTheme.diffRemovedBg}
  // ... more theme props
/>
```

**Key insight**: Critique doesn't build its own diff components. OpenTUI's `<diff>` handles:
- Split/unified layouts
- Syntax highlighting via tree-sitter
- Line numbers
- Background colors per line type

### Kajji
Uses **custom components** built from OpenTUI primitives:

```tsx
// kajji/src/components/diff/UnifiedDiffView.tsx
export function UnifiedDiffView(props: UnifiedDiffViewProps) {
  return (
    <box flexDirection="column">
      <For each={filesToRender()}>
        {(file) => <FileSection file={file} />}
      </For>
    </box>
  )
}

function DiffLineView(props: DiffLineViewProps) {
  return (
    <box flexDirection="row" backgroundColor={lineBg()}>
      <text wrapMode="none">
        <span style={{ fg: bar().color }}>{bar().char}</span>
        <span style={{ fg: lineNumColor() }}>{lineNum()}</span>
        <For each={tokens()}>
          {(token) => <span style={{ fg: token.color }}>{token.content}</span>}
        </For>
      </text>
    </box>
  )
}
```

**Why custom?**
1. **Interactive modes**: Same renderer for viewing, splitting, PR review
2. **Hunk selection**: Can toggle hunks for `jj split`
3. **Annotations**: Inline comments for PR review
4. **Passthrough mode**: Falls back to `<ghostty-terminal>` for difftastic/delta users

### ANSI Passthrough

Both use `ghostty-opentui` but for different purposes:

| | Critique | Kajji |
|---|----------|-------|
| Primary use | Web HTML export | Live passthrough mode |
| Component | N/A (uses `ptyToJson` directly) | `<ghostty-terminal>` |
| When used | `--web` flag for shareable link | Toggle with keybind for external diff tools |

---

## 4. Syntax Highlighting

### Critique
Uses **OpenTUI's tree-sitter integration**:

```typescript
// critique/src/cli.tsx:72-97
function detectFiletype(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts": case "tsx": return "typescript"
    case "json": return "javascript"
    // ...
  }
}

// Tree-sitter client passed to <diff>
<diff
  treeSitterClient={undefined}  // OpenTUI handles internally
  filetype={detectFiletype(fileName)}
  syntaxStyle={SyntaxStyle.fromStyles(syntaxTheme)}
/>
```

### Kajji
Uses **custom synchronous tokenizer**:

```typescript
// kajji/src/diff/syntax.ts (conceptual)
function tokenizeLineSync(line: string, language: string): SyntaxToken[] {
  // Shiki-based highlighting with synchronous API
  // Returns array of { content, color }
}

// Used in components
<For each={tokens()}>
  {(token) => (
    <span style={{ fg: token.color, bg: token.emphasis ? emphasisBg : undefined }}>
      {token.content}
    </span>
  )}
</For>
```

**Kajji also does word-level diff highlighting**:

```typescript
// kajji/src/diff/word-diff.ts
import { diffWords } from "diff"

function computeWordDiff(oldLine: string, newLine: string) {
  const changes = diffWords(oldLine, newLine)
  // Returns segments with type: "unchanged" | "added" | "removed"
}
```

---

## 5. Virtualization & Large Diffs

### Critique: No Virtualization
Relies on **hard limits** and **sorting**:

```typescript
// critique/src/cli.tsx:629-642
const filteredFiles = files.filter((file) => {
  const totalLines = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  return totalLines <= 6000  // Skip files with >6000 diff lines
})

const sortedFiles = filteredFiles.sort((a, b) => {
  const aSize = a.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  const bSize = b.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  return aSize - bSize  // Smallest files first
})
```

**Web export uses CSS virtualization**:
```css
/* critique/src/ansi-html.ts */
.line {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 1.5em;
}
```

### Kajji: Progressive Approach

**Current**:
1. File-at-a-time rendering via `activeFileId`
2. `<ghostty-terminal limit={1000}>` for passthrough mode

**Planned** (from `diff-row-virtualization.md`):
1. `flattenToRows()` creates addressable row list
2. `getVisibleRange()` calculates visible slice with overscan
3. Render only visible rows in scrollbox

```typescript
// kajji/src/diff/virtualization.ts
export function flattenToRows(files: FlattenedFile[]): DiffRow[] {
  const rows: DiffRow[] = []
  for (const file of files) {
    rows.push({ type: "file-header", ... })
    for (const hunk of file.hunks) {
      rows.push({ type: "hunk-header", ... })
      for (const line of hunk.lines) {
        rows.push({ type: line.type, ... })
      }
    }
  }
  return rows
}

export function getVisibleRange(viewport: ViewportState, overscan = 10) {
  return {
    start: Math.max(0, Math.floor(viewport.scrollTop) - overscan),
    end: Math.min(viewport.totalRows, Math.ceil(viewport.scrollTop + viewport.viewportHeight) + overscan)
  }
}
```

---

## 6. State Management

### Critique
**Zustand** with automatic persistence:

```typescript
// critique/src/cli.tsx:197-205
const useDiffStore = create<DiffState>(() => ({
  currentFileIndex: 0,
  themeName: persistedState.themeName ?? defaultThemeName,
}))

useDiffStore.subscribe((state) => {
  savePersistedState({ themeName: state.themeName })
})
```

### Kajji
**SolidJS signals + context**:

```typescript
// Pattern used throughout kajji
const [viewStyle, setViewStyle] = createSignal<DiffViewStyle>("unified")

// Diff state (from src/diff/types.ts)
interface DiffState {
  files: FileDiffMetadata[]
  mode: DiffMode
  viewStyle: DiffViewStyle
  currentFileId: FileId | null
  currentHunkId: HunkId | null
  hunkSelections: Map<HunkId, HunkSelection>
  annotations: Map<string, DiffAnnotation[]>
  activeFileId: FileId | null
  loading: boolean
}
```

---

## 7. Keyboard Handling

### Critique
```typescript
// critique/src/cli.tsx:274-323
useKeyboard((key) => {
  if (key.name === "escape" || key.name === "q") {
    renderer.destroy()
    return
  }
  if (key.name === "left") {
    useDiffStore.setState((state) => ({
      currentFileIndex: Math.max(0, state.currentFileIndex - 1),
    }))
  }
  if (key.name === "right") {
    useDiffStore.setState((state) => ({
      currentFileIndex: Math.min(files.length - 1, state.currentFileIndex + 1),
    }))
  }
  if (key.name === "t") {
    setShowThemePicker(true)
  }
})
```

### Kajji
Uses a **command registry** with context-aware keybinds:

```typescript
// Commands register for specific contexts
registerCommand({
  id: "diff.next-file",
  context: "log.files",  // Only active in this focus mode
  key: "j",
  handler: () => navigateToNextFile(),
})
```

---

## 8. Notable Critique Features Kajji Could Adopt

### Theme System
Critique has 30+ JSON themes with structured inheritance:

```json
{
  "id": "tokyonight",
  "name": "Tokyo Night",
  "extends": "dark",
  "colors": {
    "background": "#1a1b26",
    "diffAddedBg": "#1a2a1a",
    "syntaxKeyword": "#bb9af7"
  }
}
```

### Scroll Acceleration
macOS-style smooth scrolling:

```typescript
class ScrollAcceleration {
  public multiplier: number = 1
  private macosAccel: MacOSScrollAccel
  
  tick(delta: number) {
    return this.macosAccel.tick(delta) * this.multiplier
  }
}

// Hold Option key for 10x scroll speed
if (key.option) {
  scrollAcceleration.multiplier = 10
}
```

### Web Export
Capture TUI output as shareable HTML:

```typescript
// 1. Spawn PTY to capture ANSI
const ptyProcess = pty.spawn("bun", ["...", "--web-render"])
ptyProcess.onData((data) => { ansiOutput += data })

// 2. Convert ANSI to HTML
const html = ansiToHtml(ansiOutput, { cols, rows })

// 3. Upload to Cloudflare KV
const { url } = await fetch("/upload", { body: html })
// Returns: https://critique.dev/view/abc123
```

---

## 9. Key Takeaways

1. **OpenTUI has a `<diff>` component** - Critique uses it directly; Kajji built custom for interactivity
2. **`@pierre/diffs` is more structured** - Better for building interactive UIs than jsdiff
3. **No virtualization in Critique** - Just hard limits; Kajji needs it for jj repos with large commits
4. **Word-level highlighting** - Both use `diff` package's `diffWords()`
5. **`ghostty-opentui`** is versatile - Critique: web export; Kajji: passthrough mode
6. **Theme JSON format** - Critique's approach is more extensible than Kajji's current presets

---

## References

- [Critique repo](https://github.com/remorses/critique)
- [OpenTUI docs](https://github.com/sst/opentui)
- [@pierre/diffs](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs)
- [ghostty-opentui](https://github.com/remorses/ghostty-opentui)
