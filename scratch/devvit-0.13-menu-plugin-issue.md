# Devvit 0.13: Menu handler plugin failure (policy-agent)

This document records what we learned while debugging the **Moderation Webview** menu action (`/internal/menu/post-create`) after upgrading from Devvit 0.12 to 0.13.

## Summary

**Root cause (as far as we can determine):** On Devvit **0.13.x**, handlers registered as **menu endpoints** (`devvit.json` → `menu.items[].endpoint` → `/internal/menu/*`) run in an execution context where **no Devvit plugin is reachable over gRPC**. Every plugin call—Redis, Reddit listings, `submitCustomPost`—fails the same way before your application logic can complete.

This is **not** a Redis bug, **not** a missing-key bug, and **not** fixed by swapping Redis for the Reddit API. It is a **platform/runtime issue** affecting the menu → internal handler path on 0.13.

The app works on **0.12.x** with the same code patterns.

---

## Symptom

Clicking **Moderation Webview** in the subreddit mod menu shows:

```
Error: Contact a developer at parallax.moderator@gmail.com.
```

In `devvit playtest` logs, the real error is:

```
Error: undefined undefined: undefined
  at callErrorFromStatus (...)
  ...
  code: undefined,
  details: undefined,
  metadata: _Metadata { internalRepr: Map(0) {}, options: {} }
```

The handler's `catch` block was initially swallowing this; once `console.error('[handleMenuPostCreate] failed', error)` was added, the gRPC stack became visible.

---

## What triggers the break

| Action | Result |
|--------|--------|
| `npm install devvit@latest` (0.12 → 0.13) | Breaks |
| `npx devvit update app` (sync `@devvit/web` to 0.13) | Still broken |
| Revert to 0.12 packages + `npm install` | Works again |

The bisect points at the **0.13 platform/CLI upgrade**, not at a specific application code change.

---

## What we ruled out

These hypotheses were tested and **did not** explain the failure:

| Hypothesis | Why it was ruled out |
|------------|----------------------|
| **Redis key naming** (spaces, capitals) | Renamed to `moderation:webview-post-url`; same error |
| **Missing key / `get` on absent key** | Switched to `redis.exists` first; `exists` itself fails |
| **`submitCustomPost` splash API change (0.13)** | Added `entry: 'default'`; failure occurs before/alongside other calls |
| **Hybrid app (blocks + web)** | Removed `blocks.entry` temporarily; menu still failed |
| **Redis vs Reddit** | Replaced Redis lookup with `reddit.getNewPosts()`; same gRPC failure |
| **Application permissions** | `devvit.json` has `redis: true` and `reddit: true`; config reloads OK |

---

## What actually fails (the intersection)

Three separate calls were tried from the same menu handler. All share the **same failure signature**; only the **last stack frame** (which plugin RPC was invoked) differs.

### 1. Redis — `redis.exists` / `redis.get`

```
GenericPluginClient.Exists → RedisClient.exists
```

### 2. Reddit listings — `reddit.getNewPosts(...).all()`

```
GenericPluginClient.New → Listing.fetch → Listing.all
```

### 3. Reddit submit — `reddit.submitCustomPost(...)`

```
GenericPluginClient.SubmitCustomPost → Post.submitCustomPost → RedditClient.submitCustomPost
```

### Common stack (the intersection)

All three paths go through:

1. `GrpcWrapper.request`
2. `GenericPluginClient.<Method>` (Exists / New / SubmitCustomPost / …)
3. `callErrorFromStatus` with **`code: undefined`, `details: undefined`**, empty metadata

**Conclusion:** The menu handler cannot talk to **any** Devvit plugin host on 0.13. The bug is at the **gRPC plugin bridge for `/internal/menu/*` handlers**, not in a specific plugin (Redis, Listings, Reddit).

---

## Architecture context

### How the menu action is wired

```
devvit.json
  menu.items[].endpoint: "/internal/menu/post-create"
       ↓
src/server/index.ts
  router.post('/internal/menu/post-create', handleMenuPostCreate)
       ↓
handleMenuPostCreate (Express handler)
  → redis / reddit / etc. via @devvit/web/server
```

### App shape (hybrid, but not the root cause)

This repo runs both:

- **Devvit Web server** (`src/server/*`) — webview, triggers, menu endpoint
- **Blocks entry** (`src/service/main.ts` via `blocks.entry`) — PolicyEngine, legacy triggers, settings

