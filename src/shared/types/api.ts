/** Shared API types used by both client (fetch) and server (res.json). */

// Reddit context passed to the client
export type InitResponse = {
  username: string | null;
  isModerator: boolean;
};
