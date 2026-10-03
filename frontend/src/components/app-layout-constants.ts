/* The measurements the app frame's columns agree on. Here rather than in
   app-layout.tsx because the chat column (chat-docked-column.tsx) draws its
   own header row to the same line, and the layout imports the column — the
   column importing the layout back would be an import cycle. */

/* Shared by the sider logo row, the content-side header strip and the chat
   column's header row, so the divider under each renders at the same
   y-position and reads as one continuous line across the screen. */
export const headerRowHeight: number = 56;

export const dividerColor: string = '#d9d9d9';

/* The line between the frame's columns: the sider's right edge and the chat
   column's left edge. */
export const siderBorderColor: string = '#aaa';
