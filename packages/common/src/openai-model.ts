import type { ChatMessage, ModelPort, ModelTurn } from './ports.js';

type OpenAiToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
};

export function createOpenAiCompatibleModel(baseUrl: string, apiKey = 'scripted'): ModelPort {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async complete(input): Promise<ModelTurn> {
      const response = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gabot-scripted',
          messages: toOpenAiMessages(input.messages),
          tools: input.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`Model HTTP ${String(response.status)}`);
      }
      const body = (await response.json()) as OpenAiResponse;
      return fromOpenAi(body);
    },
  };
}

export function toOpenAiMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.toolName,
      };
    }
    return { role: message.role, content: message.content };
  });
}

function fromOpenAi(body: OpenAiResponse): ModelTurn {
  const message = body.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: parseArguments(call.function.arguments),
  }));
  return { text: message?.content ?? '', toolCalls };
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
