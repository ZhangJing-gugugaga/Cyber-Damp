---
name: guardian-goal
description: Declare or change the goal Guardian tracks for this session.
disable-model-invocation: true
---
# Guardian goal

Accept `/guardian-goal <goal>`.

- Empty: show the current goal and 'done when' list from `guardian_get_contract`,
  then `Usage: /guardian-goal <goal>`.
- With a goal: call `guardian_update_goal` with it, propose 2–4 'done when' criteria
  derived from the goal, and add the ones the user confirms via `guardian_update_goal`
  (add_criteria). Confirm the record in one line and continue with the work.
