import { Task } from '@/types/construction';

export const isTaskDescendant = (
  potentialDescendantId: string,
  potentialAncestorId: string,
  tasks: Task[]
): boolean => {
  const task = tasks.find(t => t.id === potentialDescendantId);
  if (!task || !task.parentTaskId) return false;
  if (task.parentTaskId === potentialAncestorId) return true;
  return isTaskDescendant(task.parentTaskId, potentialAncestorId, tasks);
};

export const getAllDescendants = (taskId: string, tasks: Task[]): Task[] => {
  const children = tasks.filter(t => t.parentTaskId && String(t.parentTaskId) === String(taskId));
  let descendants: Task[] = [];
  children.forEach(child => {
    if (child.type === 'group') {
      descendants = [...descendants, ...getAllDescendants(child.id, tasks)];
    } else {
      descendants.push(child);
    }
  });
  return descendants;
};
