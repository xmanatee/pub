import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-8">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-neutral-100">
          Welcome to Pub
        </h1>
        <p className="mb-8 text-neutral-400">Your adaptive interface is ready.</p>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="mb-8 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 active:scale-[0.98]"
        >
          Count: {count}
        </button>
        <p className="text-xs text-neutral-500">
          Edit{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em]">src/App.tsx</code>{" "}
          to get started.
        </p>
      </div>
    </div>
  );
}
