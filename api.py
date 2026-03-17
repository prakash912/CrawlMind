"""
FastAPI backend: discover URLs (optional group), crawl by group or single URL, download DOCX/MD.
"""
import asyncio
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends
# CORS: allow the React frontend (different port) to call this API from the browser
from fastapi.middleware.cors import CORSMiddleware
# FileResponse: send a file (DOCX/MD) as the HTTP response body for download
from fastapi.responses import FileResponse
# Pydantic BaseModel: validate request JSON and give us typed objects (e.g. req.base_url)
from pydantic import BaseModel

# Import the crawler logic and shared state from the other module
from fast_url_discovery import (
    run_crawl_pipeline,   # discover + crawl all URLs in one go
    run_discovery_only,   # only discover URLs and groups, no crawling
    run_crawl_urls,       # crawl a given list of URLs (e.g. one group)
    jobs,                 # in-memory dict: job_id -> { status, urls, groups, url_status, docs, ... }
    OUTPUT_DIR,           # Path("generated_docs") where we save DOCX and MD files
)

# Production: set CORS_ORIGINS to your frontend URL(s), comma-separated. API_KEY = require X-API-Key on write endpoints.
# Default includes localhost (dev) and production Netlify app so Render deploy works without env.
_DEFAULT_CORS = "http://localhost:3000,http://127.0.0.1:3000,https://crawlmind.netlify.app"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", _DEFAULT_CORS).strip().split(",")
API_KEY = os.getenv("API_KEY")

