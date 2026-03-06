# LANNGOOD.ID — Deploy ke Railway

## Struktur Folder
```
lanngood-deploy/
├── public/
│   └── index.html     ← Salin file frontend v3 kamu ke sini (RENAME jadi index.html)
├── server.js          ← Backend sudah siap Railway
├── package.json       ← Start script untuk Railway
├── .gitignore         ← Exclude node_modules & .env
└── README.md          ← Ini
```

## Cara Deploy

### 1. Siapkan index.html
Salin file frontend v3 kamu ke folder `public/` dan rename menjadi `index.html`.
TIDAK PERLU ubah apapun — semua fetch URL sudah menggunakan path relatif (/lannai.id).

### 2. Push ke GitHub
```bash
git init
git add .
git commit -m "LANNGOOD.ID v3 - Railway ready"
git remote add origin https://github.com/USERNAME/lanngood-id.git
git push -u origin main
```

### 3. Deploy di Railway
1. Buka railway.com → New Project → Deploy from GitHub
2. Pilih repo ini
3. Buka tab Variables → tambahkan:
   - APIKEY = gsk_xxxxxxxxxxxx   (Groq API key kamu)
   - PORT   = 3000
4. Railway otomatis deploy → dapat URL publik!

## ⚠️ Catatan Penting
- riwayat.json di Railway akan RESET setiap deploy baru
- Riwayat tetap aman di localStorage browser pengguna
- Server-side history hanya bonus, bukan primary storage