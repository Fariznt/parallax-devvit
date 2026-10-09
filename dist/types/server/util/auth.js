import { context, reddit } from '@devvit/web/server';
export const getCurrentUsername = async () => {
    const currentUser = await reddit.getCurrentUser();
    return currentUser?.username ?? null;
};
export const isCurrentUserModerator = async () => {
    const { subredditName } = context;
    const viewerUsername = await getCurrentUsername();
    if (!subredditName || !viewerUsername) {
        return false; // assume false if fail to get context---unusual/suspicious case
    }
    try {
        const moderators = await reddit.getModerators({
            subredditName,
            username: viewerUsername,
        }).all();
        return moderators.length > 0;
    }
    catch (error) {
        console.error('Unable to check moderator status', error);
        return false;
    }
};
//# sourceMappingURL=auth.js.map