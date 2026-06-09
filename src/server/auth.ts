import { context, reddit } from '@devvit/web/server';

export const getCurrentUsername = async (): Promise<string | null> => {
  const currentUser = await reddit.getCurrentUser();
  return currentUser?.username ?? null;
};

export const isCurrentUserModerator = async (username?: string | null): Promise<boolean> => {
  const { subredditName } = context;
  const viewerUsername = username ?? (await getCurrentUsername());

  if (!subredditName || !viewerUsername) {
    return false;
  }

  try {
    const moderators = await reddit.getModerators({
      subredditName,
      username: viewerUsername,
    }).all();
    return moderators.length > 0;
  } catch (error) {
    console.error('Unable to check moderator status', error);
    return false;
  }
};
