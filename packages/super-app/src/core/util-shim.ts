/**
 * Minimal shim for Node's `util` module for browser bundling. gramjs only
 * needs `inspect.custom` (a Symbol key used for console.log formatting) and
 * `inspect()` at module init — it never reads the formatted output, so
 * returning an empty string is fine.
 */
const custom = Symbol.for("nodejs.util.inspect.custom");

type InspectFn = ((value: unknown) => string) & { custom: symbol };

const inspectFn = ((_value: unknown) => "") as InspectFn;
inspectFn.custom = custom;

export const inspect = inspectFn;
export default { inspect };
