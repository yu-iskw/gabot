import { randomUUID } from 'node:crypto';

import {
  contractFail,
  contractOk,
  parseContractList,
  parseNonEmptyString,
  parseOptionalNonEmptyString,
  parseRecord,
  parseStringUnion,
} from './contract-result.js';
import { parseAbsoluteHttpUrl } from './http-origin.js';

import type { CatalogInvocationFlags } from './catalog-stage.js';
import type { ContractResult } from './contract-result.js';

/** Typed catalog entry kinds (ADR 0018). Marketplace tabs filter on these. */
export const CATALOG_ENTRY_TYPES = [
  'bot-template',
  'bot-team-template',
  'skill',
  'mcp-server',
  'a2a-agent',
] as const;

export type CatalogEntryType = (typeof CATALOG_ENTRY_TYPES)[number];

export const PUBLISHER_KINDS = ['builtin', 'workspace', 'remote'] as const;

export type PublisherKind = (typeof PUBLISHER_KINDS)[number];

/** Mention / slash / MCP-server kebab handle (aligns with allocateBotId charset). */
export const CATALOG_SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;

/** Canonical opaque id (UUID string). */
export const CATALOG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keys that must never appear in shareable template declarations. */
export const FORBIDDEN_SECRET_KEYS = [
  'credential_ref',
  'credentialRef',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'api_key',
  'apiKey',
  'token',
  'secret',
  'password',
  'connection_id',
  'connectionId',
] as const;

const FORBIDDEN_SECRET_KEY_SET: ReadonlySet<string> = new Set(FORBIDDEN_SECRET_KEYS);

export type CapabilityRequirement = {
  capability: string;
  resourceHint?: string;
  catalogEntryId?: string;
};

export type BotTemplateDeclaration = {
  name: string;
  title: string;
  instruction: string;
  skillIds: readonly string[];
  capabilityReqs: readonly CapabilityRequirement[];
  neverList: readonly string[];
};

export type BotTeamMember = {
  botTemplateId: string;
  role: string;
};

export type BotTeamTemplateDeclaration = {
  name: string;
  description: string;
  members: readonly BotTeamMember[];
};

export type SkillDeclaration = {
  title: string;
  summary: string;
  instructions: string;
  capabilityReqs: readonly CapabilityRequirement[];
};

export type McpServerDeclaration = {
  title: string;
  summary: string;
  /** Transport URL pattern or discovery URL; must not embed secrets. */
  transportUrlPattern: string;
  /** MCP Server Card style machine name; equals catalog slug when published. */
  serverName: string;
};

export type A2AAgentDeclaration = {
  title: string;
  summary: string;
  agentCardUrl: string;
  trustTier: string;
  /**
   * Remote A2A card skill ids (discovery metadata only).
   * These are NOT gabot Skill row ids or slugs.
   */
  remoteSkillIds: readonly string[];
};

export type CatalogEntryIdentity = {
  id: string;
  slug: string;
  entryType: CatalogEntryType;
  version: string;
  publisherKind: PublisherKind;
};

export type InstallChecklistItem =
  | { kind: 'missingConnect'; capability: string; catalogEntryId?: string }
  | { kind: 'missingGrant'; capability: string; resourceHint?: string; catalogEntryId?: string }
  | { kind: 'ready' };

export type InstallChecklist = {
  items: readonly InstallChecklistItem[];
  ready: boolean;
};

export function newCatalogId(): string {
  return randomUUID();
}

export function isCatalogUuid(value: string): boolean {
  return CATALOG_UUID_RE.test(value);
}

export function isCatalogSlug(value: string): boolean {
  return CATALOG_SLUG_RE.test(value);
}

export function parseCatalogUuid(
  value: unknown,
  reason = 'Catalog id must be a UUID.',
): ContractResult<string> {
  const raw = parseNonEmptyString(value, reason);
  if (!raw.ok) {
    return raw;
  }
  if (!isCatalogUuid(raw.value)) {
    return contractFail(reason);
  }
  return contractOk(raw.value.toLowerCase());
}

export function parseCatalogSlug(
  value: unknown,
  reason = 'Catalog slug is invalid.',
): ContractResult<string> {
  const raw = parseNonEmptyString(value, reason);
  if (!raw.ok) {
    return raw;
  }
  if (!isCatalogSlug(raw.value)) {
    return contractFail(reason);
  }
  return contractOk(raw.value);
}

