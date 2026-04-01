"use client";

import { layoutWithLines, prepareWithSegments, setLocale } from "@chenglou/pretext";
import { useEffect, useRef, useState } from "react";

const DEFAULT_TYPEWRITER_PHRASES = [
  "searchable insight",
  "compressed decisions",
  "a reusable knowledge layer",
];

type HeroTypewriterProps = {
  className?: string;
  deleteDelay?: number;
  deleteOnComplete?: boolean;
  locale?: string;
  pauseDelay?: number;
  phrases?: string[];
  restartDelay?: number;
  typeDelay?: number;
};

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("en-US", { granularity: "grapheme" })
    : null;

function splitGraphemes(text: string) {
  if (!segmenter) {
    return Array.from(text);
  }

  return Array.from(segmenter.segment(text), (item) => item.segment);
}

function getLineHeight(style: CSSStyleDeclaration) {
  const parsedLineHeight = Number.parseFloat(style.lineHeight);

  if (Number.isFinite(parsedLineHeight)) {
    return parsedLineHeight;
  }

  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.12 : 72;
}

function getFontShorthand(style: CSSStyleDeclaration) {
  if (style.font) {
    return style.font;
  }

  return [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function HeroTypewriter({
  className = "mt-3 block bg-linear-to-r from-primary via-(--primary-strong) to-[#ffd1a6] bg-clip-text text-transparent",
  deleteDelay = 38,
  deleteOnComplete = true,
  locale = "en-US",
  pauseDelay = 1500,
  phrases = DEFAULT_TYPEWRITER_PHRASES,
  restartDelay = 260,
  typeDelay = 82,
}: HeroTypewriterProps) {
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [metrics, setMetrics] = useState<{
    font: string;
    lineHeight: number;
    width: number;
    reservedHeight: number;
  } | null>(null);

  const activePhrase = phrases[activeIndex] ?? phrases[0] ?? "";
  const activeSegments = splitGraphemes(activePhrase);
  const visibleText = activeSegments.slice(0, visibleCount).join("");

  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  useEffect(() => {
    const element = textRef.current;
    // 获取父元素（也就是外层的 <h1> 或者是 typewriter-shell 的父级）
    const parentElement = element?.closest('.typewriter-shell')?.parentElement;

    if (!element || !parentElement) {
      return;
    }

    const updateMetrics = () => {
      const style = window.getComputedStyle(element);
      // ✅ 关键修复：使用父元素的宽度作为排版计算的边界，而不是当前打字 span 的宽度
      const width = parentElement.clientWidth;

      if (!width) {
        return;
      }

      const font = getFontShorthand(style);
      const lineHeight = getLineHeight(style);
      const reservedHeight = phrases.reduce((maxHeight, phrase) => {
        const prepared = prepareWithSegments(phrase, font);
        // 基于父元素的真实宽度计算这句 phrase 实际会占据几行
        const { height } = layoutWithLines(prepared, width, lineHeight);
        return Math.max(maxHeight, height);
      }, lineHeight);

      setMetrics({ font, lineHeight, width, reservedHeight });
    };

    const scheduleUpdate = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = requestAnimationFrame(updateMetrics);
    };

    scheduleUpdate();

    // ✅ 关键修复：监听父元素尺寸变化，而不是监听打字 span（避免打字时疯狂触发重算）
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(parentElement);

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [phrases]); // 依赖项保持不变

  useEffect(() => {
    if (!activePhrase) {
      return;
    }

    const fullLength = activeSegments.length;
    const doneTyping = visibleCount >= fullLength;
    const doneDeleting = visibleCount === 0;

    if (!deleteOnComplete && doneTyping) {
      return;
    }

    const nextDelay = isDeleting
      ? deleteDelay
      : doneTyping
        ? pauseDelay
        : typeDelay;

    timeoutRef.current = window.setTimeout(() => {
      if (isDeleting) {
        if (!doneDeleting) {
          setVisibleCount((count) => Math.max(0, count - 1));
          return;
        }

        setIsDeleting(false);
        setActiveIndex((index) => (index + 1) % phrases.length);
        return;
      }

      if (!doneTyping) {
        setVisibleCount((count) => Math.min(fullLength, count + 1));
        return;
      }

      setTimeout(() => {
        setIsDeleting(true);
      }, restartDelay);
    }, nextDelay);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    activePhrase,
    activeSegments.length,
    deleteDelay,
    deleteOnComplete,
    isDeleting,
    pauseDelay,
    phrases.length,
    restartDelay,
    typeDelay,
    visibleCount,
  ]);

  return (
    <span
      className={`typewriter-shell inline-flex items-end ${className}`}
      style={metrics ? { minHeight: metrics.reservedHeight } : undefined}
    >
      <span ref={textRef}>{visibleText}</span>
      <span aria-hidden="true" className="typewriter-cursor ml-2 inline-block" />
    </span>
  );
}
