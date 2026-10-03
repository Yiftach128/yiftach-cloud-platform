import { Button, Tooltip } from 'antd';
import type { ReactElement } from 'react';

import type { ChatMascotButtonProps } from './interfaces.ts';

/** The assistant mascot; Vite serves it straight from public/. */
const MASCOT_PATH: string = '/chatbot-badge.svg';

/* The launcher shows the bare mascot — no box — so the image is exactly the
   drawing's frame. Well past antd's 32px icon button: it is a full-color
   illustration, not a glyph, and unreadable at glyph size. */
const MASCOT_SIZE_PX: number = 72;

/* At that size the drawing starts 11px in from the image's left edge (the
   viewBox carries its own margin; measured). The image is pulled left by
   that much, so what lines up with the menu icons is the robot, not its
   transparent box. */
const MASCOT_DRAWN_LEFT_INSET_PX: number = 11;

/* What the launcher is called: the tooltip on hover, and the button's
   accessible name — there is no caption, so the name has to come from here. */
const LAUNCHER_NAME: string = 'YCP Assistant';

/**
 * The assistant's launcher: the bare mascot, no caption — hovering it shows
 * a "YCP Assistant" tooltip to its right, where a menu label would be.
 * app-layout.tsx pins it to the bottom of the sider with its left edge on
 * the menu icons' line, below the menu with the empty stretch of sider
 * between. It toggles the docked chat column (chat-docked-column.tsx). It
 * shows no on/off marker on purpose: the menu's selected bar means "the
 * page you are on", and the open column is the only sign the assistant is
 * on. antd's box is removed inline (which also beats its hover background),
 * so nothing but the drawing shows; what remains of the Button is the click
 * handling and the keyboard focus ring, and with no box to signal a button,
 * the hover/focus grow of the mascot in index.css (.app-chat-mascot) is the
 * affordance.
 */
function ChatMascotButton(props: ChatMascotButtonProps): ReactElement {
    /* Decorative — the button's aria-label names it. display: block drops the
       inline image's baseline gap, which would stretch the button off-square. */
    const mascot: ReactElement = (
        <img
            src={MASCOT_PATH}
            alt=""
            width={MASCOT_SIZE_PX}
            height={MASCOT_SIZE_PX}
            draggable={false}
            style={{ display: 'block', marginLeft: -MASCOT_DRAWN_LEFT_INSET_PX }}
        />
    );

    return (
        <Tooltip title={LAUNCHER_NAME} placement="right">
            <Button
                className="app-chat-mascot"
                type="text"
                aria-label={LAUNCHER_NAME}
                onClick={props.onClick}
                style={{
                    height: MASCOT_SIZE_PX,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                }}
            >
                {mascot}
            </Button>
        </Tooltip>
    );
}

export default ChatMascotButton;
