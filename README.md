# Parallax

### A high-flexibility, context-aware, semantic-aware decision engine driven by structured, moderator-defined policies for content moderation. 

---

## Overview

Existing rule-based content moderation tools are inflexible, unable to provide conditional 'x if y but not if z' type checks, consider thread context, nor identify violations of rules that forbid certain semantics or intentions rather than simple patterns of words tailored to a community's needs. 

Hooking up an LLM with Devvit for automatic removals is simple, but expensive, and even inaccurate as the complexity of a ruleset as a whole grows. How can we provide content moderators the power to define complex content policies, leverage the power of AI models, yet keep costs low (even free)?

We define a language PDN (Policy Definition Language) as a strict subset of JSON that provides logical combinators (AND, OR, NOT) and chainable content evaluation predicates (ex. regex patterns), allowing users to define a tree representation of complex content evaluation policies.

This project has implemented this model and an interpreter for PDN, and addressed the aforementioned issues (see 'key features'). 

Initial launch and development focus is for integration with Reddit's developer platform Devvit. We have user content routed to this "Policy Engine" by comment and post event listeners so that results can be applied as Reddit mod actions in accordance with moderator-defined instructions. The tool is currently deployed to 2 subreddits (6k and 140k+ members). 

For questions, concerns, or support, contact: parallax.moderator@gmail.com

Policy-Agent is an independent third-party application and is not affiliated with or endorsed by Reddit.

---

## Simple Example

We can represent the following ruleset in PDN as a tree of combinators (all, any, not) and predicates. 

1. Don't say "apple"
2. No targeted insults about obesity
3. All content must reference bananas explicitly or implicitly

A given policy tree expresses what the evaluated content must satisfy. Here, we must satisfy 'all' of the 3 rules. Use of fat-words triggers an LLM check to see if there is a targeted insult before marking a violation, and use of the word primate triggers a check to see if bananas are implied.

