# Feature: Classify (Simplify to 3 LLM Endpoints)

## What We Want (Your Requirements)

- **Only 3 LLM endpoints** (not ft-cli's complex engine system):
  1. **OpenAI API** (GPT-4o, etc.)
  2. **Anthropic API** (Claude)
  3. **One more** — you said "I think there's one more and that's it lol"
     - _Need clarification: Ollama? Local llama-server? LM Studio?_
- Local LLM via llama-server (already works, OpenAI-compatible)
- Use our own `primary_type`/`primary_domain` columns (fix B2/B3)
- No complex engine detection/resolution like ft-cli

## Current State

- ft-pipeline: Uses local llama-server at `localhost:1234` (OpenAI-compatible)
- ft-cli: Has complex `engine.ts` with `detectAvailableEngines()`, `resolveEngine()`, etc.
- We don't need that complexity

## Simplified Plan

1. **Config** (`config.ts`):

```typescript
export const LLM_ENDPOINTS = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  },
  anthropic: {
    baseURL: "https://api.anthropic.com/v1",
    apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
  },
  local: {
    baseURL: "http://localhost:1234/v1", // llama-server
    apiKey: "local", // or from env
  },
};
```

1. **CLI**: Just pass `--endpoint openai|anthropic|local` (not complex engine names)
   - Add to `types.ts` Command.Classify
   - Default: `local` (llama-server)

2. **Fix B2/B3 first**:
   - Write to our `primary_type`/`primary_domain` columns
   - Add system prompt for classification
   - Use `clippings_text` when available

3. **No regex fallback needed?** (you didn't mention it — ft-cli has `ft classify --regex`)

## Conventions

- Hard-code the 3 endpoints (1-2 params max)
- Use existing `llm/` module (just simplify it)
- Builder: `build()` returns self, `run()` runs it
