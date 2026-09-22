import { CloseOutlined } from '@ant-design/icons';
import { Button, Divider, Layout } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { dividerColor, headerRowHeight, siderBorderColor } from './app-layout-constants.ts';
import ChatColumnResizeHandle from './chat-column-resize-handle.tsx';
import { readStoredChatColumnWidth, storeChatColumnWidth } from './chat-column-width-storage.ts';
import ChatPanel from './chat-panel.tsx';
import type { ChatDockedColumnProps } from './interfaces.ts';

/* The width the column opens at until the user drags it: what the message
   styling is sized for (index.css, .app-chat-markdown). */
const DEFAULT_COLUMN_WIDTH_PX: number = 380;

/* Narrower than this and the tool-call tags and the composer stop fitting. */
const MIN_COLUMN_WIDTH_PX: number = 320;

/* The column may take this much of the viewport at most, so the page beside
   it never disappears. */
const MAX_COLUMN_WIDTH_FRACTION: number = 0.6;

function computeMaxColumnWidth(): number {
    return Math.floor(window.innerWidth * MAX_COLUMN_WIDTH_FRACTION);
}

/* The remembered width, kept within today's limits (the window may be
   smaller than when it was stored), or the default when there is none. */
function readInitialColumnWidth(): number {
    const stored: number | null = readStoredChatColumnWidth();
    if (stored === null) {
        return DEFAULT_COLUMN_WIDTH_PX;
    }
    const maxWidth: number = computeMaxColumnWidth();
    if (stored < MIN_COLUMN_WIDTH_PX) {
        return MIN_COLUMN_WIDTH_PX;
    } else if (stored > maxWidth) {
        return maxWidth;
    } else {
        return stored;
    }
}

/**
 * The docked chat: a right-hand column of the app frame that pushes the page
 * aside instead of floating over it — the chat quotes what is on screen
 * (rows, logs, tool results), so covering it cost the most. An antd Sider,
 * like the navigation on the left: the page reflows to what is left (the
 * tables ellipsize, the services table scrolls sideways under its minimum
 * width, the graph canvas is fluid). Sized by dragging its left edge
 * (chat-column-resize-handle.tsx), and the width is remembered across
 * reloads (chat-column-width-storage.ts). Closed means collapsed to
 * zero width, never unmounted, so the conversation, a reply still streaming
 * and the list's scroll position survive; the frame inside keeps the open
 * width so the clipped content never reflows, and `inert` takes it out of
 * hit-testing, the tab order and the accessibility tree. Nothing here
 * listens for outside clicks: the column closes only through its X or the
 * mascot (chat-mascot-button.tsx).
 */
function ChatDockedColumn(props: ChatDockedColumnProps): ReactElement {
    const [width, setWidth] = useState<number>(readInitialColumnWidth);

    /* Read per render, not once: the window may have been resized since. */
    const maxWidth: number = computeMaxColumnWidth();

    function handleResize(nextWidth: number): void {
        setWidth(nextWidth);
    }

    /* Remembered when a drag ends, not on every move. */
    function handleResizeEnd(finalWidth: number): void {
        storeChatColumnWidth(finalWidth);
    }

    function handleResetWidth(): void {
        setWidth(DEFAULT_COLUMN_WIDTH_PX);
        storeChatColumnWidth(DEFAULT_COLUMN_WIDTH_PX);
    }

    /* Sticky at viewport height, like the sider on the left: a long page
       scrolls under the column, not with it. antd transitions the sider's
       width; open, close and a drag are instant here, like the rest of the
       app's click feedback. */
    const columnStyle: CSSProperties = {
        position: 'sticky',
        top: 0,
        height: '100vh',
        transition: 'none',
    };

    /* The frame is as wide as the open column even while collapsed (antd clips
       a zero-width sider's children), so closing never reflows the messages.
       The border lives here, not on the sider, so no 1px line is left behind
       when the sider is collapsed to nothing; the resize handle is positioned
       over that border, hence the relative positioning. */
    const frameStyle: CSSProperties = {
        position: 'relative',
        boxSizing: 'border-box',
        width: width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${siderBorderColor}`,
    };

    /* Same height as the sider logo row and the header strip, and the same
       typography, so the divider under it continues the one line across the
       screen and the title sits on the breadcrumb's baseline. */
    const headerRowStyle: CSSProperties = {
        height: headerRowHeight,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        fontSize: 18,
        fontWeight: 600,
        color: 'rgba(0, 0, 0, 0.88)',
    };

    /* Fills what the header leaves and hands its children (message list +
       composer) a column to split. */
    const bodyStyle: CSSProperties = {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
    };

    return (
        <Layout.Sider
            theme="light"
            width={width}
            collapsed={!props.open}
            collapsedWidth={0}
            trigger={null}
            aria-label="Assistant chat"
            inert={!props.open}
            style={columnStyle}
        >
            <div style={frameStyle}>
                <ChatColumnResizeHandle
                    width={width}
                    minWidth={MIN_COLUMN_WIDTH_PX}
                    maxWidth={maxWidth}
                    onResize={handleResize}
                    onResizeEnd={handleResizeEnd}
                    onReset={handleResetWidth}
                />
                <div style={headerRowStyle}>
                    <span>YCP assistant</span>
                    <Button
                        type="text"
                        size="small"
                        aria-label="Close"
                        title="Close"
                        icon={<CloseOutlined />}
                        onClick={props.onClose}
                    />
                </div>
                <Divider style={{ margin: 0, borderColor: dividerColor }} />
                <div style={bodyStyle}>
                    <ChatPanel fetcher={props.fetcher} open={props.open} />
                </div>
            </div>
        </Layout.Sider>
    );
}

export default ChatDockedColumn;
