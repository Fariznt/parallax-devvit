import type { Request, Response } from 'express';
import type { MenuItemRequest, TriggerResponse, UiResponse } from '@devvit/web/shared';
/** Devvit Web menu action -> /internal/menu/post-create */
export declare function handleMenuPostCreate(_req: Request<Record<string, never>, UiResponse | TriggerResponse, MenuItemRequest>, res: Response<UiResponse | TriggerResponse>): Promise<void>;
