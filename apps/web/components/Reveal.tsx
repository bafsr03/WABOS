'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children, delay = 0, y = 16, blur, className, ...rest
}: {
  children: React.ReactNode; delay?: number; y?: number; blur?: boolean; className?: string;
} & HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      // data-reveal is the hook for the CSS safety nets in globals.css: it
      // forces opacity back to 1 under prefers-reduced-motion and inside
      // <noscript>, so content is never stranded invisible if the animation
      // never runs.
      data-reveal
      initial={{ opacity: 0, y, ...(blur ? { filter: 'blur(6px)' } : null) }}
      whileInView={{ opacity: 1, y: 0, ...(blur ? { filter: 'blur(0px)' } : null) }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* Parent-driven stagger — replaces the hand-rolled `delay={i * 0.05}` math that
   was duplicated across four call sites. Children must be <RevealItem>. */
export function RevealStagger({
  children, className, stagger = 0.06,
}: { children: React.ReactNode; className?: string; stagger?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, y = 16 }: { children: React.ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      data-reveal
      variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