export function parseCatalogEntryType(value: unknown): ContractResult<CatalogEntryType> {
  return parseStringUnion(
    value,
    CATALOG_ENTRY_TYPES,
    'Catalog entry type is required.',
    'Catalog entry type is not supported.',
  );
}

export function parsePublisherKind(value: unknown): ContractResult<PublisherKind> {
  return parseStringUnion(
    value,
    PUBLISHER_KINDS,
    'Publisher kind is required.',
    'Publisher kind is not supported.',
  );
}

export function parseCatalogEntryIdentity(value: unknown): ContractResult<CatalogEntryIdentity> {
  const record = parseRecord(value, 'Catalog entry identity must be an object.');
  if (!record.ok) {
    return record;
  }
  const id = parseCatalogUuid(record.value.id, 'Catalog entry id must be a UUID.');
  if (!id.ok) {
    return id;
  }
  const slug = parseCatalogSlug(record.value.slug);
  if (!slug.ok) {
    return slug;
  }
  const entryType = parseCatalogEntryType(record.value.entryType);
  if (!entryType.ok) {
    return entryType;
  }
  const version = parseNonEmptyString(record.value.version, 'Catalog entry version is required.');
  if (!version.ok) {
    return version;
  }
  const publisherKind = parsePublisherKind(record.value.publisherKind);
  if (!publisherKind.ok) {
    return publisherKind;
  }
  return contractOk({
    id: id.value,
    slug: slug.value,
    entryType: entryType.value,
    version: version.value,
    publisherKind: publisherKind.value,
  });
}

/**
 * Reject shareable declarations that embed credential or connection material.
 * Walks plain objects and arrays; does not follow prototypes.
 */
export function assertNoSecretsInDeclaration(value: unknown): ContractResult<void> {
  const forbidden = findForbiddenSecretKey(value, []);
  if (forbidden) {
    return contractFail(`Shareable declaration must not include secret field ${forbidden}.`);
  }
  return contractOk(undefined);
}

export function parseCapabilityRequirement(value: unknown): ContractResult<CapabilityRequirement> {
  const record = parseSecretFreeRecord(value, 'Capability requirement must be an object.');
  if (!record.ok) {
    return record;
  }
  const capability = parseNonEmptyString(record.value.capability, 'capability is required.');
  if (!capability.ok) {
    return capability;
  }
  const resourceHint = parseOptionalNonEmptyString(
    record.value.resourceHint,
    'resourceHint must be a string.',
  );
  if (!resourceHint.ok) {
    return resourceHint;
  }
  const catalogEntryId = parseOptionalCatalogUuid(
    record.value.catalogEntryId,
    'capability catalogEntryId must be a UUID.',
  );
  if (!catalogEntryId.ok) {
    return catalogEntryId;
  }
  return contractOk({
    capability: capability.value,
    ...(resourceHint.value === undefined ? {} : { resourceHint: resourceHint.value }),
    ...(catalogEntryId.value === undefined ? {} : { catalogEntryId: catalogEntryId.value }),
  });
}

export function parseBotTemplateDeclaration(
  value: unknown,
): ContractResult<BotTemplateDeclaration> {
  const record = parseSecretFreeRecord(value, 'Bot template declaration must be an object.');
  if (!record.ok) {
    return record;
  }
  const name = parseNonEmptyString(record.value.name, 'Bot template name is required.');
  if (!name.ok) {
    return name;
  }
  const title = parseNonEmptyString(record.value.title, 'Bot template title is required.');
  if (!title.ok) {
    return title;
  }
  const instruction = parseNonEmptyString(
    record.value.instruction,
    'Bot template instruction is required.',
  );
  if (!instruction.ok) {
    return instruction;
  }
  const skillIds = parseContractList(record.value.skillIds, 'skillIds', (item) =>
    parseCatalogUuid(item, 'skillIds entries must be UUIDs.'),
  );
  if (!skillIds.ok) {
    return skillIds;
  }
  const capabilityReqs = parseContractList(
    record.value.capabilityReqs,
    'capabilityReqs',
    parseCapabilityRequirement,
  );
  if (!capabilityReqs.ok) {
    return capabilityReqs;
  }
  const neverList = parseContractList(record.value.neverList, 'neverList', (item) =>
    parseNonEmptyString(item, 'neverList entries must be strings.'),
  );
  if (!neverList.ok) {
    return neverList;
  }
  return contractOk({
    name: name.value,
    title: title.value,
    instruction: instruction.value,
    skillIds: skillIds.value,
    capabilityReqs: capabilityReqs.value,
    neverList: neverList.value,
  });
}

