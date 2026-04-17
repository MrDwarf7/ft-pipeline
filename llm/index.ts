// llm/index.ts -- LLM provider interface + factory
//
// State model:
//   LLMProvider  ──check()──▶  ConnectedLLM
//                                  ├── chat()
//                                  ├── modelName()
//                                  └── label()
//
// You cannot call chat() without going through check() first.
// The type system enforces this.

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Request structured JSON output. The provider decides HOW to enforce this. */
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
