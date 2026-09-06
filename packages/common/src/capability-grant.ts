export const PROVIDER_GABOT = 'gabot';
export const PROVIDER_MOCK_MCP = 'mock-mcp';
export const PROVIDER_GITHUB = 'github';

export const CAPABILITY_MCP_ECHO = 'mcp:mock/echo';
export const CAPABILITY_COMPONENT_NOTE = 'component:component_note';
export const CAPABILITY_GITHUB_ISSUES_CREATE = 'github.issues.create';

export const RESOURCE_MCP_ECHO = 'mock/echo';
export const RESOURCE_COMPONENT_NOTE = 'component_note';
export const GITHUB_ALLOWED_REPO = 'acme/allowed';

export type ConnectionStatus = 'active' | 'revoked';

export type OwnerConnection = {
  credentialRef: string;
  id: string;
  ownerUserId: string;
  provider: string;
  status: ConnectionStatus;
  workspaceId: string;
};

export type CapabilityGrant = {
  capability: string;
  connectionId: string;
  grantedBy: string;
  id: string;
  resource: string;
};

export type GrantMatchInput = {
  capability: string;
  connections: readonly OwnerConnection[];
  grants: readonly CapabilityGrant[];
  ownerUserId: string;
  resource: string;
  workspaceId: string;
};

export type GrantMatch =
  { connection: OwnerConnection; grant: CapabilityGrant; ok: true } | { ok: false; reason: string };

const DEFAULT_CONNECTION_SEEDS = [
  { credentialRef: 'local', provider: PROVIDER_GABOT },
  { credentialRef: 'mcp-mock', provider: PROVIDER_MOCK_MCP },
  { credentialRef: 'github-stub', provider: PROVIDER_GITHUB },
] as const;

export function ownerConnectionId(workspaceId: string, provider: string): string {
  return `conn-${workspaceId}-${provider}`;
}

export function capabilityGrantId(
  connectionId: string,
  capability: string,
  resource: string,
): string {
  return `cg-${grantIdPart(connectionId)}~${grantIdPart(capability)}~${grantIdPart(resource)}`;
}

function grantIdPart(value: string): string {
  return encodeURIComponent(value).replaceAll('~', '%7E');
}

export function mcpCapabilityForRef(ref: string): string {
  return `mcp:${ref}`;
}

export function defaultOwnerConnections(
  workspaceId: string,
  ownerUserId: string,
): OwnerConnection[] {
  return DEFAULT_CONNECTION_SEEDS.map((seed) => ({
    id: ownerConnectionId(workspaceId, seed.provider),
    workspaceId,
    ownerUserId,
    provider: seed.provider,
    credentialRef: seed.credentialRef,
    status: 'active' as const,
  }));
}

export function defaultOwnerGrants(workspaceId: string, grantedBy: string): CapabilityGrant[] {
  const gabotId = ownerConnectionId(workspaceId, PROVIDER_GABOT);
  const githubId = ownerConnectionId(workspaceId, PROVIDER_GITHUB);
  return [
    {
      id: capabilityGrantId(gabotId, CAPABILITY_COMPONENT_NOTE, RESOURCE_COMPONENT_NOTE),
      connectionId: gabotId,
      capability: CAPABILITY_COMPONENT_NOTE,
      resource: RESOURCE_COMPONENT_NOTE,
      grantedBy,
    },
    {
      id: capabilityGrantId(githubId, CAPABILITY_GITHUB_ISSUES_CREATE, GITHUB_ALLOWED_REPO),
      connectionId: githubId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      grantedBy,
    },
  ];
}

export function matchCapabilityGrant(input: GrantMatchInput): GrantMatch {
  const eligible = input.connections.filter(
    (connection) =>
      connection.status === 'active' &&
      connection.workspaceId === input.workspaceId &&
      connection.ownerUserId === input.ownerUserId,
  );
  for (const connection of eligible) {
    const grant = input.grants.find(
      (row) =>
        row.connectionId === connection.id &&
        row.capability === input.capability &&
        row.resource === input.resource,
    );
    if (grant) {
      return { ok: true, connection, grant };
    }
  }
  return {
    ok: false,
    reason: `Capability ${input.capability} is not granted for ${input.resource}.`,
  };
}
