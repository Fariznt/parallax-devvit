/** Mock API fixtures for local UI preview. */

/** @type {import('../../shared/types/api').StoredRecord[]} */
export const sampleRecords = [
  {
    id: 't3_abc123',
    kind: 'post',
    sortAt: Date.now() - 60_000,
    data: {
      title: 'Is this allowed under community rules?',
      body: 'Someone posted a long rant about apples in the produce aisle. Not sure if this violates the banana policy.',
      username: 'curious_redditor',
      url: 'https://reddit.com/r/example/comments/abc123',
    },
  },
  {
    id: 't1_def456',
    kind: 'comment',
    sortAt: Date.now() - 120_000,
    data: {
      body: 'Honestly I think they were being rude about overweight shoppers. Full comment was way longer but you get the idea.',
      username: 'throwaway_commenter',
      url: 'https://reddit.com/r/example/comments/abc123/def456',
      parentPostTitle: 'Weekly discussion thread',
    },
  },
  {
    id: 't3_ghi789',
    kind: 'post',
    sortAt: Date.now() - 300_000,
    data: {
      title: 'Check out this monkey picture',
      body: 'Posted with an image — policy should still catch semantic issues in the title.',
      username: 'image_poster',
      url: 'https://reddit.com/r/example/comments/ghi789',
      imageUrl: '/snoo.png',
    },
  },
];

export const scenarios = {
  mod: {
    init: { username: 'mod_preview', isModerator: true },
    records: sampleRecords,
  },
  nonmod: {
    init: { username: 'guest_preview', isModerator: false },
    records: [],
  },
  empty: {
    init: { username: 'mod_preview', isModerator: true },
    records: [],
  },
};
