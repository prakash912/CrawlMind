# Deploy Backend on DigitalOcean + Frontend on Netlify

This setup runs the **CrawlMind backend (FastAPI)** on **DigitalOcean App Platform** and the **frontend (Vite/React)** on **Netlify**.

---

## 1. Backend (DigitalOcean App Platform)

### 1.1 App settings

- **Source**: your Git repo (repo root should contain `api.py`, `fast_url_discovery.py`, `requirements.txt`).
- **Type**: Web Service (Python).

### 1.2 Run command

Use this as the **Run Command**:

```bash
gunicorn api:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
```

### 1.3 Environment variables

Set:

- `OPENAI_API_KEY` = your OpenAI key

Optional:

- `API_KEY` = if you want to protect write endpoints (frontend must send `X-API-Key`)
- `CORS_ORIGINS` = comma-separated list of allowed frontend origins (default allows `https://crawlmind.netlify.app` and any `*.netlify.app`)
- `HTTPS_PROXY` / `HTTP_PROXY` = if the target site blocks your server IP (proxy URL like `http://USER:PASS@HOST:PORT`)

### 1.4 Verify

Your backend is live at:

- Root: `https://sea-lion-app-t5omv.ondigitalocean.app/`
- Health: `https://sea-lion-app-t5omv.ondigitalocean.app/health`
- API: `https://sea-lion-app-t5omv.ondigitalocean.app/api/...`

---

## 2. Frontend (Netlify)

### 2.1 API base URL

The frontend defaults to the DigitalOcean backend in production:

- `https://sea-lion-app-t5omv.ondigitalocean.app/api`

If you want to override it, set this env var in Netlify:

- `VITE_API_URL` = `https://sea-lion-app-t5omv.ondigitalocean.app/api`

### 2.2 Netlify build settings

- **Base directory**: `frontend`
- **Build command**: `npm run build`
- **Publish directory**: `dist`

---

## 3. Notes

- This project keeps job state in memory (`jobs` dict) and writes docs to disk (`generated_docs/`). On DigitalOcean App Platform, disk persistence depends on how your app is configured. For production-grade reliability, use object storage (S3/Spaces) and a DB/Redis for job state.

