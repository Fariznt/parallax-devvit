import { Devvit } from "@devvit/public-api";
import type { TriggerEventType, TriggerContext } from "@devvit/public-api";
import { Policy, EvaluationResult, PolicyEngine }  from "./PolicyEngine.js";

Devvit.addSettings([
  { // TODO remove; accessed with context.secrets...
    name: 'apiKey',
    label: 'OpenAI API Key',
    type: 'string',
    scope: 'app',
    isSecret: true,
  },
  { // TODO dont forget to validate JSON; context.setings...
    name: 'policyJson',
    label: 'Policy File (JSON)',
    type: 'paragraph',
    scope: 'installation', 
  },
  {
    name: 'llmURL',
    label: 'LLM Base URL',
    type: 'string',
    scope: 'installation', 
  },
  {
    name: 'llmName',
    label: 'LLM Model Name',
    type: 'string',
    scope: 'installation', 
    defaultValue: 'gpt-3.5-turbo',
  },
]);

// Devvit.configure({
//   redditAPI: true,
//   redis: true,
//   http: true,
// });



export default Devvit;
