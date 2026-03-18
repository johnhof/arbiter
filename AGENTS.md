# Arbiter — Agent Design Reference

## What It Is

A self-contained, browser-based git diff viewer with GitHub-style inline commenting. The primary workflow: a human reviews a branch diff, leaves comments on specific lines or files, then exports all comments as a structured markdown prompt that an AI agent can consume to apply the requested fixes.

## How to Run

```bash
# From the arbiter directory (defaults to git root of CWD)
arbiter

# Or specify a repo path explicitly
arbiter --path /path/to/repo
```

Opens at `http://localhost:7429` (auto-increments port if taken). When `--path` is omitted, defaults to `git rev-parse --show-toplevel` of the current directory.

## Tech Stack

- **Backend:** Node.js + Express (single file: `server.js`)
- **Frontend:** Vanilla JS, no build step, no framework (single file: `public/app.js`)
- **Styling:** Plain CSS with CSS custom properties (single file: `public/style.css`)
- **Syntax highlighting:** highlight.js loaded from CDN (core + protobuf language module)
- **Dependencies:** Only `express` (see `package.json`)

No TypeScript, no bundler, no React. Everything is imperative DOM manipulation via a `createEl()` helper.

## File Map

```
├── server.js           # Express server — git CLI wrapper + static files (~225 lines)
├── package.json        # Only dependency: express
├── .gitignore          # Excludes node_modules
├── public/
│   ├── index.html      # Shell HTML — header (3 sections), sidebar, main area, comment nav, popover
│   ├── app.js          # All frontend logic (~1260 lines)
│   └── style.css       # GitHub-dark theme, borderless design (~470 lines)
└── node_modules/       # Express + transitive deps
```

## Architecture

### Backend (`server.js` — ~225 lines)

The server is a thin wrapper around `git` CLI commands. It shells out via `execFileSync` (not `exec` — safe from injection). All endpoints are GET with query params.

| Endpoint | Purpose | Git command |
|----------|---------|-------------|
| `GET /api/validate-path?path=` | Validates a directory is a git repo | `git rev-parse --is-inside-work-tree` |
| `GET /api/branches?path=` | Lists all branches + current branch | `git branch -a`, `git symbolic-ref` |
| `GET /api/diff?path=&source=&target=` | Returns parsed diff between two branches | `git diff --no-color -U5 target...source` |
| `GET /api/file-content?path=&branch=&file=` | Returns full file content at a branch | `git show branch:file` |
| `GET /api/initial-path` | Returns the `--path` CLI arg or git root | — |

**Diff parsing** happens server-side in `parseDiff()`. It splits raw unified diff output into a structured array of file objects:

```js
{
  path: string,
  oldPath: string,       // for renames
  status: 'added' | 'modified' | 'deleted' | 'renamed',
  binary: boolean,
  generated: boolean,    // matched by .gitattributes patterns
  hunks: [{
    oldStart, oldCount, newStart, newCount,
    header: string,      // function context from @@ line
    lines: [{ type: 'add' | 'del' | 'context', content: string }]
  }]
}
```

**Generated file detection** reads `.gitattributes` and matches patterns with `linguist-generated`, `-diff`, `diff=false`, or `binary` attributes. These files are collapsed in the UI.

### Frontend (`public/app.js` — ~1260 lines)

#### Global State

Single `state` object — no reactivity system, no virtual DOM. State changes trigger manual re-renders of specific DOM sections.

```js
const state = {
  basePath: '',           // repo path on disk
  branches: [],           // all branch names
  currentBranch: '',      // HEAD branch
  sourceBranch: '',       // branch being reviewed
  targetBranch: 'main',   // base branch
  files: [],              // parsed diff file objects from API
  comments: {             // persisted to localStorage
    diff: [],             // overall diff-level comments
    files: {              // keyed by file path
      [path]: {
        file: [],         // file-level comments
        inline: []        // line-range comments
      }
    }
  },
  selectionFileIdx: null, // for line selection state
  selectionStart: null,
  selectionEnd: null,
  fileCache: {},          // cached full file contents for expand
};
```

#### Key Functional Areas

