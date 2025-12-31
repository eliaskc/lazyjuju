# OpenCode Analysis

> Reference: https://github.com/sst/opencode
> Tech: TypeScript, SolidJS, OpenTUI
> Relevance: **HIGH** - Same stack as lazierjj

---

## Theming System

OpenCode uses a **token-based theming system** with ~50 semantic color tokens.

### Architecture

```
context/theme/
  catppuccin-mocha.json   # Built-in themes as JSON
  tokyo-night.json
  ...
context/theme.tsx         # ThemeProvider + useTheme hook
```

### ThemeColors Interface

```typescript
type ThemeColors = {
  // UI tokens
  primary: RGBA
  background: RGBA
  backgroundSecondary: RGBA
  text: RGBA
  textMuted: RGBA
  border: RGBA
  borderFocused: RGBA
  
  // Selection
  selectionBackground: RGBA
  selectionText: RGBA
  
  // Status colors
  success: RGBA
  warning: RGBA
  error: RGBA
  info: RGBA
  
  // Syntax highlighting (~20+ tokens)
  syntaxKeyword: RGBA
  syntaxString: RGBA
  syntaxComment: RGBA
  syntaxFunction: RGBA
  syntaxVariable: RGBA
  // ...
  
  // Diff colors
  diffAdded: RGBA
  diffRemoved: RGBA
  diffAddedBg: RGBA
  diffRemovedBg: RGBA
}
```

### Dark/Light Mode Detection

OpenCode queries terminal background color via **OSC 11**:

```typescript
// Query terminal for background color
const response = await queryTerminal("\x1b]11;?\x07")
// Parse response to determine if dark or light
const isDark = luminance(parsedColor) < 0.5
```

### System Theme Generation

Uses `renderer.getPalette()` to get terminal's 16-color palette and generate a theme that matches user's terminal.

### Consumption Pattern

```tsx
const { theme } = useTheme()

return (
  <box 
    backgroundColor={theme.background} 
    border 
    borderColor={isFocused() ? theme.borderFocused : theme.border}
  >
    <text fg={theme.text}>Normal text</text>
    <text fg={theme.textMuted}>Muted text</text>
  </box>
)
```

---

## Keybinding Architecture

### Leader Key Pattern

OpenCode implements a **Vim-like leader key** for multi-key sequences:

```typescript
export const { use: useKeybind, provider: KeybindProvider } = createSimpleContext({
  name: "Keybind",
  init: () => {
    const [store, setStore] = createStore({ leader: false })
    
    useKeyboard(async (evt) => {
      if (!store.leader && result.match("leader", evt)) {
        setStore("leader", true)  // Blur current focus, capture global input
        return
      }
      
      if (store.leader) {
        // Handle leader sequences (e.g., leader+n = new session)
        if (result.match("session_new", evt)) {
          createSession()
        }
        setStore("leader", false)
      }
    })
  }
})
```

### Command Registry

Components register commands with the `CommandProvider`:

```typescript
// In component
const { registerCommand } = useCommand()

onMount(() => {
  registerCommand({
    id: "session.new",
    label: "New Session",
    shortcut: "leader n",
    action: () => createSession()
  })
})
```

### Command Palette

Triggered by `Ctrl+P`, searches all registered commands.

---

## Project Structure

```
packages/opencode/src/cli/cmd/tui/
├── index.tsx              # Entry point
├── context/               # State providers
│   ├── sync.tsx           # Backend sync (main state)
│   ├── theme.tsx          # Theming
│   ├── keybind.tsx        # Keybinding handler
│   ├── command.tsx        # Command registry
│   └── kv.tsx             # Key-value persistence
├── routes/                # Page-level components
│   ├── home/
│   └── session/
├── component/             # Business components
│   ├── LogPanel.tsx
│   ├── Prompt.tsx
│   └── ...
└── ui/                    # Reusable primitives
    ├── dialog.tsx
    ├── toast.tsx
    └── ...
```

### createSimpleContext Pattern

OpenCode wraps context creation for consistency:

```typescript
export function createSimpleContext<T>(opts: {
  name: string
  init: () => T
}) {
  const Context = createContext<T>()
  
  const provider = (props: { children: JSX.Element }) => {
    const value = opts.init()
    return <Context.Provider value={value}>{props.children}</Context.Provider>
  }
  
  const use = () => {
    const ctx = useContext(Context)
    if (!ctx) throw new Error(`use${opts.name} must be within ${opts.name}Provider`)
    return ctx
  }
  
  return { provider, use }
}
```

### State Management

Uses `solid-js/store` with `reconcile` for efficient updates from backend events:

```typescript
sdk.event.listen((event) => {
  setStore("session", result.index, reconcile(event.properties.info))
})
```

---

## Key Takeaways for lazierjj

1. **Theme tokens** - Use ~50 semantic tokens, not raw colors
2. **OSC 11 detection** - Query terminal for light/dark mode
3. **Leader key** - Better than cramming everything into Ctrl/Alt combos
4. **Command registry** - Powers command palette and keybind display
5. **createSimpleContext** - DRY pattern for provider boilerplate
6. **reconcile()** - Use for high-frequency state updates
