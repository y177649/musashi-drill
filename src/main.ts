import "./style.css";
import type { ProgressState, QualData, Question, QuestionRecord } from "./types";
import * as db from "./db";
import { buildQueue, chunkIntoSets, updateRecord, phaseLabel } from "./engine";

// Phase 0: このリポジトリ内にビルド時生成されたJSONを直接importする（サーバ不要）。
// Phase 1でSupabaseからのフェッチに差し替える予定だが、IndexedDBが常に正であることは変わらない。
import qualData from "./data/generated/aeronautical-special-radio.json";

const QUAL: QualData = qualData as unknown as QualData;

const app = document.getElementById("app")!;

type Screen = "home" | "quiz" | "setSummary" | "congrats";

interface RuntimeState {
  records: Record<string, QuestionRecord>;
  progress: ProgressState;
  sets: string[][];
  screen: Screen;
  setIndex: number;
  indexInSet: number;
  selectedDisplayIndex: number | null;
  unsure: boolean;
  confirmed: boolean;
  choiceOrder: number[]; // 表示位置 -> 元のchoices配列index
  variantText: string;
  setStats: { correct: number; incorrect: number; unsure: number };
}

let state: RuntimeState;

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function questionById(id: string): Question {
  const q = QUAL.questions.find((q) => q.id === id);
  if (!q) throw new Error(`question not found: ${id}`);
  return q;
}

async function init() {
  const records = await db.getAllRecords();
  let progress = await db.getProgress(QUAL.meta.id);
  if (!progress || progress.order.length === 0) {
    progress = freshLapProgress(1, records, progress?.shuffleSet ?? false);
    await db.putProgress(QUAL.meta.id, progress);
  }
  const sets = chunkIntoSets(progress.order, QUAL.meta.session.set_size);
  state = {
    records,
    progress,
    sets,
    screen: "home",
    setIndex: 0,
    indexInSet: 0,
    selectedDisplayIndex: null,
    unsure: false,
    confirmed: false,
    choiceOrder: [],
    variantText: "",
    setStats: { correct: 0, incorrect: 0, unsure: 0 },
  };
  render();
}

function freshLapProgress(
  lap: number,
  records: Record<string, QuestionRecord>,
  shuffleSet: boolean
): ProgressState {
  const order = buildQueue(lap, QUAL.questions, records, QUAL.meta, shuffleSet);
  return { lap, cursor: 0, order, shuffleSet };
}

function graduatedCount(): number {
  return QUAL.questions.filter((q) => state.records[q.id]?.graduated).length;
}

// ---------- 画面遷移 ----------

function startSet(setIndex: number) {
  state.setIndex = setIndex;
  state.indexInSet = 0;
  state.setStats = { correct: 0, incorrect: 0, unsure: 0 };
  state.screen = "quiz";
  enterQuestion();
  render();
}

function currentQuestionId(): string {
  return state.sets[state.setIndex][state.indexInSet];
}

function enterQuestion() {
  const q = questionById(currentQuestionId());
  state.selectedDisplayIndex = null;
  state.unsure = false;
  state.confirmed = false;
  state.choiceOrder = shuffleArr(q.choices.map((_, i) => i));
  const variant = q.variants[Math.floor(Math.random() * q.variants.length)];
  state.variantText = variant.text.trim();
}

async function confirmAnswer() {
  if (state.selectedDisplayIndex === null || state.confirmed) return;
  const q = questionById(currentQuestionId());
  const chosenOriginalIndex = state.choiceOrder[state.selectedDisplayIndex];
  const correct = chosenOriginalIndex === q.answer;
  state.confirmed = true;

  const prev = state.records[q.id];
  const rec = updateRecord(prev, correct, state.unsure, QUAL.meta.phases.graduate_streak);
  state.records[q.id] = rec;
  await db.putRecord(q.id, rec);

  if (correct) state.setStats.correct++;
  else state.setStats.incorrect++;
  if (state.unsure) state.setStats.unsure++;

  render();
}

async function nextQuestion() {
  state.progress.cursor++;
  await db.putProgress(QUAL.meta.id, state.progress);

  if (state.indexInSet + 1 < state.sets[state.setIndex].length) {
    state.indexInSet++;
    enterQuestion();
    render();
    return;
  }
  state.screen = "setSummary";
  render();
}

