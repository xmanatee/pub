import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <div className="card">
        <h1>Welcome to Pub</h1>
        <p className="subtitle">Your adaptive interface is ready.</p>
        <div className="counter">
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            Count: {count}
          </button>
        </div>
        <p className="hint">Edit <code>src/App.tsx</code> to get started.</p>
      </div>
    </div>
  );
}
