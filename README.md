# Arbiter

Browser-based git diff reviewer with inline commenting. Review branch diffs GitHub-style, leave comments on specific lines or files, then export all comments as a structured markdown prompt for an AI agent to apply the fixes.

## Usage

```bash
npm install
node server.js --path /path/to/repo --port 3000
```

Opens at `http://localhost:3000` (auto-increments port if taken). The `--path` flag pre-populates the repo path in the UI.

## Features

- **Branch comparison** — select source and target branches from any local git repo
- **Unified diff view** — syntax-highlighted, with expandable hidden context lines
- **Three comment levels** — overall diff, per-file, and inline (line or range selection via click/shift-click)
- **Comment persistence** — saved to localStorage, keyed by repo + branch pair
- **Agent prompt export** — copy to clipboard or download as markdown, formatted as actionable instructions with surrounding code context
- **Generated file detection** — respects `.gitattributes` patterns to collapse generated/binary files

## Architecture

Single-page app with no build step. Express backend wraps git CLI commands; vanilla JS frontend handles rendering and comment management. See [AGENTS.md](AGENTS.md) for the full design reference.
