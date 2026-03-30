"use client";

import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type RevealOnViewProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
} & HTMLAttributes<HTMLElement>;

export default function RevealOnView({
  as: Component = "div",
  children,
  className = "",
  delay = 0,
  once = true,
  threshold = 0.2,
  rootMargin = "0px 0px -10% 0px",
  ...rest
}: RevealOnViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);

          if (once) {
            observer.unobserve(element);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [once, rootMargin, threshold]);

  const style = { transitionDelay: `${delay}s` } satisfies CSSProperties;

  return (
    <Component
      ref={ref as never}
      style={style}
      {...rest}
      className={`reveal-on-view ${isVisible ? "is-visible" : ""} ${className}`.trim()}
    >
      {children}
    </Component>
  );
}