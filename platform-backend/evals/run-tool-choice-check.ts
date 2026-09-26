/**
 * Entry point of the tool-choice check (`npm run check:tool-choice`).
 *
 * Runs every case in `tool-choice-cases.ts` through the real chain — the agent
 * loop, the configured Ollama model, and the platform's real MCP tool catalog
 * over the in-process link — with one substitution: tool calls are answered
 * from canned data, so no Docker daemon is needed and results are comparable
 * between runs and between models (`OLLAMA_MODEL=... npm run check:tool-choice`).
 * Case ids given as arguments (`npm run check:tool-choice -- stop-container
 * delete-image`) run only those, in list order — for a failed case, or to split
 * a long run. Exits 1 when a case fails, 2 for an unknown case id.
 */

import { config } from '../src/config/config.ts';
import type { AgentRunResult } from '../src/services/ai-agent/interfaces.ts';
import { ToolCallingChatOrchestrator } from '../src/services/ai-agent/tool-calling-chat-orchestrator.ts';
import { OllamaLlmClient } from '../src/services/llm/ollama/ollama-llm-client.ts';
import { AutoApproveToolCallApprover } from './auto-approve-tool-call-approver.ts';
import { CannedResultsToolProvider } from './canned-results-tool-provider.ts';
import { connectPlatformToolProviderForEvals } from './connect-platform-tool-provider-for-evals.ts';
import type { ToolChoiceCase, ToolChoiceCaseScore } from './interfaces.ts';
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
        // Nothing executes here, so every call may "run"; the check scores the choice, not the consent.
        approver: new AutoApproveToolCallApprover(),
    });

    const selectedCases: ToolChoiceCase[] = selectCases(process.argv.slice(2));
    if (selectedCases.length === 0) {
        await platformTools.close();
        process.exitCode = 2;
        return;
    }

    const failedCaseIds: string[] = [];
    let peakPromptTokens: number = 0;
    const checkStartedAt: number = Date.now();

    for (let index = 0; index < selectedCases.length; index++) {
        const testCase = selectedCases[index];
        if (testCase === undefined) {
            continue;
        }
        console.log(`\n[${index + 1}/${selectedCases.length}] ${testCase.id}: "${testCase.prompt}"`);

        const caseStartedAt: number = Date.now();
        // Not auto-approved: the ask is part of what the output shows, and the approver answers it.
        const result: AgentRunResult = await orchestrator.run(
            { turns: [{ role: 'user', text: testCase.prompt }], autoApproveToolCalls: false },
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

    const passedCount: number = selectedCases.length - failedCaseIds.length;
    const totalSeconds: string = ((Date.now() - checkStartedAt) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(72)}`);
    console.log(`model ${config.OLLAMA_MODEL}: ${passedCount}/${selectedCases.length} cases passed in ${totalSeconds}s`);
    console.log(`largest prompt: ${peakPromptTokens} of ${config.OLLAMA_NUM_CTX} context tokens`);
    if (failedCaseIds.length > 0) {
        console.log(`failed: ${failedCaseIds.join(', ')}`);
        process.exitCode = 1;
    }
}

/** Every case when no ids were given; otherwise the named cases in the order named. An unknown id names the known ones and selects nothing. */
function selectCases(requestedIds: string[]): ToolChoiceCase[] {
    if (requestedIds.length === 0) {
        return TOOL_CHOICE_CASES;
    }
    const selected: ToolChoiceCase[] = [];
    for (const requestedId of requestedIds) {
        const found: ToolChoiceCase | undefined = TOOL_CHOICE_CASES.find(
            (candidate: ToolChoiceCase) => candidate.id === requestedId,
        );
        if (found === undefined) {
            const knownIds: string = TOOL_CHOICE_CASES.map((candidate: ToolChoiceCase) => candidate.id).join(', ');
            console.error(`unknown case "${requestedId}". Known cases: ${knownIds}`);
            return [];
        }
        selected.push(found);
    }
    return selected;
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(`\ntool-choice check aborted: ${error.message}`);
    } else {
        console.error('\ntool-choice check aborted:', error);
    }
    process.exitCode = 1;
});
