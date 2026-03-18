# Arbiter

Browser-based git diff reviewer with inline commenting. Review branch diffs GitHub-style, leave comments on specific lines or files, then export all comments as a structured markdown prompt for an AI agent to apply the fixes.

## Usage

```bash
npm install
node server.js --port 3000
```

Opens at `http://localhost:3000` (auto-increments port if taken). Defaults to the git root of the current working directory. Use `--path /path/to/repo` to override.

## Features

- **Branch comparison** — select source and target branches from any local git repo
- **Unified diff view** — syntax-highlighted (including protobuf), with expandable hidden context lines
- **Three comment levels** — overall diff, per-file, and inline (line or range selection via click/shift-click)
- **Collapsible UI** — file diff boxes, sidebar, and individual comments all collapse independently
- **Comment navigation** — fixed widget shows current/total comment count with prev/next jumping, tracks scroll position
- **Comment persistence** — saved to localStorage, keyed by repo + branch pair
- **Agent prompt export** — copy to clipboard or download as markdown, formatted as actionable instructions with surrounding code context
- **Generated file detection** — respects `.gitattributes` patterns to collapse generated/binary files
- **Sticky headers** — file headers pin to the top while scrolling; horizontal scrollbar sticks to the bottom
- **Responsive layout** — header wraps and stacks at narrow viewports, sidebar hides below 900px
- **Auto-sizing inputs** — path and branch inputs expand to fit content, shrink when space runs out

## Architecture

Single-page app with no build step. Express backend wraps git CLI commands; vanilla JS frontend handles rendering and comment management. See [AGENTS.md](AGENTS.md) for the full design reference.
