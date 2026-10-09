/** Local Vite dev stub — real @devvit/web/client is used in production builds. */
export const context = {
    username: 'local_dev_user',
};
export function requestExpandedMode(_event, _entrypoint) {
    console.info('[dev stub] requestExpandedMode — open http://localhost:7474/main.html');
}
export function navigateTo(thingOrUrl) {
    const url = typeof thingOrUrl === 'string' ? thingOrUrl : thingOrUrl.url;
    console.info('[dev stub] navigateTo', url);
    window.open(url, '_blank');
}
/**
 * Dev-only helper: toggle dark mode by overriding the browser's
 * prefers-color-scheme media query via the color-scheme CSS property.
 * Call `window.__devToggleDark?.()` in the browser console to test.
 */
if (typeof window !== 'undefined') {
    let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    window.__devToggleDark = () => {
        isDark = !isDark;
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
        console.info(`[dev stub] color scheme → ${isDark ? 'dark' : 'light'}`);
    };
    console.info('[dev stub] call window.__devToggleDark() to toggle dark mode');
}
//# sourceMappingURL=stub-devvit-client.js.map