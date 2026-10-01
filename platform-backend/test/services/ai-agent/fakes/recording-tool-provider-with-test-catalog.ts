import type { AgentTool } from '../../../../src/services/ai-agent/interfaces.ts';
import { RecordingToolProvider } from './recording-tool-provider.ts';

/**
 * The catalog the loop tests run against: one tool of each kind the loop's
 * policy tells apart — two readers (so a read-only batch exists), a writer
 * that only adds, and a destructive one — each with a plain answer. The
 * platform's real fifteen tools are the MCP tests' concern; the loop only
 * ever looks at the flags.
 */
const TEST_TOOL_CATALOG: AgentTool[] = [
    { name: 'list_things', description: 'Lists the things.', inputSchema: {}, readOnly: true, destructive: false },
    { name: 'count_things', description: 'Counts the things.', inputSchema: {}, readOnly: true, destructive: false },
    { name: 'add_thing', description: 'Adds a thing.', inputSchema: {}, readOnly: false, destructive: false },
    { name: 'delete_thing', description: 'Deletes a thing.', inputSchema: {}, readOnly: false, destructive: true },
];

export function createRecordingToolProviderWithTestCatalog(): RecordingToolProvider {
    const provider: RecordingToolProvider = new RecordingToolProvider(TEST_TOOL_CATALOG);
    provider.answerWith('list_things', { text: 'things: alpha, beta', isError: false });
    provider.answerWith('count_things', { text: '2', isError: false });
    provider.answerWith('add_thing', { text: 'added', isError: false });
    provider.answerWith('delete_thing', { text: 'deleted', isError: false });
    return provider;
}
