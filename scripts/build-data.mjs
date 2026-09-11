// data/<資格ID>/*.yaml を読み込み、src/data/generated/<資格ID>.json にまとめる。
// アプリ本体はYAMLを直接パースしない（依存最小・ビルド時に一度だけ変換する）。
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { load } from "js-yaml";

const dataDir = new URL("../data/", import.meta.url);
const outDir = new URL("../src/data/generated/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const qualDirs = readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory());

const index = [];

for (const qd of qualDirs) {
  const qualId = qd.name;
  const qualDir = new URL(`${qualId}/`, dataDir);
  const files = readdirSync(qualDir).filter((f) => f.endsWith(".yaml"));
  if (!files.includes("meta.yaml")) {
    console.warn(`[build-data] ${qualId}: meta.yaml が無いのでスキップ`);
    continue;
  }
  const meta = load(readFileSync(new URL("meta.yaml", qualDir), "utf8"));
  const questions = [];
  for (const f of files) {
    if (f === "meta.yaml") continue;
    const doc = load(readFileSync(new URL(f, qualDir), "utf8"));
    if (Array.isArray(doc)) questions.push(...doc);
  }
  const out = { meta, questions };
  writeFileSync(new URL(`${qualId}.json`, outDir), JSON.stringify(out, null, 2));
  index.push({ id: qualId, title: meta.title, questionCount: questions.length });
  console.log(`[build-data] ${qualId}: ${questions.length}問`);
}

writeFileSync(new URL("index.json", outDir), JSON.stringify(index, null, 2));
