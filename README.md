# Arbiter

Browser-based git diff reviewer with inline commenting and real-time agent integration. Review branch diffs GitHub-style, leave comments on specific lines or files, then export all comments as a structured markdown prompt for an AI agent to apply the fixes.

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

**Read-only polling:** Add `&readonly=true` to `GET /api/prompts` to check the prompt without updating the last-access timestamp. This prevents status-check calls from being confused with an agent consuming the prompt.

**Connection status:** The UI polls `GET /api/prompts/status` to determine when the prompt was last accessed by an agent. A connection indicator in the bottom-right corner shows green (agent connected) or red (no agent). This is only visible when the export mode is set to Accept.

## Features

- **Branch comparison** — select source and target branches from any local git repo
- **Unified diff view** — syntax-highlighted (including protobuf), with expandable hidden context lines
- **Three comment levels** — overall diff, per-file, and inline (line or range selection via click/shift-click/drag)
- **Collapsible UI** — file diff boxes, sidebar, and individual comments all collapse independently
- **Comment navigation** — fixed widget with prev/next jumping, count display, and a Clear All menu
- **Comment persistence** — saved to localStorage, keyed by repo + branch pair
- **Agent prompt export** — copy to clipboard, download as markdown, or accept for agent polling
- **Agent connection indicator** — live status showing whether an agent is polling (Accept mode only)
- **Accept feedback** — after accepting, polls for 10s and toasts when the agent picks up comments (or warns if not)
- **Comment form overlays** — diff-level and file-level comment forms appear as dropdowns when scrolled past their target area
- **Inline comments stay in view** — inline comment forms don't scroll horizontally with wide diffs
- **Generated file detection** — respects `.gitattributes` patterns to collapse generated/binary files
- **Sticky headers** — file headers pin to the top while scrolling; horizontal scrollbar sticks to the bottom
- **Responsive layout** — header wraps and stacks at narrow viewports; sidebar collapses to a rail at 900px and expands as an overlay
- **Sidebar resize** — drag the sidebar edge to resize; width is persisted per repo+branch in localStorage
- **Auto-sizing inputs** — path and branch inputs expand to fit content, shrink when space runs out
- **Keyboard shortcuts** — `⇧⏎` to submit comments, `Esc Esc` to cancel
- **Toast notifications** — dismissible with `×`; 4s for success, 8s for errors and warnings

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

Claude generates an Arbiter link pre-loaded with the right repo and branches, then polls for your review. Open the link, leave comments, click **Accept Prompt**, and Claude picks them up automatically. The connection indicator in the UI will show green when Claude is actively polling.

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/validate-path?path=` | GET | Validates a directory is a git repo |
| `/api/branches?path=` | GET | Lists all branches + current branch |
| `/api/diff?path=&source=&target=` | GET | Returns parsed diff between two branches |
| `/api/file-content?path=&branch=&file=` | GET | Returns full file content at a branch |
| `/api/initial-path` | GET | Returns the `--path` CLI arg or git root |
| `/api/prompts` | POST | Stores an exported prompt |
| `/api/prompts?path=&source=&target=` | GET | Retrieves a stored prompt (updates last-access) |
| `/api/prompts?...&readonly=true` | GET | Retrieves prompt without updating last-access |
| `/api/prompts?path=&source=&target=` | PATCH | Updates prompt fields (e.g., `{ "read": true }`) |
| `/api/prompts/status?path=&source=&target=` | GET | Returns `{ lastAccess }` timestamp |

## Architecture

Single-page app with no build step. Express backend wraps git CLI commands and provides an in-memory prompt store for agent integration. Vanilla JS frontend handles rendering, comment management, and agent connection monitoring. See [AGENTS.md](AGENTS.md) for the full design reference.
