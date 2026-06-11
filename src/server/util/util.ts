export function normalizeTimestamp(timestamp: number | undefined): number {
  if (!timestamp) return Date.now();
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

export function toRedditUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `https://reddit.com${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}
