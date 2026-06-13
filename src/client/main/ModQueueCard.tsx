import { navigateTo } from '@devvit/web/client';
import type { StoredRecord } from '../../shared/types/api';

type Props = {
  record: StoredRecord;
  onApprove: (id: string) => void;
  isApproving: boolean;
  hasError: boolean;
};

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
      clipRule="evenodd"
    />
  </svg>
);

export const ModQueueCard = ({ record, onApprove, isApproving, hasError }: Props) => {
  const { id, kind, sortAt, data } = record;
  const contextTitle = kind === 'post' ? data.title : data.parentPostTitle;

  const handleCardClick = () => {
    navigateTo(data.url);
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApprove(id);
  };

  return (
    <article
      onClick={handleCardClick}
      className={`group relative cursor-pointer rounded-xl border p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.99] ${
        hasError
          ? 'border-rd-error-border bg-rd-error-surface'
          : 'border-rd-border bg-rd-surface'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              kind === 'post'
                ? 'bg-rd-badge-post-bg text-rd-badge-post-fg'
                : 'bg-rd-badge-cmnt-bg text-rd-badge-cmnt-fg'
            }`}
          >
            {kind}
          </span>
          <span className="truncate text-sm font-medium text-rd-text-primary">
            u/{data.username}
          </span>
          <span className="shrink-0 text-xs text-rd-text-muted">
            {formatRelative(sortAt)}
          </span>
        </div>

        <button
          onClick={handleApprove}
          disabled={isApproving}
          aria-label="Approve"
          className="shrink-0 rounded-full bg-rd-approve-bg p-2 text-rd-approve-fg transition-colors hover:bg-rd-approve-hover active:scale-95 disabled:pointer-events-none disabled:opacity-60"
        >
          {isApproving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-rd-approve-fg/30 border-t-rd-approve-fg" />
          ) : (
            <CheckIcon />
          )}
        </button>
      </div>

      {/* Context title */}
      {contextTitle ? (
        <p className="mt-2 text-sm font-semibold leading-snug text-rd-text-primary">
          {contextTitle}
        </p>
      ) : null}

      {/* Body text — clamped; tap card to read full content on Reddit */}
      {data.body ? (
        <p className="mt-1.5 line-clamp-10 break-words whitespace-pre-wrap text-sm leading-relaxed text-rd-text-secondary">
          {data.body}
        </p>
      ) : null}

      {kind === 'post' && data.imageUrl ? (
        <div className="mt-3 w-full rounded-lg bg-rd-image-bg">
          <img
            src={data.imageUrl}
            alt=""
            className="w-full rounded-lg object-contain"
          />
        </div>
      ) : null}

      {/* Error state */}
      {hasError ? (
        <p className="mt-2 text-xs font-medium text-rd-text-error">
          Approval failed — please try again
        </p>
      ) : null}
    </article>
  );
};
