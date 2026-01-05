# Changelog

## 0.2.0

### new
- rebase command (`r`) with revision picker
- split command (`S`) with TUI suspend/resume
- move bookmark here command for revisions in log and refs
- undo/redo as global commands with help-only visibility
- confirmation modal for edit or abandon on immutable commits
- command log panel focusable (`4`) with keyboard scroll
- search in help modal only shows matching results
- set bookmark modal: combined flow for moving existing or creating new bookmark on selected commit

### improved
- ux: status bar truncates gracefully, commands grouped by context (left truncates, right fixed)
- ux: help modal scrolls with visible scrollbar, responsive column layout
- ux: replace input with textarea for paste and word navigation support
- ux: selection highlight only shown in focused panels
- layout: panel ratios now based on mode (files vs revisions), not focus state
- layout: command log expands to 15 lines when focused
- theming: modal title colors match border (focused and unfocused)
- theming: slight gray instead of white for borders and text, more consistent token usage

### fixed
- divergent commits now handled correctly (uses commit ID instead of change ID)
- perf: undo/redo modal loads data before display (no flash)
- scroll effect infinite loop prevented by using explicit deps
- inner box in BorderBox now fills parent for expected sizing
- commit body parsed from full description instead of removed API
- proper OpenTUI API for scrollbox viewport height

## 0.1.0

initial release
