# Arbiter — Agent Design Reference

## What It Is

A self-contained, browser-based git diff viewer with GitHub-style inline commenting. The primary workflow: a human reviews a branch diff, leaves comments on specific lines or files, then exports all comments as a structured markdown prompt that an AI agent can consume to apply the requested fixes.

## How to Run

```bash
# From the arbiter directory
node server.js --path /path/to/repo --port 3000

# Or from elsewhere
node /home/ubuntu/athena/.shared/arbiter/server.js --path /home/ubuntu/athena/platform-go
```

Opens at `http://localhost:3000` (auto-increments port if taken).

## Tech Stack

- **Backend:** Node.js + Express (single file: `server.js`)
- **Frontend:** Vanilla JS, no build step, no framework (single file: `public/app.js`)
- **Styling:** Plain CSS with CSS custom properties (single file: `public/style.css`)
- **Syntax highlighting:** highlight.js loaded from CDN
- **Dependencies:** Only `express` (see `package.json`)

No TypeScript, no bundler, no React. Everything is imperative DOM manipulation via a `createEl()` helper.

## File Map

```
.shared/arbiter/
├── server.js           # Express server — git CLI wrapper + static files
├── package.json        # Only dependency: express
├── public/
│   ├── index.html      # Shell HTML — header, sidebar, main area, comment popover
│   ├── app.js          # All frontend logic (~1060 lines)
│   └── style.css       # GitHub-dark theme (~380 lines)
└── node_modules/       # Express + transitive deps
```

## Architecture

### Backend (`server.js` — ~217 lines)

The server is a thin wrapper around `git` CLI commands. It shells out via `execFileSync` (not `exec` — safe from injection). All endpoints are GET with query params.

| Endpoint | Purpose | Git command |
|----------|---------|-------------|
| `GET /api/validate-path?path=` | Validates a directory is a git repo | `git rev-parse --is-inside-work-tree` |
| `GET /api/branches?path=` | Lists all branches + current branch | `git branch -a`, `git symbolic-ref` |
| `GET /api/diff?path=&source=&target=` | Returns parsed diff between two branches | `git diff --no-color -U5 target...source` |
| `GET /api/file-content?path=&branch=&file=` | Returns full file content at a branch | `git show branch:file` |
| `GET /api/initial-path` | Returns the `--path` CLI arg (for pre-populating the UI) | — |

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

### Frontend (`public/app.js` — ~1060 lines)

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

#### Functional Sections (in source order)

| Lines | Section | What it does |
|-------|---------|-------------|
| 1–78 | **Helpers** | `storageKey()`, `loadComments()`, `saveComments()`, `escapeHtml()`, `langFromPath()`, `api()` fetch wrapper |
| 79–98 | **DOM builder** | `createEl(tag, attrs, children)` — the only DOM creation helper. All UI is built with this. |
| 100–173 | **Init + repo loading** | DOMContentLoaded handler, `loadRepo()` (validates path, fetches branches, populates dropdowns), `loadDiff()` (fetches diff, triggers render) |
| 175–270 | **File tree (sidebar)** | `renderFileTree()` builds a nested folder structure from flat paths. `buildTree()` recursively creates folder/file nodes. Files show comment count badges. Clicking scrolls to the file in the diff. `updateActiveFile()` highlights the currently-visible file on scroll. |
| 272–398 | **Diff rendering** | `renderDiff()` iterates files, calls `buildFileBox()` per file. Each file box has: sticky header (path + status badge + Comment button), file-comments area, diff table. `buildDiffTable()` renders hunks with line numbers, syntax-highlighted code, expand buttons between/after hunks, and inline comment blocks at their anchor lines. |
| 400–425 | **Expand rows** | `buildExpandRow()` creates "show hidden lines" buttons. `getHunkEndLines()` calculates where a hunk ends. |
| 426–458 | **Inline comment rendering** | `getInlineCommentsAtLine()` finds comments anchored at a given line. `buildInlineCommentRow()` renders a comment block with edit/delete actions inside the diff table. |
| 460–527 | **Line selection** | Click a line number to select it. Shift+click to extend selection to a range. Selection state tracks start/end rows + file index. A floating popover appears with a "+ Comment" button. |
| 529–611 | **File-level comments** | `showFileCommentForm()` inserts a textarea form in the file's comment area. Saved comments go to `state.comments.files[path].file[]`. |
| 644–704 | **Diff-level comments** | `showDiffCommentForm()` adds a form above the diff container. Saved comments go to `state.comments.diff[]`. |
| 706–818 | **Comment CRUD** | Edit/delete handlers for all three comment types (inline, file, diff). Edit replaces the comment text div with a textarea in-place. All mutations call `saveComments()` then re-render the affected section. |
| 820–925 | **Expand hidden lines** | `handleExpand()` fetches full file content (cached), inserts context lines between hunks or below the last hunk. Loads up to 100 lines at a time with a "show more" button if more remain. |
| 927–1009 | **Export comments** | `exportComments(mode)` generates a markdown document. Supports two modes: `'clipboard'` (copies to clipboard) and `'file'` (downloads as `.md`). |
| 1011–1035 | **Comment context extraction** | `getCommentContext()` pulls diff lines around a comment's line range for inclusion in the export. |
| 1037–1061 | **Toast + popover dismiss** | `showToast()` for feedback messages. Click-outside handler to dismiss the comment popover. |

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

