# GitHub PR Stacking

> "Graphite in a TUI" — stacked PRs with jj's clean model, open-source and free.

## Philosophy

**Log-centric, not bookmark-centric.** Stacks are about commits, not bookmarks. Bookmarks are just the transport mechanism jj uses to push to GitHub.

- Change ID is the identity, bookmark is just transport
- `jj git push --change <rev>` auto-creates bookmark from change ID (e.g., `push-kywxvzoq`)
- Select commits in the log → create a stack → done

## Overview

Three main flows:

1. **Single PR** — Select any commit, push + create PR
2. **Stack creation** — Multi-select commits in log, create PRs for the range
3. **Stack reconciliation** — Detect merged PRs, offer to update local state

---

## Single PR Flow

### Trigger
User selects any commit and presses `p`.

### Logic
1. Run `jj git push --change <selected>` — auto-creates bookmark from change ID
2. Run `gh pr create --head <auto-bookmark>`
3. (optional) Open PR in browser

No bookmark required. No naming modal. Just "this commit should be a PR."

---

## Stack Creation Flow

### Trigger
User multi-selects commits in the log (using contiguous visual mode) and presses `c` or `P`.

### Logic
1. Validate selection is contiguous in ancestry (enforced by contiguous mode)
2. Order commits by ancestry (main → tip)
3. Show visual stack editor for preview/customization
4. On confirm, push each change and create PRs

### Visual Stack Editor

```
Create PR Stack:

  [1] push-kywxvzoq  fix auth validation     (base, ready)
  [2] push-mrzwplnk  add error handler       (draft)
  [3] feature-api    cleanup api responses   (draft)

  j/k navigate | Enter rename | Space toggle draft/ready
  Enter create | Escape cancel
```

**Features:**
- Pre-fills existing bookmarks where present, otherwise shows auto-generated `push-xxx`
- Navigate with `j`/`k`, rename with `Enter` (inline edit or modal)
- `Space` toggles draft/ready status
- Base defaults to **ready**, rest default to **draft**

### Draft Strategy

- **Base PR**: Ready for review (signals entry point for reviewers)
- **Stacked PRs**: Draft by default (encourages correct merge order)
- User can toggle any PR to ready/draft in the preview

### Edge Cases

**Existing bookmarks with open PRs:**
- Show warning in preview: `push-abc123 already has PR #42`
- Allow proceeding (user might be rebuilding a stack)
- Prevents accidental duplicate PR creation

**Commit already in another stack:**
- Surface in preview with indicator
- Not blocking, but informative

**Non-contiguous selection:**
- Prevented by contiguous visual mode (invalid commits are dimmed)
- If user somehow selects A and C without B, auto-include B and show in preview

### jj Commands

```bash
# Push each change (auto-creates bookmarks)
jj git push --change <rev1>
jj git push --change <rev2>
jj git push --change <rev3>

# Create PRs with correct base targeting
gh pr create --head push-kywxvzoq --base main
gh pr create --head push-mrzwplnk --base push-kywxvzoq --draft
gh pr create --head feature-api --base push-mrzwplnk --draft
```

---

## Stack Reconciliation Flow

### Trigger
On `jj git fetch` or manual "Sync stack" command (`S`).

### Detection
1. List local bookmarks that have open PRs: `gh pr list --state open`
2. Check which PRs have been merged since last sync
3. Identify affected stacks

### Example: Mid-stack merge
If PR #2 of 4 is merged:
- Before: `main ← #1 ← #2 ← #3 ← #4`
- After merge: `main` now contains #2's changes
- Action: Update #3 to target #1 (skip merged #2), rebase #3 and #4

### Semi-automatic approach
Since jj makes rebasing trivial:
- Detect stale stacks on refresh
- Show inline notification: "Stack has merged PRs. Press `S` to reconcile."
- One keypress applies the fix

### Full modal (for complex cases)
```
Stack changes detected:

push-def456 was merged to main.

Proposed updates:
  - Rebase push-ghi789 onto push-abc123 (was: push-def456)
  - Update PR #3 base
  - Force push remaining stack

[Enter] Apply  [Esc] Cancel  [d] Show diff
```

---

## Conflict Handling

jj allows conflicts to persist in the working copy. When rebasing a stack:
- If conflicts occur, jj records them but continues
- Show clear warning:
  ```
  Conflicts in feature-auth-test:
    - src/auth.ts
    - src/utils.ts
  
  Rebase completed with conflicts. Resolve before pushing.
  ```
