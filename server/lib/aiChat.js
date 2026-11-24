// server/lib/aiChat.js
//
// ── ONE DOOR TO AN AI MODEL ──────────────────────────────────────────────
//
// Everything in GLOOBAL that asks an AI something asks it here, so the
// provider can change (or be switched off) without the callers knowing.
//
//   PROJECT_AI=groq      Groq's API (GROQ_API_KEY, GROQ_MODEL). Free plan:
//                        about 1,000 requests a day, no card.
//   PROJECT_AI=practice  no AI at all: callers use their own fixed steps.
//   (unset)              groq when GROQ_API_KEY is set, otherwise practice.
//
// The key is read on the server only and never reaches a phone.
//
// complete() never throws. It answers { ok: true, text } or
// { ok: false, code, message } — code 'off' (no AI here), 'rate_limited',
// 'daily_budget', 'unavailable' or 'bad_answer' — so a caller can carry on
// without the AI instead of failing the person in front of it.
//
// AI_DAILY_CALLS caps calls per UTC day on this server (default 800, under
// Groq's free 1,000), so the free plan is not run dry by one busy day.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// openai/gpt-oss-120b: a production model on Groq that is not on its
// deprecation list (checked November 2026). Change with GROQ_MODEL.
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 25000;

function createAiChat({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const wanted = String(env.PROJECT_AI || '').trim().toLowerCase();
  const key = String(env.GROQ_API_KEY || '').trim();
  const provider = wanted === 'practice' ? 'practice' : (wanted === 'groq' || !wanted) && key ? 'groq' : 'practice';
  const model = provider === 'groq' ? String(env.GROQ_MODEL || GROQ_DEFAULT_MODEL).trim() : '';
  const dailyCap = Math.max(0, Number(env.AI_DAILY_CALLS || 800) || 0);
  const used = { day: '', calls: 0 };

  function spend() {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (used.day !== day) { used.day = day; used.calls = 0; }
    if (used.calls >= dailyCap) return false;
    used.calls += 1;
    return true;
  }

  async function post(body) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: res.status, data };
    } catch (e) {
      return { status: 0, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // messages: [{ role: 'user' | 'assistant', content }]
  async function complete({ system, messages, maxTokens = 900, temperature = 0.4, json = true } = {}) {
    if (provider !== 'groq') return { ok: false, code: 'off', message: 'No AI is connected.' };
    if (!spend()) return { ok: false, code: 'daily_budget', message: 'The AI has had its share for today.' };
    const body = {
      model,
      messages: [{ role: 'system', content: String(system || '') }, ...(messages || []).map((m) => ({ role: m.role, content: String(m.content || '') }))],
      temperature,
      max_tokens: maxTokens,
    };
    if (json) body.response_format = { type: 'json_object' };
    let got = await post(body);
    // A model that refuses JSON mode answers 400: ask once more without it.
    if (got.status === 400 && json) {
      delete body.response_format;
      got = await post(body);
    }
    if (got.status === 429) return { ok: false, code: 'rate_limited', message: 'The AI is busy just now.' };
    if (got.status !== 200 || !got.data) return { ok: false, code: 'unavailable', message: 'The AI did not answer.' };
    const choice = got.data.choices && got.data.choices[0];
    const textOut = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
    if (!textOut.trim()) return { ok: false, code: 'bad_answer', message: 'The AI gave an empty answer.' };
    return { ok: true, text: textOut };
  }

  return { provider, model, complete, available: provider === 'groq', usedToday: () => (used.day === new Date(now()).toISOString().slice(0, 10) ? used.calls : 0) };
}

// The first JSON object in a model's answer, or null. Models sometimes wrap
// JSON in prose or a code fence even when asked not to.
function parseJsonReply(raw) {
  const s = String(raw || '').trim();
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}

module.exports = { createAiChat, parseJsonReply, GROQ_URL, GROQ_DEFAULT_MODEL };
