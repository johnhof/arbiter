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
- **Target branch**: The base branch (default: `arbiter/main` — see step 2)

If the user doesn't specify, use sensible defaults. If the current branch is `main`, ask which branch to review.

### 2. Prepare the arbiter target branch

Before generating the review link, create a fresh `arbiter/<primary>` branch hard-reset to the remote primary branch. This gives a guaranteed up-to-date comparison target without touching the user's local `main`.

Determine the primary branch name (default: `main`; use whatever the user specified as target). Then run:

```bash
git fetch origin <primary> && \
git branch -f arbiter/<primary> origin/<primary>
```

- `git branch -f` creates the branch if it doesn't exist, or force-updates it to `origin/<primary>` if it does — no checkout required, no risk to local `main`.
- Use `arbiter/<primary>` (e.g. `arbiter/main`) as the **target branch** in the URL from this point forward.
- If the fetch fails (no remote), fall back to using the local `<primary>` branch and warn:

  > **⚠ WARNING: Could not fetch `origin/<primary>`. Falling back to local `<primary>` which may be stale.**

Then, attempt to merge `arbiter/<primary>` into the current source branch to check for conflicts:

```bash
git merge arbiter/<primary> --no-edit
```

- If the merge succeeds cleanly, proceed normally to step 3.
- If the merge results in conflicts, abort it immediately:
  ```bash
  git merge --abort
  ```
  Then continue to step 3, but prepend the following warning before presenting the link:

  > **⚠ WARNING: Merge conflicts detected. This branch has conflicts with `<primary>` that must be resolved before a clean diff can be viewed. The link below may show an incomplete or misleading diff.**

### 3. Build and present the link

Construct the URL with query parameters, using `arbiter/<primary>` as the target:

```
http://localhost:7429/?path=<repo-path>&source=<source-branch>&target=arbiter/<primary>&export=accept
```

URL-encode the path and branch names. Present the link to the user:

> **[Open in Arbiter](http://localhost:7429/?path=%2Fpath%2Fto%2Frepo&source=feature-branch&target=arbiter%2Fmain&export=accept)**
>
> Review the diff, leave your comments, then click **Accept Prompt** when done. I'll pick up your comments automatically.

### 4. Poll for the accepted prompt

After presenting the link, poll the Arbiter server using a **single bash command** that shows live status updates. Replace the placeholder variables with URL-encoded values from step 1.

Poll `/api/prompts` with query params `path`, `source`, and `target` — **do NOT include `readonly=true`**, as the server uses each request to update the `lastAccess` timestamp that the UI uses to show the agent is connected. The response will be `{"error":"No prompt found"}` (404) until the user submits; once submitted it returns `{"markdown":"...","read":false}`. Loop until `"read":false` appears in the response.

```bash
BASE="http://localhost:7429/api/prompts?path=<url-encoded-path>&source=<url-encoded-source>&target=<url-encoded-target>"; while true; do RESP=$(curl -s -w "\n%{http_code}" "$BASE"); CODE=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d'); if [ "$CODE" = "200" ]; then READ=$(echo "$BODY" | grep -o '"read":[a-z]*' | cut -d: -f2); if [ "$READ" = "false" ]; then printf "\rChecking for prompt... Retrieved!\n"; echo "$BODY"; break; else printf "\rChecking for prompt... None (read=true)"; fi; else printf "\rChecking for prompt... None            "; fi; sleep 1; done
```

- The loop prints `Checking for prompt... None` on each poll, overwriting the same line with `\r`
- When a prompt with `"read": false` is found, it prints `Retrieved!` and outputs the response body
- After retrieval, mark the prompt as read immediately:
  ```bash
  curl -s -X PATCH "http://localhost:7429/api/prompts?path=<url-encoded-path>&source=<url-encoded-source>&target=<url-encoded-target>" \
    -H "Content-Type: application/json" -d '{"read": true}'
  ```

### 5. Process the prompt

The `markdown` field in the response contains the structured review prompt. Follow its embedded instructions:

1. Read all comments first
2. Identify duplicates and overarching themes — solve with unified changes
3. **Build a plan** listing every comment with your proposed solution and present it to the user
4. **Wait for approval** — the user may modify, reject, or redirect items before you proceed
5. Execute the approved plan, then verify no comment was missed

### 6. If the server isn't running

If polling fails with a connection error, the Arbiter server may not be running. Tell the user:

> The Arbiter server starts automatically with each Claude session. If it's not running, start it manually:
> ```bash
> arbiter &
> ```
> If `arbiter` is not installed, install it globally: `npm install -g @johnhof/arbiter`

### 7. After applying changes

After applying all requested changes, offer to review again:

> Changes applied. Would you like to review again?

If yes, generate a fresh link (the source branch now has your changes) and resume polling.

## Tips

- If the user wants to review a PR, check out the PR branch first, then generate the link with that branch as source
- The link will auto-load the diff — no need to click Load in the browser
- Comments persist in the browser's localStorage across page reloads
- The user can also use Copy or Save modes — but Accept is the preferred flow for agent integration
