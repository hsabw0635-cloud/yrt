/**
 * تحقق ذكي من صور الحضور عبر Gemini Vision.
 * تُقارَن صورة الطالب بصور زملائه في الجلسة نفسها مع التركيز على المكان
 * لا على الوجه أو الملابس. عند غياب المفتاح أو فشل الخدمة تُستخدم البصمة
 * البصرية المحلية في server/scene.mjs كخطة احتياطية.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const AI_MIN_SCORE = Number(process.env.AI_MIN_SCORE || 0.55);
const TIMEOUT_MS = 25000;

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  return parts.map((part) => part?.text || '').filter(Boolean).join('\n') || null;
}

function parseScore(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    const score = Number(value.score);
    if (!Number.isFinite(score)) return null;
    return {
      score: Math.max(0, Math.min(1, score)),
      sameScene: typeof value.sameScene === 'boolean' ? value.sameScene : score >= AI_MIN_SCORE,
      reason: typeof value.reason === 'string' ? value.reason.slice(0, 200) : '',
    };
  } catch {
    return null;
  }
}

export function aiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * @param {Buffer} studentBuffer صورة الطالب
 * @param {string} studentMime نوع الصورة
 * @param {Array<{buffer: Buffer, mime: string}>} peers صور زملاء الجلسة
 */
export async function verifyImagesWithAI(studentBuffer, studentMime, peers) {
  if (!aiEnabled() || !studentBuffer || !Array.isArray(peers) || peers.length < 2) return null;

  const prompt = `أنت محقق بصري في نظام حضور جامعي. لديك صور لطلاب التقطت في نفس قاعة المحاضرة، وآخر صورة هي صورة الطالب المراد التحقق منه.
قارن محيط الصور فقط: الجدران، السبورة، المقاعد، النوافذ، الإضاءة، وتخطيط المكان. تجاهل وجه الشخص وملابسه تماماً.
أعد JSON فقط بالصيغة التالية بدون أي نص إضافي:
{"score": رقم بين 0 و 1 لمقدار تطابق المكان, "sameScene": true أو false, "reason": "سبب قصير بالعربية"}`;

  const parts = [
    { text: `${prompt}\n\nصور الزملاء في القاعة (${peers.length} صور):` },
    ...peers.map((peer, index) => [
      { text: `صورة الزميل ${index + 1}:` },
      { inline_data: { mime_type: peer.mime || 'image/jpeg', data: peer.buffer.toString('base64') } },
    ]).flat(),
    { text: 'صورة الطالب المراد التحقق منها:' },
    { inline_data: { mime_type: studentMime || 'image/jpeg', data: studentBuffer.toString('base64') } },
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.warn(`[gemini] فشل التحقق (${response.status}):`, (await response.text()).slice(0, 300));
      return null;
    }
    const result = parseScore(extractText(await response.json()));
    if (!result) return null;
    return {
      status: result.sameScene && result.score >= AI_MIN_SCORE ? 'verified' : 'suspicious',
      score: result.score,
      reason: result.sameScene ? null : 'SCENE_MISMATCH',
      detail: result.reason,
      source: 'gemini',
    };
  } catch (error) {
    console.warn('[gemini] تعذّر الاتصال، سيُستخدم الفحص المحلي:', error.message);
    return null;
  }
}
