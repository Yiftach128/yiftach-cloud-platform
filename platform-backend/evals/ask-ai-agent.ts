/**
 * Entry point for asking the AI agent one question from a terminal
 * (`npm run ask:ai-agent -- "which containers are running?"`).
 *
 * Unlike the tool-choice check this runs the tools for real, against the Docker
 * daemon at DOCKER_HOST — the whole chain the chat endpoint will use, minus
 * HTTP. It never boots the daemon: with Docker down, the tools report that in
 * band and the model says so.
 */

import { config } from '../src/config/config.ts';
import type { AgentRunResult } from '../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import { OllamaLlmClient } from '../src/services/llm/ollama/ollama-llm-client.ts';
import { connectPlatformToolProviderForEvals } from './connect-platform-tool-provider-for-evals.ts';
import { printAgentEventToTerminal } from './print-agent-event-to-terminal.ts';

async function main(): Promise<void> {
    const question: string = process.argv.slice(2).join(' ').trim();
    if (question === '') {
        console.error('usage: npm run ask:ai-agent -- "<question>"');
        process.exitCode = 1;
        return;
    }

    const llm = new OllamaLlmClient({
        baseUrl: config.OLLAMA_URL,
        model: config.OLLAMA_MODEL,
        contextTokens: config.OLLAMA_NUM_CTX,
    });
    const platformTools = await connectPlatformToolProviderForEvals(config.DOCKER_HOST);
    const orchestrator = new ToolCallingChatOrchestrator({ llm: llm, tools: platformTools });

    // Ctrl+C is the Stop button: the first one aborts the run, which then ends normally.
    const stop: AbortController = new AbortController();
    process.once('SIGINT', () => stop.abort());

    console.log('');
    const startedAt: number = Date.now();
    const result: AgentRunResult = await orchestrator.run(
        [{ role: 'user', text: question }],
        printAgentEventToTerminal,
        stop.signal,
    );
    const seconds: string = ((Date.now() - startedAt) / 1000).toFixed(1);
    await platformTools.close();

    console.log(
        `\n\n[${result.stopReason}: ${result.modelCalls} model calls, ${result.toolCalls.length} tool calls, `
        + `${seconds}s, largest prompt ${result.peakPromptTokens} of ${config.OLLAMA_NUM_CTX} tokens]`,
    );
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(`\nask failed: ${error.message}`);
    } else {
        console.error('\nask failed:', error);
    }
    process.exitCode = 1;
});
