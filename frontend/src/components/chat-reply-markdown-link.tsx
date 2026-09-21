import type { ReactElement } from 'react';

import type { ChatReplyMarkdownLinkProps } from './interfaces.ts';

/**
 * A link inside an assistant reply. Always a new tab: the URL is whatever the
 * model wrote, and following it in place would replace the app — and the
 * conversation with it. noreferrer keeps the opened page from learning where
 * the click came from (and implies noopener).
 */
function ChatReplyMarkdownLink(props: ChatReplyMarkdownLinkProps): ReactElement {
    return (
        <a href={props.href} target="_blank" rel="noreferrer">{props.children}</a>
    );
}

export default ChatReplyMarkdownLink;
