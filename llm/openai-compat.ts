// llm/openai-compat.ts -- OpenAI-compatible provider (llama-server, LM Studio, etc.)

import { type ConnectedLLM, type LLMChatOptions, type LLMProvider } from "./index.ts";

interface OpenAICompatConfig {
  baseUrl: string;
  model: string;
  /** How to request structured JSON output. Defaults to "json_object". */
  jsonMode?: "json_object" | "schema" | "prompt";
}

export const createOpenAICompat = (config: OpenAICompatConfig): LLMProvider => {
  const { baseUrl, model: _model } = config;
  const jsonMode = config.jsonMode ?? "json_object";

  return {
    async check(): Promise<ConnectedLLM> {
      const resp = await fetch(`${baseUrl}/models`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const models = data.data ?? data.models ?? [];
      if (models.length === 0) throw new Error("no models loaded");

      const resolvedModel = models[0].id;

      const connected: ConnectedLLM = {
        async chat(options: LLMChatOptions): Promise<string> {
          const body: Record<string, unknown> = {
            model: resolvedModel,
            messages: options.messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 200,
          };

          if (options.jsonSchema) {
            switch (jsonMode) {
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
                // Schema is already in the prompt — no special field needed
                break;
            }
          }

          const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            throw new Error(`LLM API error: ${resp.status} ${errText.slice(0, 200)}`);
          }

          const data = await resp.json();
          const msg = data.choices?.[0]?.message;
          return msg?.content || msg?.reasoning_content || "";
        },

        modelName() {
          return resolvedModel;
        },

        label() {
          return `openai-compat (${baseUrl})`;
        },
      };

      return connected;
    },
  };
};
