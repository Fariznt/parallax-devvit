/** Shared API types used by both client (fetch) and server (res.json). */
export type InitResponse = {
  username: string | null;
  isModerator: boolean;
};
