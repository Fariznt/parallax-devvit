### DEV NOTE: This documentation is meant to help provide an understanding of how the app works to code reviewers. While it is sufficient (in information) to enable anyone to use the app with some tinkering (if it were to be listed), it is not yet maximally user-friendly. The app is intended to be deployed and evaluated under my supervision in select subreddits before it is made public, and I will write much better documentation then.
# Policy-Agent Documentation

---

## What a Policy Is

A **policy** is a JSON object written in PDN representing a node in a policy tree. This is the text that goes in the Devvit app's settings under "Policy Definition". Most of the time, when we say policy, we mean the root node (i.e. the whole tree), and when we discuss a part of that tree, we say 'policy node'. 

When writing a policy, you want to think: "All content should satisfy this".

When Policy-Agent is running, all user comments and posts are evaluated against the policy through tree traversal (in accordance with your PDN logic) with accumulation of evaluation information as individual nodes are evaluated.

The list of violations produced by this process, each of which come with explanations and other data, determine mod actions as defined by a [Severity-Action Map](#Severity-Action Map), a much simpler configuration than policies.

Policies are composable:
- Predicate nodes perform checks.
- Combinator nodes (`all_of`, `any_of`, `not`) express logic over child policies.

Here is a simple example to think about as you read this documentation. You will understand more of it as you read, but know that it encodes the following rules:
1. Don't say "fuck"
2. No targeted insults about obesity
3. All content must reference bananas explicitly or implicitly
```
{
  "all_of": [
    {
      "name": "no_apple_allowed",
      "severity": 2,
      "not": {
        "match_check": {
          "patterns": [
            "\\b(apple)\\b"
          ],
          "flags": "i"
        }      
      }
    },
    {
      "name": "no_targeted_fat_insults",
      "severity": 2,
      "not": {
        "name": "fat_words",
        "match_check": {
          "patterns": [
            "\\b(fatty)\\b",
            "\\b(obese)\\b",
            "\\b(overweight)\\b",
            "\\b(lard)\\b",
            "\\b(blubber)\\b"
          ],
          "flags": "i"
        }  
      },
      "next_check": {
        "not": {
            "name": "targeted_insult",
            "semantic_check": {
            "condition": "includes targeted insults"
          }
        }
      }
    },
    {
      "severity": 1,
      "any_of": [
        {
            "name": "banana_mention",
            "match_check": {
               "patterns": ["\\bbananas?\\b"],
               "flags": "i"
            }
        },
        {
            "name": "primate_mention",
            "match_check": {
                "patterns": ["\\b(monkey|ape|gorilla)(s)?\\b"],
                "flags": "i"
            },
            "next_check": {
                "name: "suggests_banana",
                "semantic_check": {
                    "condition": "implies, suggests, or hints at bananas intentionally"
                }
            }
        }
      ]
    }
  ]
}

If we were to express this policy as a tree (to help you understand what a 'node' is), it would like like the following:

[Policy as tree](https://imgur.com/a/MyiUp0M)

```

---

## Core Concepts & Logic

## Policy Shape

Every policy node (a unit of text within PDN) has:

- Optional metadata:
  - `name?: string`
  - `severity?: number`
  - `next_check?: Policy`
- **Exactly one** operator:
  - A **predicate** from `match_check`, `semantic_check`, `safety_check` (currently unavailable), `language_check` (currently unavailable).
  - OR a **combinator** from `any_of`, `all_of`, `not`

- Name, when available, will be used in place of check-type (e.g. match_check) in errors or violation reports.
- Severity, when available, will be used to determine what action to take in accordance with [Severity-Action Map](#Severity-Action Map). **With no severity, violation of that node defaults to a report in modmail (no removal)**.
- next-check, predicates, and combinators are described next.

### Predicates

Predicates are nodes within the policy that perform checks, such as regex pattern matching.

Any time a given node is violated, it:
1. **Produces a violation**, if there are no downstream checks. This is the case with saying 'apple' in our earlier example.
2. **Escalates** to a `next_check` (a policy defined in parentNode.next_check, in JSON terms), which runs additional logic/checks. In the earlier example, when "no targeted insults about obesity" fails (a match_check), we escalate to a semantic_check that checks whether it was a targeted insult or mere word use.

The intention with this design is to make way for gated checks. An intelligent policy screens for violation using cheaper, dumber checks, and when those are violated, we verify the violation with a smarter check instead of bothering a real human moderator so early.

### Combinators

Combinators are logical nodes that implement (AND, OR, and NOT) as `all_of`, `any_of`, `not` nodes respectively. These do exactly what they sound like. 
- A violation occurs if not all of the nodes listed under an all_of node pass.
- A violation occurs if not any of the nodes listed under an any_of node pass.
- A violation occurs if a node listedn under not passes.

```
## Combinators

---

### `all_of`

All child policies must be satisfied. In this example, we must have all content pass BOTH that 'this is English' and 'this has banana(s)'. If 'Early Exiting' has value 'true' in your settings, the evaluator will exit as soon as one of these fails, instead of accumulating ALL violations. 

Tip: Use early exiting when you only want to know if content should be removed or reported (binary policies). Don't use it if Policy-Agent's scope in your subreddit is fully autonomous, with differnet levels of severity being used to determine punishments.

```json
{
  "all_of": [
    {
      "match_check": {
        "patterns": ["\\bbanana(s)?\\b"],
        "flags": "i"
      }
    },
    {
      "language_check": {
        "allowed": ["EN"]
      }
    }
  ]
}
```

### `any_of`

At least one child policy must be satisfied. If one is satisfied, we short-circuit and don't evaluate the rest because any_of is sastisfied. 

Tip: Put cheaper checks earlier in an any_of node, and most expensive checks like semantic_check later.

```
{
  "any_of": [
    {
      "match_check": {
        "patterns": ["\\b(cat|dog)\\b"],
        "flags": "i"
      }
    },
    {
      "match_check": {
        "patterns": ["\\bhamster(s)?\\b"],
        "flags": "i"
      }
    }
  ]
}
```

### 'not'

Negates the meaning of the policy.

```
{
  "not": {
    "match_check": {
      "patterns": ["\\bslur\\b"],
      "flags": "i",
      "blacklist": true
    }
  }
}
```



## Predicate Nodes

Predicate nodes perform actual checks against content.

---

## `match_check`

A regex-based pattern match.

### Fields
- `patterns: string[]` — regex patterns
- `flags?: string` — regex flags (e.g. `"i"`)
- `blacklist?: boolean`
  - `false` (default): whitelist semantics
  - `true`: blacklist semantics

### Blacklist example

```
{
  "name": "no slurs",
  "severity": 3,
  "match_check": {
    "patterns": ["\\b(slur1|slur2)\\b"],
    "flags": "i",
    "blacklist": true
  }
}
```

### Whitelist example

```
{
  "name": "must mention bananas",
  "severity": 1,
  "match_check": {
    "patterns": ["\\bbanana(s)?\\b"],
    "flags": "i"
  }
}
```
Word boundaries (\\b) are strongly recommended to avoid substring matches. Note that because PDN is a subset of JSON, your regex pattern must be JSON-escaped, which means you need double escaping for backslashes. Where normally you would write regex pattern "\bbanana(s)?\b" you need to escape the backslash "\\bbanana(s)?\\b"

### Sequencing example

Advanced functionality for flag 'g'. Documentation will come later.

## `semantic_check`
An LLM-based check expressed as a plain-English condition (a semantic).

```
{
  "semantic_check": {
    "condition": "the message is clearly joking and not intended as harassment"
  }
}
```

A semantic_check is NOT allowed downstream either of:
- An any_of node
- A negated all_of node (i.e. has upstream NOT).
This is to prevent internal logical complexity with LLM call batching, and to enforce well-written policies (if a semantic_check is being used, it is cheaper to use only one and encode 'any' logic directly into it).

### Guidelines
- Write conditions as reviewable assertions, not prompts.
- Keep them minimal but precise.
- Use cheaper checks when possible as an alternative.
- Gate semantic_checks behind cheaper checks where possible.

### Typical usage

Semantic checks are most often used in next_check to refine earlier screens (preventing false positives):

```
{
  "safety_check": {
    "scope": "text",
    "categories": ["harassment"]
  },
  "next_check": {
    "semantic_check": {
      "condition": "the content is targeted harassment directed at another user"
    }
  }
}
```

## `safety_check`

PDN that includes this properly is considered valid by the validator, but your evaluations will error. This check is not yet implemented and will be one of the main priorities in a future update. 

Therefore, we omit details of how to define it. Curious eyes may consult the source code type.ts files.

## `language_check`

PDN that includes this is considered valid by the validator, but your evaluations will error. This check is not yet implemented.

Therefore, we omit details of how to define it. Curious eyes may consult the source code type.ts files.

# Severity-Action Map

The **Severity-Action Map** is a Devvit setting (`Action by Severity`) that lets you automatically apply moderator actions based on the **highest severity** among all violated policy nodes.

This setting is optional. If it’s missing (or if no violated node has a severity), Parallax defaults to **sending modmail** with no removal or other action.

Like the policy, it is inputted as JSON text. In this case, it is merely a collection of severity values (must be numbers) to a list of actions (all of which are executed for a violated node of that severity level).

Example:

```json
{
  "1": ["sendModmail"],
  "2": ["remove", "sendModmail"],
  "4": ["remove", "lock", "ban:7"]
}
