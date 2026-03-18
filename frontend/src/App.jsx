import React, { useState, useCallback, useRef, useEffect } from 'react'

// Production: use VITE_API_URL if set, else crawlmind.onrender.com; local dev: /api (Vite proxy)
const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://crawlmind.onrender.com/api' : '/api')
const CARDS_PER_PAGE = 12
const URLS_PER_PAGE = 20

// Production: set VITE_API_KEY when building; it will be sent as X-API-Key
const apiHeaders = () => {
  const h = { 'Content-Type': 'application/json' }
  if (import.meta.env.VITE_API_KEY) h['X-API-Key'] = import.meta.env.VITE_API_KEY
  return h
}

async function discover(baseUrl) {
  const res = await fetch(`${API}/discover`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ base_url: baseUrl }),
  })
  if (!res.ok) throw new Error('Failed to start discovery')
  return res.json()
}

async function getStatus(jobId) {
  const res = await fetch(`${API}/status/${jobId}`)
  if (!res.ok) throw new Error('Failed to get status')
  return res.json()
}

async function crawlUrls(jobId, { urls, group }, crawlMode = 'bfs', maxDepth = 1, maxPages = 200, maxLinksPerPage = 20) {
  const body = {
    job_id: jobId,
    urls: urls || undefined,
    group: group || undefined,
    crawl_mode: crawlMode,
    max_depth: maxDepth,
    max_pages: maxPages,
    max_links_per_page: maxLinksPerPage,
  }
  const res = await fetch(`${API}/crawl-urls`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to start crawl')
  return res.json()
}

function downloadUrl(jobId, filename) {
  return `${API}/jobs/${jobId}/docs/${encodeURIComponent(filename)}`
}

function GroupCard({ name, urls, urlStatus, jobId, onCrawlGroup, onOpen }) {
  const done = urls.filter((u) => urlStatus[u]?.status === 'completed').length
  const total = urls.length
  const crawling = urls.some((u) => urlStatus[u]?.status === 'crawling')

  return (
    <div className="group-card" onClick={() => onOpen(name, urls)}>
      <div className="group-card-name">{name}</div>
      <div className="group-card-meta">
        {done}/{total} crawled
        {crawling && <span className="group-card-badge">Crawling…</span>}
      </div>
      <button
        className="group-card-btn"
        onClick={(e) => {
          e.stopPropagation()
          onCrawlGroup(name)
        }}
        disabled={crawling || done === total}
      >
        Crawl this group
      </button>
    </div>
  )
}

function GroupModal({ groupName, urls, urlStatus, jobId, onCrawlGroup, onCrawlOne, onClose }) {
  const [search, setSearch] = useState('')
  const searchLower = search.trim().toLowerCase()
  const filteredUrls = searchLower
    ? urls.filter((u) => u.toLowerCase().includes(searchLower))
    : urls
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{groupName}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-actions">
          <input
            type="search"
            className="url-search-input"
            placeholder="Search URLs in this group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search URLs"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCrawlGroup(groupName)}
            disabled={urls.some((u) => urlStatus[u]?.status === 'crawling')}
          >
            Crawl all in this group
          </button>
        </div>
        <ul className="modal-url-list">
          {filteredUrls.map((url) => {
            const st = urlStatus[url] || { status: 'pending', docx: null, md: null }
            const completed = st.status === 'completed'
            return (
              <li key={url} className="modal-url-item">
                <span className="modal-url-text" title={url}>{url}</span>
                <span className="modal-url-status">{st.status}</span>
                {st.status === 'failed' && st.error && <span className="modal-url-error" title={st.error}>{st.error}</span>}
                <span className="modal-url-actions">
                  {completed ? (
                    <>
                      <a href={downloadUrl(jobId, st.docx)} download={st.docx} className="btn-doc">DOCX</a>
                      <a href={downloadUrl(jobId, st.md)} download={st.md} className="btn-doc">MD</a>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-crawl-one"
                      onClick={() => onCrawlOne(url)}
                      disabled={st.status === 'crawling'}
                    >
                      {st.status === 'crawling' ? 'Crawling…' : 'Crawl'}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function AllUrlsList({ urls, urlStatus, jobId }) {
  const [page, setPage] = useState(0)
  if (!urls?.length) return null
  const totalPages = Math.max(1, Math.ceil(urls.length / URLS_PER_PAGE))
  const start = page * URLS_PER_PAGE
  const pageUrls = urls.slice(start, start + URLS_PER_PAGE)
  return (
    <div className="all-urls-section">
      <h3>All URLs — download DOCX or MD when ready</h3>
      <p className="all-urls-pagination-info">
        Showing {start + 1}–{Math.min(start + URLS_PER_PAGE, urls.length)} of {urls.length}
      </p>
      <ul className="all-urls-list">
        {pageUrls.map((url) => {
          const st = urlStatus[url] || { status: 'pending', docx: null, md: null, error: null }
          const completed = st.status === 'completed'
          const failed = st.status === 'failed'
          return (
            <li key={url} className="all-urls-item">
              <span className="all-urls-text" title={url}>{url}</span>
              <span className="all-urls-status">{st.status}</span>
              {failed && st.error && <span className="all-urls-error" title={st.error}>{st.error}</span>}
              {completed && (
                <span className="all-urls-dl">
                  <a href={downloadUrl(jobId, st.docx)} download={st.docx} className="btn-doc">DOCX</a>
                  <a href={downloadUrl(jobId, st.md)} download={st.md} className="btn-doc">MD</a>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <div className="pagination all-urls-pagination">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState('')
  const [jobId, setJobId] = useState(null)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showGroupView, setShowGroupView] = useState(false)
  const [groupPage, setGroupPage] = useState(0)
  const [modalGroup, setModalGroup] = useState(null)
  const [crawlMode, setCrawlMode] = useState('bfs')
  const [maxDepth, setMaxDepth] = useState(1)
  const [maxPages, setMaxPages] = useState(200)
  const [maxLinksPerPage, setMaxLinksPerPage] = useState(20)
  const [urlSearch, setUrlSearch] = useState('')
  const pollRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const poll = useCallback(
    async (id) => {
      try {
        const data = await getStatus(id)
        setStatus(data)
        if (data.status === 'failed') stopPolling()
      } catch (e) {
        setError(e.message)
        stopPolling()
      }
    },
    [stopPolling]
  )

  useEffect(() => {
    if (!jobId) return
    pollRef.current = setInterval(() => poll(jobId), 2000)
    return () => stopPolling()
  }, [jobId, poll, stopPolling])

  const startDiscover = async () => {
    setError(null)
    setStatus(null)
    setJobId(null)
    setModalGroup(null)
    setShowGroupView(false)
    setUrlSearch('')
    setLoading(true)
    try {
      const { job_id } = await discover(baseUrl.trim())
      setJobId(job_id)
      setStatus({ status: 'discovering', job_id })
      await poll(job_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCrawlGroup = useCallback(
    async (groupName) => {
      try {
        await crawlUrls(jobId, { group: groupName }, crawlMode, maxDepth, maxPages, maxLinksPerPage)
        await poll(jobId)
      } catch (e) {
        setError(e.message)
      }
    },
    [jobId, poll, crawlMode, maxDepth, maxPages, maxLinksPerPage]
  )

  const handleCrawlOne = useCallback(
    async (url) => {
      try {
        await crawlUrls(jobId, { urls: [url] }, crawlMode, maxDepth, maxPages, maxLinksPerPage)
        await poll(jobId)
      } catch (e) {
        setError(e.message)
      }
    },
    [jobId, poll, crawlMode, maxDepth, maxPages, maxLinksPerPage]
  )

  const handleCrawlAll = useCallback(async () => {
    if (!status?.urls?.length) return
    try {
      await crawlUrls(jobId, { urls: status.urls }, crawlMode, maxDepth, maxPages, maxLinksPerPage)
      await poll(jobId)
    } catch (e) {
      setError(e.message)
    }
  }, [jobId, status?.urls, poll, crawlMode, maxDepth, maxPages, maxLinksPerPage])

  const groups = status?.groups ? Object.entries(status.groups) : []
  const totalPages = Math.max(1, Math.ceil(groups.length / CARDS_PER_PAGE))
  const pageGroups = groups.slice(groupPage * CARDS_PER_PAGE, (groupPage + 1) * CARDS_PER_PAGE)
  const urlStatus = status?.url_status || {}

  const statusLabel = {
    discovering: 'Discovering URLs…',
    discovered: 'URLs discovered',
    crawling: 'Crawling…',
    completed: 'Completed',
    failed: 'Failed',
  }

  return (
    <div className="app">
      <header className="header">
        <h1>CrawlMind</h1>
        <p>Discover URLs, group them, then crawl by group or single URL. Download DOCX or Markdown per page.</p>
      </header>

      <section className="card form-card">
        <label>
          <span>Base URL</span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com/"
          />
        </label>
        <button onClick={startDiscover} disabled={loading}>
          {loading ? 'Discovering…' : 'Discover URLs'}
        </button>
      </section>

      {error && (
        <section className="card error-card">
          <strong>Error:</strong> {error}
        </section>
      )}

      {status && (
        <section className="card status-card">
          <h2>Job {status.job_id}</h2>
          <div className="status-row">
            <span className="status-badge" data-status={status.status}>
              {statusLabel[status.status] ?? status.status}
            </span>
          </div>
          {status.base_url && <p className="muted">URL: {status.base_url}</p>}
          {status.total_urls != null && status.total_urls > 0 && (
            <p>
              URLs found: <strong>{status.total_urls}</strong>
              {status.urls_done != null && <> · Done: <strong>{status.urls_done}</strong></>}
            </p>
          )}
          {status.dfs_progress && (
            <div className="dfs-progress">
              <strong>DFS crawling</strong> — Root: <span className="dfs-progress-root" title={status.dfs_progress.root_url}>{status.dfs_progress.root_url}</span>
              <br />
              Links crawled: <strong>{status.dfs_progress.pages_crawled}</strong> (max {status.dfs_progress.total_limit})
              {status.dfs_progress.current_url && (
                <>
                  <br />
                  <span className="dfs-progress-current">Current: {status.dfs_progress.current_url}</span>
                </>
              )}
            </div>
          )}
          {status.discovery_note && (
            <p className="discovery-note" title={status.discovery_note}>
              {status.discovery_note}
            </p>
          )}
          {status.error && <p className="error-text">{status.error}</p>}

          {status.status === 'discovered' && (
            <>
              <div className="crawl-mode-section">
                <h4>Crawl mode</h4>
                <label className="crawl-mode-option">
                  <input type="radio" name="crawlMode" value="bfs" checked={crawlMode === 'bfs'} onChange={() => setCrawlMode('bfs')} />
                  <span>BFS</span> — Only selected URLs, one DOCX+MD per URL (no link traversal)
                </label>
                <label className="crawl-mode-option">
                  <input type="radio" name="crawlMode" value="dfs" checked={crawlMode === 'dfs'} onChange={() => setCrawlMode('dfs')} />
                  <span>DFS</span> — From each selected URL, follow links up to depth
                </label>
                {crawlMode === 'dfs' && (
                  <div className="crawl-mode-dfs-opts">
                    <label>
                      Depth (0=root only, 1=root+links, 2=root+links+links of links)
                      <input type="number" min={0} max={5} value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value) || 1)} />
                    </label>
                    <label>
                      Max pages per root
                      <input type="number" min={10} max={500} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value) || 200)} />
                    </label>
                    <label>
                      Max links per page
                      <input type="number" min={5} max={50} value={maxLinksPerPage} onChange={(e) => setMaxLinksPerPage(Number(e.target.value) || 20)} />
                    </label>
                  </div>
                )}
              </div>
              <div className="discovered-actions">
                <button type="button" className="btn-group" onClick={() => setShowGroupView(true)}>
                  Group URL
                </button>
                <button type="button" className="btn-crawl-all" onClick={handleCrawlAll}>
                  Crawl all (one by one)
                </button>
              </div>
            </>
          )}

          {showGroupView && groups.length > 0 && (
            <div className="groups-section">
              <h3>Groups (click card to open)</h3>
              <div className="group-cards">
                {pageGroups.map(([name, urls]) => (
                  <GroupCard
                    key={name}
                    name={name}
                    urls={urls}
                    urlStatus={urlStatus}
                    jobId={status.job_id}
                    onCrawlGroup={handleCrawlGroup}
                    onOpen={(n, u) => setModalGroup({ name: n, urls: u })}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="pagination">
                  <button type="button" disabled={groupPage === 0} onClick={() => setGroupPage((p) => p - 1)}>Prev</button>
                  <span>{groupPage + 1} / {totalPages}</span>
                  <button type="button" disabled={groupPage >= totalPages - 1} onClick={() => setGroupPage((p) => p + 1)}>Next</button>
                </div>
              )}
            </div>
          )}

          {status.url_status && (
            <>
              <div className="url-search-section">
                <input
                  type="search"
                  className="url-search-input"
                  placeholder="Search URLs…"
                  value={urlSearch}
                  onChange={(e) => setUrlSearch(e.target.value)}
                  aria-label="Search URLs"
                />
              </div>
              {(() => {
                const filtered = (status.urls || []).filter((u) =>
                  u.toLowerCase().includes(urlSearch.trim().toLowerCase())
                )
                if (filtered.length === 0 && (status.urls?.length > 0 || urlSearch.trim())) {
                  return <p className="url-search-empty">No URLs match your search.</p>
                }
                return (
                  <AllUrlsList
                    key={urlSearch}
                    urls={filtered}
                    urlStatus={urlStatus}
                    jobId={status.job_id}
                  />
                )
              })()}
            </>
          )}
        </section>
      )}

      {modalGroup && (
        <GroupModal
          groupName={modalGroup.name}
          urls={modalGroup.urls}
          urlStatus={urlStatus}
          jobId={status?.job_id}
          onCrawlGroup={handleCrawlGroup}
          onCrawlOne={handleCrawlOne}
          onClose={() => setModalGroup(null)}
        />
      )}
    </div>
  )
}
