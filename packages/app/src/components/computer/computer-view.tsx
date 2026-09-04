import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { isBlankBrowser, type ScreenShot } from '../../lib/screenshot.js';
import { ChannelAvatar } from '../channels/channel-avatar.js';

const ASPECT = 1280 / 800;

export function ComputerView({
  expanded,
  name,
  onToggleExpanded,
  problem,
  shot,
  waiting,
}: {
  expanded: boolean;
  name: string;
  onToggleExpanded: () => void;
  problem: string | null;
  shot: ScreenShot | null;
  waiting: boolean;
}) {
  const blank = shot ? isBlankBrowser(shot.url) : false;
  const showScreen = shot !== null && !blank;
  return (
    <>
      <figure className="overflow-hidden rounded-2xl border border-border">
        <button
          type="button"
          aria-label="Open the assistant's screen full size"
          className="relative block w-full cursor-pointer bg-muted"
          style={{ aspectRatio: ASPECT, minHeight: 200 }}
          onClick={onToggleExpanded}
        >
          {showScreen ? (
            <img
              alt="What the assistant is looking at"
              className="absolute inset-0 h-full w-full object-contain"
              src={`data:image/png;base64,${shot.base64}`}
            />
          ) : (
            <NothingToSee blank={blank} problem={problem} waiting={waiting} />
          )}
          {name ? <NameBadge name={name} /> : null}
        </button>
      </figure>
      {expanded
        ? createPortal(
            <ExpandedScreen
              name={name}
              shot={showScreen ? shot : null}
              onClose={onToggleExpanded}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function NameBadge({ name }: { name: string }) {
  return (
    <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-1.5 text-xs font-medium text-white backdrop-blur-sm">
      <ChannelAvatar name={name} size={16} />
      {name}
    </span>
  );
}

function NothingToSee({
  blank,
  problem,
  waiting,
}: {
  blank: boolean;
  problem: string | null;
  waiting: boolean;
}) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm text-muted-foreground">
      {problem ? (
        <>
          <span className="font-medium">You cannot see the screen right now</span>
          <span>{problem}</span>
          <span>
            The assistant may still be working. An administrator can check whether its computer is
            running.
          </span>
        </>
      ) : blank || !waiting ? (
        <span>The assistant has not opened a page yet.</span>
      ) : (
        <span>Waiting for the assistant&apos;s screen…</span>
      )}
    </span>
  );
}

function ExpandedScreen({
  name,
  onClose,
  shot,
}: {
  name: string;
  onClose: () => void;
  shot: ScreenShot | null;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label="The assistant's screen"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8"
    >
      <button
        type="button"
        aria-label="Close the assistant's screen"
        className="absolute inset-0 cursor-zoom-out bg-black/80"
        onClick={onClose}
      />
      <div className="relative flex w-full max-w-[70vw] min-w-0 flex-col rounded-2xl bg-background p-4 shadow-2xl">
        <div
          className="relative min-h-0 overflow-auto rounded-xl bg-muted"
          style={{ aspectRatio: ASPECT }}
        >
          {shot ? (
            <img
              alt="What the assistant is looking at"
              className="absolute inset-0 h-full w-full object-contain"
              src={`data:image/png;base64,${shot.base64}`}
            />
          ) : (
            <NothingToSee blank problem={null} waiting={false} />
          )}
        </div>
        {name ? <p className="mt-4 text-center text-sm font-medium">{name}</p> : null}
      </div>
    </div>
  );
}

export function useExpandedScreen(): {
  expanded: boolean;
  toggle: () => void;
} {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => {
    setExpanded((open) => !open);
  }, []);
  return { expanded, toggle };
}
