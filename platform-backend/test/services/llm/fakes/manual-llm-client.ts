import type { LlmChatRequest, LlmClient, LlmReply, LlmToolCall } from '../../../../src/services/llm/interfaces.ts';

/**
 * The tests' `LlmClient`: answers from the replies the test queued, in order,
 * and keeps every request it was sent, so a test reads exactly what the loop
 * told the model. A reply's text is streamed as one delta before the reply
 * resolves; a signal aborted by then resolves with the text alone, as the real
 * client resolves with what had arrived. `failWith` makes the next call reject,
 * as a model server failure would.
 */
export class ManualLlmClient implements LlmClient {
    /** Every request, in order, each with its own copy of the message list (the loop's list keeps growing). */
    readonly requests: LlmChatRequest[] = [];
    private readonly replies: LlmReply[] = [];
    private failure: Error | undefined = undefined;

    queueReply(reply: LlmReply): void {
        this.replies.push(reply);
    }

    queueTextReply(text: string, promptTokens: number = 0): void {
        this.replies.push({ content: text, toolCalls: [], promptTokens: promptTokens, generatedTokens: 0 });
    }

    queueToolCallReply(toolCalls: LlmToolCall[], promptTokens: number = 0): void {
        this.replies.push({ content: '', toolCalls: toolCalls, promptTokens: promptTokens, generatedTokens: 0 });
    }

    /** Makes the next call reject with `failure`; later calls answer from the queue again. */
    failWith(failure: Error): void {
        this.failure = failure;
    }

    async streamChat(request: LlmChatRequest, onDelta: (textDelta: string) => void, signal: AbortSignal): Promise<LlmReply> {
        this.requests.push({ messages: request.messages.slice(), tools: request.tools.slice() });
        if (this.failure !== undefined) {
            const failure: Error = this.failure;
            this.failure = undefined;
            throw failure;
        }
        const reply: LlmReply | undefined = this.replies.shift();
        if (reply === undefined) {
            throw new Error(`ManualLlmClient: no reply queued for model call #${this.requests.length}`);
        }
        if (reply.content !== '') {
            onDelta(reply.content);
        }
        if (signal.aborted) {
            return { content: reply.content, toolCalls: [], promptTokens: reply.promptTokens, generatedTokens: reply.generatedTokens };
        }
        return reply;
    }
}
