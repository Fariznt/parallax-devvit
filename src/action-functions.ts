import { EvaluationResult } from "./PolicyEngine/handlers/types.js";
import { TriggerContext } from "@devvit/public-api";
import { ContentInfo, ActionFunction } from "./types.js"

const sendModmail: ActionFunction = async (
  result,
  content,
  context
) => {
  // Edge case handling---Devvit events don't guarantee these are truthy
  if (!content.username) {
    content.username = "unknown user"
  }
  if (!content.link) {
    content.link = "<link could not be obtained>"
  }

  const subject: string =
    `Review ${content.type} for ${result.violations.length} failed policy condition(s)`;

  let body: string =
    `Review the following ${content.type} by u/${content.username}:  
    ${content.link}

    \`\`\``;

  for (const v of result.violations) {
    const severityStr = `${v.severity ? ` (of severity ${v.severity})` : ""}`;
    body +=
    `
    Violation of ${v.node.display_name ?? v.node.type}${severityStr}:
    ${v.explanation}
    `;
  }
  body += "\`\`\`";
  await context.reddit.modMail.createConversation({
    body: body,
    subredditName: context.subredditName!,
    subject: subject,
    to: null // i.e. internal moderator conversation
  });
};

// const sendModqueue: ActionFunction = async (
//   result,
//   content,
//   context
// ) => {
//   // TODO: implement modqueue report
// };

const remove: ActionFunction = async (
  result,
  content,
  context
) => {
  console.log("removal reached")
  if (!content.id) {
    console.warn("content id null, falling back to modmail")
    sendModmail(result, content, context)
  } else {
    await context.reddit.remove(content.id, false);
    await context.reddit.addRemovalNote({
      itemIds: [content.id], 
      reasonId: "", // empty for now---may extract from trace in future
      modNote: result.modNote
    });
  }
};

// const ban: ActionFunction = async (
//   result,
//   content,
//   context
// ) => {
//   // TODO: implement ban (perma or temp handled internally)
// };


/**
 * Mapping of action (string action names) to their executable action functions.
 * Actions are dispatched dynamically based on severity resolution in main.ts
 */
export const actionFunctions: Record<string, ActionFunction> = {
  sendModmail: sendModmail,
  // sendModqueue: sendModqueue,
  remove: remove,
  // ban: ban,
};