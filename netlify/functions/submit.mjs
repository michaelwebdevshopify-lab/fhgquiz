import { QUIZ, unshuffleAnswers, score } from "../lib/questions.mjs";
import { json, attempts, readBody } from "../lib/http.mjs";

const GRACE_SECONDS = 60; // network delay allowance after the timer hits 0

// POST /api/submit { id, answers, expired }
// answers are in the participant's shuffled order; they are stored in original order.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await readBody(req);
  if (!body || !body.id) return json({ error: "Invalid request" }, 400);

  const store = attempts();
  const att = await store.get(String(body.id), { type: "json" });
  if (!att || att.quiz !== QUIZ.key || !att.layout) {
    return json({ error: "Attempt not found. It may have been removed by the admin." }, 404);
  }

  // Already submitted: return the stored result (safe for retries).
  if (att.status === "completed") return json(result(att));

  const now = Date.now();
  const elapsed = Math.floor((now - att.startedAt) / 1000);
  const answers = unshuffleAnswers(body.answers, att.layout);
  const s = score(answers);

  const done = {
    ...att,
    status: "completed",
    submittedAt: now,
    answers,
    results: s.results,
    correct: s.correct,
    total: s.total,
    percent: s.percent,
    passed: s.passed,
    timeTaken: Math.min(elapsed, QUIZ.totalSeconds),
    expired: Boolean(body.expired) || elapsed >= QUIZ.totalSeconds,
    late: elapsed > QUIZ.totalSeconds + GRACE_SECONDS,
  };
  await store.setJSON(done.id, done);
  return json(result(done));
};

// Review in the same shuffled order the participant saw.
function result(att) {
  const { order, optOrder } = att.layout;
  return {
    name: att.name,
    correct: att.correct,
    total: att.total,
    percent: att.percent,
    passed: att.passed,
    timeTaken: att.timeTaken,
    totalSeconds: QUIZ.totalSeconds,
    expired: att.expired,
    review: order.map((qi, k) => {
      const q = QUIZ.questions[qi];
      const map = optOrder[k];
      const toShown = (orig) => map.indexOf(orig);
      const shown = (v) => (v == null ? null : Array.isArray(v) ? v.map(toShown).sort((a, b) => a - b) : toShown(v));
      return {
        q: q.q,
        options: map.map((n) => q.options[n]),
        answer: shown(q.answer),
        yours: shown(att.answers[qi]),
        ok: att.results[qi],
      };
    }),
  };
}

export const config = { path: "/api/submit" };