- Block force-push until conflicts resolved (or provide override)

---

## Stack & PR Viewing

### Panel Organization Options

**Option A: Stacks in Log panel**
```
Left panel tabs: [Log] [Stacks] [Oplog]
Right panel: Diff / File tree

Bookmarks as separate panel (key 2)
```
Rationale: Stacks are commit-centric, living near Log makes conceptual sense.

**Option B: Stacks in Bookmarks panel** (preferred)
```
Left panel tabs: [Log] [Oplog]
Bookmarks panel (key 2): [Bookmarks] [Stacks] [Workspaces]
```
Rationale: Stacks are "bookmarks with relationships" — keeping them together maintains cohesion.

**Option C: Unified "Refs" panel** (preferred)
```
Bookmarks panel becomes "Refs" with sections:
  Stacks
    feature-auth (3 PRs) ✓✓○
    cleanup-api  (2 PRs) ○○
  Bookmarks
    main
    dev
  Workspaces
    agent-workspace-1
```
Rationale: Single panel with everything ref-related, no sub-tabs needed.

**Current preference:** Option B or C. Stacks are conceptually tied to bookmarks (each stack item IS a bookmark with a PR). Keeping them together avoids spreading related concepts across panels.

### Stack Status Indicators

```
feature-auth (3 PRs) ✓✓○
                     │││
                     ││└─ #3: pending (draft)
                     │└── #2: merged
                     └─── #1: merged (base)
```

Or with CI status:
```
feature-auth (3 PRs) ✓✓○ ● (CI failing on #3)
```

---

## Commands

| Key | Context | Action |
|-----|---------|--------|
| `p` | Log (single) | Push change + create PR |
| `c` or `P` | Log (multi-select) | Create PR stack from selection |
| `S` | Log/Stacks | Sync/reconcile stack |
| `gp` | Log/Stacks | Open PR in browser (if exists) |

---

## Implementation Phases

### Phase 0: Single PR (jj-native)
- [ ] `p` on any commit pushes + creates PR
- [ ] `jj git push --change` for auto-bookmark
- [ ] `gh pr create` integration
- [ ] Foundation for stacking

### Phase 1: Stack Creation
- [ ] Integration with contiguous multi-select mode
- [ ] Visual stack editor (preview, rename, draft/ready toggle)
- [ ] Push each change (auto-bookmarks)
- [ ] `gh pr create --draft --base <parent>` for each
- [ ] Progress feedback

### Phase 2: Stack Visualization
- [ ] Stacks view in bookmarks/refs panel
- [ ] PR status indicators (draft/ready/merged)
- [ ] CI status indicator
- [ ] Stack relationship lines in log view (future)

### Phase 3: Stack Reconciliation
- [ ] Detect stale stacks on refresh (merged PRs)
- [ ] One-keypress fix: rebase + update PR targets
- [ ] Semi-automatic for common cases
- [ ] Full preview modal for complex cases

### Phase 4: Polish
- [ ] Handle edge cases (orphaned PRs, conflicts)
- [ ] Undo support for stack operations
- [ ] Batch operations (mark all ready, close stack)

---

## Implementation Notes (from prior art research)

### Stack Discovery

Use jj's revset to find mutable commits in ancestry:
```bash
jj log -r 'ancestors(@) & mutable()' --no-graph \
  --template 'change_id.short() ++ "\t" ++ commit_id.short() ++ "\t" ++ bookmarks ++ "\t" ++ description.first_line() ++ "\n"'
```

### Base Targeting Logic

```typescript
function getBase(change: Change, stack: Change[]): string {
  const idx = stack.indexOf(change)
  if (idx === 0) return 'main' // or default branch
  const parent = stack[idx - 1]
  return parent.bookmarks[0] || `push-${parent.changeId.slice(0, 8)}`
}
```

### Idempotent PR Creation

Check for existing PR before creating:
```bash
gh pr list --head <branch> --json number,state,url
```
If exists, update via `gh pr edit`. If not, create new.

### Relation Chain Generation

