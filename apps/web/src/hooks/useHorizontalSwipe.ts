import { useRef, type TouchEvent } from 'react';

/** How far a thumb has to travel before it counts as a swipe rather than a tap. */
const DISTANCE = 64;
/** How much more horizontal than vertical it has to be, so scrolling never switches screens. */
const DIRECTION_RATIO = 1.5;
/**
 * Touches that begin this close to a screen edge belong to the browser: iOS Safari and
 * Chrome on Android both read an edge drag as back/forward. Competing with that would
 * make Symora feel broken in a way the user cannot fix.
 */
const EDGE_MARGIN = 28;

/**
 * Swipe left and right to move between the two screens.
 *
 * It replaces a tab bar, which on a phone costs a permanent strip of the screen for
 * something used a few times a day. What it must never do is fight the things a thumb
 * does far more often: scrolling a conversation, and dragging a caret through text. So a
 * gesture only counts when it is clearly sideways, long enough to be deliberate, started
 * away from the browser's own edge gestures, and not started on an input.
 *
 * Nothing here calls preventDefault: vertical scrolling stays entirely the browser's,
 * and a gesture that turns out to be a scroll simply never reaches the threshold.
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      // A second finger means a pinch or a two-handed scroll, neither of which is this.
      if (!touch || event.touches.length > 1) {
        start.current = null;
        return;
      }

      const nearEdge =
        touch.clientX <= EDGE_MARGIN || touch.clientX >= window.innerWidth - EDGE_MARGIN;
      const onText = (event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable="true"]',
      );

      start.current = nearEdge || onText ? null : { x: touch.clientX, y: touch.clientY };
    },

    onTouchEnd(event: TouchEvent) {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;

      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < DISTANCE || Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },

    onTouchCancel() {
      start.current = null;
    },
  };
}
