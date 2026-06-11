// import { useEffect, useState } from 'react';
// import type { Placeholder } from '../../shared/types/api';

// Client → server: fetch YOUR /api/* routes only (not external domains).
// Devvit injects auth/context server-side; you do not pass tokens from the client.
//
// useEffect(() => {
//   const load = async () => {
//     const res = await fetch('/api/init');
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     const data: Placeholder = await res.json();
//     console.log(data);
//   };
//   void load();
// }, []);

export const App = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <p className="text-center text-gray-600">src/client/main/App.tsx is under development.</p>
    </div>
  );
};
