---
name: review
description: Generate an Arbiter link for interactive code review. The human opens the link in their browser, reviews the diff, leaves comments, and exports them. Use when the user says "review", "code review", "diff review", "let me review", "interactive review", or wants to visually inspect changes before giving feedback.
---

# Arbiter Interactive Review

Generate a URL that opens Arbiter pre-loaded with the correct repo, source branch, and target branch. The Arbiter server runs automatically via a SessionStart hook — no need to launch it.

## Workflow

### 1. Determine the repo and branches

Identify:
- **Repo path**: The repository to review (default: current working directory's git root via `git rev-parse --show-toplevel`)
- **Source branch**: The branch being reviewed (default: current branch via `git symbolic-ref --short HEAD`)
- **Target branch**: The base branch (default: `main`)

If the user doesn't specify, use sensible defaults. If the current branch is `main`, ask which branch to review.

### 2. Build and present the link

Construct the URL with query parameters:

```
http://localhost:7429/?path=<repo-path>&source=<source-branch>&target=<target-branch>
```

URL-encode the path and branch names. Present the link to the user:

> **[Open in Arbiter](http://localhost:7429/?path=%2Fpath%2Fto%2Frepo&source=feature-branch&target=main)**
>
> Review the diff, leave your comments, then export them with **Copy Prompt** or **Save Prompt**.

### 3. If the server isn't running

If the user reports the link doesn't work, the Arbiter server may not be running. Tell them:

> The Arbiter server starts automatically with each Claude session. If it's not running, start it manually:
> ```bash
> node /path/to/athena/.shared/diff-reviewer/server.js --port 3000 &
> ```

### 4. Process exported comments (if provided)

If the user pastes back an exported prompt with review comments:

1. Read all comments first
2. Identify duplicates and overarching themes — solve with unified changes
3. **Build a plan** listing every comment with your proposed solution and present it to the user
4. **Wait for approval** — the user may modify, reject, or redirect items before you proceed
5. Execute the approved plan, then verify no comment was missed

### 5. After applying changes

After applying all requested changes, offer to review again:

> Changes applied. Would you like to review again?

If yes, generate a fresh link (the source branch now has your changes).

## Tips

- If the user wants to review a PR, check out the PR branch first, then generate the link with that branch as source
- The link will auto-load the diff — no need to click Load in the browser
- Comments persist in the browser's localStorage across page reloads
