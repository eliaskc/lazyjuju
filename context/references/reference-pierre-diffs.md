# pierre/diffs Package Reference

> Comprehensive analysis of [@pierre/diffs](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs) - a diff and file rendering library built on Shiki.

## Overview

`@pierre/diffs` is an open-source diff and file rendering library by [The Pierre Computer Company](https://pierre.computer). It provides:

- Diff file versions, patches, and arbitrary files
- Split or unified (stacked) layout
- Shiki-based syntax highlighting with theme support
- Light/dark mode with system preference detection
- Word/character-level inline diff highlighting
- Flexible annotation framework
- Line selection and hover utilities
- Web Components + React bindings
- SSR support with hydration

**Live demo**: [diffs.com](https://diffs.com)

## Package Structure

```
packages/diffs/
├── src/
│   ├── index.ts              # Main exports
│   ├── types.ts              # TypeScript type definitions
│   ├── constants.ts          # Regex patterns, default themes
│   ├── style.css             # Core CSS (CSS layers: base, theme, unsafe)
│   ├── sprite.ts             # SVG icon sprite sheet
│   │
│   ├── components/           # Vanilla JS web components
│   │   ├── File.ts           # Single file viewer
│   │   ├── FileDiff.ts       # Two-file diff viewer
│   │   ├── FileStream.ts     # Streaming file viewer
│   │   └── web-components.ts # Custom element registration
│   │
│   ├── react/                # React bindings
│   │   ├── File.tsx          # React file component
│   │   ├── FileDiff.tsx      # React diff component
│   │   ├── MultiFileDiff.tsx # Multiple files diff
│   │   ├── PatchDiff.tsx     # Patch-based diff
│   │   ├── WorkerPoolContext.tsx
│   │   └── types.ts
│   │
│   ├── themes/               # Shiki themes
│   │   ├── pierre-dark.json
│   │   └── pierre-light.json
│   │
│   ├── highlighter/          # Shiki integration
│   │   ├── languages/        # Language resolution
│   │   └── themes/           # Theme resolution
│   │
│   ├── managers/             # Feature managers
│   │   ├── LineSelectionManager.ts
│   │   ├── MouseEventManager.ts
│   │   ├── ResizeManager.ts
│   │   ├── ScrollSyncManager.ts
│   │   └── UniversalRenderingManager.ts
│   │
│   ├── renderers/            # Rendering logic
│   │   ├── DiffHunksRenderer.ts
│   │   └── FileRenderer.ts
│   │
│   ├── utils/                # Helper functions (50+)
│   ├── worker/               # Web Worker support
│   ├── ssr/                  # Server-side rendering
│   └── shiki-stream/         # Streaming highlighter
│
├── test/                     # Bun tests with snapshots
├── package.json
└── tsconfig.json
```

## Dependencies

```json
{
  "dependencies": {
    "@shikijs/core": "^3.0.0",
    "@shikijs/engine-javascript": "^3.0.0",
    "@shikijs/transformers": "^3.0.0",
    "diff": "catalog:",
    "hast-util-to-html": "catalog:",
    "lru_map": "catalog:",
    "shiki": "^3.0.0"
  },
  "peerDependencies": {
    "react": "^18.3.1 || ^19.0.0",
    "react-dom": "^18.3.1 || ^19.0.0"
  }
}
```

## Components

### File (Single File Viewer)

Renders a single file with syntax highlighting.

```tsx
// Vanilla JS
import { File } from '@pierre/diffs'

const viewer = new File({
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
  overflow: 'scroll',
  disableLineNumbers: false,
})

viewer.render({
  file: {
    name: 'example.ts',
    contents: 'const x = 1;',
    lang: 'typescript',
  },
  fileContainer: document.getElementById('container'),
})

// React
import { File } from '@pierre/diffs/react'

<File
  file={{ name: 'example.ts', contents: 'const x = 1;', lang: 'typescript' }}
  options={{ theme: 'pierre-dark', overflow: 'wrap' }}
  className="my-diff"
/>
```

#### FileOptions

```typescript
interface FileOptions<LAnnotation> {
  // Theming
  theme?: DiffsThemeNames | ThemesType;  // Single or { dark, light }
  themeType?: 'system' | 'light' | 'dark';
  
  // Display
  disableLineNumbers?: boolean;
  disableFileHeader?: boolean;
  overflow?: 'scroll' | 'wrap';  // Default: 'scroll'
  
  // Shiki config
  useCSSClasses?: boolean;
  tokenizeMaxLineLength?: number;
  
  // Custom CSS injection
  unsafeCSS?: string;
  
  // Line selection
  enableLineSelection?: boolean;
  onLineSelectionChange?: (range: SelectedLineRange | null) => void;
  
  // Callbacks
  renderCustomMetadata?: (file: FileContents) => Element | string | number;
  renderAnnotation?: (annotation: LineAnnotation<LAnnotation>) => HTMLElement;
  renderHoverUtility?: (getHoveredRow: () => GetHoveredLineResult) => HTMLElement;
  
  // Mouse events
  onLineClick?: (event: LineEventBaseProps) => void;
  onLineNumberClick?: (event: LineEventBaseProps) => void;
}
```

### FileDiff (Two-File Diff Viewer)

Renders differences between two files or a pre-computed diff.

```tsx
// Vanilla JS
import { FileDiff } from '@pierre/diffs'

const differ = new FileDiff({
  theme: { dark: 'pierre-dark', light: 'pierre-light' },
  diffStyle: 'split',
  diffIndicators: 'bars',
  lineDiffType: 'word-alt',
})

differ.render({
  oldFile: { name: 'old.ts', contents: 'const x = 1;' },
  newFile: { name: 'new.ts', contents: 'const x = 2;' },
})

// Or with pre-parsed diff
differ.render({
  fileDiff: parsedFileDiffMetadata,
})

// React
import { FileDiff } from '@pierre/diffs/react'

<FileDiff
  fileDiff={parsedDiff}
  options={{ diffStyle: 'unified', hunkSeparators: 'metadata' }}
/>
```

#### FileDiffOptions

```typescript
interface FileDiffOptions<LAnnotation> extends BaseCodeOptions {
  // Diff display
  diffStyle?: 'unified' | 'split';  // Default: 'split'
  diffIndicators?: 'classic' | 'bars' | 'none';  // Default: 'bars'
  disableBackground?: boolean;
  
  // Hunk separators
  hunkSeparators?: 'simple' | 'metadata' | 'line-info' | CustomFunction;
  expandUnchanged?: boolean;
  expansionLineCount?: number;  // Default: 100
  
  // Inline diff highlighting
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none';  // Default: 'word-alt'
  maxLineDiffLength?: number;  // Default: 1000
  
  // Callbacks
  renderHeaderMetadata?: (props: RenderHeaderMetadataProps) => Element;
  renderAnnotation?: (annotation: DiffLineAnnotation<LAnnotation>) => HTMLElement;
}
```

### React Components

```tsx
// File viewer
import { File } from '@pierre/diffs/react'

// Diff viewers
import { FileDiff, MultiFileDiff, PatchDiff } from '@pierre/diffs/react'

// Worker pool for performance
import { WorkerPoolProvider, useWorkerPool } from '@pierre/diffs/react'

<WorkerPoolProvider>
  <FileDiff fileDiff={diff} />
</WorkerPoolProvider>
```

## Types

### FileContents

```typescript
interface FileContents {
  name: string;
  contents: string;
  lang?: SupportedLanguages;
  cacheKey?: string;  // For render optimization
  header?: string;
}
```

### FileDiffMetadata

```typescript
interface FileDiffMetadata {
  name: string;
  prevName: string | undefined;
  lang?: SupportedLanguages;
  type: 'change' | 'rename-pure' | 'rename-changed' | 'new' | 'deleted';
  hunks: Hunk[];
  splitLineCount: number;
  unifiedLineCount: number;
  oldMode?: string;
  mode?: string;
  cacheKey?: string;
}
```

### Hunk

```typescript
interface Hunk {
  collapsedBefore: number;
  splitLineStart: number;
  splitLineCount: number;
  unifiedLineStart: number;
  unifiedLineCount: number;
  additionCount: number;
  additionStart: number;
  additionLines: number;
  deletionCount: number;
  deletionStart: number;
  deletionLines: number;
  hunkContent: (ContextContent | ChangeContent)[];
  hunkContext: string | undefined;
  hunkSpecs: string | undefined;
}
```

### LineAnnotation / DiffLineAnnotation

```typescript
interface LineAnnotation<T = undefined> {
  lineNumber: number;
  metadata?: T;
}

interface DiffLineAnnotation<T = undefined> {
  side: 'deletions' | 'additions';
  lineNumber: number;
  metadata?: T;
}
```

### ThemesType

```typescript
type ThemesType = Record<'dark' | 'light', DiffsThemeNames>;

// Example
const themes: ThemesType = {
  dark: 'pierre-dark',
  light: 'pierre-light',
};
```

## Style Tokens (CSS Variables)

The library uses CSS layers: `@layer base, theme, unsafe;`

### Core Variables

```css
:host {
  /* Font stacks */
  --diffs-font-fallback: 'SF Mono', Monaco, Consolas, monospace;
  --diffs-header-font-fallback: system-ui, -apple-system, 'Segoe UI', sans-serif;
  
  /* Base colors */
  --diffs-bg: #fff;
  --diffs-fg: #000;
  --diffs-mixer: light-dark(black, white);
  
  /* Layout */
  --diffs-gap-fallback: 8px;
  --diffs-font-size: 13px;
  --diffs-line-height: 20px;
  --diffs-tab-size: 2;
}
```

### Color Overrides

```css
/* Background overrides */
--diffs-bg-buffer-override
--diffs-bg-hover-override
--diffs-bg-context-override
--diffs-bg-separator-override

/* Line number colors */
--diffs-fg-number-override
--diffs-fg-number-addition-override
--diffs-fg-number-deletion-override

/* Diff base colors */
--diffs-deletion-color-override    /* Default: rgb(255, 0, 0) */
--diffs-addition-color-override    /* Default: rgb(0, 255, 0) */
--diffs-modified-color-override    /* Default: rgb(0, 0, 255) */

/* Deletion backgrounds */
--diffs-bg-deletion-override
--diffs-bg-deletion-number-override
--diffs-bg-deletion-hover-override
--diffs-bg-deletion-emphasis-override

/* Addition backgrounds */
--diffs-bg-addition-override
--diffs-bg-addition-number-override
--diffs-bg-addition-hover-override
--diffs-bg-addition-emphasis-override

/* Line selection */
--diffs-selection-color-override
--diffs-bg-selection-override
--diffs-bg-selection-number-override
```

### Layout Overrides

```css
--diffs-gap-inline
--diffs-gap-block
--diffs-gap-style          /* e.g., '1px solid var(--diffs-bg)' */
--diffs-tab-size
--diffs-font-family
--diffs-font-size
--diffs-line-height
--diffs-font-features      /* font-feature-settings */
--diffs-min-number-column-width
```

### Data Attributes

The library uses data attributes for styling states:

```css
[data-diffs]                    /* Main container */
[data-diffs-header]             /* File header */
[data-type="split"]             /* Split diff mode */
[data-type="unified"]           /* Unified diff mode */
[data-overflow="scroll"]        /* Horizontal scroll */
[data-overflow="wrap"]          /* Word wrap */
[data-theme-type="light"]       /* Light theme forced */
[data-theme-type="dark"]        /* Dark theme forced */
[data-background]               /* Background colors enabled */
[data-disable-line-numbers]     /* Line numbers hidden */
[data-indicators="bars"]        /* Bar-style indicators */
[data-indicators="classic"]     /* +/- indicators */
[data-line-type="change-addition"]
[data-line-type="change-deletion"]
[data-line-type="context"]
[data-line-type="context-expanded"]
[data-selected-line]            /* Line selection active */
[data-separator="line-info"]
[data-separator="metadata"]
[data-separator="custom"]
```

## Pierre Themes

### pierre-dark

```json
{
  "name": "pierre-dark",
  "type": "dark",
  "colors": {
    "editor.background": "#070707",
    "editor.foreground": "#fbfbfb",
    "diffEditor.insertedTextBackground": "#00cab11a",
    "diffEditor.deletedTextBackground": "#ff2e3f1a"
  },
  "tokenColors": [
    { "scope": "comment", "settings": { "foreground": "#84848A" } },
    { "scope": "string", "settings": { "foreground": "#5ecc71" } },
    { "scope": "constant.numeric", "settings": { "foreground": "#68cdf2" } },
    { "scope": "keyword", "settings": { "foreground": "#ff678d" } },
    { "scope": "storage", "settings": { "foreground": "#ff678d" } },
    { "scope": "variable", "settings": { "foreground": "#ffa359" } },
    { "scope": "entity.name.function", "settings": { "foreground": "#9d6afb" } },
    { "scope": "entity.name.type", "settings": { "foreground": "#d568ea" } },
    { "scope": "punctuation", "settings": { "foreground": "#79797F" } }
  ]
}
```

### pierre-light

```json
{
  "name": "pierre-light",
  "type": "light",
  "colors": {
    "editor.background": "#ffffff",
    "editor.foreground": "#070707",
    "diffEditor.insertedTextBackground": "#00cab133",
    "diffEditor.deletedTextBackground": "#ff2e3f33"
  },
  "tokenColors": [
    { "scope": "comment", "settings": { "foreground": "#84848A" } },
    { "scope": "string", "settings": { "foreground": "#199f43" } },
    { "scope": "constant.numeric", "settings": { "foreground": "#1ca1c7" } },
    { "scope": "keyword", "settings": { "foreground": "#fc2b73" } },
    { "scope": "storage", "settings": { "foreground": "#fc2b73" } },
    { "scope": "variable", "settings": { "foreground": "#d47628" } },
    { "scope": "entity.name.function", "settings": { "foreground": "#7b43f8" } },
    { "scope": "entity.name.type", "settings": { "foreground": "#c635e4" } },
    { "scope": "punctuation", "settings": { "foreground": "#79797F" } }
  ]
}
```

### Color Palette Summary

| Token | Dark | Light |
|-------|------|-------|
| Background | `#070707` | `#ffffff` |
| Foreground | `#fbfbfb` | `#070707` |
| Comment | `#84848A` | `#84848A` |
| String | `#5ecc71` | `#199f43` |
| Number | `#68cdf2` | `#1ca1c7` |
| Keyword | `#ff678d` | `#fc2b73` |
| Variable | `#ffa359` | `#d47628` |
| Function | `#9d6afb` | `#7b43f8` |
| Type | `#d568ea` | `#c635e4` |
| Operator | `#08c0ef` | `#08c0ef` |
| Punctuation | `#79797F` | `#79797F` |

### Diff Colors

| Purpose | Dark | Light |
|---------|------|-------|
| Addition base | `#00cab1` | `#00cab1` |
| Deletion base | `#ff2e3f` | `#ff2e3f` |
| Modified base | `#009fff` | `#009fff` |

## Utility Functions

### Diff Parsing

```typescript
// Parse diff from two files
import { parseDiffFromFile } from '@pierre/diffs'
const diff = parseDiffFromFile(oldFile, newFile)

// Parse patch files
import { parsePatchFiles } from '@pierre/diffs'
const patches = parsePatchFiles(patchContent)

// Get single patch
import { getSingularPatch } from '@pierre/diffs'
const patch = getSingularPatch(patchContent)
```

### Language Detection

```typescript
import { getFiletypeFromFileName } from '@pierre/diffs'
const lang = getFiletypeFromFileName('example.tsx')  // 'tsx'
```

### Theme Management

```typescript
import { 
  resolveTheme, 
  resolveThemes,
  registerCustomTheme,
  getResolvedThemes 
} from '@pierre/diffs'

// Register custom theme
await registerCustomTheme(myCustomTheme)

// Resolve themes for use
await resolveThemes(['pierre-dark', 'pierre-light'])
```

### DOM Utilities

```typescript
import {
  createCodeNode,
  createPreElement,
  createAnnotationWrapperNode,
  createFileHeaderElement,
  createSeparator,
} from '@pierre/diffs'
```

### Comparison Utilities

```typescript
import {
  areFilesEqual,
  areOptionsEqual,
  areThemesEqual,
  areSelectionsEqual,
} from '@pierre/diffs'
```

## Web Component

The library registers a custom element `<diffs-container>`:

```typescript
// Constant
export const DIFFS_TAG_NAME = 'diffs-container' as const;

// Auto-registered on import
import '@pierre/diffs'

// Usage in HTML
<diffs-container class="my-diff"></diffs-container>
```

The web component uses Shadow DOM for style isolation.

## Usage Examples

### Basic File Display

```tsx
import { File } from '@pierre/diffs/react'

function CodeViewer({ code, filename }) {
  return (
    <File
      file={{
        name: filename,
        contents: code,
        lang: 'typescript',
      }}
      options={{
        theme: { dark: 'pierre-dark', light: 'pierre-light' },
        overflow: 'scroll',
      }}
    />
  )
}
```

### Split Diff with Annotations

```tsx
import { FileDiff } from '@pierre/diffs/react'

function DiffViewer({ oldCode, newCode, comments }) {
  return (
    <FileDiff
      oldFile={{ name: 'old.ts', contents: oldCode }}
      newFile={{ name: 'new.ts', contents: newCode }}
      options={{
        diffStyle: 'split',
        diffIndicators: 'bars',
        lineDiffType: 'word-alt',
      }}
      lineAnnotations={comments.map(c => ({
        side: 'additions',
        lineNumber: c.line,
        metadata: c,
      }))}
      renderAnnotation={(annotation) => (
        <CommentBox comment={annotation.metadata} />
      )}
    />
  )
}
```

### Unified Diff with Line Selection

```tsx
import { FileDiff } from '@pierre/diffs/react'
import { useState } from 'react'

function SelectableDiff({ diff }) {
  const [selection, setSelection] = useState(null)
  
  return (
    <FileDiff
      fileDiff={diff}
      options={{
        diffStyle: 'unified',
        enableLineSelection: true,
        onLineSelectionChange: setSelection,
      }}
      selectedLines={selection}
    />
  )
}
```

### Custom Theme Integration

```tsx
import { FileDiff } from '@pierre/diffs/react'

// Override diff colors via CSS variables
<div style={{
  '--diffs-addition-color-override': '#22c55e',
  '--diffs-deletion-color-override': '#ef4444',
  '--diffs-modified-color-override': '#3b82f6',
}}>
  <FileDiff fileDiff={diff} />
</div>
```

### With Worker Pool (Performance)

```tsx
import { WorkerPoolProvider, FileDiff } from '@pierre/diffs/react'

function App() {
  return (
    <WorkerPoolProvider>
      <FileDiff fileDiff={largeDiff} />
    </WorkerPoolProvider>
  )
}
```

## Architecture Notes

1. **Web Components + React**: Core logic is in vanilla JS web components, React bindings wrap them
2. **Shadow DOM**: Styles are isolated, customization via CSS variables or `unsafeCSS`
3. **HAST**: Uses hyperscript AST for HTML generation (hast-util-to-html)
4. **Shiki**: Syntax highlighting via Shiki with bundled themes
5. **LRU Cache**: Caches highlighted results for performance
6. **Managers**: Separate concerns (resize, scroll sync, mouse events, selection)
7. **Workers**: Optional web worker pool for off-main-thread highlighting

## Key Patterns for kajji

Relevant patterns for TUI diff viewing:

1. **Line types**: `change-addition`, `change-deletion`, `context`, `context-expanded`
2. **Diff indicators**: `bars` (colored bars on line numbers) vs `classic` (+/-)
3. **Inline highlighting**: `word-alt` joins adjacent single-char changes
4. **Hunk separators**: Expandable sections with context info
5. **Theme structure**: VSCode-compatible theme JSON with `colors` and `tokenColors`
6. **CSS variable cascade**: Base colors → computed variations via `color-mix()`
