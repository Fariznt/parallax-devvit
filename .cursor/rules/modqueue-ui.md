# Custom Modqueue UI — Spec & Context

## What This Is

A Devvit **webview post** that serves as a custom moderation queue for Reddit moderators. Devvit webviews have two display contexts:

- **Inline** (`src/client/inline/`): A small preview shown before the post is opened. Currently shows a greeting and an "Open modqueue" button that calls `requestExpandedMode(event, 'main')` to launch the main view. Non-mods see a "not for you" message.
- **Main** (`src/client/main/`): The full webview, rendered in expanded/fullscreen mode. **This is where the modqueue UI lives.**

---

## Goal State: Main Modqueue UI

### Core Feature

An infinite-scroll feed of user-submitted content (posts and comments) awaiting moderation review. Items are ordered **newest → oldest**. The feed must feel fast and usable on mobile, desktop, and fullscreen aspect ratios.

### Per-Item Display

Each card in the feed represents a `StoredRecord` and should show enough context for a moderator to make a decision at a glance:

- **Kind badge**: post or comment
- **Author** (`data.username`)
- **Title** (posts: `data.title`; comments: `data.parentPostTitle` as context)
- **Body** (`data.body`) — Expand card size as needed to show full text.
- **Image** (`data.imageUrl`) - For posts, show image when available in the card
- **Timestamp** (`sortAt`, formatted as relative time e.g. "3 minutes ago")
- **Approve button**: An icon-only button (checkmark style — no text) that calls `POST /api/records/:id/approve`. On success, the item is removed from the feed optimistically.
- **Clickable surface**: Clicking the card body (not the approve button) calls Devvit's `navigateTo` with `data.url` to open the content on Reddit.

### Infinite Scroll

Pagination uses the existing `GET /api/records?from=N&to=N` endpoint, which returns a slice of records by newest-first rank (0-indexed). Page size of ~20. On reaching the bottom of the list, fetch the next page and append. Use `GET /api/records/total` to know when the feed is exhausted.

### Approve Action

`POST /api/records/:id/approve` — approves the Reddit content and removes it from the queue. Optimistically remove the item from the local list on click; handle failures gracefully (restore the item, show a brief error state on the card).

---

## Technical Stack

| Layer | Tech |
|---|---|
| Client framework | React (Vite, TypeScript) |
| Styling | Tailwind CSS |
| Client entry | `src/client/main/main.tsx` → renders `<App />` from `src/client/main/App.tsx` |
| Devvit client API | `@devvit/web/client` — provides `context`, `requestExpandedMode`, `navigateTo` |
| Backend calls | Plain `fetch('/api/...')` — no auth tokens needed, Devvit injects context server-side |
| Backend | Express serverless (`src/server/index.ts`) |
| Storage | Redis sorted set via `src/server/util/database.ts` |
| Shared types | `src/shared/types/api.ts` — `StoredRecord`, `ContentData`, `ContentKind`, `RecordsResponse`, `TotalRecordsResponse` |

### Key Constraints

- **No WebSockets**, no HTTP streaming — this is a serverless runtime
- **No `fs`, `http`, `https`, `net`** on the server
- Client-side only: use NPM packages that are browser-compatible
- Do not add new backend routes unless strictly necessary — the current endpoints likely cover all required functionality

---

## Existing Backend Endpoints (client-relevant)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/init` | Returns `{ username, isModerator }` |
| `GET` | `/api/records?from=N&to=N` | Paginated records, newest-first rank slice |
| `GET` | `/api/records/total` | Total record count |
| `POST` | `/api/records/:id/approve` | Approve content + remove from queue |

---

## Design Constraints

- **Mobile-first**, responsive across mobile/desktop/fullscreen
- Approve button is **icon-only** (no text label) — a checkmark or similar affordance
- Keep the UI clean and scannable; mods may review many items in sequence
- The item action area (approve) should be **extensible** — future actions like remove, ban, etc. should fit naturally into the card layout without requiring a full redesign
- Do not add explicit extensibility scaffolding now; just leave room for it in terms of code structure

---

## File Layout (client)

```
src/client/
  inline/
    inline.tsx          # Inline view — greeting + "Open modqueue" button
  main/
    App.tsx             # Main view root — implement the modqueue feed here
    main.tsx            # Entry point, renders <App />
  index.css             # Tailwind base styles
  vite.config.ts        # Vite config (do not modify unless necessary)
```
Feel free to expand main/ directory into more files, if necessary. Inline is very simple, so should not require anything but the one file.
---

## Local Dev / Visual Feedback Loop

```bash
npm run dev:ui       # Mock API + Vite preview at http://127.0.0.1:7474/main.html
npm run ui:capture   # Headless Chromium screenshots → src/client/Agent-UI-Viewer/screenshots/
```

Mock scenario is controlled by `MOCK_SCENARIO=mod|nonmod|empty`. Fixtures live in `src/client/Agent-UI-Viewer/fixtures.mjs`. After UI changes, run `ui:capture` and read the PNGs to verify layout.
