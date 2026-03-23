import { describe, expect, it } from "vitest";
import { LIVE_SIGNAL_QUERY, LIVE_SIGNAL_QUERY_NAME } from "./signaling.js";

function readFunctionName(ref: object): string | undefined {
  const nameSymbol = Object.getOwnPropertySymbols(ref).find(
    (symbol) => symbol.toString() === "Symbol(functionName)",
  );
  if (!nameSymbol) return undefined;
  return (ref as Record<symbol, string | undefined>)[nameSymbol];
}

describe("live daemon signaling query", () => {
  it("subscribes to the connections live query", () => {
    expect(LIVE_SIGNAL_QUERY_NAME).toBe("connections:getConnectionForAgent");
    expect(readFunctionName(LIVE_SIGNAL_QUERY)).toBe(LIVE_SIGNAL_QUERY_NAME);
  });
});