| Area | Key functions | What it does |
|------|--------------|-------------|
| **Helpers** | `storageKey()`, `loadComments()`, `saveComments()`, `escapeHtml()`, `langFromPath()`, `api()` | Utilities, localStorage persistence, fetch wrapper |
| **Auto-sizing** | `autoSizeInput()` | Measures text width with a hidden span, sets input width dynamically |
| **Header sync** | `syncHeaderHeight()` | ResizeObserver on header updates `--header-height` CSS var when controls wrap |
| **Init + loading** | `loadRepo()`, `loadDiff()` | Validates path, fetches branches, populates dropdowns, fetches diff, triggers render |
| **File tree** | `renderFileTree()`, `buildTree()`, `updateActiveFile()` | Nested folder structure in sidebar, comment count badges, scroll-to-file, active file tracking |
| **Diff rendering** | `renderDiff()`, `buildFileBox()`, `buildDiffTable()` | Per-file boxes with collapsible body, sticky header, collapse toggle, diff table with syntax highlighting |
| **Sticky scrollbar** | Built inside `buildFileBox()` | Proxy scrollbar pinned to viewport bottom, bidirectionally synced with diff table wrapper |
| **Expand rows** | `buildExpandRow()`, `handleExpand()` | Show hidden context lines between/after hunks, lazy-loaded full file content |
| **Line selection** | `handleLineClick()`, `highlightSelection()` | Click/shift-click line numbers, popover with "+ Comment" button |
| **Comments (3 types)** | `showFileCommentForm()`, `showDiffCommentForm()`, `insertInlineCommentForm()` | Inline (line range), file-level, diff-level — all with edit/delete/collapse |
| **Comment nav** | `updateCommentNav()`, `jumpToComment()`, `getVisibleCommentIndex()` | Fixed widget with prev/next arrows, current/total count, scroll-aware position tracking |
| **Export** | `exportComments()`, `getCommentContext()` | Generates markdown prompt with structured comments and surrounding diff context |
| **Sidebar toggle** | Wired in init | Collapses sidebar to 40px rail |

#### Comment Data Model

Each comment has:
```js
{
  id: string,        // genId() — timestamp + random
  text: string,      // the comment body
  timestamp: number, // Date.now()
  // Inline comments only:
  startOld: number | null,
  startNew: number | null,
  endOld: number | null,
  endNew: number | null,
}
```

Comments are persisted to `localStorage` with key `arbiter:{basePath}:{sourceBranch}:{targetBranch}`. They survive page reloads but not browser data clears.

#### Export Format

The "Copy" and "Save" buttons produce a markdown document structured as an agent prompt:

```markdown
# Code Review: Apply Requested Changes

You are reviewing a diff of `source-branch` compared to `target-branch` in `/path/to/repo`.

Below are review comments left by the reviewer. Follow this process:
1. Read all comments first...
2. Identify duplicates and overarching themes...
3. Resolve broad/architectural comments first...
4. Fix all remaining specific comments...
5. Verify no comment was missed...

---

## Overall Comments
> comment text

## File: `path/to/file.go`

### File-Level Comments
> comment text

### Inline Comments
#### Lines 42–48
```go
  42  + added line
  43    context line
```
**Comment:** comment text

---
```

The export includes diff context around each inline comment (3 lines of surrounding context with +/- prefixes and line numbers).

### Styling (`public/style.css` — ~470 lines)

GitHub-dark color scheme. **Borderless design** — structural borders are removed; components are differentiated by background color layering.

| Element | Background | Notes |
|---------|-----------|-------|
| Page | `--bg` (`#0d1117`) | Darkest layer |
| Sidebar | `#161b22` | Hardcoded, matches `--surface` |
| Header | `#1c2128` | Hardcoded, matches `--surface-raised` |
| Diff file boxes | `--surface` (`#161b22`) | Mid layer |
| File headers, expand rows | `--surface-raised` (`#1c2128`) | Lightest layer |
| Comments | `--comment-bg` (`#1c2128`) | With blue left-accent border |

Key CSS custom properties: `--bg`, `--surface`, `--surface-raised`, `--border` (used only for interactive controls), `--text`, `--text-muted`, `--accent`, `--diff-add-bg`, `--diff-del-bg`, `--comment-border`.

Layout: fixed header (min 52px, grows with wrapping) + fixed sidebar (280px, collapsible to 40px) + scrollable main area. Responsive breakpoints: sidebar hides at 900px, header stacks vertically at 700px.

### HTML Structure (`public/index.html`)

```
header#header
├── .header-left          → logo
├── .header-center        → path input + load button, target select, source select
└── .header-right         → comment/copy/save buttons

aside#sidebar
├── .sidebar-header       → toggle arrow, "Files" label, count badge
└── #file-tree            → nested folder/file tree

main#main-content
├── #diff-comment-area    → diff-level comments
└── #diff-container       → file boxes (or empty state)

#comment-nav              → fixed position, upper right — prev/next/count
#comment-popover          → floating, appears on line selection
```

## Key Design Decisions

1. **No build step.** All JS is vanilla. To add features, edit `public/app.js` directly. No compilation, no HMR, no module imports.

