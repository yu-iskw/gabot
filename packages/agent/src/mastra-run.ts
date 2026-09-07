import { MastraAgent } from '@ag-ui/mastra';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { collectAguiObservable, toRunAgentInput } from '@gabot/common';
import { Agent } from '@mastra/core/agent';

import type { Message, RunAgentInput } from '@ag-ui/core';
import type { AguiEvent, AguiRunInput } from '@gabot/common';

const DEFAULT_VERTEX_MODEL = 'gemini-2.5-flash';

const MASTRA_COWORKER_ID = 'gabot-mastra-coworker';

type MastraEndpointModel = {
  apiKey?: string;
  id: `${string}/${string}`;
  url: string;
};

/** Mastra Agent `model`: Vertex via @ai-sdk/google-vertex, or Mastra custom endpoint config. */
export type MastraModelRef =
  | { kind: 'google-vertex'; model: ReturnType<ReturnType<typeof createGoogleVertex>> }
  | { kind: 'mastra-scripted'; model: MastraEndpointModel };

export type ResolveMastraModelInput = {
  location?: string;
  modelId?: string;
  projectId?: string;
  provider?: string;
  scriptedBaseUrl?: string;
};

/**
 * Resolve a Mastra Agent `model` value.
 * @see https://mastra.ai/models/providers/google-vertex
 * @see https://mastra.ai/docs/agents/overview
 */
export function resolveMastraModel(input: ResolveMastraModelInput = {}): MastraModelRef {
  const provider = (input.provider ?? 'mastra-scripted').toLowerCase();
  if (provider === 'vertex' || provider === 'google-vertex') {
    const projectId = input.projectId;
    if (!projectId) {
      throw new Error('GOOGLE_VERTEX_PROJECT (or GOOGLE_CLOUD_PROJECT) is required for Vertex.');
    }
    const vertex = createGoogleVertex({
      project: projectId,
      location: input.location ?? 'global',
    });
    return {
      kind: 'google-vertex',
      model: vertex(input.modelId ?? DEFAULT_VERTEX_MODEL),
    };
  }
  const url = (input.scriptedBaseUrl ?? 'http://scripted-model:4400/v1').replace(/\/$/, '');
  return {
    kind: 'mastra-scripted',
    model: {
      id: 'custom/gabot-scripted',
      url,
      apiKey: 'scripted',
    },
  };
}

/**
 * Run one AG-UI turn via official `@ag-ui/mastra` `MastraAgent`.
 * Tools are `clientTools` (JSON Schema parameters) — executed on the control plane.
 * Observable events are buffered at this boundary for the Hono SSE response.
 */
export async function runMastraAsAgui(options: {
  input: AguiRunInput;
  instructions: string;
  model: MastraModelRef;
}): Promise<AguiEvent[]> {
  const official = toRunAgentInput(options.input);
  const { instructions, messages } = foldSystemIntoInstructions(
    official.messages,
    options.instructions,
  );
  const agent = new Agent({
    id: MASTRA_COWORKER_ID,
    name: MASTRA_COWORKER_ID,
    instructions,
    model: options.model.model,
  });
  const mastraAgent = new MastraAgent({
    agentId: MASTRA_COWORKER_ID,
    agent,
    // Control plane owns tool resume; avoid CopilotKit interrupt-outcome coupling.
    emitInterruptOutcome: false,
  });
  const runInput: RunAgentInput = {
    ...official,
    messages,
  };
  return collectAguiObservable(mastraAgent.run(runInput));
}

/**
 * `@ag-ui/mastra` message conversion only maps user/assistant/tool — fold system
 * into Mastra Agent instructions so identity prompts still apply.
 */
function foldSystemIntoInstructions(
  messages: Message[],
  baseInstructions: string,
): { instructions: string; messages: Message[] } {
  const systemParts: string[] = [];
  const rest: Message[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    rest.push(message);
  }
  const instructions =
    systemParts.length > 0
      ? `${baseInstructions}\n\n${systemParts.join('\n\n')}`
      : baseInstructions;
  return {
    instructions,
    messages: rest.length > 0 ? rest : [{ id: 'msg_continue', role: 'user', content: 'Continue.' }],
  };
}
