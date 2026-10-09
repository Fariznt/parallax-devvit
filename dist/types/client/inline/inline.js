import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import '../index.css';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
const Inline = () => {
    const [viewer, setViewer] = useState({ status: 'loading' });
    useEffect(() => {
        const loadViewer = async () => {
            try {
                const res = await fetch('/api/init');
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setViewer({ status: 'ready', data });
            }
            catch (error) {
                console.error('Unable to load viewer data', error);
                setViewer({ status: 'error' });
            }
        };
        void loadViewer();
    }, []);
    const username = viewer.status === 'ready' ? viewer.data.username : context.username;
    return (_jsxs("div", { className: "relative flex min-h-screen flex-col items-center justify-center gap-4 p-4", children: [_jsx("img", { className: "mx-auto w-1/2 max-w-[250px] object-contain", src: "/snoo.png", alt: "Snoo" }), _jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsxs("h1", { className: "text-center text-2xl font-bold text-rd-text-primary", children: ["Hey ", username ?? 'there', " \uD83D\uDC4B"] }), viewer.status === 'loading' ? (_jsx("p", { className: "text-center text-base text-rd-text-secondary", children: "Loading..." })) : null, (viewer.status === 'ready' && !viewer.data.isModerator) || viewer.status === 'error' ? (_jsx("p", { className: "text-center text-base text-rd-text-secondary", children: "Thanks for stopping by. This interactive post is only viewable for the moderation team. Please feel free to ignore!" })) : null, viewer.status === 'ready' && viewer.data.isModerator ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-center text-base text-rd-text-secondary", children: "The custom modqueue is ready for review." }), _jsx("button", { className: "mt-5 flex h-10 w-auto cursor-pointer items-center justify-center rounded-full bg-rd-cta px-4 text-white transition-colors hover:bg-rd-cta-hover", onClick: (e) => requestExpandedMode(e.nativeEvent, 'main'), children: "Open modqueue" })] })) : null] })] }));
};
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(Inline, {}) }));
//# sourceMappingURL=inline.js.map