/**
 * Types related to posts, comments, and action handling
 */

/**
 * Map from severity level (recorded in Policy) to corresponding mod actions
 * (sendModmail, sendModqueue, remove, ban)
 */
export type SeverityActionMap = Record<number, string[]>;

/**
 * Type for holding post/comment information for action-taking
 */
export type ContentInfo = {
  username: string | null;
  id: string | null;
  text: string;
  link: string | null;
  type: "comment" | "post";
};