export function parseBotTeamTemplateDeclaration(
  value: unknown,
): ContractResult<BotTeamTemplateDeclaration> {
  const record = parseSecretFreeRecord(value, 'Bot team template declaration must be an object.');
  if (!record.ok) {
    return record;
  }
  const name = parseNonEmptyString(record.value.name, 'Bot team name is required.');
  if (!name.ok) {
    return name;
  }
  const description = parseNonEmptyString(
    record.value.description,
    'Bot team description is required.',
  );
  if (!description.ok) {
    return description;
  }
  const members = parseContractList(record.value.members, 'members', parseBotTeamMember);
  if (!members.ok) {
    return members;
  }
  if (members.value.length === 0) {
    return contractFail('Bot team members must not be empty.');
  }
  return contractOk({
    name: name.value,
    description: description.value,
    members: members.value,
  });
}

export function parseSkillDeclaration(value: unknown): ContractResult<SkillDeclaration> {
  const record = parseSecretFreeRecord(value, 'Skill declaration must be an object.');
  if (!record.ok) {
    return record;
  }
  const title = parseNonEmptyString(record.value.title, 'Skill title is required.');
  if (!title.ok) {
    return title;
  }
  const summary = parseNonEmptyString(record.value.summary, 'Skill summary is required.');
  if (!summary.ok) {
    return summary;
  }
  const instructions = parseNonEmptyString(
    record.value.instructions,
    'Skill instructions are required.',
  );
  if (!instructions.ok) {
    return instructions;
  }
  const capabilityReqs = parseContractList(
    record.value.capabilityReqs,
    'capabilityReqs',
    parseCapabilityRequirement,
  );
  if (!capabilityReqs.ok) {
    return capabilityReqs;
  }
  return contractOk({
    title: title.value,
    summary: summary.value,
    instructions: instructions.value,
    capabilityReqs: capabilityReqs.value,
  });
}

export function parseMcpServerDeclaration(value: unknown): ContractResult<McpServerDeclaration> {
  const record = parseSecretFreeRecord(value, 'MCP server declaration must be an object.');
  if (!record.ok) {
    return record;
  }
  const title = parseNonEmptyString(record.value.title, 'MCP server title is required.');
  if (!title.ok) {
    return title;
  }
  const summary = parseNonEmptyString(record.value.summary, 'MCP server summary is required.');
  if (!summary.ok) {
    return summary;
  }
  const transportUrlPattern = parseNonEmptyString(
    record.value.transportUrlPattern,
    'MCP transportUrlPattern is required.',
  );
  if (!transportUrlPattern.ok) {
    return transportUrlPattern;
  }
  if (looksLikeEmbeddedSecret(transportUrlPattern.value)) {
    return contractFail('MCP transportUrlPattern must not embed credentials.');
  }
  const serverName = parseCatalogSlug(
    record.value.serverName,
    'MCP serverName must be a kebab slug.',
  );
  if (!serverName.ok) {
    return serverName;
  }
  return contractOk({
    title: title.value,
    summary: summary.value,
    transportUrlPattern: transportUrlPattern.value,
    serverName: serverName.value,
  });
}

export function parseA2AAgentDeclaration(value: unknown): ContractResult<A2AAgentDeclaration> {
  const record = parseSecretFreeRecord(value, 'A2A agent declaration must be an object.');
  if (!record.ok) {
    return record;
  }
  const title = parseNonEmptyString(record.value.title, 'A2A agent title is required.');
  if (!title.ok) {
    return title;
  }
  const summary = parseNonEmptyString(record.value.summary, 'A2A agent summary is required.');
  if (!summary.ok) {
    return summary;
  }
  const agentCardUrl = parseAbsoluteHttpUrl(record.value.agentCardUrl, 'A2A agentCardUrl');
  if (!agentCardUrl.ok) {
    return agentCardUrl;
  }
  const trustTier = parseNonEmptyString(record.value.trustTier, 'A2A trustTier is required.');
  if (!trustTier.ok) {
    return trustTier;
  }
  const remoteSkillIds = parseContractList(record.value.remoteSkillIds, 'remoteSkillIds', (item) =>
    parseNonEmptyString(item, 'remoteSkillIds entries must be strings.'),
  );
  if (!remoteSkillIds.ok) {
    return remoteSkillIds;
  }
  return contractOk({
    title: title.value,
    summary: summary.value,
    agentCardUrl: agentCardUrl.value.href,
    trustTier: trustTier.value,
    remoteSkillIds: remoteSkillIds.value,
  });
}

