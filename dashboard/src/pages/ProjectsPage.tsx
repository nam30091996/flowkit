import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchAPI } from '../api/client'
import type { Project } from '../types'
import ProjectDetailPage from './ProjectDetailPage'

type FilterTab = 'ACTIVE' | 'ARCHIVED' | 'ALL'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

function CreateProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setLoading(true)
    setError('')
    try {
      await fetchAPI('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description, material: 'realistic' }),
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>Create New Project</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Project Name</label>
            <input
              autoFocus
              className="px-3 py-2 rounded text-sm outline-none transition-shadow focus:ring-1 ring-accent"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My Awesome Video"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Description</label>
            <textarea
              className="px-3 py-2 rounded text-sm outline-none min-h-[80px] transition-shadow focus:ring-1 ring-accent"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
            />
          </div>
          {error && <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">{error}</div>}
          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  const isTwo = tier.includes('TWO')
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: isTwo ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)', color: isTwo ? 'var(--yellow)' : 'var(--accent)' }}
    >
      {isTwo ? 'TIER 2' : 'TIER 1'}
    </span>
  )
}

function ProjectCard({ project, onClick, onDelete }: { project: Project; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="group rounded-lg p-4 cursor-pointer transition-all hover:translate-y-[-2px] flex flex-col gap-2 relative"
      style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      onClick={onClick}
    >
      <button
        onClick={onDelete}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-500/10 text-red-500 transition-all z-10"
        title="Delete project"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
      <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>
        {project.name}
      </div>
      {project.description && (
        <div
          className="text-xs overflow-hidden"
          style={{
            color: 'var(--muted)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {project.description}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        {project.material && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(100,116,139,0.2)', color: 'var(--muted)' }}>
            {project.material}
          </span>
        )}
        <TierBadge tier={project.user_paygate_tier} />
        <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
          {formatDate(project.created_at)}
        </span>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FilterTab>('ACTIVE')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await fetchAPI<Project[]>('/api/projects')
      setProjects(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function handleDelete(e: React.MouseEvent, pid: string, name: string) {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete project "${name}"?`)) return
    try {
      await fetchAPI(`/api/projects/${pid}`, { method: 'DELETE' })
      loadProjects()
    } catch (err) {
      alert('Failed to delete project')
    }
  }

  // If there's an :id param, show detail page
  if (id) {
    return <ProjectDetailPage projectId={id} onBack={() => navigate('/projects')} />
  }

  const filtered = projects.filter(p => {
    if (tab === 'ALL') return p.status !== 'DELETED'
    return p.status === tab
  })

  const tabs: FilterTab[] = ['ACTIVE', 'ARCHIVED', 'ALL']

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {/* Filter tabs */}
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{
                background: tab === t ? 'var(--accent)' : 'var(--card)',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-1.5 rounded text-xs font-bold transition-all hover:scale-[1.05] active:scale-[0.95] flex items-center gap-2"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New Project
        </button>
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading projects...</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>No {tab.toLowerCase()} projects.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
              onDelete={(e) => handleDelete(e, p.id, p.name)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            loadProjects()
          }}
        />
      )}
    </div>
  )
}
