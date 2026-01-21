# Parallax

A high-flexibility decision engine driven by structured, moderator-defined policies to determine
the set of violations made by some unstructured text. This "Policy Engine" has user content 
routed to it by comment and post event listeners which use the policy evaluation result to apply 
moderation actions in accordance with moderator-defined instructions.
---

## Overview


[2–4 sentences describing the problem this project solves, the core idea behind the solution, and the intended audience or use case.]



Initial launch and development focus is for integration with Reddit's developer platform Devvit, and
the tool is en route for use on 2 subreddits (6k and 140k+ members) upon approval from Reddit.

---

## Key Features

- **High logical flexibility (boolean completeness over modular predicates)** – Moderators/policymakers can represent (practically) any boolean expression composed of checks (ex. regex matching) that determine user content as a violation or not. For example, we could represent x and (y or z) where each of x, y, and z are there own rule or boolean expression.
- **High semantic flexibility (integrated LLM use)** - Policies can be defined to use LLM calls for checks (named semantic_check) under the same model explained above.
- **High use-case flexibility (configurable scope of actions)** - Moderators can choose to what degree Parallax plays a role in their moderation workflow by defining violation severities and mapping those severities to moderation actions. For example, one subreddit may choose to use it as a early-report system (violations send to modmail), while another may harness automatic removals.
- **Time & cost saving measures (gated evaluation)** – The policy language is defined to enable and promote policies where expensive checks (ex. network calls and especially LLM usage) can be gated behind cheaper checks that first determine whether escalation is necessary. By default, failing of a given check results in escalation to a downstream check. 
- **Explainable decisions** - All violations determined by the engine come packaged with corresponding explanations tailored to the content being evaluated, and internal execution traces are produced.
- **Reproducible decisions** - All checks (including those involving LLMs) are ultimately deterministic (temperature = 0), improving policy debuggability. 
- **Robustness under adversarial input** – Any check that uses LLMs is guarded against prompt injection and has been briefly tested for this capability.

---

## Architecture / Design

TBD

<talk about separation of policy engine and devvit components, platform agnostic intention>

Details will be posted to ./docs/architecture

---

## Tech Stack

- **Language(s):** Typescript, JSON -- languages limited by Devvit environment
- **Runtime / Framework:** Devvit sandboxed serverless runtime (event-driven); migration to web app planned
- **Storage:** N/A, stateless by design; evaluation execution trace storage on Redis planned
- **External Services / APIs** Google's Generative Language API (LLMs), OpenAI's moderation API planned (safety checks)
- **Tooling:** Vitest

---

# Getting Started / Documentation

## Legal

See ./legal for Terms of Service and Privacy Policy

## Getting Started

TBD

## Documentation

See ./docs directory for complete documentation (highly recommended if anyone else chooses to
use this tool). 'Getting Started' is an overview.

---

# Devvit Submission Requirements

Devvit requires some additional documentation for approval. All of that will be in this section.

## Fetch Domains

The following domains are requested for this app (all of which are on the global fetch allowlist):

- `generativelanguage.googleapis.com` - Used for semantic_check nodes, the LLM-based predicate-type in a policy representation that is optionally included for complex inquiries about user content being evaluated for rule violation.
