import { Button } from 'antd';
import type { CSSProperties, ReactElement } from 'react';

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
   transparent box — and the drawing's right-hand margin (about 12px) is what
   spaces the caption, close to the menu's 10px between icon and label. */
const MASCOT_DRAWN_LEFT_INSET_PX: number = 11;

/* Likewise the drawing ends 6px above the image's bottom edge (measured):
   the caption's baseline sits on that line, at the robot's feet, not at
   the image box's edge. */
const MASCOT_DRAWN_BOTTOM_INSET_PX: number = 6;

/**
 * The assistant's launcher: the mascot with the caption "Assistant" to its
 * right, at its feet, laid out like a menu entry — app-layout.tsx pins it to
 * the bottom of the sider with its left edge on the menu icons' line, below
 * the menu with the empty stretch of sider between. It toggles the docked
 * chat column (chat-docked-column.tsx). It shows no on/off marker on
 * purpose: the menu's selected bar means "the page you are on", and the
 * open column is the only sign the assistant is on. antd's box is removed
 * inline (which also beats its hover background), so nothing but the
 * drawing and the caption show; what remains of the Button is the click
 * handling and the keyboard focus ring, and with no box to signal a button,
 * the hover/focus grow of the mascot in index.css (.app-chat-mascot) is the
 * affordance.
 */
function ChatMascotButton(props: ChatMascotButtonProps): ReactElement {
    /* Decorative — the caption names the button. display: block drops the
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

    /* Bottom-aligned with the image, then raised to the feet. Line height 1
       puts the text's baseline about a pixel above its own bottom edge, so
       the baseline lands on the drawing's last row. */
    const captionStyle: CSSProperties = {
        lineHeight: 1,
        marginBottom: MASCOT_DRAWN_BOTTOM_INSET_PX,
    };

    /* gap 0: the drawing's own margin spaces the caption (see the inset above). */
    return (
        <Button
            className="app-chat-mascot"
            type="text"
            onClick={props.onClick}
            style={{
                height: MASCOT_SIZE_PX,
                padding: 0,
                gap: 0,
                alignItems: 'flex-end',
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
            }}
        >
            {mascot}
            <span style={captionStyle}>Assistant</span>
        </Button>
    );
}

export default ChatMascotButton;
