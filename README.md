# Arbiter

Browser-based git diff reviewer with inline commenting. Review branch diffs GitHub-style, leave comments on specific lines or files, then export all comments as a structured markdown prompt for an AI agent to apply the fixes.

## Installation

```bash
git clone git@github.com:johnhof/arbiter.git ~/.local/share/arbiter
cd ~/.local/share/arbiter && npm install
```

You can clone it anywhere — just set `ARBITER_DIR` accordingly.

### Set `ARBITER_DIR` for Claude Code

The skill needs to know where Arbiter is installed. Add it to your user settings at `~/.claude/settings.json`:

```json
{
  "env": {
    "ARBITER_DIR": "/home/youruser/.local/share/arbiter"
  }
}
```

## Usage

```bash
node server.js --port 3000
```

Opens at `http://localhost:3000` (auto-increments port if taken). Defaults to the git root of the current working directory.

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--path /path/to/repo` | Repository to diff | git root of CWD |
| `--port 3000` | Server port (auto-increments if taken) | `3000` |
| `--export <mode>` | Default export button: `clipboard`, `file`, or `send` | `clipboard` |

### Agent Integration

Use `--export send` to make "Send Prompt" the default action. When the user clicks it, Arbiter prints the review prompt to stdout and exits — making it a blocking interactive step in an agent pipeline:

```bash
# Agent spawns this and blocks until the human finishes reviewing
output=$(node ~/.local/share/arbiter/server.js --path /path/to/repo --export send)
# $output contains the structured review prompt
```

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

## Claude Code Skill

Arbiter ships with a Claude Code skill at `.claude/skills/review/` that automates the review loop: Claude launches Arbiter, waits for comments, then applies the changes.

### Install the skill

Two steps:

**1. Set `ARBITER_DIR`** (if you haven't already — see Installation above)

**2. Register the skill** — either globally or per-project:

Add to `~/.claude/settings.json` (global) or `.claude/settings.json` (project):
```json
{
  "skills": ["~/.local/share/arbiter/.claude/skills"]
}
```

Or symlink into a project's existing skills directory:
```bash
ln -s ~/.local/share/arbiter/.claude/skills/review .claude/skills/arbiter-review
```

### Use the skill

In Claude Code, invoke the skill with `/review` or describe what you want:

```
/review
```
```
review my changes before I merge
```
```
let me review the diff on feature-branch
```

Claude will launch Arbiter, tell you the URL, and wait. Review the diff in your browser, leave comments, click **Send Prompt**, and Claude applies your feedback.

## Architecture

Single-page app with no build step. Express backend wraps git CLI commands; vanilla JS frontend handles rendering and comment management. See [AGENTS.md](AGENTS.md) for the full design reference.
