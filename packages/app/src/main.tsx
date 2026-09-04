import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ChannelPage } from './channel-page.js';
import { AppSidebar } from './components/app-sidebar.js';
import { AuthProvider, useAuth } from './lib/auth-context.js';
import {
  paneFromSearch,
  readChannelSearch,
  searchForPane,
  searchRecord,
} from './lib/channel-pane.js';
import { readRouteString } from './lib/route-param.js';
import { SidebarProvider } from './lib/sidebar-context.js';
import { applyDarkTheme, parseStoredDarkTheme, THEME_STORAGE_KEY } from './lib/theme.js';
import { SignPage } from './login-page.js';
import { AdminAuditPage } from './pages/admin-audit-page.js';
import { AdminBoundariesPage } from './pages/admin-boundaries-page.js';
import { AdminComputersPage } from './pages/admin-computers-page.js';
import { AdminCredentialsPage } from './pages/admin-credentials-page.js';
import { AdminIdentityPage } from './pages/admin-identity-page.js';
import { AdminPage } from './pages/admin-page.js';
import { AdminPeoplePage } from './pages/admin-people-page.js';
import { AdminPluginPage } from './pages/admin-plugin-page.js';
import { AdminPluginToolPage } from './pages/admin-plugin-tool-page.js';
import { AdminPluginsPage } from './pages/admin-plugins-page.js';
import { AgentsPage } from './pages/agents-page.js';
import { HomePage } from './pages/home-page.js';
import { NewChannelPage } from './pages/new-channel-page.js';
import { RoutinesPage } from './pages/routines-page.js';
import { SettingsPage } from './pages/settings-page.js';
import { SkillsPage } from './pages/skills-page.js';
import './styles.css';

const queryClient = new QueryClient();

applyDarkTheme(parseStoredDarkTheme(window.localStorage.getItem(THEME_STORAGE_KEY)));

function RootScreen() {
  const { ready } = useAuth();
  if (!ready) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  return <Outlet />;
}

function SignScreen() {
  const { auth, user } = useAuth();
  if (user) {
    return <Navigate to="/" />;
  }
  return <SignPage auth={auth} />;
}

function AuthedScreen() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/sign" />;
  }
  return (
    <SidebarProvider>
      <div className="flex h-svh overflow-hidden">
        <AppSidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

function ChannelScreen() {
  const params: unknown = channelRoute.useParams();
  const search = readChannelSearch(searchRecord(channelRoute.useSearch()));
  const navigate = channelRoute.useNavigate();
  return (
    <ChannelPage
      channelId={readRouteString(params, 'channelId', 'general')}
      pane={paneFromSearch(search)}
      onPane={(next) => {
        void navigate({ search: searchForPane(next) });
      }}
    />
  );
}

function PluginScreen() {
  const params: unknown = adminPluginRoute.useParams();
  return <AdminPluginPage pluginId={readRouteString(params, 'pluginId', '')} />;
}

function PluginToolScreen() {
  const params: unknown = adminPluginToolRoute.useParams();
  return (
    <AdminPluginToolPage
      pluginId={readRouteString(params, 'pluginId', '')}
      toolName={readRouteString(params, 'toolName', '')}
    />
  );
}

const rootRoute = createRootRoute({ component: RootScreen });
const signRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign',
  component: SignScreen,
});
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: AuthedScreen,
});
const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: HomePage,
});
const newChannelRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/channel/new',
  component: NewChannelPage,
});
const channelRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/channel/$channelId',
  validateSearch: (search: Record<string, unknown>) => readChannelSearch(search),
  component: ChannelScreen,
});
const agentsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/agents',
  component: AgentsPage,
});
const routinesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/routines',
  component: RoutinesPage,
});
const skillsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/skills',
  component: SkillsPage,
});
const adminRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin',
  component: AdminPage,
});
const adminAuditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/audit',
  component: AdminAuditPage,
});
const adminBoundariesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/boundaries',
  component: AdminBoundariesPage,
});
const adminComputersRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/computers',
  component: AdminComputersPage,
});
const adminPluginsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/plugins',
  component: AdminPluginsPage,
});
const adminPluginRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/plugins/$pluginId',
  component: PluginScreen,
});
const adminPluginToolRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/plugins/$pluginId/tools/$toolName',
  component: PluginToolScreen,
});
const adminPeopleRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/people',
  component: AdminPeoplePage,
});
const adminCredentialsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/credentials',
  component: AdminCredentialsPage,
});
const adminIdentityRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/identity-providers',
  component: AdminIdentityPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  signRoute,
  authedRoute.addChildren([
    indexRoute,
    newChannelRoute,
    channelRoute,
    agentsRoute,
    routinesRoute,
    skillsRoute,
    adminRoute,
    adminAuditRoute,
    adminBoundariesRoute,
    adminComputersRoute,
    adminPluginsRoute,
    adminPluginRoute,
    adminPluginToolRoute,
    adminPeopleRoute,
    adminCredentialsRoute,
    adminIdentityRoute,
    settingsRoute,
  ]),
]);

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <Navigate to="/" />,
});

const element = document.querySelector('#root');
if (!element) {
  throw new Error('root element missing');
}

createRoot(element).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
