import type { Request, Response } from 'express';
/**
 * POST /api/records/:id/approve
 *
 * Approves the corresponding Reddit content and removes it from the stored
 * review queue, mirroring what handleOnModAction does for native mod actions.
 *
 * Unlike handleOnModAction, this also archives any related modmail thread the
 * bot filed about the content — a mod approving via the custom webview is a
 * real, intentional decision (same as approving natively), so it's safe to
 * treat it the same way the old un-gated logic did.
 */
export declare function handleApprove(req: Request, res: Response): Promise<void>;
