---
name: arbiter
description: Review local diff for agent guidance. Use when the user says "review", "code review", "diff review", "let me review", "interactive review", "open arbiter", "review my changes", or wants to visually inspect local branch changes before giving feedback. Do NOT use for GitHub PR reviews — this is for local diff review only.
---

# Arbiter Interactive Review

Generate a URL that opens Arbiter pre-loaded with the correct repo, source branch, and target branch. Then poll for the reviewer's accepted prompt and process it.

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
http://localhost:7429/?path=<repo-path>&source=<source-branch>&target=<target-branch>&export=accept
```

URL-encode the path and branch names. Present the link to the user:

> **[Open in Arbiter](http://localhost:7429/?path=%2Fpath%2Fto%2Frepo&source=feature-branch&target=main&export=accept)**
>
> Review the diff, leave your comments, then click **Accept Prompt** when done. I'll pick up your comments automatically.

### 3. Poll for the accepted prompt

After presenting the link, poll the Arbiter server for the accepted prompt. Use URL-encoded query params matching the path, source, and target from step 1:

```bash
curl -s "http://localhost:7429/api/prompts?path=<url-encoded-path>&source=<url-encoded-source>&target=<url-encoded-target>"
```

- Poll every 5 seconds
- A `404` means no prompt yet — keep polling
- A `200` with `"read": false` means the reviewer has accepted — proceed
- Mark the prompt as read immediately:
  ```bash
  curl -s -X PATCH "http://localhost:7429/api/prompts?path=<url-encoded-path>&source=<url-encoded-source>&target=<url-encoded-target>" \
    -H "Content-Type: application/json" -d '{"read": true}'
  ```

### 4. Process the prompt

The `markdown` field in the response contains the structured review prompt. Follow its embedded instructions:

1. Read all comments first
2. Identify duplicates and overarching themes — solve with unified changes
3. **Build a plan** listing every comment with your proposed solution and present it to the user
4. **Wait for approval** — the user may modify, reject, or redirect items before you proceed
5. Execute the approved plan, then verify no comment was missed

### 5. If the server isn't running

If polling fails with a connection error, the Arbiter server may not be running. Tell the user:

> The Arbiter server starts automatically with each Claude session. If it's not running, start it manually:
> ```bash
> arbiter &
> ```
> If `arbiter` is not installed, install it globally: `npm install -g .` from the Arbiter repo directory.

### 6. After applying changes

After applying all requested changes, offer to review again:

> Changes applied. Would you like to review again?

If yes, generate a fresh link (the source branch now has your changes) and resume polling.

## Tips

- If the user wants to review a PR, check out the PR branch first, then generate the link with that branch as source
- The link will auto-load the diff — no need to click Load in the browser
- Comments persist in the browser's localStorage across page reloads
- The user can also use Copy or Save modes — but Accept is the preferred flow for agent integration
