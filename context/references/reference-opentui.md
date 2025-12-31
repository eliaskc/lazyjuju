# OpenTUI Patterns Analysis

> Reference: https://github.com/sst/opentui
> Package: @opentui/solid
> Relevance: **CRITICAL** - Framework we're using

---

## Keyboard Handling

### useKeyboard Hook

```typescript
import { useKeyboard } from "@opentui/solid"

useKeyboard((key) => {
  // Key object properties:
  // - name: string (e.g., "a", "enter", "escape", "up")
  // - raw: string (raw ANSI sequence)
  // - ctrl: boolean
  // - meta: boolean
  // - shift: boolean
  // - alt: boolean
  
  if (key.ctrl && key.name === "c") {
    renderer.stop()
    process.exit(0)
  }
  
  switch (key.name) {
    case "j":
    case "down":
      selectNext()
      break
    case "k":
    case "up":
      selectPrev()
      break
    case "enter":
      confirmSelection()
      break
  }
})
```

### Focus-Based Routing

Components with `focused` prop handle their own keyboard events:

```tsx
// Parent manages focus
const [focused, setFocused] = createSignal<"list" | "input">("list")

return (
  <box>
    <select 
      focused={focused() === "list"}
      options={items}
      onSelect={handleSelect}
    />
    <input 
      focused={focused() === "input"}
      onSubmit={handleSubmit}
    />
  </box>
)
```

### Global vs Local Keys

- **Global keys** (quit, help) - Handle in root `useKeyboard`
- **Local keys** - Let focused component handle via its props

---

## Styling Patterns

### Inline Color Props

```tsx
// Direct hex strings
<text fg="#ff0000">Red</text>
<box backgroundColor="#1a1b26" borderColor="#4ECDC4" />

// Named colors (terminal palette)
<text fg="red">Red</text>
<text fg="brightBlue">Bright Blue</text>
```

### RGBA Class

```typescript
import { RGBA } from "@opentui/core"

const primary = RGBA.fromHex("#4ECDC4")
const withAlpha = RGBA.fromHex("#4ECDC4").withAlpha(0.5)

<box backgroundColor={primary} />
```

### Text Attributes

```tsx
import { TextAttributes } from "@opentui/core"

// Bitmask style
<text attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}>
  Bold and underlined
</text>

// Semantic wrappers
<text>
  <b>Bold</b> and <u>underlined</u> and <i>italic</i>
</text>
```

### SyntaxStyle for Code/Diff

```typescript
import { SyntaxStyle, RGBA } from "@opentui/core"

const syntaxTheme = SyntaxStyle.fromStyles({
  keyword: { fg: RGBA.fromHex("#C792EA"), bold: true },
  string: { fg: RGBA.fromHex("#C3E88D") },
  comment: { fg: RGBA.fromHex("#676E95"), italic: true },
  function: { fg: RGBA.fromHex("#82AAFF") },
  number: { fg: RGBA.fromHex("#F78C6C") },
  default: { fg: RGBA.fromHex("#A6ACCD") },
})

<diff syntaxStyle={syntaxTheme} ... />
<code syntaxStyle={syntaxTheme} ... />
```

---

## Layout Components

### box (Flexbox Container)

```tsx
<box
  flexDirection="row"     // "row" | "column"
  flexGrow={1}            // number
  flexShrink={0}          // number
  flexBasis={0}           // number | "auto"
  gap={1}                 // number
  padding={1}             // number | [top, right, bottom, left]
  width="100%"            // number | string
  height={10}             // number | string
  alignItems="center"     // "flex-start" | "center" | "flex-end"
  justifyContent="center" // "flex-start" | "center" | "flex-end" | "space-between"
  border                  // boolean
  borderStyle="rounded"   // "single" | "double" | "rounded"
  borderColor="#4ECDC4"
  backgroundColor="#1a1b26"
  overflow="hidden"       // "visible" | "hidden"
>
```

### scrollbox (Scrollable)

```tsx
<scrollbox
  focused={isFocused()}
  stickyScroll={true}           // Auto-scroll to new content
  stickyStart="bottom"          // "top" | "bottom"
  scrollbarOptions={{ 
    visible: true,
    style: { fg: "#666" }
  }}
  contentOptions={{
    flexGrow: 1,
    gap: 1,
  }}
>
  {/* Long content */}
</scrollbox>
```

### text

```tsx
<text
  fg="#ffffff"
  bg="#000000"
  content="Or use content prop"
  wrapMode="word"         // "none" | "char" | "word"
  attributes={TextAttributes.BOLD}
>
  Text with children
</text>
```

---

## Hooks

### useOnResize

```typescript
import { useOnResize } from "@opentui/solid"

const [width, setWidth] = createSignal(80)

useOnResize((newWidth, newHeight) => {
  setWidth(newWidth)
})

// Responsive layout
const showSidebar = () => width() >= 100
```

### useRenderer

```typescript
import { useRenderer } from "@opentui/solid"

const renderer = useRenderer()

// Quit
renderer.destroy()
process.exit(0)

// Toggle debug console
renderer.console.toggle()

// Get terminal palette
const palette = renderer.getPalette()
```

---

## State Management

OpenTUI apps use standard SolidJS patterns:

### Signals

```typescript
const [count, setCount] = createSignal(0)
const [items, setItems] = createSignal<Item[]>([])
```

### Stores (for complex state)

```typescript
import { createStore, reconcile } from "solid-js/store"

const [state, setState] = createStore({
  commits: [] as Commit[],
  selectedIndex: 0,
  loading: false,
})

// Efficient updates
setState("commits", reconcile(newCommits))
setState("selectedIndex", 0)
```

### Context

```typescript
const AppContext = createContext<AppState>()

function AppProvider(props: { children: JSX.Element }) {
  const [state, setState] = createStore({ ... })
  return (
    <AppContext.Provider value={{ state, setState }}>
      {props.children}
    </AppContext.Provider>
  )
}

function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be within AppProvider")
  return ctx
}
```

---

## Key Patterns for lazierjj

1. **Focus management** - Track focused panel in parent, pass `focused` prop
2. **Key routing** - Global keys in App, local keys via focused components
3. **RGBA class** - Use for theme token definitions
4. **SyntaxStyle** - For any syntax-highlighted content
5. **reconcile()** - For efficient list updates
6. **useOnResize** - For responsive layouts
