import { Streamdown } from 'streamdown';

import { markdownComponents } from '../../lib/markdown.js';

export function AssistantProse({ text }: { text: string }) {
  return (
    <div className="w-full max-w-full pb-4 text-sm leading-relaxed">
      <Streamdown components={markdownComponents}>{text}</Streamdown>
    </div>
  );
}
