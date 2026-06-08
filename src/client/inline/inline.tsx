import '../index.css';

import { navigateTo, context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const Inline = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4">
      <img className="object-contain w-1/2 max-w-[250px] mx-auto" src="/snoo.png" alt="Snoo" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-bold text-center text-gray-900 ">
          Hey {context.username ?? 'mod'} 👋
        </h1>
        <p className="text-base text-center text-gray-600 ">
          Policy-Agent custom modqueue.
        </p>
      </div>
      <div className="flex items-center justify-center mt-5">
        <button
          className="flex items-center justify-center bg-[#d93900] text-white w-auto h-10 rounded-full cursor-pointer transition-colors px-4"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'main')}
        >
          Open modqueue
        </button>
      </div>
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 text-[0.8em] text-gray-600">
        {/* <button
          className="cursor-pointer"
          onClick={() => navigateTo('https://developers.reddit.com/docs')}
        >
          Docs
        </button>
        <span className="text-gray-300">|</span>
        <button
          className="cursor-pointer"
          onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
        >
          r/Devvit
        </button> */}
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Inline />
  </StrictMode>
);
