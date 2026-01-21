import { EvaluationResult } from "./PolicyEngine/handlers/types.js";
import { TriggerContext } from "@devvit/public-api";

/**
 * Performs a Reddit action based on result from policy engine
 */
export type ActionFunction = (
  result: EvaluationResult,
  contentId: string,
  context: TriggerContext
) => Promise<void>;


const sendModmail: ActionFunction = async (
  result,
  contentId,
  context
) => {
  // TODO: implement modmail send
};

const sendModqueue: ActionFunction = async (
  result,
  contentId,
  context
) => {
  // TODO: implement modqueue report
};

const remove: ActionFunction = async (
  result,
  contentId,
  context
) => {
  // TODO: implement content removal
};

const ban: ActionFunction = async (
  result,
  contentId,
  context
) => {
  // TODO: implement ban (perma or temp handled internally)
};


/**
 * Mapping of action (string action names) to their executable action functions.
 * Actions are dispatched dynamically based on severity resolution in main.ts
 */
export const actionFunctions: Record<string, ActionFunction> = {
  sendModmail: sendModmail,
  sendModqueue: sendModqueue,
  remove: remove,
  ban: ban,
};