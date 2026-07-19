/** Zod schemas for OpenAI-compatible /models and /chat/completions responses. */
import { z } from "zod";

const ModelEntrySchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

/**
 * OpenAI-compat models list. Servers may put entries under `data` (OpenAI) or
 * `models` (some local frontends). At least one non-empty list is required.
 */
export const ModelsResponseSchema = z
  .object({
    data: z.array(ModelEntrySchema).optional(),
    models: z.array(ModelEntrySchema).optional(),
  })
  .passthrough();

/** Resolve model ids from a validated /models body. Throws when none are loaded. */
export const modelIdsFromResponse = (raw: unknown): readonly string[] => {
  const parsed = ModelsResponseSchema.parse(raw);
  const list = parsed.data ?? parsed.models ?? [];
  if (list.length === 0) {
    throw new Error("no models loaded");
  }
  return list.map((m) => m.id);
};

const ChatMessageSchema = z
  .object({
    content: z.string().nullable().optional(),
    reasoning_content: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Minimal chat completion envelope. We only need choices[0].message text
 * fields; extra provider fields are ignored via passthrough.
 */
export const ChatCompletionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: ChatMessageSchema,
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

/**
 * Extract assistant text from a validated chat completion body.
 * Prefers `content`, then `reasoning_content`. Empty assistant text throws so
 * classify's per-item catch can mark the row failed instead of parsing "".
 */
export const assistantTextFromCompletion = (raw: unknown): string => {
  const parsed = ChatCompletionSchema.parse(raw);
  const first = parsed.choices[0];
  if (first === undefined) {
    throw new Error("LLM chat completion: no choices");
  }
  const msg = first.message;
  const content = typeof msg.content === "string" ? msg.content : "";
  const reasoning = typeof msg.reasoning_content === "string" ? msg.reasoning_content : "";
  const text = content || reasoning;
  if (text.length === 0) {
    throw new Error("LLM chat completion: empty assistant content");
  }
  return text;
};
