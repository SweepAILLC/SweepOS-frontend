/** Tracks in-flight client PATCH requests so org switch can wait for pipeline saves. */
const pendingUpdates = new Set<Promise<unknown>>();

export function trackPipelinePersistence<T>(promise: Promise<T>): Promise<T> {
  pendingUpdates.add(promise);
  void promise.finally(() => {
    pendingUpdates.delete(promise);
  });
  return promise;
}

export async function flushPipelinePersistence(): Promise<void> {
  if (pendingUpdates.size === 0) return;
  await Promise.allSettled(Array.from(pendingUpdates));
}
