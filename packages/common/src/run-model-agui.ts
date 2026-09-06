import type { AguiEvent, AguiRunInput } from './ag-ui.js';
import type { ChatMessage, ModelPort } from './ports.js';

export async function runModelAsAgui(model: ModelPort, input: AguiRunInput): Promise<AguiEvent[]> {
  const messageId = `msg_${input.runId}`;
  const events: AguiEvent[] = [
    { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
  ];
  const turn = await model.complete({
    messages: toChat(input),
    tools: input.tools,
  });
  if (turn.text) {
    events.push({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
    events.push({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: turn.text });
    events.push({ type: 'TEXT_MESSAGE_END', messageId });
  }
  for (const call of turn.toolCalls) {
    events.push({
      type: 'TOOL_CALL_START',
      toolCallId: call.id,
      toolCallName: call.name,
      parentMessageId: messageId,
    });
    events.push({
      type: 'TOOL_CALL_ARGS',
      toolCallId: call.id,
      delta: JSON.stringify(call.arguments),
    });
    events.push({ type: 'TOOL_CALL_END', toolCallId: call.id });
  }
  events.push({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId });
  return events;
}

function toChat(input: AguiRunInput): ChatMessage[] {
  return input.messages.map((message) => ({
    role: message.role,
    content: message.content,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
  }));
}
