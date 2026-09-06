import type { CommandOption } from './composer-draft.js';

export const PLACEHOLDER_COMMANDS: CommandOption[] = [
  {
    id: 'summarize',
    name: 'summarize',
    description: 'Summarize this conversation',
    kind: 'prompt',
    prompt: 'Summarize what we covered in this channel so far.',
  },
];