[![Policy as tree](https://i.imgur.com/dTzZJU1.png)](https://imgur.com/a/PBP3CYy)

See ./docs for more. See ![demo subreddit](https://www.reddit.com/r/parallax_demo/) to try it out.

---

## Key Features

- **High logical flexibility (boolean completeness over modular predicates)** – Moderators/policymakers can represent (practically) any boolean expression composed of checks (ex. regex matching) that determine user content as a violation or not. For example, we could represent x and (y or z) where each of x, y, and z are there own rule or boolean expression.
- **High semantic flexibility (integrated LLM use)** - Policies can be defined to use LLM calls for checks (named semantic_check) under the same model explained above.
- **High use-case flexibility (configurable scope of actions)** - Moderators can choose to what degree Policy-Agent plays a role in their moderation workflow by defining violation severities and mapping those severities to moderation actions. For example, one subreddit may choose to use it as a early-report system (violations send to modmail), while another may harness automatic removals.
- **Time & cost saving measures (gated evaluation)** – The policy language is defined to enable and promote policies where expensive checks (ex. network calls and especially LLM usage) can be gated behind cheaper checks that first determine whether escalation is necessary. By default, failing of a given check results in escalation to a downstream check. 
- **Explainable decisions and monitorability** - All violations determined by the engine come packaged with corresponding explanations tailored to the content being evaluated, and internal execution traces are produced. Moderators may configure the app to inform themselves of any subset of violations and mod actions they want to be informed of, with the default being that all violations are sent to modmail (with no other/silent mod actions ocurring).
- **Reproducible decisions** - All checks (including those involving LLMs) are ultimately deterministic (temperature = 0), improving policy debuggability. 
- **Error feedback** - Errors during evaluation are surfaced to modmail. This is most useful for debugging your PDN syntax (for which the validator provides an address of failure within your policy definition).
- **Robustness under adversarial input** – Any check that uses LLMs is guarded against prompt injection and has been briefly tested for this capability.

---

## Benchmark

Parallax is meant to give LLM-level moderation judgment at a fraction of the cost by gating LLMs behind cheap checks within a composition of combinators and predicates that represent some complex content policy.

**Dataset:** 2,000 comments randomly sampled from from UC Berkeley's [Measuring Hate Speech](https://huggingface.co/datasets/ucberkeley-dlab/measuring-hate-speech) corpus (hate if `hate_speech_score > 0.5`; 26% positive). Three evaluation schemes were compared: an LLM-only check (gpt-6-luna), regex-only keyword filtering (Davidson et al. 2017 lexicon + hate-related keywords), and a maximally simple Parallax policy that composes those two: the same regex gating the same LLM check. 

![Confusion counts per policy](docs/benchmark-mhs.svg)

| policy | TP | TN | FP | FN | F1 |
|---|---|---|---|---|---|
| llm | 279 | 1212 | 279 | 230 | 0.523 |
| parallax | 224 | 1340 | 151 | 285 | 0.507 |
| regex | 406 | 912 | 579 | 103 | 0.544 |

Parallax halved LLM calls (985 vs. 2,000 calls) and token cost compared with an LLM-only moderation scheme while retaining an impressive 97% of an LLM-only scheme's F1. 

It also produced 74% fewer false positives than the regex-only filtering that acts as the LLM gate (151 vs. 579), at the cost of fewer true positive flagging.

### Discussion

- The tradeoff here greatly suits online content moderation where human labor limits how much content can be reasonably reviewed, but LLM-only moderation is not justified due to cost. 

- The hate speech dataset understates Parallax's value: much of it can be caught by filtering on slurs or with cheaper tone classifiers like OpenAI's moderation API. Communities with sensitive terminology need judgment about *how* a term is used, which is where a gated semantic check matters most and where Parallax is most useful.

- Our simple Parallax policy, chosen for comparability with the regex-only and LLM-only schemes, also understate Parallax's value: This is a two-node policy that doesn't utilize the system's ability to represent and interpret compositions of predicates that represent nontrivial content policies as boolean formulas.

- Finally, it should also be noted that this dataset has higher positive rate (26%) than a typical social media space has true violations, so the percentage of LLM calls are overstated and the cost in practice is very miniscule. The system runs today on one subreddit with 146k members, and has costed $0 under the free Gemini usage limits.

---

## Tech Stack

- **Language(s):** Typescript, JSON -- languages limited by Devvit environment
- **Runtime / Framework:** Devvit sandboxed serverless runtime (event-driven); migration to web app planned
- **Storage:** N/A, stateless by design; evaluation execution trace storage on Redis planned
- **External Services / APIs** Google's Generative Language API (LLMs), OpenAI's moderation API planned (safety checks)
- **Tooling:** Vitest

---

## Future Tasks

- Easily most important: Usability improvements. Perhaps a well-tested LLM pipeline to turn existing rulesets into validated PDN, and/or a user interface for defining the policy in terms of blocks rather than JSON.
- Marketing to more subreddits
- Accepting YAML syntax for PDN
- Ban action with custom number of days
- Adding a core predicate, safety_check* (content safety classifier; more powerful than regex of match_node and cheaper than LLMs) via OpenAI's moderation API
- Report handling (currently relying on post and comment creation as the trigger from Reddit to use Parallax)

# Getting Started / Documentation

## Legal

See ./legal for Terms of Service and Privacy Policy, which applies to the Devvit application. See LICENSE in root directory for license information, which applies to the code.

## Documentation

See ./docs directory for complete documentation.
---

# Devvit Submission Requirements

Devvit requires some additional documentation for approval. All of that will be in this section.

## Fetch Domains

The following domains are requested for this app (all of which are on the global fetch allowlist):

- `generativelanguage.googleapis.com` - Used for semantic_check nodes, the LLM-based predicate-type in a policy representation that is optionally included for complex inquiries about user content being evaluated for rule violation.
