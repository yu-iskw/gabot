type ToolCaption = {
  detail?: string;
  failed: boolean;
  label: string;
  refused: boolean;
};

const OPENED_PREFIX = 'Opened ';
const CREATED_BOT_RE = /Created bot (.+?) \(/i;
const SCHEDULED_RE = /Scheduled (.+?) on /i;

export function captionForTool(content: string): ToolCaption {
  const lower = content.toLowerCase();
  const refused = isRefused(lower);
  const failed = lower.includes('failed');
  if (lower.includes('created bot')) {
    return {
      label: 'Created a bot',
      detail: firstGroup(content, CREATED_BOT_RE),
      refused,
      failed,
    };
  }
  if (lower.startsWith('scheduled')) {
    return {
      label: 'Scheduled',
      detail: firstGroup(content, SCHEDULED_RE),
      refused,
      failed,
    };
  }
  if (lower.startsWith('updated routine')) {
    return { label: 'Updated routine', detail: content, refused, failed };
  }
  if (lower.startsWith('delegated')) {
    return { label: 'Delegated', detail: content, refused, failed };
  }
  if (lower.startsWith(OPENED_PREFIX.toLowerCase())) {
    return { label: 'Opened', detail: content.slice(OPENED_PREFIX.length), refused, failed };
  }
  if (lower.includes('mcp') || lower.includes('echo')) {
    return { label: 'Called MCP', detail: content, refused, failed };
  }
  if (lower.startsWith('note:')) {
    return { label: 'Drew a note', detail: content.slice(5).trim(), refused, failed };
  }
  return { label: 'Ran a tool', detail: content, refused, failed };
}

function firstGroup(content: string, pattern: RegExp): string | undefined {
  const match = content.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isRefused(lower: string): boolean {
  return (
    lower.includes('refus') ||
    lower.includes('not granted') ||
    lower.includes('not authorized') ||
    lower.includes('policy')
  );
}
