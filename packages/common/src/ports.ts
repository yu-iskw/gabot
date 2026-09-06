export type VerifiedPerson = {
  id: string;
  email: string;
  name: string;
};

export type PeopleAuthPort = {
  verifyIdToken(token: string): Promise<VerifiedPerson>;
};

export type AgentIdentityPort = {
  principal(serviceName: string): string;
  signServiceToken(audience: string, serviceName: string): string;
  verifyServiceToken(token: string, audience: string): { serviceName: string; principal: string };
};

export type RegistryEntry = {
  id: string;
  kind: 'agent' | 'mcp-server';
  url: string;
  displayName: string;
};

export type RegistryPort = {
  list(): RegistryEntry[];
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCallId?: string;
  toolName?: string;
};

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelTurn = {
  text: string;
  toolCalls: ModelToolCall[];
};

export type ModelPort = {
  complete(input: {
    messages: ChatMessage[];
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }): Promise<ModelTurn>;
};
