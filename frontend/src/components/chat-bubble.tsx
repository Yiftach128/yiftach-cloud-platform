import { CloseOutlined, ExpandAltOutlined, ShrinkOutlined } from '@ant-design/icons';
import { Button, Card, Flex, FloatButton } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import ChatPanel from './chat-panel.tsx';
import type { ChatBubbleProps } from './interfaces.ts';

/** The assistant mascot; Vite serves it straight from public/. */
const MASCOT_PATH: string = '/chatbot-badge.svg';

/** Gap between the bubble/card and the viewport's right and bottom edges. */
const EDGE_GAP_PX: number = 24;
/* The launcher is the bare mascot — no box — so the button is exactly the
   image. Well past antd's 40px FloatButton: it is a full-color illustration,
   not a glyph, and unreadable at glyph size. */
const MASCOT_SIZE_PX: number = 72;
/* The card floats just above the mascot. The gap is small because the drawing
   brings its own headroom inside the viewBox. */
const CARD_BOTTOM_PX: number = EDGE_GAP_PX + MASCOT_SIZE_PX + 4;

/* Under antd's popups (Modal 1000, Popconfirm 1030, message 2010), so a delete
   confirmation always lands on top of the chat; above FloatButton's 99. */
const CARD_Z_INDEX: number = 900;

/**
 * The floating chat: a corner button plus the card it toggles. The card is a
 * plain position-fixed antd Card on purpose — antd's own overlays each bundle
 * a behavior that is wrong here (Popover closes on an outside click, Modal
 * blocks the page, Drawer is a full-height sheet). Nothing here listens for
 * outside clicks: the card closes only through its X or the corner button.
 */
function ChatBubble(props: ChatBubbleProps): ReactElement {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    function handleToggleOpen(): void {
        setIsOpen(!isOpen);
    }

    function handleClose(): void {
        setIsOpen(false);
    }

    function handleToggleExpanded(): void {
        setIsExpanded(!isExpanded);
    }

    let width: number;
    let height: number | string;
    let expandLabel: string;
    let expandIcon: ReactElement;
    if (isExpanded) {
        width = 640;
        /* As tall as the viewport allows — the maxHeight below, spelled out. */
        height = `calc(100vh - ${CARD_BOTTOM_PX + EDGE_GAP_PX}px)`;
        expandLabel = 'Shrink';
        expandIcon = <ShrinkOutlined />;
    } else {
        width = 380;
        height = 520;
        expandLabel = 'Expand';
        expandIcon = <ExpandAltOutlined />;
    }

    /* Closed means hidden, never unmounted: the conversation, a reply still
       streaming and the list's scroll position all survive (display: none
       would drop the scroll position). Hidden is opacity 0 plus the `inert`
       attribute below, which takes the card out of hit-testing, the tab order
       and the accessibility tree. Not `visibility`: it is inherited, and antd's
       inputs and buttons transition `all`, so they would trail the card by
       0.2s — lingering after a close, and still hidden when the composer's
       focus-on-open runs. */
    let opacity: number;
    if (isOpen) {
        opacity = 1;
    } else {
        opacity = 0;
    }

    const cardStyle: CSSProperties = {
        position: 'fixed',
        insetInlineEnd: EDGE_GAP_PX,
        bottom: CARD_BOTTOM_PX,
        zIndex: CARD_Z_INDEX,
        width: width,
        height: height,
        maxWidth: `calc(100vw - ${EDGE_GAP_PX * 2}px)`,
        maxHeight: `calc(100vh - ${CARD_BOTTOM_PX + EDGE_GAP_PX}px)`,
        opacity: opacity,
        /* antd's Card transitions `all`; open, close and expand are instant
           here, like the rest of the app's click feedback. */
        transition: 'none',
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#d9d9d9',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
    };

    /* The body fills what the header leaves and hands its children (message
       list + composer) a column to split. */
    const cardBodyStyle: CSSProperties = {
        flex: 1,
        minHeight: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
    };

    /* Decorative — the button carries the aria-label. display: block drops the
       inline image's baseline gap, which would stretch the button off-square. */
    const mascot: ReactElement = (
        <img
            src={MASCOT_PATH}
            alt=""
            width={MASCOT_SIZE_PX}
            height={MASCOT_SIZE_PX}
            draggable={false}
            style={{ display: 'block' }}
        />
    );

    const headerButtons: ReactElement = (
        <Flex gap={4}>
            <Button
                type="text"
                size="small"
                aria-label={expandLabel}
                title={expandLabel}
                icon={expandIcon}
                onClick={handleToggleExpanded}
            />
            <Button
                type="text"
                size="small"
                aria-label="Close"
                title="Close"
                icon={<CloseOutlined />}
                onClick={handleClose}
            />
        </Flex>
    );

    return (
        <>
            <Card
                size="small"
                role="dialog"
                aria-label="Assistant chat"
                inert={!isOpen}
                title="Assistant"
                extra={headerButtons}
                style={cardStyle}
                styles={{ body: cardBodyStyle }}
            >
                <ChatPanel fetcher={props.fetcher} open={isOpen} />
            </Card>
            {/* FloatButton stripped to the bare mascot: what remains of antd is the
                fixed positioning, the z-index and the keyboard focus ring. The
                hover feedback lives in index.css (.app-chat-mascot). */}
            <FloatButton
                className="app-chat-mascot"
                shape="square"
                aria-label="Assistant chat"
                icon={mascot}
                style={{
                    insetInlineEnd: EDGE_GAP_PX,
                    insetBlockEnd: EDGE_GAP_PX,
                    width: MASCOT_SIZE_PX,
                    height: MASCOT_SIZE_PX,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                }}
                onClick={handleToggleOpen}
            />
        </>
    );
}

export default ChatBubble;
