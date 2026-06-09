import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChapterDef } from "../registry/types";

/**
 * Bump this when chapter step counts / structure change so old persisted
 * cursors don't land mid-removed-step.
 */
const STORAGE_KEY = "presentation-cursor-v6";

export type Cursor = { chapter: number; step: number };

export interface StepperState {
  cursor: Cursor;
  totalChapters: number;
  chapterTotalSteps: number;
  globalIndex: number;
  totalGlobal: number;
  next(): void;
  prev(): void;
  jumpToChapter(idx: number, step?: number): void;
  jumpToGlobal(globalIdx: number): void;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Clamp a (possibly stale) cursor to the current chapter list. Persisted
 * cursors can outlive structural changes — fewer chapters, fewer steps,
 * a different scaffolded project sharing the same dev-server origin — so
 * we always re-validate before handing one to React.
 */
function sanitize(cursor: Cursor, chapters: ChapterDef[]): Cursor {
  if (chapters.length === 0) return { chapter: 0, step: 0 };
  const chapter = clamp(cursor.chapter | 0, 0, chapters.length - 1);
  const stepCount = chapters[chapter]!.narrations.length;
  const step = clamp(cursor.step | 0, 0, Math.max(0, stepCount - 1));
  return { chapter, step };
}

function cursorFromGlobal(globalIdx: number, chapters: ChapterDef[]): Cursor {
  const total = chapters.reduce((sum, chapter) => sum + chapter.narrations.length, 0);
  const target = clamp(globalIdx, 0, Math.max(0, total - 1));
  let acc = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    const stepCount = chapters[i]!.narrations.length;
    if (target < acc + stepCount) return { chapter: i, step: target - acc };
    acc += stepCount;
  }
  return { chapter: 0, step: 0 };
}

export function useStepper(
  chapters: ChapterDef[],
  storageKey = STORAGE_KEY,
  initialGlobalIndex: number | null = null,
): StepperState {
  const [cursor, setCursor] = useState<Cursor>(() => {
    const fallback = { chapter: 0, step: 0 };
    if (initialGlobalIndex != null) return cursorFromGlobal(initialGlobalIndex, chapters);
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return sanitize(JSON.parse(raw), chapters);
    } catch {
      /* ignore */
    }
    return fallback;
  });
  const safeCursor = useMemo(() => sanitize(cursor, chapters), [cursor, chapters]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(safeCursor));
    } catch {
      /* ignore */
    }
  }, [safeCursor, storageKey]);

  const offsets = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const c of chapters) {
      arr.push(acc);
      acc += c.narrations.length;
    }
    return arr;
  }, [chapters]);
  const totalGlobal = useMemo(
    () => chapters.reduce((s, c) => s + c.narrations.length, 0),
    [chapters],
  );
  const globalIndex = (offsets[safeCursor.chapter] ?? 0) + safeCursor.step;

  const next = useCallback(() => {
    setCursor((cur) => {
      const safe = sanitize(cur, chapters);
      const c = chapters[safe.chapter]!;
      if (safe.step < c.narrations.length - 1)
        return { ...safe, step: safe.step + 1 };
      if (safe.chapter < chapters.length - 1)
        return { chapter: safe.chapter + 1, step: 0 };
      return safe;
    });
  }, [chapters]);

  const prev = useCallback(() => {
    setCursor((cur) => {
      const safe = sanitize(cur, chapters);
      if (safe.step > 0) return { ...safe, step: safe.step - 1 };
      if (safe.chapter > 0) {
        const p = chapters[safe.chapter - 1]!;
        return { chapter: safe.chapter - 1, step: p.narrations.length - 1 };
      }
      return safe;
    });
  }, [chapters]);

  const jumpToChapter = useCallback(
    (idx: number, step = 0) => {
      const ch = clamp(idx, 0, chapters.length - 1);
      const c = chapters[ch]!;
      setCursor({
        chapter: ch,
        step: clamp(step, 0, c.narrations.length - 1),
      });
    },
    [chapters],
  );

  const jumpToGlobal = useCallback(
    (g: number) => {
      const target = clamp(g, 0, totalGlobal - 1);
      let acc = 0;
      for (let i = 0; i < chapters.length; i++) {
        const t = chapters[i]!.narrations.length;
        if (target < acc + t) {
          setCursor({ chapter: i, step: target - acc });
          return;
        }
        acc += t;
      }
    },
    [chapters, totalGlobal],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        jumpToChapter(0, 0);
      } else if (e.key === "End") {
        const last = chapters.length - 1;
        jumpToChapter(last, chapters[last]!.narrations.length - 1);
      } else if (e.key >= "1" && e.key <= "9") {
        const n = Number(e.key) - 1;
        if (n < chapters.length) jumpToChapter(n, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, jumpToChapter, chapters]);

  const ch = chapters[safeCursor.chapter]!;
  return {
    cursor: safeCursor,
    totalChapters: chapters.length,
    chapterTotalSteps: ch.narrations.length,
    globalIndex,
    totalGlobal,
    next,
    prev,
    jumpToChapter,
    jumpToGlobal,
  };
}
