export interface QuestionVariant {
  source: string;
  text: string;
}

export interface Question {
  id: string;
  subject: string;
  topic: string;
  variants: QuestionVariant[];
  choices: string[];
  answer: number;
  explanation: string;
  law_refs?: string[];
  figure?: string | null;
}

export interface Subject {
  id: string;
  title: string;
  exam_questions: number;
  pass_threshold: number;
}

export interface QualMeta {
  id: string;
  title: string;
  subjects: Subject[];
  session: { set_size: number; time_limit_min: number };
  phases: { brute_force_laps: number; graduate_streak: number };
}

export interface QualData {
  meta: QualMeta;
  questions: Question[];
}

export interface QuestionRecord {
  attempts: number;
  streak: number;
  graduated: boolean;
  lastResult: "correct" | "incorrect" | null;
  lastUnsure: boolean;
  lastAt: string | null;
}

export interface ProgressState {
  lap: number;
  cursor: number;
  order: string[];
  shuffleSet: boolean;
}
