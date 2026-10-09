export function normalizeTimestamp(timestamp) {
    if (!timestamp)
        return Date.now();
    return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}
export function toRedditUrl(pathOrUrl) {
    if (pathOrUrl.startsWith('http'))
        return pathOrUrl;
    return `https://reddit.com${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}
//# sourceMappingURL=util.js.map