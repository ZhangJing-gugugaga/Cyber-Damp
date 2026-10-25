---
name: guardian
description: See the session goal, progress, and any drift — and steer from chat.
disable-model-invocation: true
---
# Guardian

Accept `/guardian [question]`.

1. Call the `goal-guardian` MCP tools `guardian_get_status` and `guardian_get_contract`.
2. With no question: present a short, readable briefing — the goal, the active task,
   what's done and what's left, and any drift with its review status. Plain prose,
   no JSON, no field names.
3. With a question ('why did we drift?', 'what's left?'): answer it from the tape.
4. End by offering the useful next moves: mark the task done, switch task, update
   the goal, or review drift with AI. Execute whichever the user picks via the
   guardian tools (guardian_record_progress / guardian_update_goal).
