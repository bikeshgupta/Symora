import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateMemory,
  useDeleteMemory,
  useEditMemory,
  useMemories,
} from '@/hooks/useMemories';
import type { MemoryType, MemoryView } from '@symora/core';
import { cn } from '@/lib/cn';

const TYPE_LABEL: Record<MemoryType, string> = {
  alias: 'Alias',
  preference: 'Preference',
  fact: 'Fact',
  correction: 'Correction',
};

/**
 * Status is carried by a word, never by colour alone
 * (.claude/rules/design-system.md § Rules for the Phase 6 trusted components). The
 * superseded state is the one that matters here: a user needs to see that Symora used
 * to believe something else, and when it stopped.
 */
function MemoryStatus({ memory }: { memory: MemoryView }) {
  if (memory.isCurrent) {
    return (
      <span className="text-caption text-paid">
        Current · since {memory.effectiveFrom}
      </span>
    );
  }
  return (
    <span className="text-caption text-neutral-status">
      Superseded{memory.effectiveTo ? ` on ${memory.effectiveTo}` : ''}
    </span>
  );
}

function MemoryRow({ memory }: { memory: MemoryView }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(memory.text);
  const editMemory = useEditMemory();
  const deleteMemory = useDeleteMemory();

  function handleSave(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || trimmed === memory.text) {
      setIsEditing(false);
      return;
    }
    editMemory.mutate({ id: memory.id, text: trimmed }, { onSuccess: () => setIsEditing(false) });
  }

  return (
    <li
      className={cn(
        'rounded-md border border-border p-3',
        memory.isCurrent ? 'bg-surface' : 'bg-surface-raised',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-caption text-text-muted">{TYPE_LABEL[memory.memoryType]}</span>
          <span className="ml-2 text-body-sm font-medium text-text-primary">
            {memory.key.replace(/_/g, ' ')}
          </span>
        </div>
        <MemoryStatus memory={memory} />
      </div>

      {isEditing ? (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={handleSave}>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={`Value for ${memory.key}`}
            autoFocus
          />
          <Button type="submit" disabled={editMemory.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setText(memory.text);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <p className="mt-1 text-body-sm text-text-primary">{memory.text}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={deleteMemory.isPending}
              onClick={() => deleteMemory.mutate(memory.id)}
            >
              Delete
            </Button>
          </div>
        </>
      )}

      {editMemory.isError && (
        <p className="mt-2 text-caption text-overdue">Could not save that change.</p>
      )}
      {deleteMemory.isError && (
        <p className="mt-2 text-caption text-overdue">Could not delete that memory.</p>
      )}
    </li>
  );
}

/**
 * "What Symora knows about me" (PROGRESS.md Phase 3). Everything Symora has recorded is
 * visible here, and every row can be edited or deleted — memory is explicit and
 * editable (CLAUDE.md principle 7), and nothing reaches this list that the user did not
 * state.
 */
export function MemoryPanel() {
  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const [key, setKey] = useState('');
  const [text, setText] = useState('');
  const { data: memories, isLoading, isError, error } = useMemories(includeSuperseded);
  const createMemory = useCreateMemory();

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!key.trim() || !text.trim()) return;
    createMemory.mutate(
      { key: key.trim(), text: text.trim(), memoryType: 'fact' },
      {
        onSuccess: () => {
          setKey('');
          setText('');
        },
      },
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading text-text-primary">What Symora knows about you</h2>
        <label className="flex items-center gap-2 text-caption text-text-muted">
          <input
            type="checkbox"
            checked={includeSuperseded}
            onChange={(event) => setIncludeSuperseded(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show past values
        </label>
      </div>
      <p className="mt-1 text-body-sm text-text-muted">
        Only what you have told Symora directly. Edit or delete anything here — nothing is
        collected on its own.
      </p>

      {isLoading && <p className="mt-4 text-body-sm text-text-muted">Loading…</p>}

      {isError && (
        <p className="mt-4 text-body-sm text-overdue">
          {error instanceof Error ? error.message : 'Could not load your memories.'}
        </p>
      )}

      {memories && memories.length === 0 && (
        <p className="mt-4 text-body-sm text-text-muted">
          Nothing yet. Tell Symora something like “mummy means Sunita” and it will appear here.
        </p>
      )}

      {memories && memories.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {memories.map((memory) => (
            <MemoryRow key={memory.id} memory={memory} />
          ))}
        </ul>
      )}

      <form className="mt-5 border-t border-border pt-4" onSubmit={handleAdd}>
        <p className="text-body-sm font-medium text-text-primary">Add something</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="memory-key" className="block">What</Label>
            <Input
              id="memory-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="spouse name"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="memory-text" className="block">Is</Label>
            <Input
              id="memory-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ravi"
            />
          </div>
        </div>
        <Button
          type="submit"
          className="mt-3"
          disabled={createMemory.isPending || !key.trim() || !text.trim()}
        >
          Remember this
        </Button>
        {createMemory.isError && (
          <p className="mt-2 text-caption text-overdue">Could not save that.</p>
        )}
      </form>
    </Card>
  );
}
