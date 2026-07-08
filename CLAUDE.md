## File changes

- When making file changes, always use the `git-kura` skill unless the user explicitly instructs otherwise.
- Follow the workflow defined by the `git-kura` skill. Do not duplicate or reinterpret that workflow in this file.
- After completing file edits, always use the `subagent-review-loop` skill to review and revise the changes before reporting completion, unless the user explicitly instructs otherwise.
- If `packages/core/test/e2e` or `pakages/core/test/snapshots/*` are changed, always ask the `shell-script-reviewer` agent to review the changed snapshot diff before reporting completion.
  - Do not treat snapshot updates as ready until the `shell-script-reviewer` review has completed.
