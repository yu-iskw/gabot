import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiJson } from '../api.js';
import { PageEmpty, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Separator } from '../components/ui/separator.js';
import { Textarea } from '../components/ui/textarea.js';
import { useAuth } from '../lib/auth-context.js';
import { useSession } from '../lib/session-context.js';
import { sessionCanManageCatalog } from '../lib/session-scope.js';

type Skill = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  instructions: string;
};

export function SkillsPage() {
  const { token } = useAuth();
  const { me, queryKey } = useSession();
  const canManageCatalog = sessionCanManageCatalog(me);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'new' | 'edit'>('idle');
  const [editing, setEditing] = useState<Skill | null>(null);
  const skills = useQuery({
    queryKey: queryKey('skills'),
    queryFn: async () => {
      const body = await apiJson<{ skills: Skill[] }>('/api/skills', await token());
      return body.skills;
    },
  });
  const save = useMutation({
    mutationFn: async (input: {
      slug: string;
      title: string;
      summary: string;
      instructions: string;
    }) =>
      apiJson<{ skill: Skill }>('/api/skills', await token(), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (body) => {
      setMode('idle');
      setEditing(null);
      queryClient.setQueryData<Skill[]>(queryKey('skills'), (current) => {
        const rows = current ?? [];
        const index = rows.findIndex((row) => row.slug === body.skill.slug);
        if (index < 0) {
          return [...rows, body.skill];
        }
        return rows.map((row, rowIndex) => (rowIndex === index ? body.skill : row));
      });
      await queryClient.invalidateQueries({ queryKey: queryKey('skills') });
    },
  });
  const remove = useMutation({
    mutationFn: async (slug: string) =>
      apiJson(`/api/skills/${slug}`, await token(), { method: 'DELETE' }),
    onSuccess: async () => {
      setMode('idle');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: queryKey('skills') });
    },
  });

  return (
    <PageShell
      title="Skills"
      description="Slash-command skills this deployment offers coworkers."
      action={
        canManageCatalog ? (
          <Button
            data-testid="new-skill"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(null);
              setMode('new');
            }}
          >
            New skill
          </Button>
        ) : undefined
      }
    >
      {(mode === 'new' && canManageCatalog) || mode === 'edit' ? (
        <SkillForm
          key={editing?.slug ?? 'new'}
          skill={editing}
          busy={save.isPending}
          readOnly={!canManageCatalog}
          onCancel={() => {
            setMode('idle');
            setEditing(null);
          }}
          onDelete={
            canManageCatalog && editing
              ? () => {
                  remove.mutate(editing.slug);
                }
              : undefined
          }
          onSave={canManageCatalog ? (input) => save.mutate(input) : undefined}
        />
      ) : null}
      <PageSection title="Catalogue">
        {(skills.data ?? []).length === 0 ? (
          <PageEmpty>No skills yet.</PageEmpty>
        ) : (
          <PageRows>
            {(skills.data ?? []).map((skill, index) => (
              <div key={skill.id}>
                {index > 0 ? <Separator /> : null}
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted/40"
                  data-testid={`skill-row-${skill.slug}`}
                  onClick={() => {
                    setEditing(skill);
                    setMode('edit');
                  }}
                >
                  <p className="text-sm font-medium">/{skill.slug}</p>
                  <p className="text-sm text-muted-foreground">{skill.summary}</p>
                </button>
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}

function SkillForm({
  skill,
  busy,
  readOnly = false,
  onCancel,
  onDelete,
  onSave,
}: {
  skill: Skill | null;
  busy: boolean;
  readOnly?: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  onSave?: (input: { slug: string; title: string; summary: string; instructions: string }) => void;
}) {
  const lockedSlug = Boolean(skill);
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [title, setTitle] = useState(skill?.title ?? '');
  const [summary, setSummary] = useState(skill?.summary ?? '');
  const [instructions, setInstructions] = useState(skill?.instructions ?? '');

  return (
    <form
      className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      data-testid="skill-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly || !onSave) {
          return;
        }
        onSave({ slug, title, summary, instructions });
      }}
    >
      <Input
        name="skill-slug"
        placeholder="slug"
        value={slug}
        disabled={lockedSlug || readOnly}
        onChange={(event) => setSlug(event.target.value)}
      />
      <Input
        name="skill-title"
        placeholder="Title"
        value={title}
        disabled={readOnly}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Input
        name="skill-summary"
        placeholder="Summary"
        value={summary}
        disabled={readOnly}
        onChange={(event) => setSummary(event.target.value)}
      />
      <Textarea
        name="skill-instructions"
        placeholder="Instructions"
        value={instructions}
        disabled={readOnly}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {readOnly ? null : (
          <Button disabled={busy} type="submit">
            Save
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {onDelete && !readOnly ? (
          <Button type="button" variant="ghost" data-testid="delete-skill" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
