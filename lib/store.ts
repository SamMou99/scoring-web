import { ref, set, get, remove, onValue, off } from "firebase/database";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { db } from "./firebaseConfig";

export interface Member {
  id: string;
  name: string;
  online: boolean;
}

export interface Round {
  id: string;
  baseScore: number;
  dealerId: string;
  winnerIds: string[];
  loserIds: string[];
  scores: Record<string, number>;
  note: string;
  createdAt: string;
}

export interface GameSession {
  id: string;
  name: string;
  createdAt: string;
  members: Member[];
  rounds: Round[];
}

function toArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val);
  return [];
}

function normalizeRound(raw: any): Round {
  return {
    ...raw,
    winnerIds: toArray(raw?.winnerIds) as string[],
    loserIds: toArray(raw?.loserIds) as string[],
    scores: raw?.scores && typeof raw.scores === "object" ? raw.scores : {},
  };
}

function normalizeSession(raw: any): GameSession {
  return {
    ...raw,
    members: toArray(raw?.members) as Member[],
    rounds: toArray(raw?.rounds).map(normalizeRound),
  };
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export async function getSessions(): Promise<GameSession[]> {
  const sessionsRef = ref(db, "sessions");
  const snapshot = await get(sessionsRef);
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val() || {})
    .map(([id, raw]) => normalizeSession({ id, ...(raw as object) }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function getSession(id: string): Promise<GameSession | null> {
  const sessionRef = ref(db, `sessions/${id}`);
  const snapshot = await get(sessionRef);
  return snapshot.exists()
    ? normalizeSession({ id, ...(snapshot.val() as object) })
    : null;
}

export async function saveSession(session: GameSession): Promise<void> {
  const sessionRef = ref(db, `sessions/${session.id}`);
  await set(sessionRef, session);
}

export async function deleteSession(id: string): Promise<void> {
  const sessionRef = ref(db, `sessions/${id}`);
  await remove(sessionRef);
}

export function subscribeToSession(
  id: string,
  callback: (session: GameSession | null) => void
): () => void {
  let active = true;

  const sessionRef = ref(db, `sessions/${id}`);
  const unsub = onValue(sessionRef, (snapshot) => {
    if (!active) return;
    callback(
      snapshot.exists()
        ? normalizeSession({ id, ...(snapshot.val() as object) })
        : null
    );
  });
  return () => {
    active = false;
    off(sessionRef, "value", unsub);
  };
}

export async function joinSession(id: string): Promise<GameSession | null> {
  const sessionRef = ref(db, `sessions/${id}`);
  const snapshot = await get(sessionRef);
  if (!snapshot.exists()) return null;
  return normalizeSession({ id, ...(snapshot.val() as object) });
}

export function calculateRoundScores(
  onlineMemberIds: string[],
  dealerId: string,
  winnerIds: string[],
  loserIds: string[],
  baseScore: number
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of onlineMemberIds) {
    scores[id] = 0;
  }
  for (const wid of winnerIds) {
    scores[wid] = (scores[wid] || 0) + baseScore;
    scores[dealerId] = (scores[dealerId] || 0) - baseScore;
  }
  for (const lid of loserIds) {
    scores[lid] = (scores[lid] || 0) - baseScore;
    scores[dealerId] = (scores[dealerId] || 0) + baseScore;
  }
  return scores;
}

export function getTotalScores(session: GameSession): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const m of session.members) {
    totals[m.id] = 0;
  }
  for (const round of session.rounds) {
    for (const [mid, score] of Object.entries(round.scores)) {
      if (totals[mid] !== undefined) {
        totals[mid] += score;
      }
    }
  }
  return totals;
}

function scoreColor(v: number): string {
  if (v > 0) return "#34C759";
  if (v < 0) return "#FF3B30";
  return "#8E8E93";
}

function scoreLabel(v: number): string {
  if (v > 0) return "+" + v;
  return String(v);
}

function dealerStatusLabel(round: Round): string {
  const s = round.scores[round.dealerId] || 0;
  if (s > 0) return " (庄赢)";
  if (s < 0) return " (庄输)";
  return " (庄)";
}

export async function exportSessionPDF(session: GameSession): Promise<void> {
  const totals = getTotalScores(session);
  const getName = (mid: string) =>
    session.members.find((m) => m.id === mid)?.name || "未知";

  const sortedMembers = [...session.members].sort(
    (a, b) => (totals[b.id] || 0) - (totals[a.id] || 0)
  );

  const roundRows = session.rounds
    .map((round, idx) => {
      const scoreCells = sortedMembers
        .map((m) => {
          const s = round.scores[m.id] || 0;
          const isDealer = m.id === round.dealerId;
          const tag = isDealer ? dealerStatusLabel(round) : "";
          return `<td style="color:${scoreColor(s)}; font-weight:600;">${s !== 0 ? scoreLabel(s) : "-"}${tag}</td>`;
        })
        .join("");

      return `<tr>
        <td>${idx + 1}</td>
        <td>${round.baseScore}</td>
        <td>${getName(round.dealerId)}</td>
        ${scoreCells}
        <td style="color:#8E8E93; font-size:11px;">${round.note || ""}</td>
      </tr>`;
    })
    .join("");

  const headerCells = sortedMembers
    .map((m) => `<th>${m.name}</th>`)
    .join("");

  const totalCells = sortedMembers
    .map((m) => {
      const t = totals[m.id] || 0;
      return `<td style="color:${scoreColor(t)}; font-weight:700; font-size:15px;">${scoreLabel(t)}</td>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; padding: 20px; color: #1C1C1E; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #8E8E93; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
  th, td { border: 1px solid #E5E5EA; padding: 8px 6px; text-align: center; }
  th { background: #F2F2F7; font-weight: 600; white-space: nowrap; }
  tr:nth-child(even) td { background: #FAFAFA; }
  .total-section h2 { font-size: 16px; margin-bottom: 8px; }
  .total-row td { background: #F2F2F7 !important; font-size: 15px; }
</style>
</head>
<body>
  <h1>${session.name || "记分局"}</h1>
  <div class="meta">
    局号: ${session.id} &nbsp;|&nbsp;
    创建: ${new Date(session.createdAt).toLocaleString("zh-CN")} &nbsp;|&nbsp;
    共 ${session.rounds.length} 轮 &nbsp;|&nbsp;
    成员: ${session.members.map((m) => m.name).join("、")}
  </div>

  <table>
    <thead>
      <tr><th>轮次</th><th>底分</th><th>庄家</th>${headerCells}<th>备注</th></tr>
    </thead>
    <tbody>
      ${roundRows}
      <tr class="total-row">
        <td colspan="3" style="font-weight:700;">总计</td>
        ${totalCells}
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="total-section">
    <h2>总分排行</h2>
    <table>
      <thead><tr><th>排名</th><th>成员</th><th>总分</th></tr></thead>
      <tbody>
        ${sortedMembers
          .map(
            (m, i) =>
              `<tr><td>${i + 1}</td><td>${m.name}</td><td style="color:${scoreColor(totals[m.id] || 0)}; font-weight:700;">${scoreLabel(totals[m.id] || 0)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "记分局成绩单",
    UTI: "com.adobe.pdf",
  });
}