Hybrid mode was suspected early, but **disabling `blocks.entry` did not fix the menu**. The 0.13 changelog also states that non-UI Blocks features (menu actions, forms, triggers on `@devvit/public-api`) are deprecated but still intended to work—not that hybrid is forbidden.

The failure is specific to **Devvit Web menu internal routes on 0.13**, not to hybrid architecture per se.

---

## 0.13 changelog vs our experience

From [Devvit 0.13.0 changelog](https://developers.reddit.com/docs/changelog):

- **Devvit Web breaking change:** only documented change is removal of `splash` / `loading` on `submitCustomPost` (use `entry` instead).
- **No documented breaking change** to Redis or menu internal handlers.
- **Upgrade to 0.13 is not required** until Blocks UI removal on **June 30, 2026**.

Our experience suggests an **undocumented regression** in menu handler plugin provisioning on 0.13.

---

## Workarounds considered

| Approach | Outcome |
|----------|---------|
| Redis-only fix (key rename, `exists` before `get`) | Failed — `exists` also hits broken gRPC |
| Reddit API lookup instead of Redis | Failed — `getNewPosts` same gRPC failure |
| `submitCustomPost` only (no lookup) | Failed — `SubmitCustomPost` same gRPC failure |
| Remove blocks (web-only test) | Menu still failed |
| **`onAppInstall` trigger** to create post | **Untested / may work** — triggers use `/internal/on-app-install`, a different path; official template creates posts on install with the same `createPost()` helper |
| **Pin to 0.12.x** | **Confirmed working** in local playtest |

### Current mitigation in this repo

- Shared logic: `src/server/util/moderation-webview-post.ts`
- **`onAppInstall`**: attempts to create the webview post at install time (if trigger context has working plugins)
- **Menu handler**: tries the same helper; on failure shows a toast directing mods to the install-created post

### Recommended paths forward

1. **Short term (reliable):** Pin dependencies to 0.12.x and upload with that SDK:
   ```bash
   npm install devvit@0.12.7 @devvit/web@0.12.10 @devvit/public-api@0.12.7
   ```
   Changelog states 0.13 upgrade is not required yet.

2. **If you must stay on 0.13:** Rely on `onAppInstall` + manual navigation to the webview post until Reddit fixes menu handlers. Verify install logs for `[handleOnAppInstall] moderation webview post ready: <url>`.

3. **Report upstream:** [reddit/devvit issues](https://github.com/reddit/devvit/issues) with repro:
   - Devvit Web app, `devvit.json` menu item → `/internal/menu/*`
   - Any `@devvit/web/server` plugin call (`redis`, `reddit.submitCustomPost`, etc.)
   - 0.13.4 playtest, empty gRPC status (`code: undefined, details: undefined`)
   - Same code works on 0.12.7

---

## Evidence to collect for a bug report

When reproducing, capture from `devvit playtest` logs:

1. Menu click → `[handleMenuPostCreate] handling menu post create action`
2. Full stack with `GenericPluginClient.<Method>`
3. Devvit versions: `devvit`, `@devvit/web`, `@devvit/public-api` from `package.json`
4. Playtest version string (e.g. `v0.0.23.29`)
5. Confirmation that **0.12.x** with identical handler logic succeeds

Optional: trigger `onAppInstall` (reinstall) and compare whether `/internal/on-app-install` can call plugins while `/internal/menu/*` cannot.

---

## Files involved

| File | Role |
|------|------|
| `devvit.json` | Menu item → `/internal/menu/post-create`; permissions |
| `src/server/handlers/menu-post-create.ts` | Menu handler |
| `src/server/util/moderation-webview-post.ts` | Shared find/create webview post logic |
| `src/server/handlers/on-app-install.ts` | Install-time post creation (workaround) |
| `package.json` | `@devvit/web` / `devvit` version pins |

---

## Timeline of investigation (abbreviated)

1. Upgraded `devvit` CLI to 0.13 → menu action broke.
2. Assumed Redis/`get` on missing key → disproved (`exists`, `get`, `set` all fail).
3. Assumed `submitCustomPost` splash API → disproved (submit also fails with same gRPC error).
4. Assumed hybrid blocks+web conflict → disproved (web-only test still failed).
5. Replaced Redis with Reddit listing API → same failure at `GenericPluginClient.New`.
6. Stripped to `submitCustomPost` only → same failure at `GenericPluginClient.SubmitCustomPost`.
7. **Conclusion:** all plugin calls from menu internal handlers fail identically on 0.13; pin to 0.12 or avoid menu for plugin work.

---

*Last updated: June 2026 — Devvit 0.13.4, policy-agent playtest on `policy_agent_dev`.*
