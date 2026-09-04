import {
  getChipsByTrigger,
  isSegmentsEmpty,
  mergeAdjacentTextSegments,
  segmentsToPlainText,
  text,
} from 'prompt-area/helpers';

import type { Segment } from 'prompt-area/helpers';

export const AGENT_TRIGGER = '@';
export const COMMAND_TRIGGER = '/';

type ComposerDraft = {
  agentId: string | null;
  commandIds: string[];
  isEmpty: boolean;
  text: string;
};

export type CommandKind = 'action' | 'chip' | 'prompt';

export type CommandOption = {
  description?: string;
  id: string;
  kind?: CommandKind;
  name: string;
  prompt?: string;
  run?: () => void;
};

type AppliedCommands = {
  actions: Array<() => void>;
  segments: Segment[];
};

export function toDraft(segments: Segment[]): ComposerDraft {
  const agentChips = getChipsByTrigger(segments, AGENT_TRIGGER);
  const commandChips = getChipsByTrigger(segments, COMMAND_TRIGGER);
  return {
    text: segmentsToPlainText(segments).trim(),
    agentId: agentChips.at(-1)?.value ?? null,
    commandIds: commandChips.map((chip) => chip.value),
    isEmpty: isSegmentsEmpty(segments),
  };
}

export function enforceSingleAgent(segments: Segment[]): Segment[] {
  const agentChipCount = getChipsByTrigger(segments, AGENT_TRIGGER).length;
  if (agentChipCount <= 1) {
    return segments;
  }
  let remaining = agentChipCount;
  const kept = segments.filter((segment) => {
    if (segment.type !== 'chip' || segment.trigger !== AGENT_TRIGGER) {
      return true;
    }
    remaining -= 1;
    return remaining === 0;
  });
  return mergeAdjacentTextSegments(kept);
}

export function applyCommandChips(
  segments: Segment[],
  commands: readonly CommandOption[],
): AppliedCommands {
  const byId = new Map(commands.map((command) => [command.id, command]));
  const actions: Array<() => void> = [];
  const rewritten = segments.flatMap((segment) => rewriteCommand(segment, byId, actions));
  return {
    segments: mergeAdjacentTextSegments(rewritten),
    actions,
  };
}

function rewriteCommand(
  segment: Segment,
  byId: Map<string, CommandOption>,
  actions: Array<() => void>,
): Segment[] {
  if (segment.type !== 'chip' || segment.trigger !== COMMAND_TRIGGER) {
    return [segment];
  }
  const command = byId.get(segment.value);
  const kind = command?.kind ?? 'chip';
  if (kind === 'prompt') {
    return command?.prompt ? [text(command.prompt)] : [];
  }
  if (kind === 'action') {
    if (command?.run) {
      actions.push(command.run);
    }
    return [];
  }
  return [segment];
}
