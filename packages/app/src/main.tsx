import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
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

import { apiJson } from './api.js';
import { ChannelPage } from './channel-page.js';
import { AppSidebar } from './components/app-sidebar.js';
import { setActiveWorkspaceSlug } from './lib/active-workspace-slug.js';
import { AuthProvider, useAuth } from './lib/auth-context.js';
import {
  paneFromSearch,
  readChannelSearch,
  searchForPane,
  searchRecord,
} from './lib/channel-pane.js';
import { readRouteString } from './lib/route-param.js';
import { SessionProvider } from './lib/session-context.js';
import { SidebarProvider } from './lib/sidebar-context.js';
import { applyDarkTheme, parseStoredDarkTheme, THEME_STORAGE_KEY } from './lib/theme.js';
import { WorkspaceDirectoryProvider } from './lib/workspace-directory-context.js';
import { defaultWorkspaceEntry, fetchWorkspaceDirectory } from './lib/workspace-directory.js';
import { LocatorPage } from './locator-page.js';
import { SignPage } from './login-page.js';
import { AdminAuditPage } from './pages/admin-audit-page.js';
import { AdminBoundariesPage } from './pages/admin-boundaries-page.js';
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
import { TaskPage } from './pages/task-page.js';
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
  const { auth, directory, entry, user } = useAuth();
  if (user && entry) {
    return <Navigate to="/workspaces/$workspaceSlug" params={{ workspaceSlug: entry.slug }} />;
  }
  if (!directory) {
    return <p className="p-6 text-sm text-muted-foreground">Could not load workspaces</p>;
  }
  if (!entry || !auth) {
    return <LocatorPage />;
  }
  return <SignPage auth={auth} entry={entry} />;
}

function AuthedScreen() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/sign" />;
  }
  return <Outlet />;
}

function WorkspaceHomeRedirect() {
  const { directory, entry } = useAuth();
  const slug = entry?.slug ?? (directory ? defaultWorkspaceEntry(directory).slug : 'gabot');
  return <Navigate to="/workspaces/$workspaceSlug" params={{ workspaceSlug: slug }} />;
}

function WorkspaceShell() {
  const params: unknown = workspaceRoute.useParams();
  const workspaceSlug = readRouteString(params, 'workspaceSlug', 'gabot');
  return (
    <WorkspaceDirectoryProvider slug={workspaceSlug}>
      <SessionProvider>
        <SidebarProvider>
          <div className="flex h-svh overflow-hidden">
            <AppSidebar />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </main>
          </div>
        </SidebarProvider>
      </SessionProvider>
    </WorkspaceDirectoryProvider>
  );
}

function ChannelScreen() {
  const params: unknown = workspaceChannelRoute.useParams();
  const search = readChannelSearch(searchRecord(workspaceChannelRoute.useSearch()));
  const navigate = workspaceChannelRoute.useNavigate();
  return (
    <ChannelPage
      channelId={readRouteString(params, 'channelPublicId', '')}
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

function LegacyChannelRedirect() {
  const { token } = useAuth();
  const params: unknown = legacyChannelRoute.useParams();
  const channelId = readRouteString(params, 'channelId', '');
  const listing = useQuery({
    queryKey: ['workspace-directory'],
    queryFn: fetchWorkspaceDirectory,
  });
  const channel = useQuery({
    enabled: listing.data !== undefined && channelId.length > 0,
    queryKey: ['legacy-channel', channelId, listing.data?.workspaces[0]?.slug],
    queryFn: async () => {
      const slug = defaultWorkspaceEntry(listing.data!).slug;
      setActiveWorkspaceSlug(slug);
      const body = await apiJson<{ channels: Array<{ id: string; publicId: string }> }>(
        '/api/channels',
        await token(),
      );
      return body.channels.find((row) => row.id === channelId || row.publicId === channelId);
    },
  });
  if (!listing.data || channel.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Redirecting…</p>;
  }
  const slug = defaultWorkspaceEntry(listing.data).slug;
  if (!channel.data) {
    return <Navigate to="/workspaces/$workspaceSlug" params={{ workspaceSlug: slug }} />;
  }
  return (
    <Navigate
      to="/workspaces/$workspaceSlug/channels/$channelPublicId"
      params={{ workspaceSlug: slug, channelPublicId: channel.data.publicId }}
    />
  );
}

function TaskScreen() {
  const params: unknown = workspaceTaskRoute.useParams();
  return <TaskPage taskId={readRouteString(params, 'taskId', '')} />;
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
  component: WorkspaceHomeRedirect,
});
const legacyChannelRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/channel/$channelId',
  component: LegacyChannelRedirect,
});
const workspaceRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/workspaces/$workspaceSlug',
  component: WorkspaceShell,
});
const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/',
  component: HomePage,
});
const newChannelRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/channels/new',
  component: NewChannelPage,
});
const workspaceChannelRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/channels/$channelPublicId',
  validateSearch: (search: Record<string, unknown>) => readChannelSearch(search),
  component: ChannelScreen,
});
const workspaceTaskRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/tasks/$taskId',
  component: TaskScreen,
});
const agentsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/agents',
  component: AgentsPage,
});
const routinesRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/routines',
  component: RoutinesPage,
});
const skillsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/skills',
  component: SkillsPage,
});
const adminRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin',
  component: AdminPage,
});
const adminAuditRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/audit',
  component: AdminAuditPage,
});
const adminBoundariesRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/boundaries',
  component: AdminBoundariesPage,
});
const adminPluginsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/plugins',
  component: AdminPluginsPage,
});
const adminPluginRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/plugins/$pluginId',
  component: PluginScreen,
});
const adminPluginToolRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/plugins/$pluginId/tools/$toolName',
  component: PluginToolScreen,
});
const adminPeopleRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/people',
  component: AdminPeoplePage,
});
const adminCredentialsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/credentials',
  component: AdminCredentialsPage,
});
const adminIdentityRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/admin/identity-providers',
  component: AdminIdentityPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  signRoute,
  authedRoute.addChildren([
    indexRoute,
    legacyChannelRoute,
    workspaceRoute.addChildren([
      workspaceIndexRoute,
      newChannelRoute,
      workspaceChannelRoute,
      workspaceTaskRoute,
      agentsRoute,
      routinesRoute,
      skillsRoute,
      adminRoute,
      adminAuditRoute,
      adminBoundariesRoute,
      adminPluginsRoute,
      adminPluginRoute,
      adminPluginToolRoute,
      adminPeopleRoute,
      adminCredentialsRoute,
      adminIdentityRoute,
      settingsRoute,
    ]),
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
