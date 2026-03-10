const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/* ══════════════════════════════════════════════════════════
   LANNGOOD.ID — Backend v4.0
   • POST /lannai.id     → Groq API (llama-3.3-70b, llama-3.1-8b)
   • POST /lannreal.co   → Liquid LFM2.5-1.2b (localhost:2009)
   • CRUD /riwayat       → Riwayat obrolan (riwayat.json)
   • Static frontend dari folder public/
══════════════════════════════════════════════════════════ */

const server = express();
server.use(cors());
server.use(express.json({ limit: "2mb" }));
server.use(express.static(path.join(__dirname, "public")));

/* ── Config ── */
const APIKEY_GROQ = process.env.APIKEY;
const APIKEY_TOKEN = process.env.APIKEY_TOKEN;
const PORT = process.env.PORT || 3000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const LIQUID_URL = process.env.LIQUID_URL || "https://daniel-pork-descriptions-delays.trycloudflare.com/v1/chat/completions";
const LIQUID_FALLBACK_MODEL = "llama-3.3-70b-versatile"; // fallback ke Groq kalau Liquid offline
const HISTORY_FILE = path.join(__dirname, "riwayat.json");
const MAX_SESSIONS = 1000;

const MODELS = {
  "liquid/lfm2.5-1.2b": { label: "Genius", temperature: 0.3, max_tokens: 4096, endpoint: "liquid" },
  "llama-3.3-70b-versatile": { label: "Cerdas", temperature: 0.5, max_tokens: 4096, endpoint: "groq" },
  "llama-3.1-8b-instant": { label: "Instan", temperature: 0.5, max_tokens: 4096, endpoint: "groq" },
};
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/* ── Kepribadian ── */
const SISTEM = `
Kamu adalah LANNGOOD.ID — asisten AI buatan Lann, dirakit pada Minggu 22 Januari 2026.

IDENTITAS (WAJIB dipatuhi):
- Namamu selalu LANNGOOD.ID. Jangan sebut nama model internal (Llama, LFM, GPT, dll).
- Jika ditanya siapa kamu → jawab: "Saya LANNGOOD.ID, asisten AI buatan Lann."
- Kamu adalah satu entitas yang sama di semua model.

GAYA MENJAWAB:
- Bahasa menyesuaikan pengguna (Indonesia / Inggris).
- Gunakan **bold** untuk istilah penting.
- Kode selalu pakai fenced code block dengan nama bahasa (contoh: \`\`\`python).
- Gunakan tabel markdown jika data cocok ditampilkan tabel.
- Jawaban jelas, terstruktur, tidak bertele-tele.
- Jujur jika tidak tahu.

MEMORI:
- Kamu menerima SELURUH riwayat percakapan setiap request.
- Ganti model di tengah sesi → kamu tetap ingat semua konteks sebelumnya.
`.trim();

/* ── riwayat.json helpers ── */
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "[]", "utf8");
  console.log("[INFO] riwayat.json dibuat.");
}
function readHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return []; } }
function writeHistory(d) { try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(d, null, 2), "utf8"); } catch (e) { console.warn("[WARN]", e.message); } }

/* ── Logger ── */
server.use((req, res, next) => {
  const t = new Date().toLocaleString("id-ID");
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (["/lannai.id", "/lannreal.co"].includes(req.path)) {
    const m = req.body?.model || req.body?.cmd?.[0]?.role || "?";
    const n = (req.body?.cmd || []).length;
    console.log(`[${t}] CHAT | IP:${ip} | ${req.path} | ${n} pesan`);
  } else if (req.path !== "/health") {
    console.log(`[${t}] ${req.method} ${req.path} | IP:${ip}`);
  }
  next();
});

/* ══ HEALTH ══ */
server.get("/health", (req, res) => res.json({
  status: "online", nama: "LANNGOOD.ID", versi: "4.0.0",
  models: Object.keys(MODELS), sessions: readHistory().length,
  waktu: new Date().toISOString()
}));

/* ══ FRONTEND ══ */
server.get("/", (req, res) => {
  const f = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(f)) res.sendFile(f);
  else res.json({ status: "online", hint: "Letakkan index.html di folder public/" });
});

/* ══════════════════════════════════════════════
   ROUTE: Chat — Groq (llama-3.3-70b & llama-3.1-8b)
══════════════════════════════════════════════ */
server.post("/lannai.id", async (req, res) => {
  if (!APIKEY_GROQ)
    return res.status(500).json({ gagal: { message: "APIKEY Groq tidak ditemukan." } });

  const { cmd: pesan, model: mdReq } = req.body;
  if (!Array.isArray(pesan) || !pesan.length)
    return res.status(400).json({ gagal: { message: "'cmd' harus array non-empty." } });

  const model = (MODELS[mdReq]?.endpoint === "groq") ? mdReq : DEFAULT_MODEL;
  const cfg = MODELS[model];

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + APIKEY_GROQ },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SISTEM }, ...pesan],
        temperature: cfg.temperature,
        max_tokens: cfg.max_tokens
      })
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(r.status).json({ gagal: { message: e?.error?.message || "Groq API error" } });
    }
    const data = await r.json();
    if (!data?.choices?.[0]?.message?.content)
      return res.status(500).json({ gagal: { message: "Respons Groq kosong." } });
    if (data.usage) {
      const u = data.usage;
      console.log(`[TOKEN] ${model} | prompt:${u.prompt_tokens} completion:${u.completion_tokens} total:${u.total_tokens}`);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ gagal: { message: "Server error (Groq): " + e.message } });
  }
});