/** Build an install checklist; missing connect/grant wins over ready. */
export function buildInstallChecklist(
  requirements: readonly CapabilityRequirement[],
  flagsByCapability: ReadonlyMap<string, CatalogInvocationFlags>,
): InstallChecklist {
  const items = requirements.flatMap((req) =>
    checklistGap(req, flagsByCapability.get(req.capability)),
  );
  return items.length === 0 ? { items: [{ kind: 'ready' }], ready: true } : { items, ready: false };
}

function checklistGap(
  req: CapabilityRequirement,
  flags: CatalogInvocationFlags | undefined,
): InstallChecklistItem[] {
  if (!flags?.connected) {
    return [
      {
        kind: 'missingConnect',
        capability: req.capability,
        ...(req.catalogEntryId === undefined ? {} : { catalogEntryId: req.catalogEntryId }),
      },
    ];
  }
  if (!flags.granted) {
    return [
      {
        kind: 'missingGrant',
        capability: req.capability,
        ...(req.resourceHint === undefined ? {} : { resourceHint: req.resourceHint }),
        ...(req.catalogEntryId === undefined ? {} : { catalogEntryId: req.catalogEntryId }),
      },
    ];
  }
  return [];
}

export function mcpToolWireName(serverSlug: string, toolName: string): string {
  return `mcp__${serverSlug}__${toolName}`;
}

/**
 * Gabot Skill rows use UUID primary keys. A2A agent-card `skills[].id` values are
 * card-local discovery labels and must not be treated as Skill row ids without mapping.
 */
export function looksLikeGabotSkillRowId(value: string): boolean {
  return isCatalogUuid(value);
}

function parseSecretFreeRecord(
  value: unknown,
  reason: string,
): ContractResult<Record<string, unknown>> {
  const record = parseRecord(value, reason);
  if (!record.ok) {
    return record;
  }
  const secrets = assertNoSecretsInDeclaration(record.value);
  if (!secrets.ok) {
    return secrets;
  }
  return record;
}

function parseOptionalCatalogUuid(
  value: unknown,
  reason: string,
): ContractResult<string | undefined> {
  if (value === undefined || value === null) {
    return contractOk(undefined);
  }
  return parseCatalogUuid(value, reason);
}

function parseBotTeamMember(value: unknown): ContractResult<BotTeamMember> {
  const record = parseRecord(value, 'Bot team member must be an object.');
  if (!record.ok) {
    return record;
  }
  const botTemplateId = parseCatalogUuid(
    record.value.botTemplateId,
    'botTemplateId must be a UUID.',
  );
  if (!botTemplateId.ok) {
    return botTemplateId;
  }
  const role = parseNonEmptyString(record.value.role, 'Bot team member role is required.');
  if (!role.ok) {
    return role;
  }
  return contractOk({ botTemplateId: botTemplateId.value, role: role.value });
}

function findForbiddenSecretKey(value: unknown, path: string[]): string | undefined {
  if (Array.isArray(value)) {
    return firstForbidden(
      value.map((item, index) => findForbiddenSecretKey(item, [...path, String(index)])),
    );
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return firstForbidden(
    Object.entries(value as Record<string, unknown>).map(([key, child]) =>
      FORBIDDEN_SECRET_KEY_SET.has(key)
        ? path.length === 0
          ? key
          : `${path.join('.')}.${key}`
        : findForbiddenSecretKey(child, [...path, key]),
    ),
  );
}

function firstForbidden(candidates: Array<string | undefined>): string | undefined {
  return candidates.find((item): item is string => item !== undefined);
}

function looksLikeEmbeddedSecret(url: string): boolean {
  return (
    /[?&](access_token|api_key|token|password|secret)=/i.test(url) ||
    /:\/\/[^/@]+:[^/@]+@/.test(url)
  );
}
