# Build & Release Flows

**Status**: Not started  
**Priority**: Medium

---

## Goals

Enable users to install lazyjuju easily via:

1. **bunx** — Zero-install execution
2. **Homebrew** — macOS/Linux package manager
3. **npm/pnpm/yarn** — Node ecosystem

## Homebrew

Create a Homebrew tap:

```bash
brew tap YOUR_USERNAME/lazyjuju
brew install lazyjuju
```

Requirements:
- Create `homebrew-lazyjuju` repo with formula
- Binary releases on GitHub
- Formula that downloads and installs binary

## bunx / npx

Publish to npm:

```bash
bunx lazyjuju
# or
npx lazyjuju
```

Requirements:
- Add `"bin"` to package.json:
  ```json
  "bin": {
    "lazyjuju": "./bin/lazyjuju.js",
    "ljj": "./bin/lazyjuju.js"
  }
  ```
- Create entry script that works with Bun

## GitHub Releases

Automated releases with:
- Semantic versioning (or date-based: `2026.01.15`)
- Changelog generation (git-cliff or similar)
- Binary builds for macOS/Linux (arm64, x64)

## CI/CD

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      # Build binaries
      # Create GitHub release
      # Publish to npm
      # Update Homebrew formula
```

## Auto-Updater

Two approaches, implement both:

### 1. Update Notification

Check for updates on startup (non-blocking):

```typescript
// Check GitHub releases API
const latest = await fetch('https://api.github.com/repos/USER/lazyjuju/releases/latest')
if (semver.gt(latest.tag, currentVersion)) {
  // Show toast notification using opentui-ui
  showToast(`Update available: ${latest.tag}`)
}
```

- Check frequency: Once per day (store last check timestamp)
- Non-blocking: Don't delay startup, check in background
- Use [opentui-ui](https://github.com/msmps/opentui-ui) for toast notifications
- Show: "Update available: v1.2.3 — run `lazyjuju update` to install"

### 2. Self-Update Command

```bash
lazyjuju update        # Check and install update
lazyjuju update --check  # Just check, don't install
```

Implementation:
1. Download new binary to temp location
2. Verify checksum (from GitHub release)
3. Replace current binary (or stage for next restart)
4. Show success message: "Updated to v1.2.3. Restart to apply."

For npm installs:
```bash
# Detect install method and use appropriate update
npm update -g lazyjuju
# or
brew upgrade lazyjuju
```

### Update Flow

```
┌─ Update Available ──────────────────────────────────────────────┐
│                                                                 │
│  lazyjuju v1.2.3 is available (current: v1.2.0)                 │
│                                                                 │
│  Changes:                                                       │
│  • Added interactive splitting                                  │
│  • Fixed diff rendering performance                             │
│                                                                 │
│  [Enter] Install now    [Escape] Later    [n] Don't ask again   │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

```toml
[lazyjuju.updates]
check = true           # Enable/disable update checks
auto_install = false   # Auto-install without prompting (power users)
channel = "stable"     # stable | beta | nightly (future)
```

---

## Tasks

- [ ] Set up npm package structure
- [ ] Create bin entry script
- [ ] Create GitHub Actions workflow for releases
- [ ] Set up Homebrew tap repository
- [ ] Add changelog generation
- [ ] Test cross-platform builds
- [ ] Implement update check on startup
- [ ] Add `lazyjuju update` command
- [ ] Integrate opentui-ui for notifications
- [ ] Add update configuration options