app = FastAPI(title="CrawlMind API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: str | None = Header(None)) -> None:
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# Pydantic model: request body for POST /api/discover. Validates JSON and provides .base_url
class DiscoverRequest(BaseModel):
    base_url: str = "https://www.aum.edu/"


# Request body for POST /api/crawl (crawl all without grouping)
class CrawlRequest(BaseModel):
    base_url: str = "https://www.aum.edu/"


# Request body for POST /api/crawl-urls. Either urls list OR group name must be provided
class CrawlUrlsRequest(BaseModel):
    job_id: str
    urls: list[str] | None = None   # optional: list of URLs to crawl
    group: str | None = None        # optional: name of group (e.g. "talon") to crawl
    crawl_mode: str = "bfs"        # "bfs" (default) or "dfs"
    max_depth: int = 1             # for DFS: 0=root only, 1=root+links, 2=root+links+links of links
    max_pages: int = 200            # for DFS: safety limit on total pages per root
    max_links_per_page: int = 20    # for DFS: max links to follow per page


# Sync wrapper: run the async run_discovery_only in a new event loop (needed for BackgroundTasks)
def _run_discovery(job_id: str, base_url: str) -> None:
    asyncio.run(run_discovery_only(job_id, base_url))


# Sync wrapper: run full pipeline (discover + crawl all)
def _run_pipeline(job_id: str, base_url: str) -> None:
    asyncio.run(run_crawl_pipeline(job_id, base_url))


# Sync wrapper: run crawl for a specific list of URLs (with optional mode/depth/limits)
def _run_crawl_urls(
    job_id: str,
    urls: list[str],
    crawl_mode: str = "bfs",
    max_depth: int = 1,
    max_pages: int = 200,
    max_links_per_page: int = 20,
) -> None:
    asyncio.run(run_crawl_urls(job_id, urls, crawl_mode, max_depth, max_pages, max_links_per_page))


@app.get("/health")
def health():
    """Production: load balancer / PaaS can use this for liveness."""
    return {"status": "ok"}


# POST /api/discover — start URL discovery only; returns job_id so client can poll status
@app.post("/api/discover", dependencies=[Depends(require_api_key)])
async def start_discover(req: DiscoverRequest, background_tasks: BackgroundTasks):
    """Discover URLs only; then user can group and crawl by group or single URL."""
    job_id = str(uuid.uuid4())[:8]   # e.g. "a1b2c3d4"
    background_tasks.add_task(_run_discovery, job_id, req.base_url)  # run discovery after we respond
    return {"job_id": job_id, "message": "Discovery started"}


# POST /api/crawl — discover and crawl all URLs in one background task
@app.post("/api/crawl", dependencies=[Depends(require_api_key)])
async def start_crawl(req: CrawlRequest, background_tasks: BackgroundTasks):
    """Crawl all URLs immediately (no grouping)."""
    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(_run_pipeline, job_id, req.base_url)
    return {"job_id": job_id, "message": "Crawl started in background"}


# POST /api/crawl-urls — crawl specific URLs or a group (job must already be in "discovered" state)
@app.post("/api/crawl-urls", dependencies=[Depends(require_api_key)])
async def crawl_urls(req: CrawlUrlsRequest, background_tasks: BackgroundTasks):
    """Crawl specific URLs or a group (job must be in 'discovered' state)."""
    if req.job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    j = jobs[req.job_id]
    if j.get("status") != "discovered":
        raise HTTPException(status_code=400, detail="Job must be in discovered state")
    if req.group:
        urls = j.get("groups", {}).get(req.group)
        if not urls:
            raise HTTPException(status_code=404, detail="Group not found")
    elif req.urls:
        urls = req.urls
    else:
        raise HTTPException(status_code=400, detail="Provide urls or group")
    crawl_mode = (req.crawl_mode or "bfs").lower()
    if crawl_mode not in ("bfs", "dfs"):
        crawl_mode = "bfs"
    max_depth = max(0, min(int(req.max_depth) if req.max_depth is not None else 1, 5))
    max_pages = max(10, min(int(req.max_pages) if req.max_pages is not None else 200, 500))
    max_links_per_page = max(5, min(int(req.max_links_per_page) if req.max_links_per_page is not None else 20, 50))
    background_tasks.add_task(
        _run_crawl_urls,
        req.job_id,
        urls,
        crawl_mode,
        max_depth,
        max_pages,
        max_links_per_page,
    )
    return {"message": "Crawl started", "count": len(urls), "crawl_mode": crawl_mode, "max_depth": max_depth}


# GET /api/status/{job_id} — return full job state for polling (status, urls, groups, url_status, docs)
@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    j = jobs[job_id]
    return {
        "job_id": job_id,
        "status": j["status"],
        "base_url": j.get("base_url"),
        "total_urls": j.get("total_urls", 0),
        "urls": j.get("urls", []),
        "groups": j.get("groups", {}),
        "url_status": j.get("url_status", {}),
        "urls_done": j.get("urls_done", 0),
        "docs_count": len(j.get("docs", [])),
        "docs": j.get("docs", []),
        "error": j.get("error"),
        "dfs_progress": j.get("dfs_progress"),
    }


# GET /api/jobs/{job_id}/docs — list all generated doc filenames for this job
@app.get("/api/jobs/{job_id}/docs")
async def list_docs(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "docs": jobs[job_id].get("docs", [])}


# GET /api/jobs/{job_id}/docs/{filename} — download one DOCX or MD file
@app.get("/api/jobs/{job_id}/docs/{filename}")
async def download_doc(job_id: str, filename: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    # Prevent path traversal: filename must not contain / or \ (so we only serve files inside job folder)
    if "/" in filename or "\\" in filename or filename != filename.strip():
        raise HTTPException(status_code=404, detail="Doc not found")
    if filename not in jobs[job_id].get("docs", []):
        raise HTTPException(status_code=404, detail="Doc not found")
    path = (OUTPUT_DIR / job_id / filename).resolve()
    base_dir = (OUTPUT_DIR / job_id).resolve()
    # Security: ensure resolved path is still under job dir (in case of weird filenames)
    if not path.exists() or not str(path).startswith(str(base_dir)):
        raise HTTPException(status_code=404, detail="File not found on disk")
    if filename.lower().endswith(".md"):
        media_type = "text/markdown"
    else:
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return FileResponse(path, filename=filename, media_type=media_type)
