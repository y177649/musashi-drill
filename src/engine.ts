// 周回・セット分割・卒業判定のロジック（UIから独立させて単体でテストできるようにしておく）
import type { Question, QuestionRecord, QualMeta } from "./types";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 今の周（lap）で回すべき問題IDの並びを作る。
 *  brute_force_laps 以内は全問、それを超えたら「未卒業（誤答/迷った履歴あり）」のみ。 */
export function buildQueue(
  lap: number,
  questions: Question[],
  records: Record<string, QuestionRecord>,
  meta: QualMeta,
  shuffleSet: boolean
): string[] {
  const allIds = questions.map((q) => q.id);
  let pool: string[];
  if (lap <= meta.phases.brute_force_laps) {
    pool = allIds;
  } else {
    pool = allIds.filter((id) => !records[id]?.graduated);
    if (pool.length === 0) pool = allIds; // 全問卒業 → 通常周回に戻して忘却を防ぐ
  }
  return shuffleSet ? shuffle(pool) : pool;
}

export function chunkIntoSets(order: string[], setSize: number): string[][] {
  if (order.length === 0) return [];
  const sets: string[][] = [];
  for (let i = 0; i < order.length; i += setSize) sets.push(order.slice(i, i + setSize));
  return sets;
}

export function updateRecord(
  prev: QuestionRecord | undefined,
  correct: boolean,
  unsure: boolean,
  graduateStreak: number
): QuestionRecord {
  const streak = correct && !unsure ? (prev?.streak ?? 0) + 1 : 0;
  return {
    attempts: (prev?.attempts ?? 0) + 1,
    streak,
    graduated: streak >= graduateStreak,
    lastResult: correct ? "correct" : "incorrect",
    lastUnsure: unsure,
    lastAt: new Date().toISOString(),
  };
}

export function phaseLabel(lap: number, meta: QualMeta): string {
  return lap <= meta.phases.brute_force_laps
    ? `第${lap}周・全問刷り込み`
    : `第${lap}周・重点復習モード`;
}
