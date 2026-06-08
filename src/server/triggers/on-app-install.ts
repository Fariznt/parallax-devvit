import type { Request, Response } from 'express';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';

/** Devvit Web trigger: onAppInstall → /internal/on-app-install */
export async function handleOnAppInstall(
  _req: Request<Record<string, never>, TriggerResponse, OnAppInstallRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  res.status(200).json({ status: 'ok' });
}
