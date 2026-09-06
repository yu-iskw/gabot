import { IconLayoutSidebar } from '@tabler/icons-react';

import { useOptionalSidebar } from '../../lib/sidebar-context.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/button.js';

export function SidebarToggle({ className }: { className?: string }) {
  const sidebar = useOptionalSidebar();
  if (!sidebar) {
    return null;
  }
  const label = sidebar.open ? 'Hide sidebar' : 'Show sidebar';
  return (
    <Button
      aria-label={label}
      className={cn('text-muted-foreground', className)}
      size="icon"
      variant="ghost"
      onClick={sidebar.toggle}
    >
      <IconLayoutSidebar className="size-4.5" />
    </Button>
  );
}

export function SidebarToggleBar() {
  return (
    <div className="flex h-12 shrink-0 items-center px-3">
      <SidebarToggle />
    </div>
  );
}
