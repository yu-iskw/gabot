import { IconX } from '@tabler/icons-react';

import { Button } from '../ui/button.js';

import type { ReactNode } from 'react';

const DEFAULT_WIDTH = 400;

export function DetailPanel({
  children,
  detail,
  detailWidth = DEFAULT_WIDTH,
  onClose,
  open,
}: {
  children: ReactNode;
  detail?: ReactNode;
  detailWidth?: number;
  onClose: () => void;
  open: boolean;
}) {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: open ? detailWidth : 0 }}
      >
        <div
          className="flex h-full flex-col border-l border-border bg-sidebar"
          style={{ width: detailWidth }}
        >
          <div className="sticky top-0 flex h-12 shrink-0 items-center justify-end px-2">
            <Button aria-label="Close detail" size="icon" variant="ghost" onClick={onClose}>
              <IconX className="size-4.5" />
            </Button>
          </div>
          {open ? <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}
