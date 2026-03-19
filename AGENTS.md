# Arbiter — Agent Design Reference

## What It Is

A self-contained, browser-based git diff viewer with GitHub-style inline commenting and real-time agent integration. The primary workflow: a human reviews a branch diff, leaves comments on specific lines or files, then exports all comments as a structured markdown prompt that an AI agent can consume to apply the requested fixes. In "Accept" mode, the agent polls the server for comments and the UI shows live connection status.

## How to Run

```bash
# From the arbiter directory (defaults to git root of CWD)
arbiter

# Or specify a repo path explicitly
arbiter --path /path/to/repo

# Start in agent integration mode (Accept as default export)
arbiter --path /path/to/repo --export accept
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
├── server.js           # Express server — git CLI wrapper + prompt API (~285 lines)
├── package.json        # Only dependency: express
├── .gitignore          # Excludes node_modules
├── public/
│   ├── index.html      # Shell HTML — header, sidebar, main area, comment nav, agent status (~87 lines)
│   ├── app.js          # All frontend logic (~1625 lines)
│   └── style.css       # GitHub-dark theme, borderless design (~710 lines)
├── .claude/
│   └── skills/
│       └── review/     # Claude Code skill for automated review loop
└── node_modules/       # Express + transitive deps
```

## Architecture

### Backend (`server.js` — ~285 lines)

The server is a thin wrapper around `git` CLI commands plus an in-memory prompt store for agent integration. It shells out via `execFileSync` (not `exec` — safe from injection).

| Endpoint | Purpose | Git command |
|----------|---------|-------------|
| `GET /api/validate-path?path=` | Validates a directory is a git repo | `git rev-parse --is-inside-work-tree` |
| `GET /api/branches?path=` | Lists all branches + current branch | `git branch -a`, `git symbolic-ref` |
| `GET /api/diff?path=&source=&target=` | Returns parsed diff between two branches | `git diff --no-color -U5 target...source` |
| `GET /api/file-content?path=&branch=&file=` | Returns full file content at a branch | `git show branch:file` |
| `GET /api/initial-path` | Returns the `--path` CLI arg or git root | — |
| `POST /api/prompts` | Stores an exported prompt (path, source, target, markdown) | — |
| `GET /api/prompts?path=&source=&target=` | Retrieves a stored prompt; updates `lastAccess` timestamp | — |
| `GET /api/prompts?...&readonly=true` | Retrieves prompt without updating `lastAccess` (for UI polling) | — |
| `PATCH /api/prompts?path=&source=&target=` | Updates prompt fields (e.g., `read: true`) | — |
| `GET /api/prompts/status?path=&source=&target=` | Returns `{ lastAccess }` — when the prompt was last polled by an agent | — |

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

**Prompt access tracking:** The `GET /api/prompts` endpoint records `Date.now()` in a `promptAccess` Map each time it's called (unless `readonly=true`). The `/api/prompts/status` endpoint exposes this timestamp so the UI can determine if an agent is actively polling.

### Frontend (`public/app.js` — ~1625 lines)

#### Global State

Single `state` object — no reactivity system, no virtual DOM. State changes trigger manual re-renders of specific DOM sections.

```js
const state = {
  basePath: '',           // repo path on disk
  branches: [],           // all branch names
  currentBranch: '',      // HEAD branch
  sourceBranch: '',       // branch being reviewed
  targetBranch: 'main',   // base branch
  exportMode: 'clipboard', // current export mode: clipboard | file | accept
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
| **Line selection** | `handleLineMouseDown()`, `highlightSelection()` | Click/shift-click/drag on line numbers to select ranges |
| **Comments (3 types)** | `showFileCommentForm()`, `showDiffCommentForm()`, `insertInlineCommentForm()` | Inline (line range), file-level, diff-level — all with edit/delete/collapse |
| **Comment overlays** | Inside `showFileCommentForm()`, `showDiffCommentForm()` | When scrolled away from the comment area, forms appear as fixed overlay dropdowns instead of scrolling the page |
| **Comment nav** | `updateCommentNav()`, `jumpToComment()`, `getVisibleCommentIndex()` | Fixed widget with prev/next arrows, count button with menu (Clear All) |
| **Export** | `exportComments()`, `getCommentContext()`, `pollForRead()` | Generates markdown prompt; in Accept mode, polls for read status and shows toast feedback |
| **Agent status** | `pollStatus()`, `updateAgentWarning()`, `updateAgentVisibility()` | Polls `/api/prompts/status` every 1s; shows connection indicator; ⚠️ on Accept button when disconnected |
| **Toasts** | `showToast()` | Fixed-position notifications with dismiss button; 4s for success, 8s for errors/warnings |
| **Sidebar toggle** | Wired in init | Collapses sidebar to 40px rail; on narrow screens, expands as overlay |

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

The export produces a markdown document structured as an agent prompt with a 7-step process:

```markdown
# Code Review: Apply Requested Changes

You are reviewing a diff of `source-branch` compared to `target-branch` in `/path/to/repo`.

Below are review comments left by the reviewer. Follow this process:
1. Read all comments first...
2. Identify duplicates and overarching themes...
3. Check if any comment has already been addressed...
4. Push back when appropriate...
5. Build a plan and present it to the reviewer...
6. Wait for approval...
7. Execute the approved plan...

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

#### Agent Connection Indicator

When `exportMode` is `'accept'`, a small widget appears in the bottom-right corner showing two dots connected by a line. The UI polls `/api/prompts/status` every second:

