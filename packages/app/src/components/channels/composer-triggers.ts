import { commandTrigger, mentionTrigger } from 'prompt-area/helpers';

import { AGENT_TRIGGER, COMMAND_TRIGGER, type CommandOption } from './composer-draft.js';

import type { TriggerConfig, TriggerSuggestion } from 'prompt-area/helpers';

type AgentOption = {
  description?: string;
  id: string;
  name: string;
};

export function toAgentOptions(
  profiles: ReadonlyArray<{ id: string; name: string; title?: string }> | undefined,
  permittedIds?: readonly string[],
): AgentOption[] {
  if (!profiles) {
    return [];
  }
  const permitted = permittedIds ? new Set(permittedIds) : null;
  return profiles
    .filter((profile) => !permitted || permitted.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.title,
    }));
}

export function toCommandOptions(
  skills: ReadonlyArray<{ slug: string; summary: string; title: string }> | undefined,
  extras: readonly CommandOption[] = [],
): CommandOption[] {
  const fromSkills = (skills ?? []).map((skill) => ({
    id: skill.slug,
    name: skill.slug,
    description: skill.title || skill.summary,
    kind: 'chip' as const,
  }));
  return [...extras, ...fromSkills];
}

export function buildTriggers({
  agents,
  commands,
}: {
  agents: readonly AgentOption[];
  commands: readonly CommandOption[];
}): TriggerConfig[] {
  return [agentTrigger(agents), slashCommandTrigger(commands)];
}

function matches(query: string, ...fields: Array<string | undefined>): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

function agentTrigger(agents: readonly AgentOption[]): TriggerConfig {
  return mentionTrigger({
    char: AGENT_TRIGGER,
    accessibilityLabel: 'agent',
    reopenOnChipClick: true,
    emptyMessage: 'No agents in this channel',
    onSearch: (query): TriggerSuggestion[] =>
      agents
        .filter((agent) => matches(query, agent.name, agent.description))
        .map((agent) => ({
          value: agent.id,
          label: agent.name,
          description: agent.description,
        })),
    onSelect: (suggestion) => suggestion.label,
  });
}

function slashCommandTrigger(commands: readonly CommandOption[]): TriggerConfig {
  return commandTrigger({
    char: COMMAND_TRIGGER,
    position: 'start',
    accessibilityLabel: 'command',
    emptyMessage: 'No matching commands',
    onSearch: (query): TriggerSuggestion[] =>
      commands
        .filter((command) => matches(query, command.name, command.description))
        .map((command) => ({
          value: command.id,
          label: command.name,
          description: command.description,
        })),
    onSelect: (suggestion) => suggestion.label,
  });
}
