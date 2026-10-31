/**
 * Decides whether a camera detection is a NEW scan.
 *
 * Cameras report the same sticker many times per second for as long as it is in view.
 * A code is accepted once, then ignored until it has been out of view for `quietMs`
 * (the phone was moved away). Without this, one sticker sitting in front of the
 * camera kept reopening the sale sheet and could record the same sale again and again.
 */
export function createScanGate(quietMs = 1200) {
  let lastCode = '';
  let lastSeen = -Infinity;

  return {
    /** Returns true when `code` should be handled as a new scan at time `now` (ms). */
    accept(code: string, now: number): boolean {
      const clean = code.trim();
      if (!clean) return false;
      const sameCode = clean === lastCode;
      const stillInView = sameCode && now - lastSeen < quietMs;
      lastCode = clean;
      lastSeen = now;
      return !stillInView;
    },
    /** Treat the last code as still in view at `now` (call when a sheet closes). */
    hold(now: number) {
      lastSeen = now;
    },
  };
}