Auto-generate for PR body:
```typescript
function relationChain(stack: StackItem[], current: number): string {
  const lines = stack.map(item => {
    const marker = item.prNumber === current ? '👉 ' : '   '
    return `- ${marker}#${item.prNumber} ${item.title}`
  })
  return `### Relation chain\n${lines.join('\n')}`
}
```

### Auto-Rebase After Landing

jj-spr's main friction is manual rebase. After `land`:
```bash
jj git fetch
jj rebase -d main@origin  # or appropriate target
```
kajji can prompt or auto-run this with confirmation.

---

## Future: Full PR Management

Beyond stacking, kajji could become a full PR management tool.

→ **See [PR Management](./pr-management.md) for detailed exploration.**

Summary of what's explored there:
- PR list with filtering (open, assigned, created by me, review requested)
- PR detail view (description, reviews, CI, files, diff)
- Actions: approve, request changes, comment (inline and general), merge
- GitHub file sync (track viewed files, sync with GitHub's checkboxes)
- AI-assisted review (see [AI Integration](./ai-integration.md))

### Why This Matters
This would make kajji a true "Graphite in TUI":
- Open-source and free
- Works with standard tools (jj + gh CLI)
- No vendor lock-in, no account required
- Full stacking workflow from creation to merge

---

## Dependencies

- `gh` CLI must be installed and authenticated
- Repository must have GitHub remote
- jj must be configured with git backend

## Prior Art & Inspiration

### Tools to Consider Integrating

**[jj-spr](https://github.com/LucioFranco/jj-spr)** — jj-native stacked PRs (Rust)
- Uses change IDs as PR identity (`jj-spr-{change_id}` branches)
- Two modes: `--cherry-pick` (independent) vs dependent stacks — kajji should offer both
- Append-only PR updates (new commits, not force-push — preserves review context)
- Main friction: manual rebase after landing — kajji could automate this
- Could potentially use as backend or reference implementation

**[spr](https://github.com/ejoffe/spr)** — git-based stacked PRs (Go)
- Proven UX patterns: status bits (⌛❌✅❌ for CI/approval/conflicts/stack), WIP prefix, batch merge
- Git-only (no jj support), but valuable for UX inspiration
- Key ideas to adopt: `--count` for partial stack ops, intelligent merge ordering, config model (repo vs user)

### Scripts & Workflows

**[jj-vcs/jj#485](https://github.com/jj-vcs/jj/issues/485)** — Upstream discussion on GitHub integration

**[jj-gh-pr.nu](https://github.com/eopb/jj-gh-pr.nu)** — Nushell scripts for jj → GitHub PRs
- Uses `jj log -r 'ancestors(@) & mutable()'` for stack discovery
- Parent bookmark lookup via `{change}-` revset syntax

**Community Python script** (jj-github-pr):
- **Relation chain pattern**: Adds markdown section to PR body showing stack position:
  ```markdown
  ### Relation chain
  - 👉 #45  ← this PR
  - #44
  - #43
  ```
- Idempotent PR creation (check existing via `repo.get_pulls(head=...)`, update or create)
- Force-push via raw git for branch updates

**Graphite bridge script**:
- `jj branch list -r 'reachable(@,mutable())'` to discover bookmarks
- `gt track --force` to import into Graphite, then `gt submit` for PR creation

### Key Patterns from Research

| Pattern | Source | Recommendation |
|---------|--------|----------------|
| Change ID as PR identity | jj-spr | Already planned, validated |
| Two stacking modes (independent/dependent) | jj-spr | Add `--cherry-pick` style option |
| Status bits (⌛❌✅❌) | spr | Adopt for stack visualization |
| WIP prefix to skip PR | spr | Support in commit message detection |
| Relation chain in PR body | Python script | Auto-generate for all stacked PRs |
| Append-only PR updates | jj-spr | Consider as option (preserves review context) |
| `--count` for partial ops | spr | Add to CLI commands |

### Other References

- [Graphite](https://graphite.dev/) — Commercial stacking tool (good UX reference)
- [gh-stack](https://github.com/timothyandrew/gh-stack) — CLI for GitHub stacked PRs

## Open Questions

- How to handle force-push failures (protected branches, etc.)?
- Integration with jj's eventual native GitHub support?
- Custom bookmark naming: allow user to rename auto-generated `push-xxx` bookmarks? (Yes, in visual editor)
- Use jj-spr as backend vs implement natively? (jj-spr is Rust, well-structured)
- Append-only vs force-push for PR updates? (trade-off: review context vs clean history)
- Independent vs dependent stacks as default? (independent is simpler, dependent is more "correct")
