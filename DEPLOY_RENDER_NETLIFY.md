# Deploy Backend on Render + Frontend on Netlify

This guide walks you through putting the **backend (FastAPI) on Render** and the **frontend (React/Vite) on Netlify**.

---

## 1. Backend on Render

### 1.1 Create a Web Service

1. Go to [render.com](https://render.com) and sign in (or sign up).
2. **New** → **Web Service**.
3. Connect your Git repository (GitHub/GitLab) and select the repo that contains this project.
4. Configure the service:
   - **Name:** e.g. `crawlmind-api`
   - **Region:** Choose one close to your users.
   - **Branch:** `main` (or your default branch).
   - **Root Directory:** Leave blank if the backend lives at the repo root; otherwise set it (e.g. if backend is in a subfolder).
   - **Runtime:** **Python 3**.

### 1.2 Build & Start Commands

- **Build Command:**
  ```bash
  pip install -r requirements.txt
  ```
- **Start Command:**
  ```bash
  gunicorn api:app -w 1 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT
  ```
  Render sets `PORT`; the app must listen on `0.0.0.0` and that port. Using 1 worker avoids multiple in-memory job stores; increase `-w` only if you add shared storage (e.g. Redis/DB).

### 1.3 Environment Variables (Render Dashboard)

In the Render service → **Environment** tab, add:

| Key | Value | Notes |
|-----|--------|--------|
| `OPENAI_API_KEY` | `sk-...` | Required for formatting content. |
| `CORS_ORIGINS` | `https://your-app.netlify.app` | Your Netlify site URL (no trailing slash). Add multiple origins comma-separated if needed. |
| `API_KEY` | (optional) | If set, clients must send `X-API-Key: <value>` on write endpoints. |

### 1.4 Deploy

Click **Create Web Service**. After the first deploy, note the service URL, e.g.:

- `https://crawlmind-api.onrender.com`

Use this as the backend base URL for the frontend. The frontend expects the API base to include `/api` (e.g. `https://crawlmind-api.onrender.com/api`).

### 1.5 Render Notes

- **Ephemeral disk:** Render’s filesystem is not persistent. Files under `generated_docs/` are lost on restart/redeploy. For production you’d store docs in object storage (e.g. S3) or a volume; this setup is fine for trying it live.
- **Free tier:** The service may spin down after inactivity; the first request can be slow (cold start).
- **Health check:** You can set the health check path to `GET /health` if you add that route (e.g. returns 200 OK).

---

## 2. Frontend on Netlify

### 2.1 Point Frontend at the Backend

The frontend currently uses a relative API path (`/api`). When the backend is on Render, the frontend must call the full Render URL.

1. **Environment variable:** Set the backend base URL when building:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://crawlmind-api.onrender.com/api` (your Render Web Service URL + `/api`; no trailing slash).

2. **Code change in the frontend:** In `frontend/src/App.jsx`, set the API base from that variable:
   - Find the line that defines the API base, e.g.:
     ```js
     const API = '/api'
     ```
   - Replace with:
     ```js
     const API = import.meta.env.VITE_API_URL || '/api'
     ```
   - So in development (no `VITE_API_URL`) it still uses `/api` (Vite proxy); in production Netlify will have `VITE_API_URL` set to your Render URL including `/api`.

3. **Optional – API key:** If you set `API_KEY` on Render, set the same value in Netlify as `VITE_API_KEY` so the frontend can send it (e.g. in the `X-API-Key` header).

### 2.2 Deploy on Netlify

1. Go to [netlify.com](https://www.netlify.com) and sign in.
2. **Add new site** → **Import an existing project** and connect the same Git repo.
3. Configure the build:
   - **Base directory:** `frontend` (if the React app is in the `frontend` folder).
   - **Build command:** `npm run build` (or `yarn build`).
   - **Publish directory:** `dist` (Vite’s default output).
4. **Environment variables** (Site settings → Environment variables):
   - `VITE_API_URL` = `https://crawlmind-api.onrender.com/api` (your Render backend URL including `/api`).
   - `VITE_API_KEY` = (same as Render’s `API_KEY`, if you use it).
5. Save and deploy. Netlify will build with these variables; the built app will call your Render backend.

### 2.3 Netlify Notes

- Every Git push to the linked branch can trigger a new build and deploy (if you enabled that).
- The site URL will look like `https://<random>.netlify.app` or a custom domain you add. Use that exact URL in Render’s `CORS_ORIGINS`.

---

## 3. Checklist

| Step | Backend (Render) | Frontend (Netlify) |
|------|-------------------|---------------------|
| 1 | Create Web Service, connect repo | Import project, connect repo |
| 2 | Build: `pip install -r requirements.txt` | Base dir: `frontend`, build: `npm run build` |
| 3 | Start: `gunicorn api:app -w 1 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT` | Publish: `dist` |
| 4 | Set `OPENAI_API_KEY`, `CORS_ORIGINS`, optional `API_KEY` | Set `VITE_API_URL` (and optional `VITE_API_KEY`) |
| 5 | Deploy and copy service URL | In code: `const API = import.meta.env.VITE_API_URL \|\| '/api'` |
| 6 | Put Netlify site URL in `CORS_ORIGINS` | Deploy; test from Netlify URL; ensure `VITE_API_URL` includes `/api` |

---

## 4. Quick Reference

- **Backend URL (Render):** `https://<your-service>.onrender.com`
- **Frontend URL (Netlify):** `https://<your-site>.netlify.app`
- **CORS:** Render’s `CORS_ORIGINS` must include the Netlify URL.
- **API base in frontend:** `VITE_API_URL` must be the full Render API base, including `/api` (e.g. `https://your-service.onrender.com/api`).

Once both are deployed and env vars are set, use the Netlify URL in the browser; it will talk to the Render backend and you can run discovery and crawls from the live frontend.
