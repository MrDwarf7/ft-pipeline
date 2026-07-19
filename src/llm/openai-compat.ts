/** OpenAI-compatible LLM client (llama-server / LM Studio). */
import { CONFIG } from "../config.ts";
import { fetchWithRetry, type RetryPolicy } from "../utils/http.ts";
import { type ConnectedLLM, type LLMChatOptions, type LLMProvider } from "./index.ts";
import { assistantTextFromCompletion, modelIdsFromResponse } from "./schema.ts";

interface OpenAICompatConfig {
  baseUrl: string;
  model?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Retry policy from CONFIG -- every RetryPolicy field set explicitly here. */
const buildLlmRetryPolicy = (): RetryPolicy => ({
  maxAttempts: CONFIG.maxExternalCallAttempts,
  baseDelayMs: CONFIG.retryBaseMs,
  jitter: true,
  retryOn: [500, 502, 503],
  fetch: globalThis.fetch.bind(globalThis),
  sleep,
});

const applyJsonMode = (
  body: Record<string, unknown>,
  options: LLMChatOptions,
): void => {
  if (options.jsonSchema === undefined) return;

  switch (options.jsonMode) {
    case "json_object":
      body.response_format = { type: "json_object" };
      break;
    case "schema":
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "response", schema: options.jsonSchema },
      };
      break;
    case "prompt":
      break;
  }
};

export const createOpenAICompat = (config: OpenAICompatConfig): LLMProvider => {
  const { baseUrl, model: configuredModel } = config;
  const policy = buildLlmRetryPolicy();

  return {
    async check(): Promise<ConnectedLLM> {
      const modelsResp = await fetchWithRetry(
        { input: `${baseUrl}/models`, init: undefined },
        policy,
      );
      if (!modelsResp.ok) {
        throw new Error(`HTTP ${modelsResp.status}`);
      }

      const modelsJson: unknown = await modelsResp.json();
      const modelIds = modelIdsFromResponse(modelsJson);
      const firstId = modelIds[0];
      if (firstId === undefined) {
        throw new Error("no models loaded");
      }
      const resolvedModel = configuredModel ?? firstId;

      const connected: ConnectedLLM = {
        async chat(options: LLMChatOptions): Promise<string> {
          const body: Record<string, unknown> = {
            model: resolvedModel,
            messages: options.messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
          };
          applyJsonMode(body, options);

          const resp = await fetchWithRetry(
            {
              input: `${baseUrl}/chat/completions`,
              init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            },
            policy,
          );

          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            throw new Error(
              `LLM API error: ${resp.status} ${errText.slice(0, 200)}`,
            );
          }

          const data: unknown = await resp.json();
          return assistantTextFromCompletion(data);
        },

        modelName() {
          return resolvedModel;
        },

        label() {
          return `openai-compat (${baseUrl})`;
        },
      };

      /* Short probe: prove inference works before a full classify batch. */
      await connected.chat({
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        temperature: 0,
        maxTokens: 8,
        jsonMode: "prompt",
      });

      return connected;
    },
  };
};
