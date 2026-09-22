import type { CSSProperties, ReactElement } from 'react';

import { formatToolCallArgumentsJson } from './chat-tool-call-formatters.ts';
import type { ChatToolCall, ChatToolCallDetailsProps } from './interfaces.ts';

/* The log panes' surface (container-logs-panel.tsx): what a tool returned is
   machine output, and often container logs. Height-capped, since a result can
   run to thousands of characters inside the 380px card. */
const detailsStyle: CSSProperties = {
    maxHeight: 240,
    overflowY: 'auto',
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: 8,
};

const headingStyle: CSSProperties = {
    color: '#8c8c8c',
};

const laterHeadingStyle: CSSProperties = {
    color: '#8c8c8c',
    marginTop: 8,
};

/* The log panes' stderr red, for a result the tool reported as an error. */
const ERROR_TEXT_COLOR: string = '#ff7875';

/**
 * What one tool call sent and got back, opened from its tag: the arguments as
 * JSON and the result text exactly as the model read it — trimmed to the
 * agent's budget, so it is also all the model could have quoted. The
 * .app-log-output class opts the text into selection (index.css).
 */
function ChatToolCallDetails(props: ChatToolCallDetailsProps): ReactElement {
    const call: ChatToolCall = props.toolCall;

    let resultText: string;
    if (call.resultText !== undefined) {
        resultText = call.resultText;
    } else if (call.status === 'running') {
        resultText = 'Waiting for the result…';
    } else {
        resultText = 'No result: the reply ended before the tool answered.';
    }

    let resultStyle: CSSProperties | undefined;
    if (call.status === 'error') {
        resultStyle = { color: ERROR_TEXT_COLOR };
    } else {
        resultStyle = undefined;
    }

    return (
        <div className="app-log-output" style={detailsStyle}>
            <div style={headingStyle}>Arguments</div>
            <div>{formatToolCallArgumentsJson(call.arguments)}</div>
            <div style={laterHeadingStyle}>Result</div>
            <div style={resultStyle}>{resultText}</div>
        </div>
    );
}

export default ChatToolCallDetails;
