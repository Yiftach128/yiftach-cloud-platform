import type { TestContext } from 'node:test';

import type { LlmChatRequest, LlmReply } from '../../../../../src/services/llm/interfaces.ts';
import { OllamaLlmClient } from '../../../../../src/services/llm/ollama/ollama-llm-client.ts';
import { StandInOllamaServer } from '../stand-in-ollama-server.ts';

/**
 * One Ollama client over one stand-in server on a free port, started
 * together; the server's `stop` is registered on the test, so a failed test
 * frees the port too. `chat` collects the text fragments on `deltas`.
 */
export class OllamaLlmClientWithStandInServer {
    readonly model: string = 'test-model';
    readonly contextTokens: number = 8192;
    readonly server: StandInOllamaServer;
    readonly client: OllamaLlmClient;
    readonly deltas: string[] = [];

    private constructor(server: StandInOllamaServer) {
        this.server = server;
        this.client = new OllamaLlmClient({
            baseUrl: server.baseUrl,
            model: this.model,
            contextTokens: this.contextTokens,
        });
    }

    static async start(t: TestContext): Promise<OllamaLlmClientWithStandInServer> {
        const server: StandInOllamaServer = new StandInOllamaServer();
        await server.start();
        t.after((): Promise<void> => server.stop());
        return new OllamaLlmClientWithStandInServer(server);
    }

    chat(request: LlmChatRequest, signal: AbortSignal): Promise<LlmReply> {
        return this.client.streamChat(request, (text: string): void => {
            this.deltas.push(text);
        }, signal);
    }
}
