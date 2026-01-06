# PR Management

> Full GitHub PR review and management within kajji.

**Status**: Exploratory  
**Priority**: Low (future exploration)  
**Depends on**: GitHub stacking (Phase 0-2)

---

## Philosophy

This is exploratory territory. The goal is to evaluate whether kajji should become a PR management tool or stay focused on jj operations. Build for personal use first, see if it adds value or feels like scope creep.

**Risk**: Becoming an "everything TUI" that tries to replace GitHub's web UI entirely. Many tools already do PR management (gh CLI, GitHub web, IDE integrations). kajji's value is jj-native workflows — PR management should complement that, not dominate it.

**Possible architectures**:
- Integrated panels within existing TUI
- Separate tab (`[jj] [PR]`) where jj contains current TUI
- Completely separate TUI (`kajji pr` vs `kajji`)

Start small, evaluate fit.

---

## Core Features

### PR List View

View PRs for the current repository with filtering:

- **States**: Open, closed, merged, draft
- **Filters**: Assigned to me, created by me, review requested, all
- **Quick info**: Title, author, status, CI, labels, review state

```
PRs (open, assigned to me)

  #42  Add auth validation       @alice   ● CI passing  ✓ approved
  #38  Fix rate limiting         @bob     ○ CI running  ? needs review
  #35  Update dependencies       @me      ● CI passing  ✓ approved

  j/k navigate | Enter view | f filter | r refresh
```

### PR Detail View

When drilling into a PR:

- **Header**: Title, author, base/head branches, status
- **Description**: Full PR body (rendered markdown?)
- **Reviews**: Review status, comments count
- **CI**: Check status with expandable details
- **Files**: Changed files list (similar to existing file tree)
- **Diff**: Full diff view (reuse existing infrastructure)

### PR Actions

| Key | Action |
|-----|--------|
| `Enter` | View PR details |
| `o` | Open in browser |
| `a` | Approve |
| `r` | Request changes (opens comment modal) |
| `c` | Add comment (general or inline) |
| `m` | Merge (with strategy picker) |
| `d` | Toggle draft/ready |
| `e` | Edit description |

---

## GitHub File Sync

Track which files you've viewed in a PR, syncing with GitHub's "viewed" checkboxes:

- Mark files as viewed when you navigate away
- Show viewed/unviewed status in file tree
- Persist across sessions (via GitHub API)
- Filter to show only unviewed files

This helps with large PRs where you review incrementally.

```
Files (3/12 viewed)

  ✓ src/auth.ts
  ✓ src/utils.ts  
    src/api/handler.ts      ← currently viewing
    src/api/routes.ts
    ...
```

---

## Inline Comments

Add comments on specific lines in the diff:

1. Navigate to line in diff view
2. Press `c` to open comment modal
3. Write comment, submit
4. Comment appears inline in diff

For reviewing:
- See existing comments inline in diff
- Reply to comment threads
- Resolve/unresolve threads

This requires custom diff rendering (see `diff-viewing.md`) rather than relying on jj's native diff output.

---

## Review Workflow

Full review cycle without leaving the terminal:

1. Open PR from list
2. Navigate files, view diffs
3. Add inline comments as needed
4. Submit review (approve / request changes / comment only)

```
Submit Review

  ○ Comment only
  ● Approve
  ○ Request changes

  [Review summary - optional]
  ________________________________
  |                              |
  |______________________________|

  Enter submit | Escape cancel
```

---

## Integration Points

### With Stacking (`github-stacking.md`)

- View stack status in PR list
- Navigate between stacked PRs
- See stack context when reviewing (which PR is this building on?)

### With AI (`ai-integration.md`) — Mostly Out of Scope

Most AI integration is out of scope. See [AI Integration](./ai-integration.md) for the scope decision.

**If PR management is implemented:** Comment generation with human review *could* be reconsidered, but with healthy skepticism. The UX of "AI drafts, human approves" is complex to get right, and overlaps significantly with GitHub Copilot, Claude Code actions, etc.

### With Custom Diff (`diff-viewing.md`)

- Required for inline comments
- Enables "viewed" tracking per file
- Hunk navigation for targeted review

---

## Implementation Phases

### Phase 0: Research
- [ ] Evaluate `gh` CLI capabilities for PR operations
- [ ] Prototype PR list view
- [ ] Decide on architecture (integrated vs separate)

### Phase 1: Read-Only
- [ ] PR list with filtering
- [ ] PR detail view (description, status, files)
- [ ] Diff viewing (reuse existing)
- [ ] Open in browser

### Phase 2: Basic Actions
- [ ] Approve / request changes
- [ ] Add general comments
- [ ] Merge PR
- [ ] Toggle draft/ready

### Phase 3: Inline Comments
- [ ] Requires custom diff renderer
- [ ] Add comments on lines
- [ ] View existing comments
- [ ] Reply to threads

### Phase 4: File Sync
- [ ] Track viewed files
- [ ] Sync with GitHub API
- [ ] Persist state

---

## CLI Commands

If PR management moves forward, corresponding CLI commands:

```bash
# List PRs
kajji pr list [--state open|closed|merged] [--filter assigned|mine|review]

# View PR details
kajji pr show <number>

# Review actions
kajji pr approve <number> [--body "LGTM"]
kajji pr request-changes <number> --body "Please fix..."
kajji pr comment <number> --body "Question about..."

# Merge
kajji pr merge <number> [--squash|--rebase|--merge]
```

All with `--json` for agent consumption.

---

## Open Questions

- How much overlap with existing tools is acceptable?
- Is the value proposition strong enough vs `gh pr` + browser?
- Should this be a separate tool/TUI entirely?
- How to handle review comments that reference code that's changed?
- Offline support? (probably not — PRs are inherently online)

---

## Prior Art

- [gh CLI](https://cli.github.com/) — GitHub's official CLI, does most PR operations
- [hub](https://github.com/github/hub) — Older GitHub CLI wrapper
- [lazygit](https://github.com/jesseduffield/lazygit) — Has basic PR viewing
- [gitui](https://github.com/extrawurst/gitui) — Rust TUI, some PR features
- [Graphite](https://graphite.dev/) — Full PR management + stacking

---

## Decision Log

*Record key decisions as they're made*

- TBD: Architecture choice (integrated vs separate)
- TBD: Scope boundaries (what NOT to include)
