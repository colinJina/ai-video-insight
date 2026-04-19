"use client";

import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type RevealOnViewProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
} & HTMLAttributes<HTMLElement>;

const subscribeToIntersectionObserverSupport = () => () => {};

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
  const revealWithoutObserver = useSyncExternalStore(
    subscribeToIntersectionObserverSupport,
    () => typeof IntersectionObserver === "undefined",
    () => false,
  );

  useEffect(() => {
    const element = ref.current;

    if (!element || revealWithoutObserver) {
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
  }, [once, revealWithoutObserver, rootMargin, threshold]);

  const style = { transitionDelay: `${delay}s` } satisfies CSSProperties;
  const shouldShow = isVisible || revealWithoutObserver;

  return (
    <Component
      ref={ref as never}
      style={style}
      {...rest}
      className={`reveal-on-view ${shouldShow ? "is-visible" : ""} ${className}`.trim()}
    >
      {children}
    </Component>
  );
}
