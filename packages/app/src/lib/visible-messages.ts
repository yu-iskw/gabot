type ChatMessage = {
  content: string;
  id: string;
  role: string;
};

export function visibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message, index) => shouldShow(messages, index, message));
}

function shouldShow(messages: ChatMessage[], index: number, message: ChatMessage): boolean {
  if (message.role !== 'assistant' || index === 0) {
    return true;
  }
  const previous = messages[index - 1];
  if (previous.role !== 'tool') {
    return true;
  }
  return !assistantRestatesTool(previous.content, message.content);
}

function assistantRestatesTool(tool: string, assistant: string): boolean {
  const toolLower = tool.toLowerCase();
  const text = assistant.toLowerCase();
  if (text.length === 0) {
    return true;
  }
  if (toolLower.includes(text) || text.includes(toolLower)) {
    return true;
  }
  if (toolLower.includes('created bot') && text.includes('created')) {
    return true;
  }
  if (toolLower.startsWith('scheduled') && text.includes('scheduled')) {
    return true;
  }
  if (toolLower.startsWith('opened') && text.includes('opened')) {
    return true;
  }
  return toolLower.includes('not granted') && (text.includes('grant') || text.includes('refus'));
}
