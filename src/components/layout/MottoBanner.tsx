"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
}

interface Props {
  mode: "admin" | "legacy";
  text?: string;
  subtext?: string;
  textStyle?: TextStyle;
  subtextStyle?: TextStyle;
  legacyHtml?: string;
  /** 단어 등장 간격(초). 0 = 고정 표시 (즉시 전체 노출) */
  intervalSec: number;
  color?: string;
  className?: string;
}

const FINAL_HOLD_MS = 5000; // 다 채워진 뒤 정지 시간

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/(div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function tsToCss(s?: TextStyle): React.CSSProperties {
  if (!s) return {};
  return {
    fontFamily: s.fontFamily || undefined,
    fontSize: s.fontSize || undefined,
    fontWeight: (s.fontWeight as React.CSSProperties["fontWeight"]) || undefined,
    fontStyle: (s.fontStyle as React.CSSProperties["fontStyle"]) || undefined,
  };
}

export default function MottoBanner({
  mode,
  text,
  subtext,
  textStyle,
  subtextStyle,
  legacyHtml,
  intervalSec,
  color,
  className,
}: Props) {
  // 1. 본문/보조문구 정규화
  //   admin 모드: text + subtext 직접 사용 (둘 다 평문, \n 줄바꿈)
  //   legacy 모드: HTML 을 평문화해서 메인으로 사용 (보조문구는 없음)
  const mainText = useMemo(() => {
    const raw = mode === "admin" ? text || "" : htmlToPlainText(legacyHtml || "");
    return raw.trim();
  }, [mode, text, legacyHtml]);
  const subText = (mode === "admin" ? (subtext || "") : "").trim();
  const sanitizedLegacy = useMemo(
    () => (mode === "legacy" && legacyHtml ? sanitizeHtml(legacyHtml) : ""),
    [mode, legacyHtml],
  );

  // 2. 줄 / 단어 분해 — 줄바꿈 보존
  const wordsByLine = useMemo(
    () =>
      mainText
        .split("\n")
        .map((l) => l.trim().split(/\s+/).filter(Boolean))
        .filter((w) => w.length > 0),
    [mainText],
  );
  const totalWords = wordsByLine.reduce((s, w) => s + w.length, 0);
  const isShort = totalWords <= 3 || mainText.length < 15;

  // 3. 배너 phase — 누적형. 0 = 첫 단어, totalWords-1 = 본문 전체, totalWords = 본문 + 보조 (final).
  //    final phase 에서 FINAL_HOLD_MS 동안 정지 후 0 으로 리셋.
  const subInFinal = !!subText;
  const maxPhase = subInFinal ? totalWords : Math.max(0, totalWords - 1);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (intervalSec <= 0) return;
    if (isShort) return;
    if (totalWords <= 1) return;
    const isFinal = phase >= maxPhase;
    const delay = isFinal ? FINAL_HOLD_MS : Math.max(300, intervalSec * 1000);
    const t = setTimeout(() => {
      setPhase((p) => (p >= maxPhase ? 0 : p + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [phase, intervalSec, isShort, maxPhase, totalWords]);

  const containerStyle: React.CSSProperties = color ? { color } : {};
  const mainCss = tsToCss(textStyle);
  const subCss = tsToCss(subtextStyle);

  // 4. legacy + 고정 — HTML 그대로 (관리자 모드 아닌 fallback 케이스)
  if (mode === "legacy" && intervalSec <= 0) {
    return (
      <div
        className={className}
        style={containerStyle}
        dangerouslySetInnerHTML={{ __html: sanitizedLegacy }}
      />
    );
  }

  // 5. 짧은 문장 — 한 줄 큰 글씨 (배너/고정 무관 정적)
  if (isShort) {
    const enlarged: React.CSSProperties = {
      ...mainCss,
      fontSize: mainCss.fontSize || "1.5rem",
      fontWeight: mainCss.fontWeight || "bold",
    };
    return (
      <div className={className} style={containerStyle}>
        <span>
          <span className="whitespace-nowrap" style={enlarged}>
            {mainText}
          </span>
          {subText && (
            <span style={subCss} className="ml-2 align-baseline">
              {subText}
            </span>
          )}
        </span>
      </div>
    );
  }

  // 누적 표시: 현재 phase 까지 단어 노출. 보조문구는 final phase 에서만.
  const wordsToShow =
    intervalSec <= 0 ? totalWords : Math.min(phase + 1, totalWords);
  const showSubtext = intervalSec <= 0 ? !!subText : subText && phase >= totalWords;

  // 6 + 7. 고정 모드 (admin) 또는 배너 모드 — 동일 구조로 렌더 (visibility 토글)
  // 외부 className 은 보통 flex container — 안쪽은 한 덩어리 div 로 줄들이 세로 스택되게.
  let runningIdx = 0;
  const lines = wordsByLine.map((words, li) => {
    const startIdx = runningIdx;
    runningIdx += words.length;
    const isLastLine = li === wordsByLine.length - 1;
    return (
      <div key={li} className="leading-snug">
        {words.map((w, wi) => {
          const myIdx = startIdx + wi;
          const visible = myIdx < wordsToShow;
          return (
            <span
              key={wi}
              style={{
                ...mainCss,
                opacity: visible ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}
            >
              {wi > 0 && " "}
              {w}
            </span>
          );
        })}
        {subText && isLastLine && (
          <span
            className="ml-2 align-baseline"
            style={{
              ...subCss,
              opacity: showSubtext ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            {subText}
          </span>
        )}
      </div>
    );
  });

  return (
    <div className={className} style={containerStyle}>
      <div>{lines}</div>
    </div>
  );
}