/* ══════════════════════════════════════════════
   ROUTE: Chat — Liquid LFM2.5 (self-hosted :2009)
══════════════════════════════════════════════ */
server.post("/lannreal.co", async (req, res) => {
  const historyuser = req.body.cmd;

  if (!Array.isArray(historyuser) || !historyuser.length)
    return res.status(400).json({ gagal: { message: "'cmd' harus array non-empty." } });

  // ── Coba Liquid lokal dulu ──
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s — LM Studio butuh waktu

    const respon = await fetch(LIQUID_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (APIKEY_TOKEN || "no-key"),
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LANNGOOD-Server/4.0"
      },
      body: JSON.stringify({
        model: "liquid/lfm2.5-1.2b",
        messages: [{ role: "system", content: SISTEM }, ...historyuser],
        temperature: 0.3
      })
    });
    clearTimeout(timeout);
    const data = await respon.json();
    // kalau ada error dari liquid server, lempar ke fallback
    if (data.error) throw new Error(data.error);
    return res.json(data);
  } catch (e) {
    // ── Fallback ke Groq kalau Liquid tidak tersedia ──
    console.warn(`[LIQUID] Server tidak tersedia (${e.message}), fallback ke Groq...`);

    if (!APIKEY_GROQ)
      return res.status(500).json({ gagal: { message: "Liquid server offline dan APIKEY Groq tidak ditemukan." } });

    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + APIKEY_GROQ },
        body: JSON.stringify({
          model: LIQUID_FALLBACK_MODEL,
          messages: [{ role: "system", content: SISTEM }, ...historyuser],
          temperature: 0.3,
          max_tokens: 4096
        })
      });
      const data = await r.json();
      if (!data?.choices?.[0]?.message?.content)
        return res.status(500).json({ gagal: { message: "Fallback Groq: respons kosong." } });

      console.log(`[LIQUID→GROQ] Fallback berhasil via ${LIQUID_FALLBACK_MODEL}`);
      // tandai di response supaya frontend tahu ini fallback
      data._fallback = true;
      data._fallback_model = LIQUID_FALLBACK_MODEL;
      return res.json(data);
    } catch (e2) {
      return res.status(500).json({ gagal: { message: "Liquid offline & Groq gagal: " + e2.message } });
    }
  }
});

/* ══ RIWAYAT CRUD ══ */
server.get("/riwayat", (req, res) => {
  const all = readHistory();
  res.json(all.map(({ id, judul, model, waktu, pesan_count, pinned, starred }) =>
    ({ id, judul, model, waktu, pesan_count, pinned: !!pinned, starred: !!starred })
  ));
});
server.get("/riwayat/:id", (req, res) => {
  const item = readHistory().find(h => h.id === req.params.id);
  if (!item) return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  res.json(item);
});
server.post("/riwayat/simpan", (req, res) => {
  const { id, judul, model, waktu, pesan, pinned, starred } = req.body;
  if (!id || !Array.isArray(pesan))
    return res.status(400).json({ gagal: { message: "'id' dan 'pesan' wajib ada." } });
  let all = readHistory();
  const idx = all.findIndex(h => h.id === id);
  const entry = {
    id, judul: (judul || "Percakapan Baru").slice(0, 80), model: model || DEFAULT_MODEL,
    waktu: waktu || new Date().toISOString(), pesan_count: pesan.length,
    pinned: !!pinned, starred: !!starred, pesan
  };
  if (idx >= 0) all[idx] = entry; else all.unshift(entry);
  const p = all.filter(h => h.pinned), u = all.filter(h => !h.pinned).slice(0, MAX_SESSIONS - p.length);
  writeHistory([...p, ...u]);
  res.json({ ok: true, id, judul: entry.judul });
});
server.patch("/riwayat/:id", (req, res) => {
  const all = readHistory(), idx = all.findIndex(h => h.id === req.params.id);
  if (idx < 0) return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  const { judul, pinned, starred } = req.body;
  if (judul !== undefined) all[idx].judul = judul.slice(0, 80);
  if (pinned !== undefined) all[idx].pinned = !!pinned;
  if (starred !== undefined) all[idx].starred = !!starred;
  writeHistory(all); res.json({ ok: true });
});
server.delete("/riwayat/:id", (req, res) => {
  const all = readHistory(), next = all.filter(h => h.id !== req.params.id);
  if (next.length === all.length) return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  writeHistory(next); res.json({ ok: true });
});
server.delete("/riwayat", (req, res) => {
  writeHistory([]); console.log("[RIWAYAT] Semua dihapus."); res.json({ ok: true });
});
server.use((req, res) => res.status(404).json({ gagal: { message: `Route tidak ditemukan: ${req.method} ${req.path}` } }));

/* ══ START ══ */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║           LANNGOOD.ID  SERVER  v4.0  🚀               ║
╠═══════════════════════════════════════════════════════╣
║  Status   : RUNNING ✓                                 ║
║  Port     : ${String(PORT).padEnd(43)}║
╠═══════════════════════════════════════════════════════╣
║  POST /lannai.id    → Groq (llama-3.3-70b / 8b)       ║
║  POST /lannreal.co  → Liquid LFM2.5-1.2b 👑 (:2009)   ║
║  GET  /health       → Status server                   ║
║  CRUD /riwayat      → Chat history                    ║
╚═══════════════════════════════════════════════════════╝
  `);
});