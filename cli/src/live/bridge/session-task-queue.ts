/**
 * Serializes provider session tasks. Chains promises so that each task observes
 * a stable session state (session_id, resume arg, active subprocess) without
 * interleaving with a concurrent delivery.
 */
export function createSessionTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let chain: Promise<void> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
