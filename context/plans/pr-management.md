# PR Management

> Full GitHub PR review and management within kajji.

**Status**: Planning  
**Priority**: Medium  
**Depends on**: [Custom Diff Renderer](./custom-diff-renderer.md) Phases 1-3 (after Interactive Splitting)

---

## Philosophy

This is exploratory territory. The goal is to evaluate whether kajji should become a PR management tool or stay focused on jj operations. Build for personal use first, see if it adds value or feels like scope creep.

**Why PR review after interactive splitting:** Splitting only needs hunk-level identification (simpler), while PR review needs line-level anchoring to match GitHub's comment API. PR review adds the `(path, side, line)` infrastructure on top of the hunk-level base.

**Risk**: Becoming an "everything TUI" that tries to replace GitHub's web UI entirely. kajji's value is jj-native workflows — PR management should complement that, not dominate it.

---

## Core Insight: GitHub Patch Alignment

When reviewing PRs, use GitHub's patch format as the canonical source:

```typescript
// Fetch PR patches via GitHub API
const prFiles = await ghApi(`/repos/${owner}/${repo}/pulls/${prNumber}/files`)

for (const file of prFiles) {
  // file.patch is the same unified diff format @pierre/diffs handles
  const parsed = parsePatchFiles(file.patch)
}
```

**Why this matters:** GitHub's PR file patches are the canonical "diff context" GitHub uses for comment placement. When we parse the same patch text, our `(path, side, line)` mapping matches their expectations exactly.

---

## Line Anchoring for Comments

Comments anchor to specific lines using GitHub's coordinate system:

```typescript
interface LineAnchor {
  path: string           // file path
  side: 'LEFT' | 'RIGHT' // GitHub terminology: LEFT=old file, RIGHT=new file
  line: number           // line number in that side
  
  // For multi-line comments
  start_line?: number
  start_side?: 'LEFT' | 'RIGHT'
}

// When creating a comment via GitHub API:
// POST /repos/{owner}/{repo}/pulls/{pull_number}/comments
{
  body: "comment text",
  commit_id: "abc123",  // HEAD SHA
  path: "src/auth.ts",
  side: "RIGHT",
  line: 42
}
```

This matches the row index built by the custom diff renderer:

```typescript
interface DiffRow {
  // ... other fields from custom-diff-renderer.md
  side: 'LEFT' | 'RIGHT' | null
  lineNumber?: number
  fileId: FileId  // path
}
```

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

### PR Detail View (File-at-a-Time)

When drilling into a PR, show one file at a time (not full diff):

- **File picker** on left: changed files list with viewed/unviewed status
- **File diff** on right: structured rendering of single file
- **Inline comments**: rendered below their anchor lines

This matches the performance model in custom-diff-renderer.md and natural PR review UX.

```
┌─ Files (3/12) ──────────┬─ src/auth.ts ─────────────────────────────┐
│ ✓ src/utils.ts          │ @@ -10,6 +10,8 @@ function validate()      │
│   src/auth.ts      ◄    │    function validate(input) {            │
│   src/api/handler.ts    │ -    return true                         │
│   src/api/routes.ts     │ +    if (!input) throw new Error()       │
│   ...                   │ +    return isValid(input)               │
│                         │    }                                     │
│                         │ ┌─ @alice · 2h ago ────────────────────┐ │
│                         │ │ Should we validate type here too?    │ │
│                         │ └──────────────────────────────────────┘ │
└─────────────────────────┴──────────────────────────────────────────┘
```

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

### Annotation Data Structure

```typescript
interface DiffAnnotation {
  // Anchor (stable, survives view mode changes)
  anchor: LineAnchor  // { path, side, line }
  
  type: 'comment' | 'suggestion' | 'ai-explanation'
  content: string
  author?: string
  createdAt?: Date
  
  // GitHub sync
  prCommentId?: number
  threadId?: string
  resolved?: boolean
  
  // For replies
  replyTo?: number  // parent comment ID
}

// Key for annotation lookup: `${path}:${side}:${line}`
function annotationKey(anchor: LineAnchor): string {
  return `${anchor.path}:${anchor.side}:${anchor.line}`
}
```

