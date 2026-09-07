export type A2AAgentCard = {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
};

export function createMastraAgentCard(url: string): A2AAgentCard {
  return {
    name: 'gabot-mastra-coworker',
    description:
      'Mastra coworker for gabot. Tools execute on the control plane, not in this process.',
    url,
    version: '1.0.0',
    protocolVersion: '0.2.1',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'general',
        name: 'General Assistant',
        description: 'Chat and granted MCP tools.',
        tags: ['chat'],
      },
    ],
  };
}

export function isA2AAgentCard(value: unknown): value is A2AAgentCard {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const card = value as Record<string, unknown>;
  return (
    typeof card.name === 'string' &&
    typeof card.description === 'string' &&
    typeof card.url === 'string' &&
    typeof card.version === 'string' &&
    Array.isArray(card.skills)
  );
}
