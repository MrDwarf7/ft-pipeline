/** LLM provider interface + factory. Type-state pattern: check() returns ConnectedLLM. */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** How the provider should request JSON when `jsonSchema` is set. */
export type LLMJsonMode = "json_object" | "schema" | "prompt";

export interface LLMChatOptions {
  messages: LLMMessage[];
  /** Sampling temperature -- caller always supplies (no client default). */
  temperature: number;
  /** Max completion tokens -- caller always supplies (no client default). */
  maxTokens: number;
  /**
   * How to request structured JSON when `jsonSchema` is present. Required on
   * every call so openai-compat never invents a mode.
   */
  jsonMode: LLMJsonMode;
  /** Request structured JSON output. The provider decides HOW via jsonMode. */
  jsonSchema?: Record<string, unknown>;
}

/** A connected, verified LLM ready for inference. */
export interface ConnectedLLM {
  /** Send a chat completion. Returns the assistant text. */
  chat(options: LLMChatOptions): Promise<string>;

  /** Model name (available after check). */
  modelName(): string;

  /** Provider label for logging (e.g. "llama-server", "lm-studio"). */
  label(): string;
}

/** An LLM provider in its initial (unverified) state. */
export interface LLMProvider {
  /** Verify the provider is reachable and a model is loaded. Returns a connected client. */
  check(): Promise<ConnectedLLM>;
}

export { createOpenAICompat } from "./openai-compat.ts";
export {
  assistantTextFromCompletion,
  ChatCompletionSchema,
  modelIdsFromResponse,
  ModelsResponseSchema,
} from "./schema.ts";
