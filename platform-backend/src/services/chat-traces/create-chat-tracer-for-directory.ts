import type { AgentRunTracer } from '../ai-agent/interfaces.ts';
import { NoOpAgentRunTracer } from '../ai-agent/no-op-agent-run-tracer.ts';
import type { ChatTracerOptions } from './interfaces.ts';
import { JsonLinesChatTracer } from './json-lines-chat-tracer.ts';

/**
 * The chat's tracer for `CHAT_TRACE_DIR`: a trace file per run in that folder,
 * or none at all when it is empty. The on/off decision lives here, not in
 * `server.ts` — the way `staticFrontend('')` serves nothing.
 */
export function createChatTracerForDirectory(options: ChatTracerOptions): AgentRunTracer {
    if (options.directory === '') {
        return new NoOpAgentRunTracer();
    }
    return new JsonLinesChatTracer(options);
}
