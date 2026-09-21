import { memo } from 'react';
import type { ReactElement } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import ChatReplyMarkdownLink from './chat-reply-markdown-link.tsx';
import type { ChatReplyMarkdownProps } from './interfaces.ts';

/* Module-level so the renderer gets the same arrays/objects on every render.
   gfm adds tables (what a model reaches for when asked to list containers),
   strikethrough and task lists; breaks keeps a single newline a line break —
   small models write "State: running\nUptime: 2h" and mean two lines, which
   plain markdown would join into one. */
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

/* No images: a reply can quote tool results (container logs, image labels),
   which are not ours — and an <img> is fetched without a click, so one written
   into a log line could carry what the model read to a foreign server. Links
   stay, since following one takes a deliberate click. */
const DISALLOWED_ELEMENTS: string[] = ['img'];

const COMPONENTS: Components = {
    a: ChatReplyMarkdownLink,
};

/**
 * An assistant reply rendered as markdown. Raw HTML in the text is never
 * interpreted (react-markdown shows it as text, and no rehype-raw is added),
 * so model output cannot inject markup. The element styling lives in index.css
 * under .app-chat-markdown — descendants cannot be styled inline. Memoized on
 * the text: while one reply streams, every fragment re-renders the whole list,
 * and the finished replies above it must not be re-parsed each time.
 */
function ChatReplyMarkdown(props: ChatReplyMarkdownProps): ReactElement {
    return (
        <div className="app-chat-message app-chat-markdown">
            <Markdown
                remarkPlugins={REMARK_PLUGINS}
                disallowedElements={DISALLOWED_ELEMENTS}
                components={COMPONENTS}
            >
                {props.text}
            </Markdown>
        </div>
    );
}

export default memo(ChatReplyMarkdown);
