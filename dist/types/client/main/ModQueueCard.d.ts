import type { StoredRecord } from '../../shared/types/api';
type Props = {
    record: StoredRecord;
    onApprove: (id: string) => void;
    onDismiss: (id: string) => void;
    onRemove: (id: string) => void;
    busyAction: 'approve' | 'dismiss' | 'remove' | null;
    hasError: boolean;
};
export declare const ModQueueCard: ({ record, onApprove, onDismiss, onRemove, busyAction, hasError, }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
