# Privacy Policy

**Last updated:** 1/21/25

This Privacy Policy describes how **Policy-Agent** (“the App”, “we”, “us”) collects, uses, stores, and shares information when installed and used on Reddit communities via the Devvit platform.

## 1. Scope

This Privacy Policy applies only to data processed by the Devvit App in the context of Reddit moderation and content analysis. The Devvit App operates exclusively within Reddit and does not provide an external user-facing service. This Privacy Policy does NOT apply to other services or applications under similar names or operating for other platforms using the same core infrastructure.

## What data we collect

Based on the App’s current implementation, we collect and/or process the following categories of data:

### 1. Reddit content submitted to the App for evaluation
When a post or comment is created, the App reads and processes:

- **Comments**
  - Comment text (the comment body)
  - Comment ID
  - Comment permalink

- **Posts**
  - Post title
  - Post body
  - Post image
  - Post ID
  - Post permalink

### 2. Contextual thread content (comments only)
For a new comment, the App may fetch and process the **parent comment chain** (the thread context) by repeatedly retrieving parent comments. This contextual data can include:

- Parent comment text (bodies)
- Parent comment author IDs (if available from Reddit; otherwise recorded as “Unknown User”)
- Parent comment IDs/parent relationships as needed to traverse the chain

This context is used only to evaluate the new comment more accurately.

### 3. Reddit account identifiers (limited)
The App may read and use:

- **Author username** for the triggering post/comment (if provided in the event payload)
- **Author ID** for parent comments in a thread (when fetching parent comments)

### 4. Image / media URL (posts only, if available)
For posts, the App may fetch an enriched thumbnail and process:

- **An image URL** (thumbnail/enriched thumbnail URL), if present

### 5. App configuration and secrets (moderator-provided settings)
The App uses settings configured by moderators, including:

- **LLM API key** (stored as a secret at app scope)
- **Policy definition JSON** (installation scope)
- **Severity to action mapping JSON** (installation scope)
- **LLM base URL** and **LLM model name** (installation scope)
- **Early-exit / short-circuit configuration** (installation scope)

These settings are not collected from regular Reddit users; they are provided by moderators/admins configuring the App.

## 3. How We Use Data

Collected or processed data is used solely for the following purposes:

- Automated evaluation of Reddit posts and comments against moderator-defined policies
- Assisting moderators with:
  - Content review
  - Rule enforcement
  - Reporting and escalation
- Generating explanations or summaries for moderation decisions
- Triggering Reddit-native moderation actions (e.g., modmail, modqueue, removals, bans)
- Debugging, error handling, and improving reliability of the App

The App does **not** use data for:
- Advertising
- Behavioral profiling
- Analytics unrelated to moderation
- Monetization or resale

## 4. How We Share Data

### 4.1 Reddit
All moderation actions and notifications are performed using Reddit’s official APIs and are visible only according to Reddit’s permission models.

### 4.2 Third-Party Services
If enabled by the moderator:
- User content may be sent to external providers for analysis under the moderator-defined policy
- No user data unrelated to evaluation is ever shared
- All third-party services with whom any content is shared is explicitly part of [Devvit's global fetch allowlist](https://developers.reddit.com/docs/capabilities/server/http-fetch#global-fetch-allowlist)

Current third party services with whom any content is shared include:
- Google's Generative Language API (generativelanguage.googleapis.com)

We do **not** sell, rent, or trade any data to third parties.

## 5. Data Storage and Retention

- The App does not currently maintain a persistent external database of its own.
- Temporary in-memory processing may occur during evaluation.
- Based on configuration, the App may include limited excerpts of content, usernames, links, and policy evaluation explanations in **Reddit modmail** messages or **Reddit modqueue** sent to subreddit moderators.

## 7. Moderator Control and Responsibility

Moderators:
- Fully control App configuration
- Define policies, severity levels, and enabled actions
- Are responsible for ensuring their use of the App complies with Reddit policies and applicable laws

The App acts strictly according to moderator-defined settings.

## 8. Children’s Privacy

The App is not designed for use by children and processes only Reddit content subject to Reddit’s own age requirements.

## 9. Changes to This Policy

This Privacy Policy may be updated as the App evolves. Material changes will be reflected by updating the “Last updated” date.

## 10. Contact

If you have questions or concerns about this Privacy Policy, please contact:

**parallax.moderator@gmail.com**