### Visual Rendering

Comments appear inline below the referenced line:

```
  +    return isValid(input)
  ┌─ @alice · 2h ago ─────────────────────────────────────────────┐
  │ Should we validate the input type here too?                   │
  │                                                               │
  │ ┌─ @bob · 1h ago ───────────────────────────────────────────┐ │
  │ │ Good catch, I'll add that.                                │ │
  │ └───────────────────────────────────────────────────────────┘ │
  │ [Reply] [Resolve]                                             │
  └───────────────────────────────────────────────────────────────┘
     }
```

### Adding Comments

1. Navigate to line in diff view
2. Press `c` to open comment modal
3. Write comment, submit
4. Comment syncs to GitHub via API

---

## Review Workflow

Full review cycle without leaving the terminal:

1. Open PR from list
2. Navigate files (file-at-a-time)
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

## Implementation Phases

**Note:** These phases build on the custom diff renderer phases.

### Phase 0: Research
- [ ] Evaluate `gh` CLI capabilities for PR operations
- [ ] Test `gh api` for fetching PR files/patches
- [ ] Prototype PR list view

### Phase 1: Read-Only (MVP)
- [ ] PR list with filtering (`gh pr list`)
- [ ] PR detail view with file picker
- [ ] File diff viewing (reuse custom diff renderer)
- [ ] Open in browser

### Phase 2: Viewing Comments
- [ ] Fetch existing comments via `gh api`
- [ ] Map comments to line anchors
- [ ] Render inline in diff view
- [ ] File viewed/unviewed tracking

### Phase 3: Adding Comments
- [ ] Comment input modal
- [ ] Submit comments via `gh api`
- [ ] Reply to threads
- [ ] Resolve threads

### Phase 4: Review Actions
- [ ] Approve / request changes
- [ ] Submit review with summary
- [ ] Merge PR (strategy picker)
- [ ] Toggle draft/ready

---

## Integration Points

### With Custom Diff Renderer

The diff renderer provides:
- Row index with `(path, side, line)` coordinates
- File-at-a-time rendering for performance
- Hunk navigation
- Same visual style as jj diffs

### With Stacking (`github-stacking.md`)

- View stack status in PR list
- Navigate between stacked PRs
- See stack context when reviewing

### With AI (`ai-integration.md`)

Mostly out of scope. If implemented: AI explanations anchored to specific lines using the same LineAnchor system.

---

## CLI Commands

```bash
# List PRs
kajji pr list [--state open|closed|merged] [--filter assigned|mine|review]

# View PR details
kajji pr show <number>

# Review actions
kajji pr approve <number> [--body "LGTM"]
kajji pr request-changes <number> --body "Please fix..."
kajji pr comment <number> --body "Question about..."

# Inline comment (CLI)
kajji pr comment <number> --path src/auth.ts --line 42 --body "Check this"

# Merge
kajji pr merge <number> [--squash|--rebase|--merge]
```

All with `--json` for agent consumption.

---

## Open Questions

- How much overlap with existing tools is acceptable?
- Is the value proposition strong enough vs `gh pr` + browser?
- How to handle review comments that reference code that's changed?
- Offline support? (probably not — PRs are inherently online)

---

## Prior Art

- [gh CLI](https://cli.github.com/) — GitHub's official CLI, does most PR operations
- [lazygit](https://github.com/jesseduffield/lazygit) — Has basic PR viewing
- [gitui](https://github.com/extrawurst/gitui) — Rust TUI, some PR features
- [Graphite](https://graphite.dev/) — Full PR management + stacking
- [@pierre/diffs](https://github.com/pierrecomputer/pierre) — Line selection/annotation patterns

---

## Decision Log

*Record key decisions as they're made*

- Phase ordering: Interactive splitting before PR review (splitting only needs hunk-level, PR needs line-level)
- State keying: Stable anchors (path, side, line), not array indices
- Rendering: File-at-a-time for performance and natural UX
