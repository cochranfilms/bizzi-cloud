"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export type ScrollRevealVariant = "fade-up" | "fade" | "tilt-in" | "fade-scale";

const variants: Record<
  ScrollRevealVariant,
  { rest: string; active: string }
> = {
  "fade-up": {
    rest: "opacity-0 translate-y-8",
    active: "opacity-100 translate-y-0",
  },
  fade: {
    rest: "opacity-0",
    active: "opacity-100",
  },
  "tilt-in": {
    rest: "opacity-0 translate-y-5 rotate-[0.6deg]",
    active: "opacity-100 translate-y-0 rotate-0",
  },
  "fade-scale": {
    rest: "opacity-0 scale-[0.96]",
    active: "opacity-100 scale-100",
  },
};

const baseTransition =
  "transition-[opacity,transform] duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

const motionOkVisible =
  "motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:rotate-0 motion-reduce:scale-100";

type ScrollRevealProps = {
  children: ReactNode;
  variant?: ScrollRevealVariant;
  className?: string;
  /** Extra delay after intersecting (ms), for light staggering inside a section */
  delayMs?: number;
};

/**
 * Reveals children once they enter the viewport — subtle motion, respects reduced motion.
 */
export default function ScrollReveal({
  children,
  variant = "fade-up",
  className = "",
  delayMs = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -7% 0px",
        threshold: 0.07,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const v = variants[variant];

  return (
    <div
      ref={ref}
      className={`${baseTransition} ${motionOkVisible} ${
        active ? v.active : v.rest
      } ${className}`.trim()}
      style={
        active && delayMs > 0
          ? { transitionDelay: `${delayMs}ms` }
          : undefined
      }
    >
      {children}
    </div>
  );
}
