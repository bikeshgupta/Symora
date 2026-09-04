import { CommitmentList } from './CommitmentList';
import type { CommitmentView } from '@symora/core';

/**
 * Tasks specifically. A thin specialisation of CommitmentList rather than a parallel
 * implementation — tasks are commitments of type TASK
 * (.claude/rules/data-model.md), and duplicating the row markup would be the first step
 * toward the two drifting apart visually.
 */
export function TaskList({
  tasks,
  title = "Today's tasks",
  onComplete,
}: {
  tasks: CommitmentView[];
  title?: string;
  onComplete?: (task: CommitmentView) => void;
}) {
  return (
    <CommitmentList
      title={title}
      commitments={tasks}
      emptyMessage="Nothing due today."
      onComplete={onComplete}
    />
  );
}
