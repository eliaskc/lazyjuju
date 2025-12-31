# lazyjj Analysis

> Reference: https://github.com/Cretezy/lazyjj
> Tech: Rust, Ratatui
> Relevance: **MEDIUM** - Alternative jj TUI, config integration patterns

---

## Keybinding System

### Per-Tab Event Enums

Each tab defines its own keybind events:

```rust
// src/keybinds/log_tab.rs
pub enum LogTabEvent {
    New,
    Edit,
    Describe,
    Squash,
    Abandon,
    // ...
}

pub struct LogTabKeybinds {
    pub new: Shortcut,
    pub edit: Shortcut,
    pub describe: Shortcut,
    // ...
}
```

### Shortcut Parsing

Supports human-readable config strings:

```rust
impl FromStr for Shortcut {
    fn from_str(s: &str) -> Result<Self> {
        // "ctrl+s" -> KeyCode::Char('s') + KeyModifiers::CONTROL
        // "shift+n" -> KeyCode::Char('N') + KeyModifiers::SHIFT
        // "enter" -> KeyCode::Enter
    }
}
```

### Configuration Format

Users configure in jj's TOML config:

```toml
[lazyjj.keybinds.log]
new = "n"
edit = ["e", "enter"]      # Multiple triggers
describe = "d"
abandon = "a"
squash = "s"

[lazyjj.keybinds.files]
stage = "s"
unstage = "u"

[lazyjj.keybinds.global]
quit = "q"
help = "?"
refresh = "R"
```

### Keybind Disable

```toml
# Disable a keybind entirely
[lazyjj.keybinds.log]
abandon = false
```

---

## Theming

### Minimal Theme System

lazyjj has a simpler approach - one configurable highlight color:

```rust
// src/env.rs
pub fn highlight_color() -> Color {
    config.get("lazyjj.highlight-color")
        .unwrap_or(Color::Rgb(50, 50, 150))
}
```

### Static Styles

Most styles are hardcoded for consistency:

```rust
// src/ui/styles.rs
pub static POPUP_BORDER: LazyLock<Style> = LazyLock::new(|| {
    Style::default().fg(Color::Green)
});

pub static TITLE_STYLE: LazyLock<Style> = LazyLock::new(|| {
    Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
});

pub static SELECTED_STYLE: LazyLock<Style> = LazyLock::new(|| {
    Style::default().bg(highlight_color())
});
```

---

## Project Structure

```
src/
├── main.rs              # Entry + event loop
├── app.rs               # Central App state
├── env.rs               # Config loading from jj
├── commander/           # jj CLI wrapper
│   ├── mod.rs
│   ├── log.rs           # Parse jj log
│   ├── diff.rs          # Parse jj diff
│   └── ...
├── keybinds/            # Keybinding definitions
│   ├── mod.rs           # Shortcut parsing
│   ├── log_tab.rs
│   ├── files_tab.rs
│   └── ...
└── ui/                  # UI components
    ├── mod.rs
    ├── log_tab.rs
    ├── files_tab.rs
    ├── styles.rs
    └── popup.rs
```

### State Flow

```rust
// main.rs event loop
loop {
    terminal.draw(|f| app.draw(f))?;
    
    if let Event::Key(key) = event::read()? {
        app.input(key);  // Delegates to active tab
    }
}

// app.rs
impl App {
    fn input(&mut self, key: KeyEvent) {
        match self.current_tab {
            Tab::Log => self.log_tab.input(key),
            Tab::Files => self.files_tab.input(key),
            // ...
        }
    }
}
```

### jj Config Integration

lazyjj reads from jj's config system, not a separate file:

```rust
// env.rs
pub fn load_config() -> Config {
    // Uses jj's config resolution
    // ~/.jjconfig.toml, .jj/repo/config.toml, etc.
    jj_lib::config::load_config()
}
```

---

## Notable Patterns

### Performance Monitoring

Built-in frame time display for debugging:

```rust
// Show render time in UI during development
if cfg!(debug_assertions) {
    let frame_time = last_render.elapsed();
    // Display in corner
}
```

### Snapshot Testing

Commander output parsing uses insta for snapshot tests:

```rust
#[test]
fn test_parse_log() {
    let output = include_str!("fixtures/log_output.txt");
    let commits = parse_log(output);
    insta::assert_debug_snapshot!(commits);
}
```

---

## Key Takeaways for lazierjj

1. **Use jj's config** - Don't create a separate config file
2. **Per-tab keybinds** - Each panel has its own event enum
3. **Multiple trigger support** - `["e", "enter"]` for same action
4. **Keybind disable** - `action = false` to disable
5. **Static styles** - Use `LazyLock` for constant styles
6. **Snapshot tests** - Essential for parser testing
