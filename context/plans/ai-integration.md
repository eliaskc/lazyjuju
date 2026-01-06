# AI/LLM Integration

> AI-assisted workflows — mostly out of scope, except commit message generation.

**Status**: Largely out of scope  
**Priority**: Very low  
**Inspiration**: [lumen](https://github.com/jnsahaj/lumen) — Rust CLI with AI commit messages

---

## Scope Decision

**Most AI features are out of scope for kajji.**

After consideration, AI integration beyond commit message generation requires entirely new UX flows and significantly inflates scope. kajji should stay focused on being an excellent jj TUI, not an AI-powered development assistant.

**In scope (maybe):**
- **Commit message generation** — Low-friction, well-defined, minimal UX impact

**Out of scope:**
- Explain changes (revision/file/hunk) — Requires new panels, modals, streaming UI
- Hunk selection for AI queries — Requires additional UI for selection and query modal
- AI-assisted jj actions — External agents (Claude Code, etc.) already do this better
- AI-assisted PR review — Only reconsider if PR management is implemented

**Healthy skepticism:** AI features are tempting but often add complexity without proportional value. Many dedicated tools already exist (aicommits, gptcommit, lumen, Claude Code, Copilot). kajji's value is jj-native workflows, not AI.

---

## Philosophy (if implementing commit messages)

AI features should augment, not replace, user judgment. The goal is to reduce friction in repetitive tasks (writing commit messages), not to automate decision-making.

**CLI-first approach**: AI features should work via CLI for agent consumption. The TUI can call these CLI commands, but the underlying functionality is CLI-accessible.

**Provider agnostic**: Users should be able to use their preferred LLM provider (OpenAI, Anthropic, local models, etc.) via standard configuration.

---

## Core Features

### 1. Commit Message Generation (Primary)

Generate commit messages from diffs — the highest-value, lowest-risk AI feature.

**CLI:**
```bash
# Generate message for working copy
kajji ai message

# Generate for specific revision
kajji ai message <rev>

# Output options
kajji ai message --subject-only  # Just the subject line
kajji ai message --json          # Structured output

# Apply directly (opens describe modal pre-filled, or just sets it)
kajji ai message --apply
```

**TUI integration:**
- In describe modal: button/keybind to generate message
- Or: dedicated keybind in revision view (e.g., `A` for AI message)
- Pre-fills subject and body fields
- User can edit before committing

**Output format:**
```
feat: add rate limiting to API endpoints

Implements token bucket rate limiting for all public API endpoints.
Adds configurable limits per endpoint and user tier.

- Add RateLimiter class with token bucket algorithm
- Integrate middleware into Express router
- Add rate limit headers to responses
```

---

## Out of Scope (Archived Ideas)

The following were considered but deemed out of scope due to UX complexity and overlap with existing tools.

<details>
<summary>Explain Changes</summary>

Help understand what a commit/file/hunk does — useful for code review and archaeology.

**Why out of scope:** Requires new panels, modals, streaming UI. External agents (Claude Code, Cursor) already provide this via `/explain` or similar. The UX investment doesn't match the value added.

**If ever reconsidered:**
- Progression: revision-level → file-level → hunk-level
- CLI: `kajji ai explain <rev> [--file <f>]`
- TUI: keybind in revision view to explain selected commit

</details>

<details>
<summary>Hunk Selection for AI</summary>

Navigate hunks, mark them, ask AI questions about selected code.

**Why out of scope:** Requires additional UI for selection and query modal. Too much scope for uncertain value.

</details>

<details>
<summary>AI-Assisted jj Actions</summary>

AI suggests how to split commits, etc.

**Why out of scope:** External agents (Claude Code, Cursor, etc.) can already call `kajji` CLI commands. Building orchestration into kajji duplicates their capabilities.

</details>

<details>
<summary>AI-Assisted PR Review</summary>

AI drafts review comments that users approve/edit/reject.

**Why out of scope:** Heavy overlap with GitHub Copilot, Claude Code actions, etc. Only reconsider if PR management is implemented AND there's clear value over existing tools.

**If PR management lands:** Comment generation with human review *could* be considered, but maintain healthy skepticism. The UX of "AI drafts, human approves" is complex to get right.

</details>

---

## Configuration

```toml
[ai]
# Provider configuration
provider = "anthropic"  # or "openai", "ollama", "custom"
model = "claude-sonnet-4-20250514"

# API key (or use environment variable)
# api_key = "sk-..."  # Not recommended in config
# Prefer: ANTHROPIC_API_KEY, OPENAI_API_KEY env vars

# Custom endpoint (for ollama, proxies, etc.)
# endpoint = "http://localhost:11434/v1"

[ai.message]
# Commit message generation settings
style = "conventional"  # conventional, imperative, descriptive
max_subject_length = 72
include_body = true

[ai.explain]
# Explanation settings
default_detail = "normal"  # brief, normal, verbose
```

---

## CLI Commands Summary

If commit message generation is implemented:

```bash
# Commit messages (only in-scope AI feature)
kajji ai message [rev]              # Generate commit message
kajji ai message --apply            # Generate and apply
kajji ai message --subject-only     # Subject line only

# All commands support
--json                              # Structured output
--provider <name>                   # Override provider
--model <name>                      # Override model
```

---

## Implementation Phases

### Phase 0: Research (if pursuing)
- [ ] Review [lumen](https://github.com/jnsahaj/lumen) implementation
- [ ] Evaluate LLM provider libraries for TypeScript/Bun
- [ ] Prototype commit message generation
- [ ] Decide on provider abstraction

### Phase 1: Commit Messages (CLI)
- [ ] `kajji ai message` command
- [ ] Provider configuration
- [ ] Conventional commit format
- [ ] `--json` output

### Phase 2: Commit Messages (TUI)
- [ ] Keybind to generate message
- [ ] Pre-fill describe modal
- [ ] Loading state / streaming response

### ~~Phase 3-4: Out of scope~~
Explain changes, hunk selection, and other AI features are out of scope. See "Out of Scope" section above.

---

## Integration Points

### With CLI (`cli.md`)
- Commit message generation exposed via CLI
- `--json` output for agent consumption

### ~~With Custom Diff (`diff-viewing.md`)~~
Out of scope — hunk selection for AI queries is not planned.

### ~~With PR Management (`pr-management.md`)~~
Mostly out of scope. If PR management is implemented, comment generation with human review *could* be reconsidered, but with healthy skepticism.

---

## Open Questions

- Which LLM library? (Vercel AI SDK, LangChain, raw API calls?)
- How to handle rate limits and costs?
- Should we stream responses in TUI?
- How much context to send? (full diff vs summary?)
- Privacy considerations for sending code to APIs?
- Local model support priority? (ollama, llama.cpp)

---

## Prior Art

- [lumen](https://github.com/jnsahaj/lumen) — Rust CLI, AI commit messages, beautiful diffs
- [aicommits](https://github.com/Nutlope/aicommits) — AI commit message generator
- [gptcommit](https://github.com/zurawiki/gptcommit) — Git hook for AI commits
- [aider](https://github.com/paul-gauthier/aider) — AI pair programming (broader scope)
- GitHub Copilot — Inline suggestions, PR summaries
- Claude Code — `/review` command for PR review

---

## Non-Goals

- **Autonomous actions**: AI should suggest, not execute
- **Full agent orchestration**: Use external agents (Claude Code, etc.) for complex tasks
- **Code generation**: Out of scope — use dedicated tools
- **Chat interface**: kajji is a TUI, not a chatbot
- **Explain changes**: Out of scope — external agents do this better
- **Hunk-level AI queries**: Out of scope — requires too much UX investment
- **AI-assisted jj actions**: Out of scope — external agents can call kajji CLI directly
- **AI PR review**: Out of scope unless PR management lands and clear value is demonstrated
