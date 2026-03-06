const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/* ══════════════════════════════════════════════════════════
   LANNGOOD.ID — Backend v3.0  (Railway-Ready)
   • Semua request ke Groq API via /lannai.id
   • Riwayat obrolan disimpan ke riwayat.json (server)
   • Frontend di-serve dari folder public/
══════════════════════════════════════════════════════════ */
const server = express();
server.use(cors());
server.use(express.json({ limit: "2mb" }));
server.use(express.static(path.join(__dirname, "public")));

/* ── Config ── */
const APIKEY_GROQ = process.env.APIKEY;
const PORT = process.env.PORT || 3000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const HISTORY_FILE = path.join(__dirname, "riwayat.json");
const MAX_SESSIONS = 1000;

const MODELS = {
  "llama-3.3-70b-versatile": { label: "Cerdas", temperature: 0.5, max_tokens: 4096 },
  "llama-3.1-8b-instant": { label: "Instan", temperature: 0.5, max_tokens: 4096 }
};
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/* ── Kepribadian tunggal ── */
const SISTEM = `
Kamu adalah LANNGOOD.ID — asisten AI buatan Lann, dirakit pada Minggu 22 Januari 2026.

IDENTITAS (WAJIB dipatuhi):
- Namamu selalu LANNGOOD.ID. Jangan sebut nama model internal (Llama, GPT, dll).
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

/* ══ riwayat.json helpers ══ */
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "[]", "utf8");
  console.log("[INFO] riwayat.json dibuat:", HISTORY_FILE);
}
function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch { return []; }
}
function writeHistory(data) {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { console.warn("[WARN] Tidak bisa tulis riwayat.json:", e.message); }
}

/* ══ Middleware ══ */
function checkKey(req, res, next) {
  if (!APIKEY_GROQ) return res.status(500).json({ gagal: { message: "APIKEY tidak ditemukan di environment variables." } });
  next();
}
function logger(req, res, next) {
  const t = new Date().toLocaleString("id-ID");
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (req.method === "POST" && req.path === "/lannai.id") {
    const m = req.body?.model || DEFAULT_MODEL;
    const n = (req.body?.cmd || []).length;
    console.log(`[${t}] CHAT | IP:${ip} | Model:${m} | ${n} pesan`);
  } else if (req.path !== "/health") {
    console.log(`[${t}] ${req.method} ${req.path} | IP:${ip}`);
  }
  next();
}
server.use(logger);

/* ══ ROUTES ══ */

/* Health Check */
server.get("/health", (req, res) => {
  const hist = readHistory();
  res.json({
    status: "online",
    nama: "LANNGOOD.ID",
    versi: "3.0.0",
    models: Object.keys(MODELS),
    sessions: hist.length,
    waktu: new Date().toISOString()
  });
});

/* Serve frontend — catch-all agar SPA works */
server.get("/", (req, res) => {
  const f = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(f)) res.sendFile(f);
  else res.json({ status: "online", hint: "Letakkan index.html di folder public/" });
});

/* ── Chat ── */
server.post("/lannai.id", checkKey, async (req, res) => {
  const { cmd: pesan, model: mdReq } = req.body;

  if (!Array.isArray(pesan) || !pesan.length)
    return res.status(400).json({ gagal: { message: "'cmd' harus array non-empty." } });
  if (pesan.length > 200)
    return res.status(400).json({ gagal: { message: "Maksimal 200 pesan per request." } });
  for (let i = 0; i < pesan.length; i++) {
    const p = pesan[i];
    if (!p.role || !p.content)
      return res.status(400).json({ gagal: { message: `Pesan #${i + 1} perlu 'role' dan 'content'.` } });
    if (!["user", "assistant"].includes(p.role))
      return res.status(400).json({ gagal: { message: `Role '${p.role}' tidak valid.` } });
    if (!p.content.trim())
      return res.status(400).json({ gagal: { message: `Pesan #${i + 1}: content kosong.` } });
  }

  const model = MODELS[mdReq] ? mdReq : DEFAULT_MODEL;
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
      return res.status(r.status).json({ gagal: { message: e?.error?.message || "Groq error" } });
    }

    const data = await r.json();
    if (!data?.choices?.[0]?.message?.content)
      return res.status(500).json({ gagal: { message: "Respons AI kosong." } });

    if (data.usage) {
      const u = data.usage;
      console.log(`[TOKEN] ${model} | prompt:${u.prompt_tokens} completion:${u.completion_tokens} total:${u.total_tokens}`);
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ gagal: { message: "Server error: " + e.message } });
  }
});

