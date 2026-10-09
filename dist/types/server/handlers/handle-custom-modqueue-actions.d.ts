import type { Request, Response } from 'express';
/**
 * POST /api/records/:id/approve
 *
 * Approves the corresponding Reddit content and removes it from the stored
 * review queue, mirroring what handleOnModAction does for native mod actions.
 *
 * Unlike handleOnModAction, this also archives any related modmail thread the
 * bot filed about the content -- a mod approving via the custom webview is a
 * real, intentional decision (same as approving natively)
 */
export declare function handleApprove(req: Request, res: Response): Promise<void>;
/**
 * POST /api/records/:id/dismiss
 *
 * Removes an item from the custom review queue only — does not approve/remove
 * the Reddit content, and does not archive related modmail.
 */
export declare function handleDismiss(req: Request, res: Response): Promise<void>;
/**
 * POST /api/records/:id/remove
 *
 * Removes the corresponding Reddit content and deletes it from the stored
 * review queue. Archives related modmail when remMailOnApproveRemove is on.
 */
export declare function handleRemove(req: Request, res: Response): Promise<void>;
/**
 * POST /api/records/clear
 *
 * Clears the entire custom review queue. Does not touch Reddit content or
 * related modmail threads.
 */
export declare function handleClearAll(_req: Request, res: Response): Promise<void>;
