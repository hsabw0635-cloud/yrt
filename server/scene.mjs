/**
 * مقارنة "بصمة المكان" بين صورة حضور وصور زملاء الطالب في الجلسة نفسها.
 * لا توجد إحداثيات أو بيانات جغرافية؛ المقارنة بصرية فقط.
 */

export const SCENE_MIN_SCORE = 0.5;
const MIN_PEERS = 2;
const GRAY_WEIGHT = 0.45;
const COLOR_WEIGHT = 0.35;
const EDGE_WEIGHT = 0.2;

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = Number(a[index]) || 0;
    const y = Number(b[index]) || 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (!normA || !normB) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(normA * normB)));
}

function correlation(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  const meanA = a.reduce((sum, value) => sum + (Number(value) || 0), 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + (Number(value) || 0), 0) / b.length;
  return cosine(
    a.map((value) => (Number(value) || 0) - meanA),
    b.map((value) => (Number(value) || 0) - meanB),
  );
}

export function parseSceneSignature(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.v !== 1 || !Array.isArray(value.gray) || !Array.isArray(value.color) || !Array.isArray(value.edges)) return null;
    if (value.gray.length !== 256 || value.color.length !== 27 || value.edges.length !== 8) return null;
    return value;
  } catch {
    return null;
  }
}

export function sceneSimilarity(a, b) {
  const grayScore = Math.max(0, correlation(a.gray, b.gray));
  const colorScore = Math.max(0, cosine(a.color, b.color));
  const edgeScore = Math.max(0, cosine(a.edges, b.edges));
  const score = GRAY_WEIGHT * grayScore + COLOR_WEIGHT * colorScore + EDGE_WEIGHT * edgeScore;
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

/**
 * يحتاج طالبين على الأقل في الجلسة قبل اعتبار المخالفة.
 * تُقارن الصورة بأقرب 3 صور سابقة لتفادي إدانة الطالب بسبب صورة شاذة واحدة.
 */
export function verifyScene(rawSignature, peerSignatures = []) {
  const signature = parseSceneSignature(rawSignature);
  if (!signature) return { status: 'verified', score: null, reason: null };

  const peers = (peerSignatures || [])
    .map(parseSceneSignature)
    .filter(Boolean);
  if (peers.length < MIN_PEERS) return { status: 'verified', score: null, reason: null };

  const scores = peers
    .map((peer) => sceneSimilarity(signature, peer))
    .sort((a, b) => b - a);
  const closest = scores.slice(0, Math.min(3, scores.length));
  const score = Math.round((closest.reduce((sum, value) => sum + value, 0) / closest.length) * 1000) / 1000;

  return score >= SCENE_MIN_SCORE
    ? { status: 'verified', score, reason: null }
    : { status: 'suspicious', score, reason: 'SCENE_MISMATCH' };
}
