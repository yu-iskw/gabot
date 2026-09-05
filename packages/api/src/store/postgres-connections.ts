import {
  capabilityGrantId,
  defaultOwnerConnections,
  defaultOwnerGrants,
  ownerConnectionId,
} from '@gabot/common';

import type { CapabilityGrantRecord, OwnerConnectionRecord } from './types.js';
import type postgres from 'postgres';

type TxSql = postgres.TransactionSql;
type Sql = ReturnType<typeof postgres>;

export async function insertDefaultOwnerConnections(
  sql: TxSql,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  for (const connection of defaultOwnerConnections(workspaceId, ownerUserId)) {
    await sql`
      INSERT INTO connections (
        id, workspace_id, owner_user_id, provider, credential_ref, status
      )
      VALUES (
        ${connection.id}, ${connection.workspaceId}, ${connection.ownerUserId},
        ${connection.provider}, ${connection.credentialRef}, ${connection.status}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
  for (const grant of defaultOwnerGrants(workspaceId, ownerUserId)) {
    await sql`
      INSERT INTO capability_grants (id, connection_id, capability, resource, granted_by)
      VALUES (
        ${grant.id}, ${grant.connectionId}, ${grant.capability}, ${grant.resource},
        ${grant.grantedBy}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

export async function selectOwnerConnections(
  sql: Sql,
  workspaceId: string,
): Promise<OwnerConnectionRecord[]> {
  const rows = await sql<
    {
      credential_ref: string;
      id: string;
      owner_user_id: string;
      provider: string;
      status: string;
      workspace_id: string;
    }[]
  >`
    SELECT id, workspace_id, owner_user_id, provider, credential_ref, status
    FROM connections WHERE workspace_id = ${workspaceId} ORDER BY provider
  `;
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    credentialRef: row.credential_ref,
    status: row.status === 'revoked' ? 'revoked' : 'active',
  }));
}

export async function selectCapabilityGrants(
  sql: Sql,
  workspaceId: string,
): Promise<CapabilityGrantRecord[]> {
  return sql<CapabilityGrantRecord[]>`
    SELECT g.id, g.connection_id AS "connectionId", g.capability, g.resource,
           COALESCE(g.granted_by, '') AS "grantedBy"
    FROM capability_grants g
    JOIN connections c ON c.id = g.connection_id
    WHERE c.workspace_id = ${workspaceId}
    ORDER BY g.capability, g.resource
  `;
}

export async function upsertCapabilityGrant(
  sql: Sql,
  input: {
    capability: string;
    granted: boolean;
    grantedBy: string;
    ownerUserId: string;
    provider: string;
    resource: string;
    workspaceId: string;
  },
): Promise<void> {
  const connectionId = ownerConnectionId(input.workspaceId, input.provider);
  const owned = await sql<{ id: string }[]>`
    SELECT id FROM connections
    WHERE id = ${connectionId} AND owner_user_id = ${input.ownerUserId}
  `;
  if (!owned.at(0)) {
    throw new Error('Connection not found.');
  }
  const id = capabilityGrantId(connectionId, input.capability, input.resource);
  if (input.granted) {
    await sql`
      INSERT INTO capability_grants (id, connection_id, capability, resource, granted_by)
      VALUES (${id}, ${connectionId}, ${input.capability}, ${input.resource}, ${input.grantedBy})
      ON CONFLICT (id) DO NOTHING
    `;
    return;
  }
  await sql`DELETE FROM capability_grants WHERE id = ${id}`;
}
