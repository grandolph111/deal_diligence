import type { Priority } from '../../../types/api';

interface PriorityBadgeProps {
  priority: Priority;
}

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'priority-low' },
  MEDIUM: { label: 'Medium', className: 'priority-medium' },
  HIGH: { label: 'High', className: 'priority-high' },
  URGENT: { label: 'Urgent', className: 'priority-urgent' },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <span className={`priority-badge ${config.className}`}>
      {config.label}
    </span>
  );
}
