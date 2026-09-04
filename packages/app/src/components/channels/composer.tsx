import { IconArrowUp, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { PromptArea } from 'prompt-area';
import { plainTextToSegments } from 'prompt-area/helpers';
import { useCallback, useMemo, useRef, useState } from 'react';

import { apiJson } from '../../api.js';
import { useAuth } from '../../lib/auth-context.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/button.js';

import { applyCommandChips, enforceSingleAgent, toDraft } from './composer-draft.js';
import { PLACEHOLDER_COMMANDS } from './composer-sources.js';
import { buildTriggers, toAgentOptions, toCommandOptions } from './composer-triggers.js';

import type { Coworker } from '../../lib/agents.js';
import type { Segment } from 'prompt-area/helpers';
import type { FormEvent, KeyboardEvent } from 'react';

const COMPACT_MIN = 19;
const COMPACT_MAX = 96;
const HERO_MAX = 220;

type SkillRow = { slug: string; summary: string; title: string };

export function Composer({
  className,
  compact = false,
  editorClassName,
  onSubmit,
  pending,
  placeholder,
  submitLabel,
}: {
  className?: string;
  compact?: boolean;
  editorClassName?: string;
  onSubmit: (message: string) => void;
  pending: boolean;
  placeholder: string;
  submitLabel: string;
}) {
  const [value, setValue] = useState<Segment[]>([]);
  const sending = useRef(false);
  const { agents, commands } = useComposerCatalog();
  const triggers = useMemo(() => buildTriggers({ agents, commands }), [agents, commands]);
  const draft = useMemo(() => toDraft(value), [value]);
  const canSend = !draft.isEmpty && !pending;

  const handleChange = useCallback(
    (next: Segment[]) => {
      const { segments, actions } = applyCommandChips(enforceSingleAgent(next), commands);
      setValue(segments);
      for (const action of actions) {
        action();
      }
    },
    [commands],
  );

  function submitNow(text?: string): void {
    const submitted = (text ?? draft.text).trim();
    if (submitted.length === 0 || pending || sending.current) {
      return;
    }
    sending.current = true;
    setValue([]);
    onSubmit(submitted);
    sending.current = false;
  }

  function submitForm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitNow();
  }

  const editor = (
    <PromptArea
      aria-label="Message"
      autoGrow={!compact}
      className={cn(
        'min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none',
        editorClassName,
      )}
      maxHeight={compact ? COMPACT_MAX : HERO_MAX}
      minHeight={compact ? COMPACT_MIN : undefined}
      placeholder={placeholder}
      triggers={triggers}
      value={value}
      onChange={handleChange}
      onSubmit={(segments) => {
        submitNow(toDraft(segments).text);
      }}
    />
  );

  if (compact) {
    return (
      <form
        className={cn(
          'flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3',
          'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
          className,
        )}
        onSubmit={submitForm}
      >
        <MoreButton />
        <PromptMirror value={draft.text} onPlain={handleChange} />
        {editor}
        <SendButton disabled={!canSend} label={submitLabel} />
      </form>
    );
  }

  return (
    <form
      className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}
      onSubmit={submitForm}
    >
      <div className="grow px-3 pt-3 pb-2">
        <PromptMirror value={draft.text} onPlain={handleChange} />
        {editor}
      </div>
      <div className="mb-2 flex items-center justify-end px-2">
        <SendButton disabled={!canSend} label={submitLabel} />
      </div>
    </form>
  );
}

function PromptMirror({
  onPlain,
  value,
}: {
  onPlain: (segments: Segment[]) => void;
  value: string;
}) {
  return (
    <textarea
      name="prompt"
      aria-hidden
      className="sr-only"
      tabIndex={-1}
      value={value}
      onChange={(event) => onPlain(plainTextToSegments(event.target.value))}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}

function MoreButton() {
  return (
    <Button
      aria-label="More message options unavailable"
      className="disabled:opacity-100"
      disabled
      size="icon"
      type="button"
      variant="ghost"
    >
      <IconPlus className="size-5" />
    </Button>
  );
}

function SendButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <Button
      aria-label={label}
      className="size-8 rounded-full p-0"
      disabled={disabled}
      size="icon"
      type="submit"
    >
      <IconArrowUp className="size-3.5" />
    </Button>
  );
}

function useComposerCatalog(): {
  agents: ReturnType<typeof toAgentOptions>;
  commands: ReturnType<typeof toCommandOptions>;
} {
  const { token } = useAuth();
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const body = await apiJson<{ agents: Coworker[] }>('/api/agents', await token());
      return body.agents;
    },
  });
  const skills = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const body = await apiJson<{ skills: SkillRow[] }>('/api/skills', await token());
      return body.skills;
    },
  });
  return {
    agents: toAgentOptions(agents.data),
    commands: toCommandOptions(skills.data, PLACEHOLDER_COMMANDS),
  };
}
