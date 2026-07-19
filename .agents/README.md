# Agent skills packaging

Canonical skill content lives in **`.master/`**. Agent folders and tool-native paths are mostly
symlinks so we edit once.

```
.agents/
  .master/skills/<name>/SKILL.md   # source of truth
  skills/                          # -> .master/skills  (agentskills / multi-tool)
  grok|claude|hermes|codex|cursor|gemini|opencode/
    skills/                        # -> ../.master/skills
```

Repo-root shims for tools that only scan their own tree:

| Path             | Points at                |
| ---------------- | ------------------------ |
| `.grok/skills`   | `.agents/.master/skills` |
| `.claude/skills` | `.agents/.master/skills` |

## Edit a skill

Change the file under `.agents/.master/skills/<name>/`. Everything else follows.

## Agent-specific override later

If one tool needs different text, replace that agent's symlink for the skill with a real directory
(or a fork of the skill) and leave the rest linked to `.master`.

## Install / discover

- **Grok**: project skills via `.grok/skills` and/or `.agents/skills` (both hit master)
- **Claude Code**: `.claude/skills`
- **Codex / agentskills-style**: `.agents/skills`
- **Hermes / others**: copy or symlink from `.agents/<agent>/skills` into that tool's skills home if
  it does not scan the repo automatically