Comments are persisted to `localStorage` with key `diffreviewer:{basePath}:{sourceBranch}:{targetBranch}`. They survive page reloads but not browser data clears.

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

### Styling (`public/style.css` — ~380 lines)

GitHub-dark color scheme using CSS custom properties. Key design tokens:

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#0d1117` | Page background |
| `--surface` | `#161b22` | Cards, sidebar, header |
| `--surface-raised` | `#1c2128` | Elevated elements |
| `--border` | `#30363d` | All borders |
| `--text` | `#e6edf3` | Primary text |
| `--text-muted` | `#8b949e` | Secondary text |
| `--accent` | `#58a6ff` | Links, selections, comment borders |
| `--diff-add-bg` | `#1b2d1f` | Addition line background |
| `--diff-del-bg` | `#3d1117` | Deletion line background |
| `--comment-border` | `#58a6ff` | Left border on comment blocks |

Layout: fixed header (52px) + fixed sidebar (280px) + scrollable main area. Sidebar hides below 900px viewport width. File headers are `position: sticky` within their diff box.

## Key Design Decisions

1. **No build step.** All JS is vanilla. To add features, edit `public/app.js` directly. No compilation, no HMR, no module imports.

2. **Server-side diff parsing.** The `parseDiff()` function on the server handles all git output parsing. The frontend receives clean structured JSON.

3. **Manual DOM management.** No virtual DOM or reactivity. Comment edits trigger `renderDiff()` (full re-render of the diff area) or targeted re-renders of comment sections. This is fine for the data sizes involved.

4. **`createEl()` is the only DOM builder.** All DOM nodes are created through this helper. It accepts `{ className, textContent, style, on*, ...attributes }` and an optional children array. When modifying UI, use this pattern — don't use `innerHTML` with user content (XSS-safe by design).

5. **Comments are client-side only.** Stored in `localStorage`, keyed by repo+branches. No server-side persistence. The export-to-markdown is the durable output.

6. **`execFileSync` not `exec`.** Git commands use array-based args, preventing shell injection. The `maxBuffer` is 50MB.

## Common Modification Patterns

**Adding a new API endpoint:**
1. Add a new `app.get('/api/...')` handler in `server.js`
2. Use the `git(args, cwd)` helper for git commands
3. Call it from `app.js` via `api('/api/...')`

**Adding a new button to the header:**
1. Add `<button>` in `index.html` inside `.header-controls`
2. Wire up the event listener in the `DOMContentLoaded` handler in `app.js`

**Adding a new comment type or modifying export format:**
1. Comments live in `state.comments` — extend the structure
2. Update `saveComments()` / `loadComments()` (they JSON-serialize the whole object)
3. Update `exportComments()` to include the new data in the markdown output

**Modifying the diff table rendering:**
1. `buildDiffTable()` is the main function — it loops over hunks and lines
2. Each line is a `<tr>` with three `<td>`s: old line number, new line number, content
3. Inline comments are inserted as additional `<tr>` rows after their anchor line

**Changing the color scheme:**
1. Edit CSS custom properties in `:root` in `style.css`
2. All colors reference these variables — no hardcoded colors in the JS (except the toast green `#238636`)

## Gotchas

- **Re-render strategy:** `renderDiff()` nukes and rebuilds the entire diff container. If you add state that lives in the DOM (e.g., collapse toggles on file boxes), it will be lost on any comment save that triggers a re-render. Store such state in the `state` object.
- **Line number types:** Line numbers in data attributes and comment objects are stored as both old and new (`startOld`, `startNew`, `endOld`, `endNew`). For additions, only `new` is populated; for deletions, only `old`. Context lines have both. The export and display logic uses `||` fallbacks (e.g., `c.startOld || c.startNew`).
- **Expand is lazy:** Full file content is fetched on first expand click and cached in `state.fileCache`. The expand buttons do their own DOM insertion without going through `renderDiff()`.
- **No routing.** Single-page, no URL state. Refreshing the page re-fetches everything from scratch (but comments survive via localStorage).
- **highlight.js is loaded globally** from CDN. It runs synchronously on each `<code>` element during render. Large diffs with many files may feel slow — this is the bottleneck.
