import {
  capabilityGrantId,
  defaultOwnerConnections,
  defaultOwnerGrants,
  ownerConnectionId,
} from '@gabot/common';

import type {
  CapabilityGrantRecord,
  CapabilityGrantWrite,
  OwnerConnectionRecord,
} from './types.js';
import type postgres from 'postgres';

type TxSql = postgres.TransactionSql;
type Sql = ReturnType<typeof postgres>;

export async function insertDefaultOwnerConnections(
  sql: TxSql,
  workspaceId: string,
  ownerUserId: string,
  seedGrants: boolean,
): Promise<void> {
  const connections = defaultOwnerConnections(workspaceId, ownerUserId);
  await sql`
    INSERT INTO connections ${sql(
      connections.map((connection) => ({
        id: connection.id,
        workspace_id: connection.workspaceId,
        owner_user_id: connection.ownerUserId,
        provider: connection.provider,
        credential_ref: connection.credentialRef,
        status: connection.status,
      })),
    )}
    ON CONFLICT (id) DO NOTHING
  `;
  if (!seedGrants) {
    return;
  }
  const grants = defaultOwnerGrants(workspaceId, ownerUserId);
  await sql`
    INSERT INTO capability_grants ${sql(
      grants.map((grant) => ({
        id: grant.id,
        connection_id: grant.connectionId,
        capability: grant.capability,
        resource: grant.resource,
        granted_by: grant.grantedBy,
      })),
    )}
    ON CONFLICT (connection_id, capability, resource) DO NOTHING
  `;
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

export async function upsertCapabilityGrant(sql: Sql, input: CapabilityGrantWrite): Promise<void> {
  const connectionId = ownerConnectionId(input.workspaceId, input.provider);
  const id = capabilityGrantId(connectionId, input.capability, input.resource);
  await sql.begin(async (tx) => {
    const owned = await tx<{ id: string }[]>`
      SELECT id FROM connections
      WHERE id = ${connectionId} AND owner_user_id = ${input.ownerUserId}
      FOR UPDATE
    `;
    if (!owned.at(0)) {
      throw new Error('Connection not found.');
    }
    if (input.granted) {
      await tx`
        INSERT INTO capability_grants (id, connection_id, capability, resource, granted_by)
        VALUES (${id}, ${connectionId}, ${input.capability}, ${input.resource}, ${input.grantedBy})
        ON CONFLICT (connection_id, capability, resource) DO NOTHING
      `;
      return;
    }
    await tx`
      DELETE FROM capability_grants
      WHERE connection_id = ${connectionId}
        AND capability = ${input.capability}
        AND resource = ${input.resource}
    `;
  });
}
