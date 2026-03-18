---
name: review
description: Launch Arbiter for interactive code review. The human reviews a branch diff in the browser, leaves comments, and sends them back. Claude then builds a plan and applies the requested changes after approval. Use when the user says "review", "code review", "diff review", "let me review", "interactive review", or wants to visually inspect changes before giving feedback.
---

# Arbiter Interactive Review

Launch Arbiter so the human can review a branch diff in the browser, leave inline/file/overall comments, and send them back as a structured prompt. Then build a plan and apply the requested changes after approval.

## Prerequisites

Arbiter requires `ARBITER_DIR` to be set. Check:

```bash
[ -f "${ARBITER_DIR}/server.js" ] && echo "OK: $ARBITER_DIR" || echo "ARBITER_DIR not set or invalid — see Arbiter README for installation"
```

If not found, tell the user to:
1. Install Arbiter (see the Arbiter README)
2. Add `ARBITER_DIR` to `~/.claude/settings.json`:
   ```json
   {
     "env": {
       "ARBITER_DIR": "/path/to/arbiter"
     }
   }
   ```
3. Restart Claude Code for the env var to take effect

## Workflow

### 1. Determine the repo and branches

Before launching, identify:
- **Repo path**: The repository to review (default: current working directory's git root)
- **Source branch**: The branch being reviewed (default: current branch)
- **Target branch**: The base branch (default: main)

If the user doesn't specify, use sensible defaults. If the current branch is `main`, ask which branch to review.

### 2. Launch Arbiter

Run Arbiter with `--export send` so the "Send Prompt" button is the default action:

```bash
node "$ARBITER_DIR/server.js" --path /path/to/repo --export send
```

**Important:**
- Arbiter prints the review prompt to **stdout** when the human clicks "Send Prompt", then exits
- The server auto-increments the port if the default (3000) is taken
- Tell the user the URL before launching so they know where to open their browser

### 3. Present the URL and launch

Tell the user:

> Launching Arbiter for review. Open the URL shown in the terminal, review the diff, leave your comments, then click **"Send Prompt"** when done.

Then run the server. The command blocks until the user clicks Send.

### 4. Process the review comments

When Arbiter exits, its stdout contains a structured markdown prompt with all the reviewer's comments. The prompt contains its own instructions — follow them:

1. Read all comments first
2. Identify duplicates and overarching themes — solve with unified changes
3. **Build a plan** listing every comment with your proposed solution and present it to the user
4. **Wait for approval** — the user may modify, reject, or redirect items before you proceed
5. Execute the approved plan, then verify no comment was missed

### 5. After applying changes

After applying all requested changes, offer to re-launch Arbiter for a follow-up review:

> Changes applied. Would you like to review again?

If yes, repeat from step 2.

## Tips

- If the user wants to review a PR, check out the PR branch first, then launch Arbiter with that branch as source
- If Arbiter produces empty output (the user closed the browser without clicking Send), tell the user and offer to relaunch
- The user can also switch to Copy or Save modes from the dropdown in the browser — but Send is the default when launched with `--export send`