2. **Server-side diff parsing.** The `parseDiff()` function on the server handles all git output parsing. The frontend receives clean structured JSON.

3. **Manual DOM management.** No virtual DOM or reactivity. Comment edits trigger `renderDiff()` (full re-render of the diff area) or targeted re-renders of comment sections. This is fine for the data sizes involved.

4. **`createEl()` is the only DOM builder.** All DOM nodes are created through this helper. It accepts `{ className, textContent, style, on*, ...attributes }` and an optional children array. When modifying UI, use this pattern — don't use `innerHTML` with user content (XSS-safe by design).

5. **Comments are client-side only.** Stored in `localStorage`, keyed by repo+branches. No server-side persistence. The export-to-markdown is the durable output.

6. **`execFileSync` not `exec`.** Git commands use array-based args, preventing shell injection. The `maxBuffer` is 50MB.

7. **Borderless design.** No structural borders on containers. Background color layering (`--bg` → `--surface` → `--surface-raised`) differentiates components. Borders remain only on interactive controls (inputs, buttons) and comment left-accent.

8. **Sticky scrollbar pattern.** Each diff table has a proxy scrollbar div with `position: sticky; bottom: 0` that mirrors the table's scroll width. A `ResizeObserver` keeps the width in sync. Scroll positions are bidirectionally linked. This avoids needing to scroll to the bottom of a long diff to access horizontal scroll.

## Common Modification Patterns

**Adding a new API endpoint:**
1. Add a new `app.get('/api/...')` handler in `server.js`
2. Use the `git(args, cwd)` helper for git commands
3. Call it from `app.js` via `api('/api/...')`

**Adding a new button to the header:**
1. Add `<button>` in `index.html` inside `.header-right` (actions) or `.header-center` (controls)
2. Wire up the event listener in the `DOMContentLoaded` handler in `app.js`

**Adding a new comment type or modifying export format:**
1. Comments live in `state.comments` — extend the structure
2. Update `saveComments()` / `loadComments()` (they JSON-serialize the whole object)
3. Update `exportComments()` to include the new data in the markdown output
4. Call `updateCommentNav()` after any comment mutation to keep the nav widget in sync

**Modifying the diff table rendering:**
1. `buildDiffTable()` is the main function — it loops over hunks and lines
2. Each line is a `<tr>` with three `<td>`s: old line number, new line number, content
3. Inline comments are inserted as additional `<tr>` rows after their anchor line
4. The table is wrapped in `.diff-table-outer > .diff-table-wrapper` + `.diff-sticky-scrollbar`

**Adding collapsible behavior:**
1. Add a toggle element (use `createEl('span', { className: '...-toggle', textContent: '\u25BC' })`)
2. Wrap collapsible content in a container div
3. Add click handler: `container.classList.toggle('collapsed'); toggle.classList.toggle('collapsed');`
4. CSS: `.collapsed { display: none; }` for body, `rotate(-90deg)` for toggle

**Changing the color scheme:**
1. Edit CSS custom properties in `:root` in `style.css`
2. Some colors are hardcoded (header: `#1c2128`, sidebar: `#161b22`, toast: `#238636`) — update those directly

## Gotchas

- **Re-render strategy:** `renderDiff()` nukes and rebuilds the entire diff container. If you add state that lives in the DOM (e.g., collapse toggles on file boxes), it will be lost on any comment save that triggers a re-render. Store such state in the `state` object.
- **Line number types:** Line numbers in data attributes and comment objects are stored as both old and new (`startOld`, `startNew`, `endOld`, `endNew`). For additions, only `new` is populated; for deletions, only `old`. Context lines have both. The export and display logic uses `||` fallbacks (e.g., `c.startOld || c.startNew`).
- **Expand is lazy:** Full file content is fetched on first expand click and cached in `state.fileCache`. The expand buttons do their own DOM insertion without going through `renderDiff()`.
- **No routing.** Single-page, no URL state. Refreshing the page re-fetches everything from scratch (but comments survive via localStorage).
- **highlight.js is loaded globally** from CDN (core + protobuf module). It runs synchronously on each `<code>` element during render. Large diffs with many files may feel slow — this is the bottleneck.
- **Comment nav uses `getBoundingClientRect()`** to find visible comments. This is correct regardless of DOM nesting depth, unlike `offsetTop` which is relative to the offset parent.
- **Sticky scrollbar sync:** The proxy scrollbar width is kept in sync via `ResizeObserver`. If you change how the diff table is structured, make sure the observer target is still the `.diff-table-wrapper`.
- **Hardcoded colors:** Header (`#1c2128`) and sidebar (`#161b22`) backgrounds are hardcoded rather than using CSS variables. Update these directly when changing the theme.
