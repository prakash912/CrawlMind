# Deployment issues: “Only 1 URL discovered” and “Crawl fails”

On **production** (e.g. Render), you may see:

- **Discovery** finds only **1 URL** (the base URL you entered).
- **Crawl** then **fails** for that URL (status “failed”, no DOCX/MD).

This is usually a **deployment / environment** issue, not a bug in the app logic. Below is what’s going on and what to do.

---

## 1. Why discovery only returns 1 URL on prod

Discovery works by:

1. Fetching **robots.txt** and **sitemap** (or **sitemap.xml**) from the target site.
2. If that returns no page URLs, falling back to **BFS**: fetch the base URL, parse links, and follow them.

On a **hosted backend** (e.g. Render):

- All those requests go **from the server’s IP** (e.g. Render’s datacenter).
- Many sites **block or throttle** datacenter IPs, or return a minimal/captcha page.
- So:
  - Sitemap/robots requests may get **empty or blocked** responses → no URLs.
  - BFS then fetches only the **base URL**; that request can also fail or return a non‑normal page → no links found.
  - Result: **only the base URL** is added to the list → “only 1 URL discovered”.

So “only 1 URL” on prod is usually:

- **Target site blocking or throttling** the hosting provider’s IP (e.g. Render), or
- **Network/timeouts** between the host and the target (the app already uses long timeouts and retries; they can’t fix blocking).

---

## 2. Why crawl then fails

When you click **Crawl** for that one URL:

- The backend again **fetches** that URL from the same server (e.g. Render).
- If the target still blocks or returns no usable content, the fetch fails or returns too little text.
- The backend then marks the URL as **failed** (and now stores a short **error** message in the job so you can see it in the UI/API).

So the same **deployment constraint** (target site vs. server IP) that caused “only 1 URL” also causes **crawl to fail** for that URL.

---

## 3. What to check on deployment

| Check | What to do |
|-------|------------|
| **OPENAI_API_KEY** | In Render (or your backend host): **Environment** → set **OPENAI_API_KEY**. If it’s missing or wrong, formatting fails and the URL is marked failed (error message should mention API key / OpenAI). |
| **API_KEY (optional)** | If you set **API_KEY** on the backend, the frontend must send the same value as **X-API-Key** (e.g. set **VITE_API_KEY** on Netlify). Otherwise write endpoints return 401 and jobs may not start. |
| **Health / root** | Open `https://your-backend.onrender.com/health` and `https://your-backend.onrender.com/`. If these don’t return JSON, the app isn’t running or the start command is wrong (see render.yaml or your deploy docs). |
| **Start command** | Backend must bind to `0.0.0.0:$PORT`. Example: `gunicorn api:app -w 1 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT`. |
| **Proxy (optional)** | If the target site blocks your host’s IP, set **HTTPS_PROXY** or **HTTP_PROXY** on the backend (e.g. in Render env) to an HTTP proxy that can reach the target. All discovery and crawl requests will use it. |

---

## 4. Confirm it’s a deployment/target issue: test with a friendly site

To see if the **backend and deploy** are fine and the issue is the **target site + hosting IP**:

1. On your **production** app (Netlify + Render), run discovery with a **permissive** base URL, for example:
   - `https://example.com`
2. Check:
   - Does discovery return **more than 1 URL**?
   - Does **crawl** for one of those URLs **succeed** and show DOCX/MD?

If **yes** with `example.com` (or another simple site) but **no** with your real target (e.g. `https://www.aum.edu/`):

- The backend and deployment are working.
- The problem is that the **real target** is blocking or limiting requests from your host (e.g. Render). Options:
  - Use a **different target** that allows your host’s IP.
  - Run the backend somewhere the target doesn’t block (e.g. your own server or another provider).
  - If you control the target, allow your host’s IP or relax blocking for that server.

If **even example.com** gives only 1 URL or crawl fails:

- Then look at **deploy/config**: env vars (OPENAI_API_KEY, API_KEY), start command, and logs on Render (and any errors shown in the UI for the failed URL).

---

## 5. Summary

- **“Only discover 1 URL”** and **“crawl fails”** on prod are usually the same root cause: the **target site** doesn’t respond properly to requests **from your hosted backend** (blocking, throttling, or very slow).
- When discovery finds only the base URL, the API returns **`discovery_note`** and the UI shows a short message that the target may be blocking the server and suggests using a proxy or another network.
- You can set **HTTPS_PROXY** or **HTTP_PROXY** on the backend; then all outbound requests (discovery and crawl) go through that proxy, which can help if the proxy’s IP is not blocked.
- Set **OPENAI_API_KEY** (and optionally **API_KEY** / **VITE_API_KEY**) correctly and use the right **start command**.
- Use a **test URL** like `https://example.com` to confirm the deployment works; then treat failures with your real URL as a **deployment/target compatibility** issue (target vs. host IP), not an application bug.
