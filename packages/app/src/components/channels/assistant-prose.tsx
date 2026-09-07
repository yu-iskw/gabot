import { Streamdown } from 'streamdown';

import { markdownComponents } from '../../lib/markdown.js';

export function AssistantProse({ agentId, text }: { agentId?: string | null; text: string }) {
  return (
    <div className="w-full max-w-full pb-4 text-sm leading-relaxed">
      {agentId ? (
        <p className="mb-1 text-xs font-medium text-muted-foreground" data-testid="assistant-agent">
          @{agentId}
        </p>
      ) : null}
      <Streamdown components={markdownComponents}>{text}</Streamdown>
    </div>
  );
}
