import { CloudOutlined, CloudServerOutlined, ClusterOutlined, CodeSandboxOutlined, DashboardOutlined, PlusOutlined } from '@ant-design/icons';
import { Divider, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { dividerColor, headerRowHeight, siderBorderColor } from './app-layout-constants.ts';
import { readStoredChatColumnOpen, storeChatColumnOpen } from './chat-column-open-storage.ts';
import ChatDockedColumn from './chat-docked-column.tsx';
import ChatMascotButton from './chat-mascot-button.tsx';
import HeaderBreadcrumb from './header-breadcrumb.tsx';
import type { AppLayoutProps, NavItem } from './interfaces.ts';

/* One step darker than the content background (antd's colorBgLayout, #f5f5f5). */
const siderBackground: string = '#ececec';

/* Gap between the mascot and the bottom edge of the screen — the content
   padding, so it lines up with the page's bottom margin. */
const mascotBottomGap: number = 24;

/* Where the menu entries' icons start: antd's inline item margin (4px) plus
   its level-1 padding (24px). The launcher's left edge sits on the same line. */
const menuIconLeft: number = 28;

/* Single source of truth for navigation: drives the sider menu, the selected-item
   derivation, and the header breadcrumb roots. Paths double as menu keys. */
const navItems: NavItem[] = [
    { path: '/overview', icon: <DashboardOutlined />, label: 'Overview' },
    { path: '/services', icon: <CloudServerOutlined />, label: 'My Services' },
    {
        path: '/containers/new',
        icon: <PlusOutlined />,
        label: 'New Service',
        childLabels: { database: 'Managed Service', image: 'Docker Image', github: 'GitHub Repository' },
    },
    { path: '/images', icon: <CodeSandboxOutlined />, label: 'My Images' },
    { path: '/build-agents', icon: <ClusterOutlined />, label: 'Build Agents' },
];

/* The Link makes each item a real anchor (new-tab friendly); antd's menu CSS
   stretches an in-item anchor over the whole row, icon included, so no
   Menu-level onClick is needed. */
const menuItems: MenuProps['items'] = navItems.map((item: NavItem) => ({
    key: item.path,
    icon: item.icon,
    label: <Link to={item.path}>{item.label}</Link>,
}));

/* Child routes (e.g. /services/<container>) keep their nav root highlighted. Exact
   matches win first so one nav path can never shadow another. */
function deriveSelectedMenuKey(pathname: string, items: NavItem[]): string {
    for (const item of items) {
        if (pathname === item.path) {
            return item.path;
        }
    }
    for (const item of items) {
        if (pathname.startsWith(item.path + '/')) {
            return item.path;
        }
    }
    return pathname;
}

function AppLayout(props: AppLayoutProps): ReactElement {
    const location = useLocation();
    /* Here, not in the chat components: the launcher sits in the sider on the
       left and the column it toggles on the right, and this is the one place
       that renders both. Remembered per tab with a cross-tab fallback
       (chat-column-open-storage.ts), so a reload does not close the column
       and a new tab starts as the last one left it. */
    const [isChatOpen, setIsChatOpen] = useState<boolean>(readStoredChatColumnOpen);

    function setChatOpen(open: boolean): void {
        setIsChatOpen(open);
        storeChatColumnOpen(open);
    }

    function handleToggleChat(): void {
        setChatOpen(!isChatOpen);
    }

    function handleCloseChat(): void {
        setChatOpen(false);
    }

    const selectedMenuKey: string = deriveSelectedMenuKey(location.pathname, navItems);

    /* Sticky at viewport height: a long page scrolls under the sider, so the
       navigation and the mascot pinned to its bottom stay on screen. */
    const siderStyle: CSSProperties = {
        position: 'sticky',
        top: 0,
        height: '100vh',
        background: siderBackground,
        borderRight: `1px solid ${siderBorderColor}`,
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider theme="light" style={siderStyle}>
                {/* A column, so the mascot can be pushed to the bottom. */}
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div className="app-logo" style={{ height: headerRowHeight, flex: 'none' }}><CloudOutlined /> YCP</div>
                    <Divider style={{ margin: '0 0 8px 0', borderColor: dividerColor }} />
                    <Menu
                        className="app-sider-menu"
                        mode="inline"
                        selectedKeys={[selectedMenuKey]}
                        items={menuItems}
                        style={{ background: 'transparent', borderInlineEnd: 'none' }}
                    />
                    {/* The assistant's launcher: the bare mascot with its left edge on the
                        menu icons' line, pinned to the bottom of the screen with the empty
                        stretch of sider between it and the menu (chat-mascot-button.tsx
                        says why it has no caption and no on/off marker). */}
                    <div style={{ marginTop: 'auto', paddingLeft: menuIconLeft, paddingBottom: mascotBottomGap, display: 'flex', alignItems: 'center' }}>
                        <ChatMascotButton onClick={handleToggleChat} />
                    </div>
                </div>
            </Layout.Sider>
            <Layout>
                {/* Header strip matching the sider logo row; the divider below continues
                    the sider's divider across the rest of the screen. */}
                <div style={{ height: headerRowHeight, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
                    <HeaderBreadcrumb navItems={navItems} />
                </div>
                <Divider style={{ margin: 0, borderColor: dividerColor }} />
                <Layout.Content style={{ padding: 24 }}>
                    <Outlet />
                </Layout.Content>
            </Layout>
            {/* Outside the Outlet, so the conversation survives route changes; a third
                column of the frame, so it pushes the page aside instead of covering it. */}
            <ChatDockedColumn fetcher={props.chatFetcher} open={isChatOpen} onClose={handleCloseChat} />
        </Layout>
    );
}

export default AppLayout;
