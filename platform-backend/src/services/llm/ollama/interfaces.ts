/** Public types for the Ollama provider. Ollama's wire shapes are not here — they stay in `ollama-chat-mapper.ts`. */

export interface OllamaLlmClientOptions {
    /** Where Ollama listens, e.g. "http://127.0.0.1:11434". */
    baseUrl: string;
    /** Model tag exactly as `ollama pull` took it, e.g. "qwen3:4b-instruct-2507-q4_K_M". */
    model: string;
    /**
     * Context window to load the model with, in tokens (Ollama's `num_ctx`).
     * Always sent explicitly: Ollama's default is small, and a prompt that does
     * not fit is truncated silently rather than refused.
     */
    contextTokens: number;
    /**
     * Whether the model reasons before it answers (Ollama's top-level `think`).
     * Sent only when set; absent, Ollama applies the model's own default (on,
     * for one that can think). `false` switches it off on a hybrid model such
     * as qwen3.5; a thinking-only model ignores it, and Ollama refuses `true`
     * for a model without the thinking capability.
     */
    think?: boolean;
}
