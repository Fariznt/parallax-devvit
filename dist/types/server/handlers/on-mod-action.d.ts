import type { Request, Response } from 'express';
import type { OnModActionRequest, TriggerResponse } from '@devvit/web/shared';
/** Usernames whose mod actions are automation, not a real mod decision. */
export declare const AUTOMATION_BOTS: Set<string>;
/**
 * Devvit Web trigger: onModAction -> /internal/on-mod-action
 *
 * When a real moderator approves or removes a post/comment outside of this app's UI
 * (e.g. via native Reddit mod tools), the item has been actioned and should be
 * removed from the pending queue.
 *
 * Actions taken by automatoin bots are ignored entirely here, so they don't pull items out of the
 * custom modqueue webview. The webview's own approve flow
 * (handle-custom-modqueue-actions.ts) is responsible for its own queue/modmail
 * cleanup instead.
 */
export declare function handleOnModAction(req: Request<Record<string, never>, TriggerResponse, OnModActionRequest>, res: Response<TriggerResponse>): Promise<void>;
