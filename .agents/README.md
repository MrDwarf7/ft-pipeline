# Agent skills packaging

Canonical skill content lives in **`.master/`**. Per-agent dirs under `.agents/` are mostly symlinks
so we edit once.

```
.agents/
  .master/skills/<name>/SKILL.md   # source of truth
  skills/                          # -> .master/skills  (agentskills / multi-tool)
  grok|claude|hermes|codex|cursor|gemini|opencode/
    skills/                        # -> ../.master/skills
```

Repo-root discovery shims (tools that only scan their own tree at the project root):

| Path      | Points at        |
| --------- | ---------------- |
| `.claude` | `.agents/claude` |
| `.grok`   | `.agents/grok`   |

So `.claude/skills/...` and `.grok/skills/...` still resolve to master.

## Edit a skill

Change the file under `.agents/.master/skills/<name>/`. Everything else follows.

## Agent-specific override later

If one tool needs different text, replace that agent's `skills` symlink (or a single skill under it)
with a real directory and leave the rest linked to `.master`.

## Install / discover

- **Grok**: `.grok/skills` (shim) and/or `.agents/skills` / `.agents/grok/skills`
- **Claude Code**: `.claude/skills` (shim -> `.agents/claude/skills`)
- **Codex / agentskills-style**: `.agents/skills`
- **Hermes / others**: copy or symlink from `.agents/<agent>/skills` if the tool does not scan the
  repo automatically