/* ── Riwayat CRUD ── */

// LIST
server.get("/riwayat", (req, res) => {
  const all = readHistory();
  res.json(all.map(({ id, judul, model, waktu, pesan_count, pinned, starred }) =>
    ({ id, judul, model, waktu, pesan_count, pinned: !!pinned, starred: !!starred })
  ));
});

// DETAIL
server.get("/riwayat/:id", (req, res) => {
  const item = readHistory().find(h => h.id === req.params.id);
  if (!item) return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  res.json(item);
});

// SIMPAN / UPDATE
server.post("/riwayat/simpan", (req, res) => {
  const { id, judul, model, waktu, pesan, pinned, starred } = req.body;
  if (!id || !Array.isArray(pesan))
    return res.status(400).json({ gagal: { message: "'id' dan 'pesan' wajib ada." } });

  let all = readHistory();
  const idx = all.findIndex(h => h.id === id);
  const entry = {
    id,
    judul: (judul || "Percakapan Baru").slice(0, 80),
    model: model || DEFAULT_MODEL,
    waktu: waktu || new Date().toISOString(),
    pesan_count: pesan.length,
    pinned: !!pinned,
    starred: !!starred,
    pesan
  };

  if (idx >= 0) all[idx] = entry; else all.unshift(entry);
  const p = all.filter(h => h.pinned);
  const u = all.filter(h => !h.pinned).slice(0, MAX_SESSIONS - p.length);
  writeHistory([...p, ...u]);
  console.log(`[RIWAYAT] Simpan: "${entry.judul}" (${entry.pesan_count} pesan)`);
  res.json({ ok: true, id, judul: entry.judul });
});

// PATCH (rename / pin / star)
server.patch("/riwayat/:id", (req, res) => {
  const all = readHistory();
  const idx = all.findIndex(h => h.id === req.params.id);
  if (idx < 0) return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  const { judul, pinned, starred } = req.body;
  if (judul !== undefined) all[idx].judul = judul.slice(0, 80);
  if (pinned !== undefined) all[idx].pinned = !!pinned;
  if (starred !== undefined) all[idx].starred = !!starred;
  writeHistory(all);
  res.json({ ok: true });
});

// DELETE one
server.delete("/riwayat/:id", (req, res) => {
  const all = readHistory();
  const next = all.filter(h => h.id !== req.params.id);
  if (next.length === all.length)
    return res.status(404).json({ gagal: { message: "Tidak ditemukan." } });
  writeHistory(next);
  res.json({ ok: true });
});

// DELETE all
server.delete("/riwayat", (req, res) => {
  writeHistory([]);
  console.log("[RIWAYAT] Semua dihapus.");
  res.json({ ok: true });
});

/* 404 */
server.use((req, res) =>
  res.status(404).json({ gagal: { message: `Route tidak ditemukan: ${req.method} ${req.path}` } })
);

/* ══ START ══ */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║          LANNGOOD.ID  SERVER  v3.0               ║
╠══════════════════════════════════════════════════╣
║  Status      : RUNNING                           ║
║  Port        : ${String(PORT).padEnd(34)}║
╠══════════════════════════════════════════════════╣
║  POST  /lannai.id          → Chat                ║
║  GET   /riwayat            → List sesi           ║
║  POST  /riwayat/simpan     → Simpan sesi         ║
║  PATCH /riwayat/:id        → Edit sesi           ║
║  DEL   /riwayat/:id        → Hapus sesi          ║
╚══════════════════════════════════════════════════╝
`);
});