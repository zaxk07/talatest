# TalaTest

Zero-API-key, 100% client-side study reviewer. Upload **PDF, PPTX, DOCX, TXT or Markdown** (or paste notes) and get a Study Guide, Active Recall Flashcards, a Calm/Kahoot-style practice exam and a Match game. Decks auto-save to `localStorage`; export a printable reviewer as `.md` / `.txt`.

## Scripts
- `npm run dev` — start the dev server
- `npm test` — Vitest (parser + quiz generator + fuzzy matching)
- `npm run build` — type-check (`tsc -b`) and build to `dist/`

## Notes
- `npm install` may need `--legacy-peer-deps` with the newest Vite/Vitest majors.
- jsdom is pinned to 26 for Node 20 compatibility.
- Scanned (image-only) PDFs are not supported (no OCR).
- Deploys as a static SPA on Vercel (`vercel.json` included).
