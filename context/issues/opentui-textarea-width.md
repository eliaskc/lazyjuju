# OpenTUI Issue: Textarea viewport width initialization

**Status:** Draft (not yet filed)
**Repo:** https://github.com/sst/opentui

## Summary

Textarea/EditBufferRenderable initializes EditorView with hardcoded 80-column default before Yoga measures the container, causing incorrect viewport width on initial render.

## Problem

When using `<textarea>` with `wrapMode="none"`, the internal viewport doesn't match the container width:

- **Wide terminals:** Extra right margin inside textarea
- **Narrow terminals:** Content overflows container bounds

Calling `requestRender()` after mount fixes the overflow but a margin remains.

## Root Cause

In `EditBufferRenderable.ts` line ~109:

```typescript
this.editorView = EditorView.create(this.editBuffer, this.width || 80, this.height || 24)
```

The `|| 80` default is used when `this.width` is undefined at construction time (before Yoga measurement).

## Reproduction

```tsx
<box width="60%" border>
  <textarea
    wrapMode="none"
    flexGrow={1}
    initialValue="Type a very long line that exceeds container width..."
  />
</box>
```

1. On wide terminal: notice right margin inside textarea
2. On narrow terminal: text overflows outside border

## Workarounds Attempted

| Approach | Result |
|----------|--------|
| `width="100%"` | No effect |
| `flexGrow={1}` | No effect |
| `scrollMargin={0}` | No effect |
| `requestRender()` on mount | Fixes overflow, margin remains |

## Suggested Fix

Options for OpenTUI:

1. **Lazy EditorView creation** - Defer until first resize when actual width is known
2. **Smaller default** - Use 1 instead of 80, let resize correct it
3. **Require explicit width** - Don't default, require prop or error
4. **Re-create EditorView on first resize** - If initial width was defaulted

## Environment

- @opentui/solid: (check package.json)
- @opentui/core: (check package.json)
- Platform: macOS
