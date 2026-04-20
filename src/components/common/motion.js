/* Smooth ease-out curve for all transitions */
const ease = [0.22, 1, 0.36, 1];

export const page = (reduceMotion) => ({
  initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
  animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
  exit: reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 },
  transition: reduceMotion ? { duration: 0 } : { duration: 0.3, ease },
});

export const fadeUp = (reduceMotion, delay=0) => ({
  initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 },
  animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
  transition: reduceMotion ? { duration: 0 } : { duration: 0.35, ease, delay },
});
