# CrawlMind

Crawl a site with accurate URL discovery, then crawl and generate **one DOCX per URL** (filename from URL), one by one. Format content with OpenAI. Includes a React frontend to start jobs and download generated docs.

## Features

- **Accurate URL discovery**: Sitemap (with full recursion) or BFS fallback; URLs are normalized (same domain, no fragments), filtered (no .pdf/.xml/assets etc.), and deduped.
- **One doc per URL**: Each page gets its own Word document; the filename is derived from the URL path (e.g. `about_us.docx`, `programs_mba.docx`).
- **Combine all option**: Crawl selected URLs and merge into one `combined.docx` + `combined.md`.
- **One-by-one pipeline**: For each URL: crawl → extract text → OpenAI format → write DOCX, then move to the next (sequential).
- **OpenAI formatting** (optional): Raw crawl text can be sent to GPT for formatting only. Set `USE_OPENAI_FORMAT=false` in `.env` to use **Python-only** cleaning (no API key needed): main content via **trafilatura**, boilerplate filtered, same DOCX/MD output.
- **React UI**: Start a crawl by URL, watch status (pages done), download DOCX files.

## Setup

### Backend (Python)

```bash
cd /path/to/crawlmind
python3 -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip3 install -r requirements.txt
```

Create a `.env` file. For **Python-only** (no API cost): set `USE_OPENAI_FORMAT=false` and omit the key. For OpenAI formatting: set `OPENAI_API_KEY=sk-...`.

Optional: `CRAWL_BASE_URL=https://example.com/` (default used when running the script directly). See **ACCURATE_CRAWL_AND_DOCS.md** for accurate crawl and doc options.

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000 and proxies `/api` to the backend.

## Production backend

The frontend uses this backend API by default in production builds:

- `https://sea-lion-app-t5omv.ondigitalocean.app/api`

You can override it by setting `VITE_API_URL` when building/deploying the frontend.

## Run

1. **Start the API** (from project root):

```bash
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

2. **Start the frontend** (from `frontend/`):

```bash
npm run dev
```

3. Open http://localhost:3000, enter a base URL, click **Start crawl**. Status updates every 2 seconds; each URL gets its own DOCX (named by URL) as it completes.

## API

- `POST /api/crawl` — Body: `{ "base_url": "https://example.com/" }`. Returns `{ "job_id": "..." }`.
- `GET /api/status/{job_id}` — Status, `total_urls`, `urls_done`, `docs` (filenames).
- `GET /api/jobs/{job_id}/docs` — List of generated doc filenames.
- `GET /api/jobs/{job_id}/docs/{filename}` — Download DOCX.

## CLI (URL discovery only)

To only discover URLs and save to `urls_fast.json`:

```python
from fast_url_discovery import main_save_urls_only
import asyncio
asyncio.run(main_save_urls_only())
```

Or run the full pipeline once for the default base URL:

```bash
python fast_url_discovery.py
```

Generated DOCX files are written under `generated_docs/{job_id}/`.

## Backend documentation (full)

See `BACKEND_COMPLETE_GUIDE.md` for complete backend explanation.

For presentation/viva prep, see `BACKEND_PRESENTATION_QA.md`.
