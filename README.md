# Arbiter

Browser-based git diff reviewer with inline commenting. Review branch diffs GitHub-style, leave comments on specific lines or files, then export all comments as a structured markdown prompt for an AI agent to apply the fixes.

## Installation

```bash
git clone git@github.com:johnhof/arbiter.git
cd arbiter && npm install -g .
```

This installs `arbiter` as a global command. You can verify with `arbiter --help` or `which arbiter`.

## Usage

```bash
arbiter
```

Opens at `http://localhost:7429` (auto-increments if taken). Defaults to the git root of the current working directory.

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--path /path/to/repo` | Repository to diff | git root of CWD |
| `--port <number>` | Server port (auto-increments if taken) | `7429` |
| `--export <mode>` | Default export button: `clipboard`, `file`, or `accept` | `clipboard` |

### Agent Integration

Use `--export accept` to make "Accept Prompt" the default action. When the user clicks it, the prompt is stored on the server in memory, keyed by repo path + source + target branch. An agent can poll for it:

```bash
# Poll for an accepted prompt
curl -s "http://localhost:7429/api/prompts?path=/path/to/repo&source=feature&target=main"
# Mark as read after consuming
curl -s -X PATCH "http://localhost:7429/api/prompts?path=/path/to/repo&source=feature&target=main" \
  -H "Content-Type: application/json" -d '{"read": true}'
```

## Features

- **Branch comparison** — select source and target branches from any local git repo
- **Unified diff view** — syntax-highlighted (including protobuf), with expandable hidden context lines
- **Three comment levels** — overall diff, per-file, and inline (line or range selection via click/shift-click)
- **Collapsible UI** — file diff boxes, sidebar, and individual comments all collapse independently
- **Comment navigation** — fixed widget shows current/total comment count with prev/next jumping, tracks scroll position
- **Comment persistence** — saved to localStorage, keyed by repo + branch pair
- **Agent prompt export** — copy to clipboard, download as markdown, or accept for agent polling
- **Generated file detection** — respects `.gitattributes` patterns to collapse generated/binary files
- **Sticky headers** — file headers pin to the top while scrolling; horizontal scrollbar sticks to the bottom
- **Responsive layout** — header wraps and stacks at narrow viewports, sidebar hides below 900px
- **Auto-sizing inputs** — path and branch inputs expand to fit content, shrink when space runs out

## Claude Code Skill

Arbiter ships with a Claude Code skill at `.claude/skills/review/` that automates the review loop: Claude generates an Arbiter link, the user reviews and leaves comments, then clicks Accept. Claude polls for the prompt and applies the changes.

### Install the skill

**Option 1: Register the skill directory** in your Claude Code settings (`~/.claude/settings.json` for global, or `.claude/settings.json` for per-project):

```json
{
  "skills": ["<path-to-arbiter>/.claude/skills"]
}
```

**Option 2: Symlink** into a project's existing skills directory:

```bash
ln -s <path-to-arbiter>/.claude/skills/review .claude/skills/arbiter-review
```

**Option 3: Copy** the skill into your project:

```bash
cp -r <path-to-arbiter>/.claude/skills/review .claude/skills/arbiter-review
```

Find your install path with `npm ls -g arbiter` or `which arbiter`.

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

Claude generates an Arbiter link pre-loaded with the right repo and branches, then polls for your review. Open the link, leave comments, click **Accept Prompt**, and Claude picks them up automatically.

## Architecture

Single-page app with no build step. Express backend wraps git CLI commands; vanilla JS frontend handles rendering and comment management. See [AGENTS.md](AGENTS.md) for the full design reference.
