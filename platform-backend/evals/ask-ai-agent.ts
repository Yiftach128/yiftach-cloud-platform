/**
 * Entry point for asking the AI agent one question from a terminal
 * (`npm run ask:ai-agent -- "which containers are running?"`).
 *
 * Unlike the eval suite this runs the tools for real, against the Docker
 * daemon at DOCKER_HOST — the whole chain the chat endpoint uses, minus
 * HTTP. It never boots the daemon: with Docker down, the tools report that in
 * band and the model says so. A destructive tool call waits for a y/n on the
 * terminal, the way the chat waits for Approve/Deny; a call that only adds
 * runs at once.
 */

import { config } from '../src/config/config.ts';
import type { AgentRunResult } from '../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import { OllamaLlmClient } from '../src/services/llm/ollama/ollama-llm-client.ts';
import { connectPlatformToolProviderForEvals } from './connect-platform-tool-provider-for-evals.ts';
import { printAgentEventToTerminal } from './print-agent-event-to-terminal.ts';
import { TerminalToolCallApprover } from './terminal-tool-call-approver.ts';

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
    const orchestrator = new ToolCallingChatOrchestrator({
        llm: llm,
        tools: platformTools,
        approver: new TerminalToolCallApprover(),
    });

    // Ctrl+C is the Stop button: the first one aborts the run, which then ends normally.
    const stop: AbortController = new AbortController();
    process.once('SIGINT', () => stop.abort());

    console.log('');
    const startedAt: number = Date.now();
    const result: AgentRunResult = await orchestrator.run(
        { turns: [{ role: 'user', text: question }], autoApproveToolCalls: false },
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
