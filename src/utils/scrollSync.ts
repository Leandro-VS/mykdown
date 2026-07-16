export const SCROLL_SYNC_TOLERANCE = 1;

export function reachedSynchronizedScrollTarget(
  currentPosition: number,
  targetPosition: number | null,
): boolean {
  return (
    targetPosition !== null &&
    Math.abs(currentPosition - targetPosition) <= SCROLL_SYNC_TOLERANCE
  );
}
