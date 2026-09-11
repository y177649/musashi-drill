// 進捗の保存先。オフラインで確実に動くよう常にIndexedDBを正とする。
import type { ProgressState, QuestionRecord } from "./types";

const DB_NAME = "musashi-drill";
const DB_VERSION = 1;
const STORE_RECORDS = "records";
const STORE_META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) db.createObjectStore(STORE_RECORDS);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecord(qid: string): Promise<QuestionRecord | undefined> {
  return run(STORE_RECORDS, "readonly", (s) => s.get(qid));
}

export async function putRecord(qid: string, rec: QuestionRecord): Promise<void> {
  await run(STORE_RECORDS, "readwrite", (s) => s.put(rec, qid));
}

export async function getAllRecords(): Promise<Record<string, QuestionRecord>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_RECORDS, "readonly");
    const store = t.objectStore(STORE_RECORDS);
    const out: Record<string, QuestionRecord> = {};
    const cur = store.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        out[String(c.key)] = c.value as QuestionRecord;
        c.continue();
      } else {
        resolve(out);
      }
    };
    cur.onerror = () => reject(cur.error);
  });
}

export async function getProgress(qualId: string): Promise<ProgressState | undefined> {
  return run(STORE_META, "readonly", (s) => s.get(`progress:${qualId}`));
}

export async function putProgress(qualId: string, state: ProgressState): Promise<void> {
  await run(STORE_META, "readwrite", (s) => s.put(state, `progress:${qualId}`));
}

export async function exportAll(qualId: string) {
  return {
    exportedAt: new Date().toISOString(),
    qualId,
    records: await getAllRecords(),
    progress: await getProgress(qualId),
  };
}

export async function importAll(payload: {
  qualId: string;
  records: Record<string, QuestionRecord>;
  progress?: ProgressState;
}): Promise<void> {
  for (const [qid, rec] of Object.entries(payload.records)) {
    await putRecord(qid, rec);
  }
  if (payload.progress) await putProgress(payload.qualId, payload.progress);
}
