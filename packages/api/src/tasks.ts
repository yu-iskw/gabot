import {
  digestTaskAdmitRequest,
  membershipCoversWorkspace,
  mentionedBotId,
  parseTaskAdmitRequest,
  rootAuthority,
  TURN_TOOL_NAMES,
} from '@gabot/common';

import { PROTECTED_AGENT_ID, TaskIdempotencyConflictError } from './store/types.js';
import { isTurnClientError } from './turns.js';

import type { AdmittedTask, GabotStore, SessionUser } from './store/types.js';

class TaskAdmitClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TaskAdmitClientError';
  }
}

function isTaskAdmitClientError(error: unknown): boolean {
  return error instanceof TaskAdmitClientError;
}

function isTaskIdempotencyConflict(error: unknown): boolean {
  return error instanceof TaskIdempotencyConflictError;
}

type AdmitTaskDeps = {
  store: GabotStore;
  user: SessionUser;
};

export async function admitTaskRequest(
  deps: AdmitTaskDeps,
  body: unknown,
): Promise<AdmittedTask> {
  const parsed = parseTaskAdmitRequest(body);
  if (!parsed.ok) {
    throw new TaskAdmitClientError(parsed.reason);
  }
  const request = parsed.value;
  const botId =
    request.botId ??
    mentionedBotId(request.objective) ??
    (await defaultParticipantBotId(deps.store, request.channelId));
  const [scope, participating, membership] = await Promise.all([
    deps.store.getChannelScope(request.channelId),
    deps.store.isChannelParticipant(request.channelId, 'bot', botId),
    deps.store.getMembership(deps.user.id),
  ]);
  if (!scope) {
    throw new TaskAdmitClientError(`Channel ${request.channelId} is not in a workspace project.`);
  }
  if (!participating) {
    throw new TaskAdmitClientError(`Bot ${botId} is not a participant on channel ${request.channelId}.`);
  }
  if (!membershipCoversWorkspace(membership, scope.workspaceId)) {
    throw new TaskAdmitClientError(
      'Active workspace membership is required to admit a task on this channel.',
    );
  }
  return deps.store.admitTask({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    channelId: request.channelId,
    botId,
    ownerUserId: deps.user.id,
    objective: request.objective,
    audience: request.audience,
    successCriteria: request.successCriteria,
    resourceScope: request.resources,
    idempotencyKey: request.idempotencyKey,
    requestDigest: digestTaskAdmitRequest({ ...request, botId }),
    authority: rootAuthority(TURN_TOOL_NAMES),
  });
}

async function defaultParticipantBotId(store: GabotStore, channelId: string): Promise<string> {
  const bots = (await store.listChannelParticipants(channelId))
    .filter((row) => row.principalType === 'bot')
    .map((row) => row.principalId);
  if (bots.includes(PROTECTED_AGENT_ID)) {
    return PROTECTED_AGENT_ID;
  }
  const fallback = bots[0];
  if (!fallback) {
    throw new TaskAdmitClientError(`No bot is a participant on channel ${channelId}.`);
  }
  return fallback;
}

export function mapTaskHttpError(error: unknown): { message: string; status: 400 | 409 | 500 } {
  if (isTaskIdempotencyConflict(error)) {
    return { status: 409, message: error instanceof Error ? error.message : 'conflict' };
  }
  if (isTaskAdmitClientError(error) || isTurnClientError(error)) {
    return { status: 400, message: error instanceof Error ? error.message : String(error) };
  }
  return { status: 500, message: error instanceof Error ? error.message : String(error) };
}
