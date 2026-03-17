# CrawlMind

Crawl a site with accurate URL discovery, then crawl and generate **one DOCX per URL** (filename from URL), one by one. Format content with OpenAI. Includes a React frontend to start jobs and download generated docs.

## Features

- **Accurate URL discovery**: Sitemap (with full recursion) or BFS fallback; URLs are normalized (same domain, no fragments), filtered (no .pdf/.xml/assets etc.), and deduped.
- **One doc per URL**: Each page gets its own Word document; the filename is derived from the URL path (e.g. `about_us.docx`, `programs_mba.docx`).
- **One-by-one pipeline**: For each URL: crawl → extract text → OpenAI format → write DOCX, then move to the next (sequential).
- **OpenAI formatting**: Raw crawl text is sent to GPT for formatting only (structure, headings, readability).
- **React UI**: Start a crawl by URL, watch status (pages done), download DOCX files.

## Setup

### Backend (Python)

```bash
cd /path/to/crawlmind
python3 -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip3 install -r requirements.txt
```

Create a `.env` file with:

```
OPENAI_API_KEY=sk-...
```

Optional: `CRAWL_BASE_URL=https://example.com/` (default used when running the script directly).

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000 and proxies `/api` to the backend.

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
