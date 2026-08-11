'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Only passes children through, so everything rendered below it stays a server
 * component. `reducedMotion="user"` makes framer-motion honour the OS setting
 * for transform-ish properties automatically; individual components still check
 * useReducedMotion() where they drive their own timers.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
