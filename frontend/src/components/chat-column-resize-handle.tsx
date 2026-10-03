import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from 'react';

import type { ChatColumnResizeHandleProps } from './interfaces.ts';

/* Wide enough to grab, narrow enough to read as the column's border line:
   it covers that 1px line plus 5px of the column's own edge. */
const HANDLE_WIDTH_PX: number = 6;

/** How far one arrow key press moves the edge. */
const KEYBOARD_STEP_PX: number = 16;

/**
 * The grab strip on the assistant column's left edge (chat-docked-column.tsx).
 * Dragging it resizes the column: the pointer is captured on press, so the
 * drag keeps working when the pointer outruns the strip, and the new width
 * follows how far the edge was pulled from where the drag began. It is the
 * ARIA "window splitter": a focusable separator that Left/Right move by a
 * step and Home/End take to the limits, so the keyboard resizes too. A
 * double-click returns the default width. Invisible at rest like the sash
 * of any docked panel; hover and focus tint it (index.css,
 * .app-chat-resize-handle), and the cursor says what it does.
 */
function ChatColumnResizeHandle(props: ChatColumnResizeHandleProps): ReactElement {
    /* Where the drag began; null while no drag is in progress. */
    const dragStartPointerX = useRef<number | null>(null);
    const dragStartWidth = useRef<number>(0);

    function clampWidth(width: number): number {
        if (width < props.minWidth) {
            return props.minWidth;
        } else if (width > props.maxWidth) {
            return props.maxWidth;
        } else {
            return width;
        }
    }

    function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
        if (event.button !== 0) {
            return;
        }
        /* Cancelling the pointerdown suppresses the mouse events that would
           start a text selection sweeping across the page mid-drag. */
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStartPointerX.current = event.clientX;
        dragStartWidth.current = props.width;
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
        if (dragStartPointerX.current === null) {
            return;
        }
        /* The column is docked on the right, so pulling the edge left widens it. */
        const pulled: number = dragStartPointerX.current - event.clientX;
        props.onResize(clampWidth(dragStartWidth.current + pulled));
    }

    function handlePointerEnd(): void {
        if (dragStartPointerX.current === null) {
            return;
        }
        dragStartPointerX.current = null;
        /* props.width already carries the last move: the update from that
           event was flushed before this one was dispatched. */
        props.onResizeEnd(props.width);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        let next: number;
        if (event.key === 'ArrowLeft') {
            next = clampWidth(props.width + KEYBOARD_STEP_PX);
        } else if (event.key === 'ArrowRight') {
            next = clampWidth(props.width - KEYBOARD_STEP_PX);
        } else if (event.key === 'Home') {
            next = props.minWidth;
        } else if (event.key === 'End') {
            next = props.maxWidth;
        } else {
            return;
        }
        event.preventDefault();
        props.onResize(next);
        props.onResizeEnd(next);
    }

    /* touch-action none keeps a touch drag from scrolling the page instead. */
    const handleStyle: CSSProperties = {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: HANDLE_WIDTH_PX,
        cursor: 'col-resize',
        touchAction: 'none',
        zIndex: 1,
    };

    return (
        <div
            className="app-chat-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the assistant column"
            aria-valuemin={props.minWidth}
            aria-valuemax={props.maxWidth}
            aria-valuenow={props.width}
            tabIndex={0}
            style={handleStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onKeyDown={handleKeyDown}
            onDoubleClick={props.onReset}
        />
    );
}

export default ChatColumnResizeHandle;
