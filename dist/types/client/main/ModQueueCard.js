import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { navigateTo } from '@devvit/web/client';
function formatRelative(timestamp) {
    const diffMs = Date.now() - timestamp;
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60)
        return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
const CheckIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-4 w-4", "aria-hidden": "true", children: _jsx("path", { fillRule: "evenodd", d: "M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z", clipRule: "evenodd" }) }));
const TrashIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-4 w-4", "aria-hidden": "true", children: _jsx("path", { fillRule: "evenodd", d: "M8.75 1A2.75 2.75 0 0 0 6 3.75V4.5h8.5v-.75A2.75 2.75 0 0 0 11.75 1h-3ZM15.5 6h-11v8.25A2.75 2.75 0 0 0 7.25 17h5.5a2.75 2.75 0 0 0 2.75-2.75V6ZM8 9.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V10A.75.75 0 0 1 8 9.25Zm4.75.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0V10Z", clipRule: "evenodd" }) }));
const XIcon = () => (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: "h-4 w-4", "aria-hidden": "true", children: _jsx("path", { d: "M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" }) }));
const Spinner = ({ trackClass, tipClass }) => (_jsx("div", { className: `h-4 w-4 animate-spin rounded-full border-2 ${trackClass} ${tipClass}` }));
const actionButtonClass = 'shrink-0 rounded-full p-2 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-60';
export const ModQueueCard = ({ record, onApprove, onDismiss, onRemove, busyAction, hasError, }) => {
    const { id, kind, sortAt, data } = record;
    const contextTitle = kind === 'post' ? data.title : data.parentPostTitle;
    const isBusy = busyAction !== null;
    const handleCardClick = () => {
        navigateTo(data.url);
    };
    const handleApprove = (e) => {
        e.stopPropagation();
        onApprove(id);
    };
    const handleDismiss = (e) => {
        e.stopPropagation();
        onDismiss(id);
    };
    const handleRemove = (e) => {
        e.stopPropagation();
        onRemove(id);
    };
    return (_jsxs("article", { onClick: handleCardClick, className: `group relative cursor-pointer rounded-xl border p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.99] ${hasError
            ? 'border-rd-error-border bg-rd-error-surface'
            : 'border-rd-border bg-rd-surface'}`, children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", children: [_jsx("span", { className: `inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kind === 'post'
                                    ? 'bg-rd-badge-post-bg text-rd-badge-post-fg'
                                    : 'bg-rd-badge-cmnt-bg text-rd-badge-cmnt-fg'}`, children: kind }), _jsxs("span", { className: "truncate text-sm font-medium text-rd-text-primary", children: ["u/", data.username] }), _jsx("span", { className: "shrink-0 text-xs text-rd-text-muted", children: formatRelative(sortAt) })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [_jsx("button", { onClick: handleDismiss, disabled: isBusy, "aria-label": "Remove from queue", className: `${actionButtonClass} bg-rd-dismiss-bg text-rd-dismiss-fg hover:bg-rd-dismiss-hover`, children: busyAction === 'dismiss' ? (_jsx(Spinner, { trackClass: "border-rd-dismiss-fg/30", tipClass: "border-t-rd-dismiss-fg" })) : (_jsx(TrashIcon, {})) }), _jsx("button", { onClick: handleRemove, disabled: isBusy, "aria-label": "Remove content", className: `${actionButtonClass} bg-rd-remove-bg text-rd-remove-fg hover:bg-rd-remove-hover`, children: busyAction === 'remove' ? (_jsx(Spinner, { trackClass: "border-rd-remove-fg/30", tipClass: "border-t-rd-remove-fg" })) : (_jsx(XIcon, {})) }), _jsx("button", { onClick: handleApprove, disabled: isBusy, "aria-label": "Approve", className: `${actionButtonClass} bg-rd-approve-bg text-rd-approve-fg hover:bg-rd-approve-hover`, children: busyAction === 'approve' ? (_jsx(Spinner, { trackClass: "border-rd-approve-fg/30", tipClass: "border-t-rd-approve-fg" })) : (_jsx(CheckIcon, {})) })] })] }), contextTitle ? (_jsx("p", { className: "mt-2 text-sm font-semibold leading-snug text-rd-text-primary", children: contextTitle })) : null, data.body ? (_jsx("p", { className: "mt-1.5 line-clamp-10 break-words whitespace-pre-wrap text-sm leading-relaxed text-rd-text-secondary", children: data.body })) : null, kind === 'post' &&
                data.imageUrl &&
                /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(data.imageUrl) ? (_jsx("div", { className: "mt-3 w-full rounded-lg bg-rd-image-bg", children: _jsx("img", { src: data.imageUrl, alt: "", className: "w-full rounded-lg object-contain" }) })) : null, hasError ? (_jsx("p", { className: "mt-2 text-xs font-medium text-rd-text-error", children: "Action failed \u2014 please try again" })) : null] }));
};
//# sourceMappingURL=ModQueueCard.js.map