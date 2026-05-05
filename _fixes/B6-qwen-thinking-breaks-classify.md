# B6: Qwen3.5-9B thinking breaks classify — disable reasoning

**Priority:** P1 — Critical (all classify calls fail)

**Date discovered:** 2026-04-27

## Problem

All 14 `classify` calls fail with `"No JSON in response"` errors. The model outputs
thinking/reasoning content that fills all tokens and never generates the JSON response.

Error pattern:

```
classify failed {tweet_id:"...","error":"No JSON in response: Thinking Process:\n\n1. **Analyze..."}
```

## Root cause

The llama-server was started with `--reasoning on --reasoning-budget -1`. The Qwen3.5-9B model
generates verbose thinking blocks that consume all `max_tokens` (500) before the actual JSON can be
generated. The `reasoning_content` field in the API response contains all the thinking text with no
JSON anywhere in the output.

The `disable_thinking: true` API parameter does NOT work — llama-server ignores it when the model
was loaded with `--reasoning on` server-side.

The `response_format: { type: "json_object" }` also doesn't prevent thinking output.

## Fix

Restart llama-server with `--reasoning off`.

Option A — via llama_me registry:

```python
config = registry.get("Qwen3.5-9B-uncensored@q4_k_m:FULLCTX")
config.reasoning_enabled = False
config.tools = []
config.run()
```

Option B — restart llama-server.real directly:

```bash
# Kill current server
ps aux | grep llama-server | grep -v grep
kill <pid>

# Restart with --reasoning off
LD_LIBRARY_PATH=/opt/llama-cpp/lib /opt/llama-cpp/bin/llama-server.real \
  --port 1234 \
  -m /mnt/linux_data/lmstudio_models/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf \
  -c 262144 -b 16384 -t 6 -ngl all --split-mode none --flash-attn on --reasoning off
```

## Verification

After restart:

```bash
curl -s http://localhost:1234/v1/chat/completions -X POST -H 'Content-Type: application/json' \
  -d '{"model":"Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf","messages":[{"role":"user","content":"Return JSON with answer with value test"}],"max_tokens":100,"response_format":{"type":"json_object"}}'
```

Expected: `{"choices":[{"finish_reason":"stop","message":{"content":"{\"answer\":\"test\"}"}}...]}`

If `finish_reason` is `length` or content starts with "Thinking Process", reasoning is still on.

## Also applied: disable_thinking in LLM client

Fixed `src/llm/openai-compat.ts` to add `disable_thinking: true` to the request body when
`json_schema` is set. This was a reasonable attempt but doesn't work with the current llama-server —
kept as belt-and-suspenders in case future llama-server versions honor it.

## Status

**FIXED** — restarted llama-server with `--reasoning off`, classify now succeeds 14/14.
