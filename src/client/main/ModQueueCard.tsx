import { navigateTo } from '@devvit/web/client';
import type { StoredRecord } from '../../shared/types/api';

type Props = {
  record: StoredRecord;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  busyAction: 'approve' | 'dismiss' | 'remove' | null;
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

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.784 0 1.569.08 2.35.234v.41a41.612 41.612 0 0 0-4.7 0v-.41A40.098 40.098 0 0 1 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
      clipRule="evenodd"
    />
  </svg>
);

const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
  </svg>
);

const Spinner = ({ trackClass, tipClass }: { trackClass: string; tipClass: string }) => (
  <div className={`h-4 w-4 animate-spin rounded-full border-2 ${trackClass} ${tipClass}`} />
);

const actionButtonClass =
  'shrink-0 rounded-full p-2 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-60';

export const ModQueueCard = ({
  record,
  onApprove,
  onDismiss,
  onRemove,
  busyAction,
  hasError,
}: Props) => {
  const { id, kind, sortAt, data } = record;
  const contextTitle = kind === 'post' ? data.title : data.parentPostTitle;
  const isBusy = busyAction !== null;

  const handleCardClick = () => {
    navigateTo(data.url);
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApprove(id);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(id);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(id);
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

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={handleDismiss}
            disabled={isBusy}
            aria-label="Remove from queue"
            className={`${actionButtonClass} bg-rd-dismiss-bg text-rd-dismiss-fg hover:bg-rd-dismiss-hover`}
          >
            {busyAction === 'dismiss' ? (
              <Spinner
                trackClass="border-rd-dismiss-fg/30"
                tipClass="border-t-rd-dismiss-fg"
              />
            ) : (
              <TrashIcon />
            )}
          </button>

          <button
            onClick={handleRemove}
            disabled={isBusy}
            aria-label="Remove content"
            className={`${actionButtonClass} bg-rd-remove-bg text-rd-remove-fg hover:bg-rd-remove-hover`}
          >
            {busyAction === 'remove' ? (
              <Spinner
                trackClass="border-rd-remove-fg/30"
                tipClass="border-t-rd-remove-fg"
              />
            ) : (
              <XIcon />
            )}
          </button>

          <button
            onClick={handleApprove}
            disabled={isBusy}
            aria-label="Approve"
            className={`${actionButtonClass} bg-rd-approve-bg text-rd-approve-fg hover:bg-rd-approve-hover`}
          >
            {busyAction === 'approve' ? (
              <Spinner
                trackClass="border-rd-approve-fg/30"
                tipClass="border-t-rd-approve-fg"
              />
            ) : (
              <CheckIcon />
            )}
          </button>
        </div>
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

      {kind === 'post' &&
      data.imageUrl &&
      /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(data.imageUrl) ? (
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
          Action failed — please try again
        </p>
      ) : null}
    </article>
  );
};
