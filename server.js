const express = require("express");
const app = express();
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));


app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const SM_KEY = process.env.SPEECHMATICS_API_KEY || "";
const SM_BASE = "https://asr.api.speechmatics.com/v2";

const queues = new Map();

function authOk(req) {
  const h = req.headers.authorization || "";
  return h === `Bearer ${AUTH_TOKEN}`;
}

function pushItem(userId, obj) {
  const q = queues.get(userId) || [];
  q.push(obj);
  queues.set(userId, q);
}

async function createJob(language) {
  const r = await fetch(`${SM_BASE}/jobs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SM_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "transcription",
      transcription_config: { language: language || "de" }
    })
  });
  if (!r.ok) throw new Error(`createJob ${r.status}`);
  const j = await r.json();
  return j.id || (j.job && j.job.id) || j;
}

async function uploadAudio(jobId, buffer, contentType) {
  const r = await fetch(`${SM_BASE}/jobs/${jobId}/audio`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SM_KEY}`,
      "Content-Type": contentType || "audio/wav"
    },
    body: buffer
  });
  if (!r.ok) throw new Error(`uploadAudio ${r.status}`);
}

function decodeBase64Audio(b64) {
  const comma = b64.indexOf(",");
  const raw = comma >= 0 ? b64.slice(comma + 1) : b64;
  return Buffer.from(raw, "base64");
}

async function fetchTranscript(jobId) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${SM_BASE}/jobs/${jobId}/transcript?format=json-v2`, {
      headers: {
        "Authorization": `Bearer ${SM_KEY}`,
        "Accept": "application/json"
      }
    });
    if (r.status === 404 || r.status === 202) {
      await new Promise(res => setTimeout(res, 500));
      continue;
    }
    if (!r.ok) throw new Error(`transcript ${r.status}`);
    const j = await r.json();
    const parts = [];
    const arr = Array.isArray(j.results) ? j.results : [];
    for (const res of arr) {
      const alt = res && res.alternatives && res.alternatives[0];
      if (alt && typeof alt.content === "string") parts.push(alt.content);
    }
    return parts.join(" ").trim();
  }
  throw new Error("timeout");
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});
app.get("/", (req, res) => res.json({ ok: true, service: "speech-relay" }));

app.post("/ingest", async (req, res) => {
  try {
    if (!authOk(req)) return res.status(401).json({ ok: false });
    const userId = String(req.body.userId || "").trim();
    const language = String(req.body.language || "de");
    const audio = String(req.body.audio || "");
    const contentType = String(req.body.contentType || "audio/wav");
    if (!userId || !audio) return res.status(400).json({ ok: false });
    if (!SM_KEY) return res.status(500).json({ ok: false });

    const jobId = await createJob(language);
    const buf = decodeBase64Audio(audio);
    await uploadAudio(jobId, buf, contentType);
    const text = await fetchTranscript(jobId);

    if (text) pushItem(userId, { text, lang: language, ts: Math.floor(Date.now() / 1000) });
    res.json({ ok: true, jobId, text });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/pull", (req, res) => {
  if (!authOk(req)) return res.status(401).json({ ok: false });
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ ok: false, items: [] });
  const q = queues.get(userId) || [];
  queues.set(userId, []);
  res.json({ ok: true, items: q });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log("[speech-relay] listening on", port);
});
process.on("SIGTERM", () => { console.log("[speech-relay] SIGTERM"); process.exit(0); });
process.on("SIGINT", () => { console.log("[speech-relay] SIGINT"); process.exit(0); });