async function goNextSetOrLap() {
  if (state.setIndex + 1 < state.sets.length) {
    startSet(state.setIndex + 1);
    return;
  }
  // 周回完了。次の周へ。
  const nextLap = state.progress.lap + 1;
  state.progress = freshLapProgress(nextLap, state.records, state.progress.shuffleSet);
  await db.putProgress(QUAL.meta.id, state.progress);
  state.sets = chunkIntoSets(state.progress.order, QUAL.meta.session.set_size);
  if (state.progress.order.length === 0) {
    state.screen = "congrats";
    render();
    return;
  }
  state.screen = "home";
  render();
}

function backToHome() {
  state.screen = "home";
  render();
}

async function toggleShuffleSet(checked: boolean) {
  state.progress.shuffleSet = checked;
  await db.putProgress(QUAL.meta.id, state.progress);
  render();
}

// ---------- 書き出し / 読み込み（iOS ITP対策の保険） ----------

async function exportProgress() {
  const payload = await db.exportAll(QUAL.meta.id);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `musashi-drill-${QUAL.meta.id}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProgress(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(String(reader.result));
      await db.importAll(payload);
      await init();
    } catch (e) {
      alert("読み込みに失敗しました: " + e);
    }
  };
  reader.readAsText(file);
}

// ---------- レンダリング ----------

function render() {
  if (state.screen === "home") return renderHome();
  if (state.screen === "quiz") return renderQuiz();
  if (state.screen === "setSummary") return renderSetSummary();
  if (state.screen === "congrats") return renderCongrats();
}

function renderHome() {
  const total = QUAL.questions.length;
  const grad = graduatedCount();
  const phase = phaseLabel(state.progress.lap, QUAL.meta);

  const setChips = state.sets
    .map((s, i) => {
      const done = i < state.setIndex; // 簡易表示：今回セッション内の完了状態のみ
      return `<button class="chip ${done ? "chip-done" : ""}" data-set="${i}">セット${i + 1}<br><span class="chip-count">${s.length}問</span></button>`;
    })
    .join("");

  app.innerHTML = `
    <div class="screen home">
      <header class="topbar">
        <h1>${QUAL.meta.title}</h1>
        <p class="subject">法規ドリル・武蔵方式</p>
      </header>

      <section class="card">
        <div class="stat-row">
          <div class="stat"><span class="stat-num">${state.progress.lap}</span><span class="stat-label">周目</span></div>
          <div class="stat"><span class="stat-num">${grad}/${total}</span><span class="stat-label">卒業</span></div>
        </div>
        <p class="phase-label">${phase}</p>
      </section>

      <section class="card">
        <p class="section-title">セットを選ぶ</p>
        <div class="chip-grid">${setChips}</div>
      </section>

      <section class="card settings">
        <label class="switch-row">
          <span>セットの中身をシャッフル（次の周から反映）</span>
          <input type="checkbox" id="shuffle-toggle" ${state.progress.shuffleSet ? "checked" : ""} />
        </label>
      </section>

      <section class="card backup">
        <p class="section-title">バックアップ（機種変更・データ消失の保険）</p>
        <div class="backup-row">
          <button id="export-btn" class="btn-secondary">進捗を書き出す</button>
          <label class="btn-secondary file-label">
            読み込む
            <input type="file" id="import-input" accept="application/json" hidden />
          </label>
        </div>
      </section>
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((btn) => {
    btn.addEventListener("click", () => startSet(Number(btn.dataset.set)));
  });
  document.getElementById("shuffle-toggle")!.addEventListener("change", (e) => {
    toggleShuffleSet((e.target as HTMLInputElement).checked);
  });
  document.getElementById("export-btn")!.addEventListener("click", exportProgress);
  document.getElementById("import-input")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) importProgress(file);
  });
}

