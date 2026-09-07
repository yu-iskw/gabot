import { chip, text } from 'prompt-area/helpers';
import { describe, expect, it } from 'vitest';

import { applyCommandChips, enforceSingleAgent, toDraft } from './composer-draft.js';

import type { CommandOption } from './composer-draft.js';
import type { Segment } from 'prompt-area/helpers';

function agent(id: string, name: string): Segment {
  return chip({ trigger: '@', value: id, displayText: name });
}

function command(id: string, name: string): Segment {
  return chip({ trigger: '/', value: id, displayText: name });
}

describe('toDraft', () => {
  it('flattens chips back into the plain text sent to the runtime', () => {
    const draft = toDraft([agent('knowledge', 'Knowledge'), text(' what changed last week?')]);
    expect(draft.text).toBe('@Knowledge what changed last week?');
    expect(draft.agentId).toBe('knowledge');
    expect(draft.isEmpty).toBe(false);
  });

  it('reports no agent when the message does not address one', () => {
    expect(toDraft([text('hello')]).agentId).toBeNull();
  });

  it('treats whitespace-only content as empty', () => {
    expect(toDraft([text('   ')]).isEmpty).toBe(true);
    expect(toDraft([]).isEmpty).toBe(true);
  });
});

describe('enforceSingleAgent', () => {
  it('keeps the most recent mention', () => {
    const segments: Segment[] = [
      agent('knowledge', 'Knowledge'),
      text(' and '),
      agent('computer', 'Computer'),
      text(' check this'),
    ];
    expect(toDraft(enforceSingleAgent(segments)).agentId).toBe('computer');
  });
});

describe('applyCommandChips', () => {
  const commands: CommandOption[] = [
    { id: 'search', name: 'search', kind: 'chip' },
    { id: 'summarize', name: 'summarize', kind: 'prompt', prompt: 'Summarize this channel.' },
  ];

  it('expands prompt commands into editable text', () => {
    const result = applyCommandChips([command('summarize', 'summarize')], commands);
    expect(toDraft(result.segments).text).toBe('Summarize this channel.');
  });

  it('leaves chip commands in the message', () => {
    const result = applyCommandChips([command('search', 'search'), text(' files')], commands);
    expect(toDraft(result.segments).commandIds).toEqual(['search']);
  });
});
