/** Devvit Web trigger: onAppInstall -> /internal/on-app-install */
export async function handleOnAppInstall(_req, res) {
    console.log('[handleOnAppInstall] handling app install event');
    res.status(200).json({ status: 'ok' });
}
//# sourceMappingURL=on-app-install.js.map