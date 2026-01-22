import { EvaluationResult } from "./PolicyEngine/handlers/types.js";
import { TriggerContext } from "@devvit/public-api";

/**
 * This file has types related to posts, comments, and action handling
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

/**
 * Type for functions that perform a Reddit action based on result from policy engine
 */
export type ActionFunction = (
  result: EvaluationResult,
  content: ContentInfo,
  context: TriggerContext
) => Promise<void>;



