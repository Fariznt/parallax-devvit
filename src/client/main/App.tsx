import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InitResponse,
  RecordsResponse,
  StoredRecord,
  TotalRecordsResponse,
} from '../../shared/types/api';
import { ModQueueCard } from './ModQueueCard';

const PAGE_SIZE = 20;

type AppState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  | { status: 'ready' };

export const App = () => {
  const [appState, setAppState] = useState<AppState>({ status: 'loading' });
  const [records, setRecords] = useState<StoredRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorCards, setErrorCards] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Track offset in a ref so the intersection observer callback always sees the latest value.
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (from: number) => {
    const to = from + PAGE_SIZE - 1;
    const res = await fetch(`/api/records?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: RecordsResponse = await res.json();
    return data.records;
  }, []);

  // Load the first page + total count on mount.
  useEffect(() => {
    const init = async () => {
      try {
        const [initRes, totalRes] = await Promise.all([
          fetch('/api/init'),
          fetch('/api/records/total'),
        ]);

        if (!initRes.ok) throw new Error(`init HTTP ${initRes.status}`);
        const initData: InitResponse = await initRes.json();

        if (!initData.isModerator) {
          setAppState({ status: 'forbidden' });
          return;
        }

        if (!totalRes.ok) throw new Error(`total HTTP ${totalRes.status}`);
        const totalData: TotalRecordsResponse = await totalRes.json();
        setTotalRecords(totalData.totalRecords);

        const firstPage = await fetchPage(0);
        setRecords(firstPage);
        const newOffset = firstPage.length;
        offsetRef.current = newOffset;
        setOffset(newOffset);
        const more = firstPage.length === PAGE_SIZE;
        hasMoreRef.current = more;
        setHasMore(more);
        setAppState({ status: 'ready' });
      } catch {
        setAppState({ status: 'error' });
      }
    };

    void init();
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(offsetRef.current);
      setRecords((prev) => [...prev, ...page]);
      const newOffset = offsetRef.current + page.length;
      offsetRef.current = newOffset;
      setOffset(newOffset);
      const more = page.length === PAGE_SIZE;
      hasMoreRef.current = more;
      setHasMore(more);
    } catch {
      // Swallow — next intersection will retry.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage]);

  // Infinite scroll via IntersectionObserver on a sentinel div.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, appState]);

  const handleExitComplete = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setTotalRecords((prev) => prev - 1);
    offsetRef.current = Math.max(0, offsetRef.current - 1);
    setLeavingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Calls the server's handleApprove (src/server/handlers/handle-custom-modqueue-actions.ts),
  // which approves the content, removes it from the queue, and archives related modmail.
  const handleApproveClick = useCallback(async (id: string) => {
    setApprovingIds((prev) => new Set([...prev, id]));

    try {
      const res = await fetch(`/api/records/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setLeavingIds((prev) => new Set([...prev, id]));
    } catch {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setErrorCards((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setErrorCards((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 4000);
    }
  }, []);

  if (appState.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-rd-text-secondary">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-rd-spinner-track border-t-rd-cta" />
          <span className="text-sm">Loading modqueue…</span>
        </div>
      </div>
    );
  }

  if (appState.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-center text-sm text-rd-text-error">
          Failed to load modqueue. Please refresh and try again.
        </p>
      </div>
    );
  }

  if (appState.status === 'forbidden') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-center text-sm text-rd-text-secondary">
          Moderator access required.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-rd-text-primary">Modqueue</h1>
        <span className="text-sm text-rd-text-secondary">
          {totalRecords === 0
            ? 'No items'
            : `${totalRecords} item${totalRecords !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Feed */}
      {records.length === 0 && !loadingMore ? (
        <div className="rounded-xl border border-dashed border-rd-border p-10 text-center text-sm text-rd-text-muted">
          Queue is empty — nothing to review.
        </div>
      ) : (
        <div className="flex flex-col">
          {records.map((record) => {
            const leaving = leavingIds.has(record.id);
            return (
              <div
                key={record.id}
                className={`grid transition-all duration-300 ease-in-out ${
                  leaving
                    ? '[grid-template-rows:0fr] opacity-0'
                    : '[grid-template-rows:1fr] opacity-100'
                }`}
                onTransitionEnd={(e) => {
                  if (!leaving || e.target !== e.currentTarget) return;
                  if (e.propertyName !== 'grid-template-rows') return;
                  handleExitComplete(record.id);
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="pb-3">
                    <ModQueueCard
                      record={record}
                      onApprove={handleApproveClick}
                      isApproving={approvingIds.has(record.id)}
                      hasError={errorCards.has(record.id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {loadingMore ? (
        <div className="mt-4 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-rd-spinner-track border-t-rd-cta" />
        </div>
      ) : null}

      {/* End of feed */}
      {!hasMore && records.length > 0 ? (
        <p className="mt-6 text-center text-xs text-rd-text-muted">
          End of queue
        </p>
      ) : null}
    </div>
  );
};
