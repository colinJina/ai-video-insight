"use client";

import { layoutWithLines, prepareWithSegments, setLocale } from "@chenglou/pretext";
import { useEffect, useRef, useState } from "react";

const TYPEWRITER_PHRASES = [
  "登录后即刻抵达",
  "压缩成关键结论",
  "回到可搜索的知识",
];

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("zh-CN", { granularity: "grapheme" })
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

export default function HeroTypewriter() {
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

  const activePhrase = TYPEWRITER_PHRASES[activeIndex] ?? TYPEWRITER_PHRASES[0];
  const activeSegments = splitGraphemes(activePhrase);
  const visibleText = activeSegments.slice(0, visibleCount).join("");

  useEffect(() => {
    setLocale("zh-CN");
  }, []);

  useEffect(() => {
    const element = textRef.current;

    if (!element) {
      return;
    }

    const updateMetrics = () => {
      const style = window.getComputedStyle(element);
      const width = element.clientWidth;

      if (!width) {
        return;
      }

      const font = getFontShorthand(style);
      const lineHeight = getLineHeight(style);
      const reservedHeight = TYPEWRITER_PHRASES.reduce((maxHeight, phrase) => {
        const prepared = prepareWithSegments(phrase, font);
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

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(element);

    void document.fonts?.ready.then(scheduleUpdate);

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const atPhraseEnd = visibleCount >= activeSegments.length;
    const atPhraseStart = visibleCount === 0;

    let delay = isDeleting ? 38 : 82;

    if (!isDeleting && atPhraseEnd) {
      delay = 1500;
    } else if (isDeleting && atPhraseStart) {
      delay = 260;
    }

    timeoutRef.current = window.setTimeout(() => {
      if (!isDeleting && atPhraseEnd) {
        setIsDeleting(true);
        return;
      }

      if (isDeleting && atPhraseStart) {
        setIsDeleting(false);
        setActiveIndex((current) => (current + 1) % TYPEWRITER_PHRASES.length);
        return;
      }

      setVisibleCount((current) => current + (isDeleting ? -1 : 1));
    }, delay);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [activeSegments.length, isDeleting, visibleCount]);

  const lines =
    metrics && visibleText
      ? layoutWithLines(
          prepareWithSegments(visibleText, metrics.font),
          metrics.width,
          metrics.lineHeight,
        ).lines
      : [];

  return (
    <span
      ref={textRef}
      className="typewriter-shell mt-3 block bg-gradient-to-r from-primary via-[color:var(--primary-strong)] to-[#ffd1a6] bg-clip-text text-transparent"
      style={{
        minHeight: metrics ? `${metrics.reservedHeight}px` : undefined,
      }}
    >
      {lines.length > 0 ? (
        lines.map((line, index) => (
          <span className="typewriter-line block" key={`${activePhrase}-${index}-${line.text}`}>
            {line.text}
            {index === lines.length - 1 ? (
              <span aria-hidden="true" className="typewriter-cursor ml-1 inline-block" />
            ) : null}
          </span>
        ))
      ) : (
        <span className="typewriter-line block">
          <span aria-hidden="true" className="typewriter-cursor inline-block" />
        </span>
      )}
    </span>
  );
}