- **Green** (`#3fb950`): An agent polled within the last 5 seconds — "A client is listening for changes"
- **Red** (`#da3633`): No agent poll in 5+ seconds — "No client is listening for changes"

When disconnected, a ⚠️ icon with tooltip appears on the Accept button. Both the widget and the warning are hidden when the export mode is Copy or Save.

After clicking Accept, the UI polls `GET /api/prompts?readonly=true` every second for 10 seconds. If the prompt's `read` status changes to `true`, a green toast confirms pickup. Otherwise, a yellow warning toast appears.

### Styling (`public/style.css` — ~710 lines)

GitHub-dark color scheme. **Borderless design** — structural borders are removed; components are differentiated by background color layering.

| Element | Background | Notes |
|---------|-----------|-------|
| Page | `--bg` (`#0d1117`) | Darkest layer |
| Sidebar | `#161b22` | Hardcoded, matches `--surface` |
| Header | `#1c2128` | Hardcoded, matches `--surface-raised` |
| Diff file boxes | `--surface` (`#161b22`) | Mid layer |
| File headers, expand rows | `--surface-raised` (`#1c2128`) | Lightest layer |
| Comments | `--comment-bg` (`#1c2128`) | With blue left-accent border |
| Agent status | `--comment-bg` (`#1c2128`) | Bottom-right, same as comments |

Key CSS custom properties: `--bg`, `--surface`, `--surface-raised`, `--border` (used only for interactive controls), `--text`, `--text-muted`, `--accent`, `--diff-add-bg`, `--diff-del-bg`, `--comment-border`.

Layout: fixed header (min 52px, grows with wrapping) + fixed sidebar (280px, collapsible to 40px, resizable via drag) + scrollable main area. Responsive breakpoints: sidebar collapses to rail at 900px (expandable as overlay), header stacks vertically at 700px.

### HTML Structure (`public/index.html`)

```
header#header
├── .header-left          → logo
├── .header-center        → path input, target select, source select
└── .header-right         → Comment button, split export button (Copy/Save/Accept)

aside#sidebar
├── .sidebar-header       → toggle arrow, "Files" label, count badge
├── #file-tree            → nested folder/file tree
└── #sidebar-resize       → drag handle for sidebar width

main#main-content
├── #diff-comment-area    → diff-level comments
└── #diff-container       → file boxes (or empty state)

#comment-nav              → fixed position, upper right — ▲ [count ⋯] ▼ + Clear All menu

#agent-status             → fixed position, bottom right — connection indicator SVG + tooltip
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

9. **Comment form overlays.** When the user clicks Comment (diff-level or file-level) while scrolled past the target area, the form renders as a fixed overlay below the header instead of scrolling the page. This behaves like a dropdown menu.

10. **Inline comment forms stay in view.** Inline comment forms use `position: sticky; left: 16px` and have their width capped to the `.diff-table-outer` container, so they don't scroll horizontally with wide diffs.

11. **Agent connection awareness.** The `readonly=true` query parameter on `GET /api/prompts` prevents the UI's own status-check polling from being counted as an agent connection, keeping the connection indicator accurate.

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
4. Call `updateCommentNav()` after any comment mutation to keep the nav widget and export button in sync

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
2. Some colors are hardcoded (header: `#1c2128`, sidebar: `#161b22`, toast success: `#238636`, toast error: `#da3633`, toast warning: `#d29922`) — update those directly

**Adding items to the comment nav menu:**
1. Add a `<button class="comment-nav-menu-item">` inside `#comment-nav-menu` in `index.html`
2. Wire up a click listener in the comment nav menu IIFE at the bottom of `app.js`

## Gotchas

- **Re-render strategy:** `renderDiff()` nukes and rebuilds the entire diff container. If you add state that lives in the DOM (e.g., collapse toggles on file boxes), it will be lost on any comment save that triggers a re-render. Store such state in the `state` object.
- **Line number types:** Line numbers in data attributes and comment objects are stored as both old and new (`startOld`, `startNew`, `endOld`, `endNew`). For additions, only `new` is populated; for deletions, only `old`. Context lines have both. The export and display logic uses `||` fallbacks (e.g., `c.startOld || c.startNew`).
- **Expand is lazy:** Full file content is fetched on first expand click and cached in `state.fileCache`. The expand buttons do their own DOM insertion without going through `renderDiff()`.
- **No routing.** Single-page, no URL state beyond query params for initial load. Refreshing the page re-fetches everything from scratch (but comments survive via localStorage).
- **highlight.js is loaded globally** from CDN (core + protobuf module). It runs synchronously on each `<code>` element during render. Large diffs with many files may feel slow — this is the bottleneck.
- **Comment nav uses `getBoundingClientRect()`** to find visible comments. This is correct regardless of DOM nesting depth, unlike `offsetTop` which is relative to the offset parent.
- **Sticky scrollbar sync:** The proxy scrollbar width is kept in sync via `ResizeObserver`. If you change how the diff table is structured, make sure the observer target is still the `.diff-table-wrapper`.
- **Hardcoded colors:** Header (`#1c2128`) and sidebar (`#161b22`) backgrounds are hardcoded rather than using CSS variables. Update these directly when changing the theme.
- **Agent status polling:** The UI polls `/api/prompts/status` every 1 second. The `readonly=true` flag on `GET /api/prompts` is critical — without it, the UI's own `pollForRead()` calls would reset the `lastAccess` timestamp and falsely indicate an agent is connected.
- **Export mode in state:** `state.exportMode` drives visibility of the agent status widget and the ⚠️ warning. Changing modes triggers `updateAgentVisibility()` via the polling loop.