function renderQuiz() {
  const q = questionById(currentQuestionId());
  const total = state.sets[state.setIndex].length;

  const choicesHtml = state.choiceOrder
    .map((origIdx, dispIdx) => {
      const text = q.choices[origIdx];
      let cls = "choice";
      if (state.confirmed) {
        if (origIdx === q.answer) cls += " choice-correct";
        else if (dispIdx === state.selectedDisplayIndex) cls += " choice-wrong";
      } else if (dispIdx === state.selectedDisplayIndex) {
        cls += " choice-selected";
      }
      return `<button class="${cls}" data-choice="${dispIdx}" ${state.confirmed ? "disabled" : ""}>
        <span class="choice-num">${dispIdx + 1}</span><span class="choice-text">${escapeHtml(text)}</span>
      </button>`;
    })
    .join("");

  const explanationHtml = state.confirmed
    ? `<div class="explanation">
        <p class="explanation-title">${state.selectedDisplayIndex !== null && state.choiceOrder[state.selectedDisplayIndex] === q.answer ? "✅ 正解" : "❌ 不正解"}</p>
        <p class="explanation-body">${escapeHtml(q.explanation).replace(/\n/g, "<br>")}</p>
        ${q.law_refs?.length ? `<p class="law-refs">${q.law_refs.map(escapeHtml).join(" / ")}</p>` : ""}
      </div>`
    : "";

  app.innerHTML = `
    <div class="screen quiz">
      <header class="topbar topbar-quiz">
        <button class="back-btn" id="back-home">← ホーム</button>
        <span class="progress-text">第${state.progress.lap}周・セット${state.setIndex + 1}・${state.indexInSet + 1}/${total}問目</span>
      </header>

      <div class="question-area">
        <p class="topic">${escapeHtml(q.topic)}</p>
        <p class="question-text">${escapeHtml(state.variantText).replace(/\n/g, "<br>")}</p>
      </div>

      <div class="choices">${choicesHtml}</div>

      ${explanationHtml}

      <div class="action-bar">
        ${
          !state.confirmed
            ? `<button class="unsure-btn ${state.unsure ? "unsure-active" : ""}" id="unsure-btn">🤔 迷った</button>
               <button class="confirm-btn" id="confirm-btn" ${state.selectedDisplayIndex === null ? "disabled" : ""}>確定</button>`
            : `<button class="confirm-btn" id="next-btn">次へ →</button>`
        }
      </div>
    </div>
  `;

  document.getElementById("back-home")!.addEventListener("click", backToHome);

  if (!state.confirmed) {
    app.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedDisplayIndex = Number(btn.dataset.choice);
        render();
      });
    });
    document.getElementById("unsure-btn")!.addEventListener("click", () => {
      state.unsure = !state.unsure;
      render();
    });
    document.getElementById("confirm-btn")!.addEventListener("click", confirmAnswer);
  } else {
    document.getElementById("next-btn")!.addEventListener("click", nextQuestion);
  }
}

function renderSetSummary() {
  const s = state.setStats;
  const isLastSet = state.setIndex + 1 >= state.sets.length;
  app.innerHTML = `
    <div class="screen set-summary">
      <h2>セット${state.setIndex + 1} 終了</h2>
      <div class="summary-stats">
        <div class="summary-stat correct">✅ 正解 ${s.correct}</div>
        <div class="summary-stat wrong">❌ 不正解 ${s.incorrect}</div>
        <div class="summary-stat unsure">🤔 迷った ${s.unsure}</div>
      </div>
      <div class="action-bar action-bar-static">
        <button class="btn-secondary" id="home-btn">ホームへ</button>
        <button class="confirm-btn" id="continue-btn">${isLastSet ? "この周を完了 →" : "次のセットへ →"}</button>
      </div>
    </div>
  `;
  document.getElementById("home-btn")!.addEventListener("click", backToHome);
  document.getElementById("continue-btn")!.addEventListener("click", goNextSetOrLap);
}

function renderCongrats() {
  app.innerHTML = `
    <div class="screen congrats">
      <h2>🎉 全問卒業しました</h2>
      <p>「迷わず正解」が連続${QUAL.meta.phases.graduate_streak}回続いた問題ばかりになりました。</p>
      <p>通常周回に戻して忘却を防ぎます。</p>
      <div class="action-bar action-bar-static">
        <button class="confirm-btn" id="home-btn">ホームへ</button>
      </div>
    </div>
  `;
  document.getElementById("home-btn")!.addEventListener("click", backToHome);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

init();
