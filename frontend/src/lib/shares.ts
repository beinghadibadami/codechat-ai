/**
 * Local registry of share links created in this browser.
 *
 * There are no user accounts yet, so the server has no way to list "your"
 * shares. Rather than pretend otherwise, we remember the ids created here and
 * the /shared page is explicit that the list is browser-local.
 */
const STORE_KEY = 'codechat-shares';
const MAX_RECORDS = 50;

export interface ShareRecord {
  id: string;
  repoName: string | null;
  createdAt: string;
  messageCount: number;
}

export const readShares = (): ShareRecord[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as ShareRecord[]) : [];
  } catch {
    return [];
  }
};

export const writeShares = (records: ShareRecord[]) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    /* storage unavailable — the link still works, it just isn't listed */
  }
};

/** Record a newly created share, newest first, de-duplicated by id. */
export const rememberShare = (record: ShareRecord) => {
  writeShares([record, ...readShares().filter(r => r.id !== record.id)]);
};

export const forgetShare = (id: string): ShareRecord[] => {
  const next = readShares().filter(r => r.id !== id);
  writeShares(next);
  return next;
};
