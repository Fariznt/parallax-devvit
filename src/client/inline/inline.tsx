import '../index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../../shared/types/api';

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; data: InitResponse }
  | { status: 'error' };

const Inline = () => {
  const [viewer, setViewer] = useState<ViewerState>({ status: 'loading' });

  useEffect(() => {
    const loadViewer = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: InitResponse = await res.json();
        setViewer({ status: 'ready', data });
      } catch (error) {
        console.error('Unable to load viewer data', error);
        setViewer({ status: 'error' });
      }
    };

    void loadViewer();
  }, []);

  const username =
    viewer.status === 'ready' ? viewer.data.username : context.username;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <img className="mx-auto w-1/2 max-w-[250px] object-contain" src="/snoo.png" alt="Snoo" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-center text-2xl font-bold text-rd-text-primary">
          Hey {username ?? 'there'} 👋
        </h1>
        {viewer.status === 'loading' ? (
          <p className="text-center text-base text-rd-text-secondary">Loading...</p>
        ) : null}
        {(viewer.status === 'ready' && !viewer.data.isModerator) || viewer.status === 'error' ? (
          <p className="text-center text-base text-rd-text-secondary">
            Thanks for stopping by. This interactive post is only viewable for the moderation team.
            Please feel free to ignore!
          </p>
        ) : null}
        {viewer.status === 'ready' && viewer.data.isModerator ? (
          <>
            <p className="text-center text-base text-rd-text-secondary">
              The custom modqueue is ready for review.
            </p>
            <button
              className="mt-5 flex h-10 w-auto cursor-pointer items-center justify-center rounded-full bg-rd-cta px-4 text-white transition-colors hover:bg-rd-cta-hover"
              onClick={(e) => requestExpandedMode(e.nativeEvent, 'main')}
            >
              Open modqueue
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Inline />
  </StrictMode>
);
