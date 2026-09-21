/**
 * Entry point of the tool-choice check (`npm run check:tool-choice`).
 *
 * Runs every case in `tool-choice-cases.ts` through the real chain — the agent
 * loop, the configured Ollama model, and the platform's real MCP tool catalog
 * over the in-process link — with one substitution: tool calls are answered
 * from canned data, so no Docker daemon is needed and results are comparable
 * between runs and between models (`OLLAMA_MODEL=... npm run check:tool-choice`).
 * Exits 1 when a case fails.
 */

import { config } from '../src/config/config.ts';
import type { AgentRunResult } from '../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import { OllamaLlmClient } from '../src/services/llm/ollama/ollama-llm-client.ts';
import { CannedResultsToolProvider } from './canned-results-tool-provider.ts';
import { connectPlatformToolProviderForEvals } from './connect-platform-tool-provider-for-evals.ts';
import type { ToolChoiceCaseScore } from './interfaces.ts';
import { printAgentEventToTerminal } from './print-agent-event-to-terminal.ts';
import { scoreToolChoiceCase } from './score-tool-choice-case.ts';
import { TOOL_CHOICE_CASES } from './tool-choice-cases.ts';

async function main(): Promise<void> {
    const llm = new OllamaLlmClient({
        baseUrl: config.OLLAMA_URL,
        model: config.OLLAMA_MODEL,
        contextTokens: config.OLLAMA_NUM_CTX,
    });
    const platformTools = await connectPlatformToolProviderForEvals(config.DOCKER_HOST);
    const orchestrator = new ToolCallingChatOrchestrator({
        llm: llm,
        tools: new CannedResultsToolProvider(platformTools),
    });

    const failedCaseIds: string[] = [];
    let peakPromptTokens: number = 0;
    const checkStartedAt: number = Date.now();

    for (let index = 0; index < TOOL_CHOICE_CASES.length; index++) {
        const testCase = TOOL_CHOICE_CASES[index];
        if (testCase === undefined) {
            continue;
        }
        console.log(`\n[${index + 1}/${TOOL_CHOICE_CASES.length}] ${testCase.id}: "${testCase.prompt}"`);

        const caseStartedAt: number = Date.now();
        const result: AgentRunResult = await orchestrator.run(
            [{ role: 'user', text: testCase.prompt }],
            printAgentEventToTerminal,
            new AbortController().signal,
        );
        const seconds: string = ((Date.now() - caseStartedAt) / 1000).toFixed(1);
        peakPromptTokens = Math.max(peakPromptTokens, result.peakPromptTokens);

        const score: ToolChoiceCaseScore = scoreToolChoiceCase(testCase, result.toolCalls);
        let verdict: string;
        if (score.passed) {
            verdict = 'PASS';
        } else {
            verdict = 'FAIL';
            failedCaseIds.push(testCase.id);
        }
        console.log(
            `\n  ${verdict}  ${result.modelCalls} model calls, ${result.toolCalls.length} tool calls, `
            + `${seconds}s, stop: ${result.stopReason}`,
        );
        for (const problem of score.problems) {
            console.log(`        - ${problem}`);
        }
    }

    await platformTools.close();

    const passedCount: number = TOOL_CHOICE_CASES.length - failedCaseIds.length;
    const totalSeconds: string = ((Date.now() - checkStartedAt) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(72)}`);
    console.log(`model ${config.OLLAMA_MODEL}: ${passedCount}/${TOOL_CHOICE_CASES.length} cases passed in ${totalSeconds}s`);
    console.log(`largest prompt: ${peakPromptTokens} of ${config.OLLAMA_NUM_CTX} context tokens`);
    if (failedCaseIds.length > 0) {
        console.log(`failed: ${failedCaseIds.join(', ')}`);
        process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(`\ntool-choice check aborted: ${error.message}`);
    } else {
        console.error('\ntool-choice check aborted:', error);
    }
    process.exitCode = 1;
});
