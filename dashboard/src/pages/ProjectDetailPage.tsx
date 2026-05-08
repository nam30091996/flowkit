import React, { useState, useEffect, useRef } from 'react'
import type { Project, Character, StatusType } from '../types'
import { fetchAPI } from '../api/client'

type Tab = 'Characters' | 'Images' | 'Videos'

interface BatchItem {
  id: any
  text: string
  url?: string
  mediaId?: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  videoStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  videoUrl?: string
  videoText?: string
  characterMediaIds?: string[]
  isUpscaling?: boolean
}

interface PersistedData {
  items: BatchItem[]
  outputPath?: string
  videoOutputPath?: string
}

const Badge = ({ label, color }: { label: string | null; color?: string }) => (
  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter" style={{ background: color || 'var(--surface)', color: color ? '#fff' : 'var(--accent)' }}>{label}</span>
)

const StatusDot = ({ status }: { status: string }) => (
  <div className={`w-1.5 h-1.5 rounded-full ${status === 'COMPLETED' ? 'bg-green-500' : status === 'PROCESSING' ? 'bg-blue-500 animate-pulse' : status === 'FAILED' ? 'bg-red-500' : 'bg-white/20'}`} />
)

const deepExtractMediaId = (obj: any): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.mediaId || obj.media_id) return obj.mediaId || obj.media_id;
  if (typeof obj.name === 'string' && (obj.name.includes('/media/') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj.name))) {
    const parts = obj.name.split('/');
    const last = parts[parts.length - 1];
    if (last && last.length > 20) return last;
    if (last && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last)) return last;
  }
  for (const key in obj) {
    const found = deepExtractMediaId(obj[key]);
    if (found) return found;
  }
  return null;
};

// ---- Videos Tab ----
interface VideosTabProps {
  project: Project
  items: BatchItem[]
  setItems: React.Dispatch<React.SetStateAction<BatchItem[]>>
  videoOutputPath: string
  setVideoOutputPath: (p: string) => void
}
function VideosTab({ project, items, setItems, videoOutputPath, setVideoOutputPath }: VideosTabProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [autoUpscale, setAutoUpscale] = useState(() => {
    const saved = localStorage.getItem(`flowkit_upscale_${project.id}`);
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(`flowkit_upscale_${project.id}`, autoUpscale.toString());
  }, [autoUpscale, project.id]);

  const stopRef = useRef(false)

  const stats = {
    total: items.length,
    completed: items.filter(p => p.videoStatus === 'COMPLETED').length,
    failed: items.filter(p => p.videoStatus === 'FAILED').length,
    processing: items.filter(p => p.videoStatus === 'PROCESSING').length,
  }

  const findUrl = (obj: any, excludeUrl?: string): string | null => {
    if (!obj || typeof obj !== 'object') return null;

    // 1. Strictly prioritize 'videoUrl' field first
    if (typeof obj.videoUrl === 'string' && obj.videoUrl.startsWith('http') && obj.videoUrl !== excludeUrl) {
      return obj.videoUrl;
    }

    // 2. Check other candidates but verify they aren't the excluded one
    const candidates = [obj.fifeUrl, obj.servingUri, obj.url, obj.contentUrl];
    for (const url of candidates) {
      if (typeof url === 'string' && url.startsWith('http') && url !== excludeUrl) {
        // If we are in video mode, maybe check if it's likely a video?
        // Google doesn't always have extensions, so we just return the first new one we find
        return url;
      }
    }

    for (const key in obj) {
      const found = findUrl(obj[key], excludeUrl);
      if (found) return found;
    }
    return null;
  };

  const pollUpscaleStatus = async (i: number, opName: any) => {
    let attempts = 0;
    console.log(`[UPSCALE] Starting poll for scene #${i + 1}, op: ${opName}`);
    while (attempts < 100 && !stopRef.current) {
      try {
        const statusRes = await fetchAPI<any>('/api/flow/check-status', {
          method: 'POST',
          body: JSON.stringify({ operations: [{ operation: { name: opName } }] })
        });
        const opResult = statusRes?.operations?.[0] || statusRes?.workflows?.[0] || (statusRes?.done !== undefined ? statusRes : null);
        const isDone = opResult?.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' ||
          opResult?.status === 'MEDIA_GENERATION_STATUS_FAILED' ||
          opResult?.done === true ||
          opResult?.mediaStatus?.mediaGenerationStatus === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' ||
          opResult?.mediaStatus?.mediaGenerationStatus === 'MEDIA_GENERATION_STATUS_FAILED';

        if (isDone) {
          if (opResult.error || opResult.status === 'MEDIA_GENERATION_STATUS_FAILED' || opResult.operation?.error) {
            console.error(`[UPSCALE] Error for #${i + 1}:`, opResult.error || opResult.operation?.error);
            return null;
          }
          const searchIn = opResult.response || opResult.result || opResult;
          return findUrl(searchIn);
        }
      } catch (err) {
        console.warn(`[UPSCALE] Poll hiccup for #${i + 1}:`, err);
      }
      attempts++;
      await new Promise(r => setTimeout(r, 15000));
    }
    return null;
  }

  const pollVideoStatus = async (i: number, opName: any) => {
    let attempts = 0;
    const item = items[i];
    console.log(`[VIDEO] Starting poll for scene #${i + 1}, op: ${opName}`);

    while (attempts < 200 && !stopRef.current) {
      try {
        const statusRes = await fetchAPI<any>('/api/flow/check-status', {
          method: 'POST',
          body: JSON.stringify({ operations: [{ operation: { name: opName } }] })
        });

        // Google's batchCheck returns { operations: [ { done: true, ... } ] } or { workflows: [ ... ] }
        const opResult = statusRes?.operations?.[0] || statusRes?.workflows?.[0] || (statusRes?.done !== undefined ? statusRes : null);

        const isDone = opResult?.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' ||
          opResult?.status === 'MEDIA_GENERATION_STATUS_FAILED' ||
          opResult?.done === true ||
          opResult?.mediaStatus?.mediaGenerationStatus === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' ||
          opResult?.mediaStatus?.mediaGenerationStatus === 'MEDIA_GENERATION_STATUS_FAILED';

        if (isDone) {
          console.log(`[VIDEO] Scene #${i + 1} Operation finished. Status: ${opResult?.status}. Result:`, opResult);

          if (opResult.error || opResult.status === 'MEDIA_GENERATION_STATUS_FAILED' || opResult.operation?.error) {
            const errorObj = opResult.error || opResult.operation?.error;
            console.error(`[VIDEO] Google returned error for #${i + 1}:`, errorObj?.message || errorObj || 'Unknown error');
            setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'FAILED' } : p));
            return;
          }

          // Try response, then result, then root
          const searchIn = opResult.response || opResult.result || opResult;
          const resultUrl = findUrl(searchIn, item.url);
          const mediaId = deepExtractMediaId(searchIn);

          // Step 1.5: Optional Upscale to 1080p
          if (resultUrl && mediaId && autoUpscale) {
            console.log(`[VIDEO] SUCCESS! Video generated for #${i + 1}. MediaID: ${mediaId}. Starting 1080p Upscale...`);
            setItems(prev => prev.map((p, idx) => idx === i ? { ...p, isUpscaling: true } : p));

            // Step 2: Start Upscale to 1080p
            try {
              const upscaleRes = await fetchAPI<any>('/api/flow/upscale-video', {
                method: 'POST',
                body: JSON.stringify({
                  media_id: mediaId,
                  scene_id: `upscale-${i + 1}-${Date.now()}`,
                  aspect_ratio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
                  resolution: 'VIDEO_RESOLUTION_1080P'
                })
              });

              const uRoot = upscaleRes.data || upscaleRes.result || upscaleRes;
              const uOpName = uRoot.operations?.[0]?.operation?.name || uRoot.media?.[0]?.name || uRoot.name;

              if (uOpName) {
                const finalUpscaledUrl = await pollUpscaleStatus(i, uOpName);
                if (finalUpscaledUrl) {
                  console.log(`[UPSCALE] SUCCESS! Final 1080p URL for #${i + 1}:`, finalUpscaledUrl);
                  setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'COMPLETED', videoUrl: finalUpscaledUrl, isUpscaling: false } : p));

                  if (videoOutputPath) {
                    const fileName = `vid_${i + 1}.mp4`
                    const fullPath = `${videoOutputPath}\\${fileName}`.replace(/\//g, '\\')
                    try { await fetchAPI<any>('/api/batch-images/save', { method: 'POST', body: JSON.stringify({ url: finalUpscaledUrl, save_path: fullPath }) }) } catch (e) { console.error('[VIDEO] Save failed:', e) }
                  }
                  return;
                }
              }
            } catch (uErr) {
              console.error(`[UPSCALE] Failed for #${i + 1}, falling back to non-upscaled video:`, uErr);
            }

            // Fallback: Use the original non-upscaled video if upscale fails or isn't possible
            setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'COMPLETED', videoUrl: resultUrl, isUpscaling: false } : p));
            if (videoOutputPath) {
              const fileName = `vid_${i + 1}.mp4`
              const fullPath = `${videoOutputPath}\\${fileName}`.replace(/\//g, '\\')
              try { await fetchAPI<any>('/api/batch-images/save', { method: 'POST', body: JSON.stringify({ url: resultUrl, save_path: fullPath }) }) } catch (e) { console.error('[VIDEO] Save failed:', e) }
            }
            return;
          } else if (resultUrl) {
            // Case where upscale is disabled OR no mediaId found
            console.log(`[VIDEO] SUCCESS! Finishing video for #${i + 1} (Upscale: ${autoUpscale})`);
            setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'COMPLETED', videoUrl: resultUrl, isUpscaling: false } : p));
            if (videoOutputPath) {
              const fileName = `vid_${i + 1}.mp4`
              const fullPath = `${videoOutputPath}\\${fileName}`.replace(/\//g, '\\')
              try { await fetchAPI<any>('/api/batch-images/save', { method: 'POST', body: JSON.stringify({ url: resultUrl, save_path: fullPath }) }) } catch (e) { console.error('[VIDEO] Save failed:', e) }
            }
            return;
          } else {
            console.warn(`[VIDEO] Scene #${i + 1} is done but no URL found yet. Retrying...`);
          }
        } else {
          console.log(`[VIDEO] Scene #${i + 1} still in progress (Attempt ${attempts})... Raw:`, statusRes);
        }
      } catch (err: any) {
        console.warn(`[VIDEO] Poll hiccup for #${i + 1} (will retry):`, err.message || err);
      }
      attempts++;
      await new Promise(r => setTimeout(r, 12000));
    }

    if (attempts >= 200) {
      console.error(`[VIDEO] Polling timed out (40 mins) for #${i + 1}`);
      setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'FAILED' } : p));
    }
  }

  const processSingleVideo = async (i: number) => {
    const item = items[i];
    if (!item.mediaId) {
      console.warn(`[VIDEO] Scene #${i + 1} missing mediaId, skipping.`);
      return;
    }
    console.log(`[VIDEO] Sending generation request for scene #${i + 1}...`);
    setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'PROCESSING' } : p));
    try {
      const genResult = await fetchAPI<any>('/api/flow/generate-video', {
        method: 'POST',
        body: JSON.stringify({
          start_image_media_id: item.mediaId,
          prompt: item.videoText || item.text,
          project_id: project.id,
          scene_id: `batch-vid-${item.id}-${Date.now()}`,
          aspect_ratio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
          user_paygate_tier: project.user_paygate_tier || 'PAYGATE_TIER_ONE'
        })
      });
      const root = genResult.data || genResult.result || genResult;

      // Extract the actual operation name. 
      // In newer FX APIs, the 'media' name (UUID) is the pollable operation name, NOT the workflow name.
      const opName = root.operations?.[0]?.operation?.name ||
        root.media?.[0]?.name ||
        root.workflows?.[0]?.metadata?.primaryMediaId ||
        root.workflows?.[0]?.name;

      if (!opName) {
        console.error(`[VIDEO] No operation name found for #${i + 1}. Root:`, root);
        throw new Error("No operation name found");
      }

      console.log(`[VIDEO] Extracted OpName for #${i + 1}:`, opName);
      await pollVideoStatus(i, opName);
    } catch (err: any) {
      console.error(`[VIDEO] Critical failure for #${i + 1}:`, err);
      setItems(prev => prev.map((p, idx) => idx === i ? { ...p, videoStatus: 'FAILED' } : p));
    }
  }

  const startBatch = async (onlyFailed = false) => {
    if (isGenerating || items.length === 0) return
    setIsGenerating(true); setIsStopping(false); stopRef.current = false; const concurrency = 2;
    // Explicitly skip items that don't have a successful image generation
    const queue = [...Array(items.length).keys()].filter(idx =>
      (onlyFailed ? items[idx].videoStatus === 'FAILED' : items[idx].videoStatus !== 'COMPLETED') &&
      items[idx].status === 'COMPLETED' &&
      items[idx].mediaId
    )
    const processNext = async () => { while (queue.length > 0 && !stopRef.current) { const i = queue.shift()!; setCurrentIndex(i); await processSingleVideo(i) } }
    const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(() => processNext()); await Promise.all(workers); setIsGenerating(false); setIsStopping(false); setCurrentIndex(-1)
  }

  const queueCount = items.filter(p => p.videoStatus !== 'COMPLETED' && p.status === 'COMPLETED' && p.mediaId).length;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-6">
          <div className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Video Batch Status</span><div className="flex gap-4 mt-1"><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-sm font-bold">{stats.total} Total</span></div><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-sm font-bold">{stats.completed} Done</span></div><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-sm font-bold">{stats.failed} Failed</span></div></div></div>
          <div className="flex flex-col gap-1 ml-6"><label className="text-[10px] font-bold uppercase tracking-wider opacity-50">Video Output Directory</label><div className="flex gap-2"><input type="text" value={videoOutputPath} onChange={e => setVideoOutputPath(e.target.value)} className="w-80 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs outline-none" /><button onClick={() => { console.log('Browse Video clicked'); fetchAPI<any>('/api/batch-images/pick-dir').then(p => { console.log('Browse Video res:', p); if (p) setVideoOutputPath(p.path); }) }} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-widest">Browse</button></div></div>
          <div className="flex items-center gap-3 ml-6 pt-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={autoUpscale} onChange={e => setAutoUpscale(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-[10px] font-bold uppercase tracking-wider opacity-50">Auto Upscale 1080p</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="px-3 py-1.5 rounded text-xs font-bold transition-all border border-white/10 hover:bg-white/5 cursor-pointer flex items-center gap-2">Import Video TXT<input type="file" accept=".txt" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = (re) => {
              const content = re.target?.result as string; const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
              setItems(prev => { const next = [...prev]; let lineIdx = 0; for (let i = 0; i < next.length && lineIdx < lines.length; i++) { if (!next[i].videoText || next[i].videoText.trim() === '') next[i].videoText = lines[lineIdx++]; } return next; });
            }; reader.readAsText(file); e.target.value = '';
          }} /></label>
          {isGenerating ? <button onClick={() => { stopRef.current = true; setIsStopping(true); }} className="px-6 py-1.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">{isStopping ? 'Stopping...' : 'Stop'}</button> : (
            <div className="flex gap-2">
              {stats.failed > 0 && <button onClick={() => startBatch(true)} className="px-3 py-1.5 rounded text-xs font-bold border border-red-500/20 text-red-400 hover:bg-red-500/10">Retry Failed ({stats.failed})</button>}
              <button onClick={() => startBatch(false)} disabled={queueCount === 0} className="px-6 py-1.5 rounded text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed" style={{ background: 'var(--accent)', color: '#fff' }}>{queueCount > 0 ? `Start Video Batch (${queueCount})` : 'Start Video Batch'}</button>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-4 flex-1 overflow-hidden">
        <div className="w-[450px] flex flex-col gap-2 p-2 rounded-xl border overflow-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          {items.map((p, i) => (
            <div key={i} className={`flex gap-3 p-3 rounded-lg border transition-all ${currentIndex === i ? 'ring-2 ring-blue-500' : ''}`} style={{ background: p.videoStatus === 'COMPLETED' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
              <div className="w-24 aspect-video rounded bg-black/40 overflow-hidden shrink-0">
                {p.url ? <img src={p.url} className="w-full h-full object-cover" alt="" /> : p.status === 'FAILED' ? <div className="w-full h-full flex items-center justify-center bg-red-950/20 text-red-500 text-[8px] font-bold">FAILED</div> : null}
              </div>
              <div className="flex-1 min-w-0"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-bold opacity-40">SCENE #{i + 1}</span><StatusDot status={p.videoStatus || 'PENDING'} /></div><textarea value={p.videoText || p.text} onChange={e => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, videoText: e.target.value } : item))} className="w-full bg-transparent border-none resize-none outline-none p-0 text-[11px] leading-snug" style={{ color: 'var(--text)' }} rows={2} /></div>
            </div>
          ))}
        </div>
        <div className="flex-1 p-2 rounded-xl border overflow-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {items.map((p, i) => (
              <div key={i} className="relative group aspect-video bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {p.videoUrl ? <video src={p.videoUrl} className="w-full h-full object-cover" controls /> : p.url ? <img src={p.url} className="w-full h-full object-cover opacity-50" alt="" /> : <div className="w-full h-full flex items-center justify-center opacity-10">NO VIDEO</div>}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold">#{i + 1}</div>
                {(p.videoStatus === 'COMPLETED' || p.videoStatus === 'FAILED') && (
                  <button onClick={() => processSingleVideo(i)} className={`absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-full transition-opacity hover:bg-blue-500 text-white ${p.videoStatus === 'FAILED' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                  </button>
                )}
                {p.videoStatus === 'PROCESSING' && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">{p.isUpscaling ? 'Upscaling...' : 'Rendering...'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Characters Tab ----
interface CharactersTabProps {
  project: Project
  characters: Character[]
  loadCharacters: () => Promise<void>
  outputPath: string
}
function CharactersTab({ project, characters, loadCharacters, outputPath }: CharactersTabProps) {
  const [loading, setLoading] = useState(false) // loading managed by parent now
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetchAPI<Character[]>(`/api/projects/${project.id}/characters`)
      setCharacters(res)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadCharacters() }, [project.id])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isAdding) return;

    setIsAdding(true);
    try {
      const content = await file.text();

      // 1. Check if it's a Script TXT or JSON
      if (content.includes('LOCKED') || content.includes('STYLE:')) {
        console.log('[IMPORT] Detected Script TXT format. Parsing...');

        // Extract STYLE
        const styleMatch = content.match(/STYLE:\s*([\s\S]*?)(?=\nTONE:|\nRENDERING RULES:|\nCHARACTERS AND OBJECTS|$)/);
        const style = styleMatch ? styleMatch[1].trim() : "";

        // Extract LOCKED section
        const lockedSectionMatch = content.match(/CHARACTERS AND OBJECTS \(LOCKED\):([\s\S]*?)(?=\nENVIRONMENT|\n\[END|$)/);
        if (!lockedSectionMatch) throw new Error("Could not find CHARACTERS AND OBJECTS (LOCKED) section");

        const lines = lockedSectionMatch[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('-'));
        const newEntities: Character[] = [];
        const batchRequests: any[] = [];

        for (const line of lines) {
          const match = line.match(/^-\s*([^:]+):\s*(.*)/);
          if (!match) continue;

          const name = match[1].trim();
          const description = match[2].trim();

          // Categorize entity type
          let type: 'character' | 'location' | 'visual_asset' = 'character';
          const nameLower = name.toLowerCase();
          const descLower = description.toLowerCase();

          if (name.includes('BG_') || descLower.includes('location') || nameLower.includes('forest') || nameLower.includes('kitchen') || nameLower.includes('garden') || nameLower.includes('veranda')) {
            type = 'location';
          } else if (nameLower.includes('prop') || descLower.includes('object') || nameLower.includes('set') || nameLower.includes('pot') || nameLower.includes('stamp') || nameLower.includes('journal')) {
            type = 'visual_asset';
          }

          // Create the character/object
          const char = await fetchAPI<Character>('/api/characters', {
            method: 'POST',
            body: JSON.stringify({
              name: name,
              image_prompt: JSON.stringify({ STYLE: style, DESCRIPTION: description }),
              entity_type: type
            })
          });

          // Link to project
          await fetchAPI(`/api/projects/${project.id}/characters/${char.id}`, { method: 'POST' });
          newEntities.push(char);
        }

        alert(`Imported ${newEntities.length} entities from script.`);

        // Refresh the list immediately
        loadCharacters();
      } else {
        // Fallback to legacy JSON import
        try {
          const data = JSON.parse(content);
          for (const [name, info] of Object.entries(data)) {
            const char = await fetchAPI<Character>('/api/characters', {
              method: 'POST',
              body: JSON.stringify({ name: name, image_prompt: JSON.stringify(info), entity_type: 'character' })
            });
            await fetchAPI(`/api/projects/${project.id}/characters/${char.id}`, { method: 'POST' });
          }
          loadCharacters();
        } catch (jsonErr) {
          console.error('[IMPORT] JSON parse failed:', jsonErr);
          throw new Error("Invalid format. Please use Ghibli Script TXT or JSON.");
        }
      }
    } catch (err: any) {
      console.error('Import failed:', err);
      alert(`Import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAdding(false);
      e.target.value = '';
    }
  };

  const handleAdd = async () => {
    if (!newName || isAdding) return
    setIsAdding(true)
    try {
      const char = await fetchAPI<Character>('/api/characters', {
        method: 'POST',
        body: JSON.stringify({ name: newName, image_prompt: newPrompt, entity_type: 'character' })
      })
      await fetchAPI(`/api/projects/${project.id}/characters/${char.id}`, { method: 'POST' })
      setNewName(''); setNewPrompt(''); loadCharacters()
    } catch (e) { console.error(e) }
    setIsAdding(false)
  }

  const handleDelete = async (cid: string) => {
    if (!confirm('Remove this character?')) return
    try {
      await fetchAPI(`/api/projects/${project.id}/characters/${cid}`, { method: 'DELETE' })
      loadCharacters()
    } catch (e) { console.error(e) }
  }

  const handleRefresh = async () => {
    if (loading || generatingId) return
    setLoading(true)
    await loadCharacters()
  }

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL characters/objects in this project? This cannot be undone.')) return;
    setIsAdding(true);
    try {
      for (const char of characters) {
        await fetchAPI(`/api/projects/${project.id}/characters/${char.id}`, { method: 'DELETE' });
      }
      loadCharacters();
    } catch (err) {
      console.error('Clear all failed:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleGenerateAllRefs = async () => {
    if (!characters.length) return;
    if (!confirm(`This will generate reference images for all ${characters.length} entities one by one. Continue?`)) return;

    setIsAdding(true);
    for (const char of characters) {
      // Skip if it already has a media_id and we don't want to overwrite? 
      // Actually, user probably wants to generate all, so we call handleGenerate.
      console.log(`[BATCH] Processing ${char.name}...`);
      await handleGenerate(char);
    }
    setIsAdding(false);
    alert('All reference images generated sequentially.');
  };

  const handleGenerate = async (char: Character) => {
    if (generatingId) return
    setGeneratingId(char.id)
    try {
      let finalPrompt = '';
      const turnaroundKeywords = "full body character turnaround sheet, front view, side view, back view, 3/4 view, neutral pose, plain background, consistent character design";
      const locationKeywords = "wide angle, cinematic landscape, deep depth of field, no people, no characters, empty scenery, empty room, scenery only, high detail, masterpiece, Ghibli style watercolor";
      const objectKeywords = "close up, highly detailed texture, isolated on simple background, no people, no characters, painterly Ghibli style";

      try {
        const parsed = JSON.parse(char.image_prompt || '{}');
        const style = parsed.STYLE || '';
        const desc = parsed.DESCRIPTION || char.name;

        if (char.entity_type === 'character') {
          finalPrompt = `${style}, ${desc}, ${turnaroundKeywords}, Ghibli-inspired cinematic style, high detail`;
        } else if (char.entity_type === 'location') {
          finalPrompt = `${style}, ${desc}, ${locationKeywords}`;
        } else {
          finalPrompt = `${style}, ${desc}, ${objectKeywords}`;
        }
      } catch (e) {
        // Fallback for non-JSON prompts
        finalPrompt = char.image_prompt || char.name;
        if (char.entity_type === 'character') finalPrompt += `, ${turnaroundKeywords}`;
      }

      // Final safety trim (set to 2000 characters to support very long descriptive styles)
      if (finalPrompt.length > 2000) {
        finalPrompt = finalPrompt.substring(0, 2000);
      }

      console.log(`[GENERATE] Optimized prompt for ${char.name} (${finalPrompt.length} chars):`, finalPrompt);

      const genResult = await fetchAPI<any>('/api/flow/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: finalPrompt,
          project_id: project.id,
          aspect_ratio: 'IMAGE_ASPECT_RATIO_LANDSCAPE',
          user_paygate_tier: project.user_paygate_tier || 'PAYGATE_TIER_ONE'
        })
      })

      const findUrl = (obj: any): string | null => { if (!obj || typeof obj !== 'object') return null; if (obj.fifeUrl || obj.servingUri || obj.url || obj.contentUrl) return obj.fifeUrl || obj.servingUri || obj.url || obj.contentUrl; for (const key in obj) { const found = findUrl(obj[key]); if (found) return found; } return null; };
      const imageUrl = findUrl(genResult);

      const rawMediaId = deepExtractMediaId(genResult);
      const mediaId = (rawMediaId as string)?.split(':').pop()?.split('/').pop() || (rawMediaId as string) || '';

      if (mediaId) {
        // Step 1: Initial update with the generated ID (as a fallback)
        await fetchAPI(`/api/characters/${char.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ media_id: mediaId, reference_image_url: imageUrl })
        })

        // Step 2: Save locally and then re-upload to Flow for a "clean" Media ID
        if (imageUrl && outputPath) {
          const fileName = `${char.name}.png`
          const fullPath = `${outputPath}\\${fileName}`.replace(/[\/\\]+/g, '\\')
          try {
            // Save to local disk
            await fetchAPI<any>('/api/batch-images/save', {
              method: 'POST',
              body: JSON.stringify({ url: imageUrl, save_path: fullPath })
            })
            console.log(`[CHARACTER] Saved reference image for ${char.name} to ${fullPath}`)

            // Upload back to Flow
            console.log(`[CHARACTER] Re-uploading ${char.name} to Flow for persistent Media ID...`)
            const uploadRes = await fetchAPI<any>('/api/flow/upload-image', {
              method: 'POST',
              body: JSON.stringify({ file_path: fullPath, project_id: project.id, file_name: fileName })
            })

            const newMediaId = uploadRes.media_id
            if (newMediaId) {
              console.log(`[CHARACTER] Re-upload success. New Media ID: ${newMediaId}`)
              // Step 3: Update character with the UPLOADED Media ID
              await fetchAPI(`/api/characters/${char.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ media_id: newMediaId })
              })
            }
          } catch (e) {
            console.error(`[CHARACTER] Save/Upload failed for ${char.name}:`, e)
          }
        }

        loadCharacters()
      }
    } catch (e) { console.error(e) }
    setGeneratingId(null)
  }

  if (loading) return <div className="p-8 text-center opacity-50">Loading characters...</div>

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-180px)] overflow-auto pr-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-4 p-6 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-bold uppercase tracking-widest opacity-50">Add Character</h2>
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Name (e.g. Luna)" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500/50 transition-all" />
            <textarea placeholder="Appearance Prompt (Visual details only, no action)" value={newPrompt} onChange={e => setNewPrompt(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500/50 transition-all min-h-[100px] resize-none" />
            <button onClick={handleAdd} disabled={!newName || isAdding} className="w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-30" style={{ background: 'var(--accent)', color: '#fff' }}>{isAdding ? 'Adding...' : 'Create Character'}</button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold uppercase tracking-widest opacity-50">Project Characters ({characters.length})</h2>
            <div className="flex items-center gap-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors cursor-pointer">
                Import TXT
                <input type="file" accept=".txt,.json" className="hidden" onChange={handleImport} disabled={isAdding} />
              </label>
              <button onClick={handleGenerateAllRefs} disabled={isAdding || !!generatingId || characters.length === 0} className="text-[10px] font-bold uppercase tracking-widest text-green-500 hover:text-green-400 transition-colors disabled:opacity-30">Generate All Refs</button>
              <button onClick={handleClearAll} disabled={isAdding || !!generatingId || characters.length === 0} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors disabled:opacity-30">Clear All</button>
              <button onClick={handleRefresh} className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors">Refresh URLs</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {characters.map(char => (
              <div key={char.id} className="flex flex-col gap-3 p-4 rounded-xl border group" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="w-full aspect-video rounded-lg bg-black/40 overflow-hidden border border-white/5 relative">
                  {char.reference_image_url ? <img src={char.reference_image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center opacity-10 text-[10px] font-bold">NO REF</div>}
                  {char.media_id && <div className="absolute top-2 right-2 px-2 py-1 rounded bg-green-500/80 backdrop-blur-sm text-white text-[9px] font-bold uppercase tracking-widest">Ready</div>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold opacity-90">{char.name}</span>
                    <button onClick={() => handleDelete(char.id)} className="p-1 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all text-red-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] opacity-90 line-clamp-2 leading-relaxed">
                      {(() => {
                        try {
                          const parsed = JSON.parse(char.image_prompt || '');
                          return parsed.DESCRIPTION || parsed.STYLE || char.image_prompt;
                        } catch (e) {
                          return char.image_prompt || 'No prompt set.';
                        }
                      })()}
                    </p>
                  </div>
                  <button onClick={() => handleGenerate(char)} disabled={!!generatingId} className="w-full mt-1 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-bold uppercase tracking-widest transition-all disabled:opacity-30">
                    {generatingId === char.id ? 'Generating...' : char.reference_image_url ? 'Regenerate Ref' : 'Generate Ref'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Images Tab ----
interface ImagesTabProps {
  project: Project
  items: BatchItem[]
  setItems: React.Dispatch<React.SetStateAction<BatchItem[]>>
  outputPath: string
  setOutputPath: (p: string) => void
  characters: Character[]
}
function ImagesTab({ project, items, setItems, outputPath, setOutputPath, characters }: ImagesTabProps) {
  const [isGenerating, setIsGenerating] = useState(false); const [isStopping, setIsStopping] = useState(false); const [currentIndex, setCurrentIndex] = useState(-1); const stopRef = useRef(false)
  const stats = { total: items.length, completed: items.filter(p => p.status === 'COMPLETED').length, failed: items.filter(p => p.status === 'FAILED').length }

  const findUrl = (obj: any, excludeUrl?: string): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    const candidates = [obj.fifeUrl, obj.servingUri, obj.url, obj.contentUrl, obj.imageUrl];
    for (const url of candidates) {
      if (typeof url === 'string' && url.startsWith('http') && url !== excludeUrl) return url;
    }
    for (const key in obj) {
      const found = findUrl(obj[key], excludeUrl);
      if (found) return found;
    }
    return null;
  };

  const processSinglePrompt = async (i: number) => {
    console.log(`[IMAGE] Starting scene #${i + 1}`);
    setItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'PROCESSING' } : p))
    try {
      const item = items[i];
      const genResult = await fetchAPI<any>('/api/flow/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: item.text,
          project_id: project.id,
          aspect_ratio: 'IMAGE_ASPECT_RATIO_LANDSCAPE',
          user_paygate_tier: project.user_paygate_tier || 'PAYGATE_TIER_ONE',
          character_media_ids: item.characterMediaIds
        })
      })
      console.log(`[IMAGE] Gen response for #${i + 1}:`, genResult);

      let imageUrl = findUrl(genResult);
      let mediaId = deepExtractMediaId(genResult);

      // Clean up Media ID
      if (mediaId) {
        mediaId = (mediaId as string).split(':').pop()?.split('/').pop() || mediaId;
      }

      if (!imageUrl && mediaId) {
        console.log(`[IMAGE] No URL in gen response for #${i + 1}, fetching via get_media...`);
        const mRes = await fetchAPI<any>(`/api/flow/media/${mediaId}?project_id=${project.id}`);
        imageUrl = findUrl(mRes);
      }

      if (!imageUrl) throw new Error(`Could not find image URL for #${i + 1}`);
      console.log(`[IMAGE] Success for #${i + 1}:`, imageUrl, mediaId);

      if (outputPath) {
        const fileName = `img_${i + 1}.png`
        const fullPath = `${outputPath}\\${fileName}`.replace(/[\/\\]+/g, '\\')
        try {
          await fetchAPI<any>('/api/batch-images/save', {
            method: 'POST',
            body: JSON.stringify({ url: imageUrl, save_path: fullPath })
          })
        } catch (e) { console.error(`[IMAGE] Save failed for #${i + 1}:`, e) }
      }

      setItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'COMPLETED', url: imageUrl!, mediaId: mediaId || undefined } : p))
    } catch (err: any) {
      console.error(`[IMAGE] Critical failure for #${i + 1}:`, err);
      setItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'FAILED' } : p));
    }
  }

  const startBatch = async (onlyFailed = false) => {
    if (isGenerating || items.length === 0) return
    setIsGenerating(true); setIsStopping(false); stopRef.current = false; const concurrency = 2;
    const queue = [...Array(items.length).keys()].filter(idx =>
      onlyFailed ? items[idx].status === 'FAILED' : items[idx].status !== 'COMPLETED'
    )
    if (queue.length === 0) { setIsGenerating(false); return; }
    const processNext = async () => { while (queue.length > 0 && !stopRef.current) { const i = queue.shift()!; setCurrentIndex(i); try { await processSinglePrompt(i) } catch (err) { } } }
    const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(() => processNext()); await Promise.all(workers); setIsGenerating(false); setIsStopping(false); setCurrentIndex(-1)
  }

  const matchCharacters = (text: string) => {
    const lowerText = text.toLowerCase();

    return characters
      .filter(c => {
        if (!c.media_id) return false;

        // Strip common prefixes to get the core name
        const coreName = c.name
          .replace(/^Hero Prop\s*-\s*/i, '')
          .replace(/^Background\s*-\s*/i, '')
          .replace(/^BG_\d+\s*[:.-]*\s*/i, '')
          .trim()
          .toLowerCase();

        if (coreName.length < 3) return lowerText.includes(coreName);

        // Match if core name appears in the text
        return lowerText.includes(coreName) || coreName.split(' ').every(word => lowerText.includes(word));
      })
      .map(c => c.media_id!);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-6">
          <div className="flex flex-col"><span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Batch Status</span><div className="flex gap-4 mt-1"><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-sm font-bold">{stats.total} Total</span></div><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-sm font-bold">{stats.completed} Done</span></div><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-sm font-bold">{stats.failed} Failed</span></div></div></div>
          <div className="flex flex-col gap-1 ml-6"><label className="text-[10px] font-bold uppercase tracking-wider opacity-50">Output Directory</label><div className="flex gap-2"><input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)} className="w-80 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs outline-none" /><button onClick={() => { console.log('Browse Images clicked'); fetchAPI<any>('/api/batch-images/pick-dir').then(p => { console.log('Browse Images res:', p); if (p) setOutputPath(p.path); }) }} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-widest">Browse</button></div></div>
        </div>
        <div className="flex items-center gap-3">
          <label className="px-3 py-1.5 rounded text-xs font-bold transition-all border border-white/10 hover:bg-white/5 cursor-pointer flex items-center gap-2">Import Script TXT<input type="file" accept=".txt" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const content = await file.text();

            // 1. Extract STYLE and TONE (Strictly exclude RENDERING RULES)
            const styleMatch = content.match(/STYLE:\s*([\s\S]*?)(?=\n?TONE:|\n?RENDERING RULES|\n?CHARACTERS AND OBJECTS|$)/i);
            const style = styleMatch ? styleMatch[1].trim() : "";
            
            const toneMatch = content.match(/TONE:\s*([\s\S]*?)(?=\n?STYLE:|\n?RENDERING RULES|\n?CHARACTERS AND OBJECTS|\n?SCENE|$)/i);
            const tone = toneMatch ? toneMatch[1].trim() : "";

            // 2. Parse Scenes
            const scenes: any[] = [];
            const sceneRegex = /SCENE\s+(\d+):([\s\S]*?)(?=\nSCENE\s+\d+:|\n\[END|$)/g;
            let match;

            while ((match = sceneRegex.exec(content)) !== null) {
              const sceneNum = match[1];
              const sceneBody = match[2];

              const envMatch = sceneBody.match(/ENVIRONMENT\s*\(SCENE\):\s*([\s\S]*?)(?=\n-?\s*IMAGE:|-?\s*IMAGE:|\n-?\s*ACTIONS:|-?\s*ACTIONS:|\n-?\s*CAMERA:|-?\s*CAMERA:|\n-?\s*AUDIO:|\n-?\s*DIALOGUE:|\n-?\s*NOTES:|$)/i);
              const imgMatch = sceneBody.match(/IMAGE:\s*([\s\S]*?)(?=\n-?\s*ACTIONS:|-?\s*ACTIONS:|\n-?\s*ENVIRONMENT:|-?\s*ENVIRONMENT:|\n-?\s*CAMERA:|-?\s*CAMERA:|\n-?\s*AUDIO:|\n-?\s*DIALOGUE:|\n-?\s*NOTES:|$)/i);
              const actMatch = sceneBody.match(/ACTIONS:\s*([\s\S]*?)(?=\n-?\s*IMAGE:|-?\s*IMAGE:|\n-?\s*ENVIRONMENT:|-?\s*ENVIRONMENT:|\n-?\s*CAMERA:|-?\s*CAMERA:|\n-?\s*AUDIO:|\n-?\s*DIALOGUE:|\n-?\s*NOTES:|$)/i);
              const camMatch = sceneBody.match(/CAMERA:\s*([\s\S]*?)(?=\n-?\s*ENVIRONMENT:|ENVIRONMENT:|\n-?\s*IMAGE:|IMAGE:|\n-?\s*ACTIONS:|ACTIONS:|\n-?\s*AUDIO:|\n-?\s*DIALOGUE:|\n-?\s*NOTES:|$)/i);

              const cleanText = (txt: string) => {
                if (!txt) return "";
                return txt.trim()
                  .replace(/^-\s*/gm, '')
                  .replace(/\n+/g, ' ')
                  .replace(/\s*(Location:|Scenery:|Atmosphere:|IMAGE:|ACTIONS:|CAMERA:|Lens:|ASMR:|VISUAL FX:)/gi, '\n- $1')
                  .trim();
              };

              const env = envMatch ? cleanText(envMatch[1]) : "";
              const img = imgMatch ? cleanText(imgMatch[1]) : "";
              const act = actMatch ? cleanText(actMatch[1]) : "";
              const camFull = camMatch ? camMatch[1].trim() : "";
              
              // CAMERA: Extract ONLY the Lens part
              let lens = "";
              const lensMatch = camFull.match(/Lens:\s*([^\n.]+)/i);
              if (lensMatch) {
                lens = lensMatch[1].trim();
              } else {
                lens = camFull.split('.')[0].replace(/Lens:\s*/i, '').replace(/^-\s*/, '').trim();
              }

              // Final Prompt Construction (NO ACTIONS, NO RENDERING RULES)
              const fullPrompt = `STYLE: ${style}\nTONE: ${tone}\nENVIRONMENT (SCENE):\n${env}\nIMAGE:\n${img}\nCAMERA (Lens): ${lens}`;
              
              scenes.push({
                id: Date.now() + parseInt(sceneNum),
                text: fullPrompt,
                status: 'PENDING',
                videoStatus: 'PENDING',
                characterMediaIds: matchCharacters(env + " " + img + " " + act)
              });
            }

            if (scenes.length > 0) {
              setItems(prev => [...prev, ...scenes]);
              alert(`Imported ${scenes.length} scenes with smart entity mapping.`);
            } else {
              alert("No scenes found. Check script format.");
            }
            e.target.value = '';
          }} className="hidden" /></label>
          <button onClick={() => { if (confirm('Clear?')) setItems([]) }} className="px-3 py-1.5 rounded text-xs font-bold border border-red-500/20 text-red-400 hover:bg-red-500/10">Clear</button>
          {isGenerating ? <button onClick={() => { stopRef.current = true; setIsStopping(true); }} className="px-6 py-1.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">{isStopping ? 'Stopping...' : 'Stop'}</button> : (
            <div className="flex gap-2">
              {stats.failed > 0 && <button onClick={() => startBatch(true)} className="px-3 py-1.5 rounded text-xs font-bold border border-red-500/20 text-red-400 hover:bg-red-500/10">Retry Failed ({stats.failed})</button>}
              <button onClick={() => startBatch(false)} disabled={items.length === 0} className="px-6 py-1.5 rounded text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>Start Batch</button>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-4 flex-1 overflow-hidden">
        <div className="w-96 flex flex-col gap-2 p-2 rounded-xl border overflow-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          {items.map((p, i) => (
            <div key={i} className={`p-3 rounded-lg border transition-all ${currentIndex === i ? 'ring-2 ring-blue-500' : ''}`} style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold opacity-40">#{i + 1}</span>
                  {p.characterMediaIds && p.characterMediaIds.length > 0 && (
                    <div className="flex gap-1">
                      {p.characterMediaIds.map(mid => {
                        const char = characters.find(c => c.media_id === mid);
                        return char ? <div key={mid} className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-bold uppercase">{char.name}</div> : null;
                      })}
                    </div>
                  )}
                </div>
                <StatusDot status={p.status} />
              </div>
              <textarea value={p.text} onChange={e => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} rows={8} className="w-full bg-transparent border-none resize-none outline-none p-0 text-[11px] leading-tight" style={{ color: 'var(--text)' }} />
            </div>
          ))}
        </div>
        <div className="flex-1 p-2 rounded-xl border overflow-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((p, i) => (
              <div key={i} className="relative group aspect-video bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                {p.url ? <img src={p.url} className="w-full h-full object-cover" alt="" /> : p.status === 'FAILED' ? <div className="w-full h-full flex flex-col items-center justify-center bg-red-950/40 text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg><span className="text-[10px] font-bold mt-2 uppercase tracking-widest">Failed</span></div> : <div className="w-full h-full flex items-center justify-center opacity-10 font-bold text-[10px]">NO IMAGE</div>}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold">#{i + 1}</div>
                {(p.status === 'COMPLETED' || p.status === 'FAILED') && (
                  <button onClick={() => processSinglePrompt(i)} className={`absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-full transition-opacity hover:bg-blue-500 text-white ${p.status === 'FAILED' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                  </button>
                )}
                {p.status === 'PROCESSING' && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Generating...</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Main ProjectDetailPage ----
export default function ProjectDetailPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<Tab>('Characters')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [outputPath, setOutputPath] = useState('D:\\Youtube\\Studio Thiên Vũ\\flowkit\\output\\image')
  const [videoOutputPath, setVideoOutputPath] = useState('D:\\Youtube\\Studio Thiên Vũ\\flowkit\\output\\video')
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  const loadCharacters = async () => {
    try {
      const res = await fetchAPI<Character[]>(`/api/projects/${projectId}/characters`)
      setCharacters(res)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchAPI<Project>(`/api/projects/${projectId}`),
      fetchAPI<PersistedData>(`/api/projects/${projectId}/batch-data`)
    ]).then(([p, data]) => {
      setProject(p)
      if (data && data.items) {
        setBatchItems(data.items)
      }
      if (data && data.outputPath) {
        setOutputPath(data.outputPath)
      }
      if (data && data.videoOutputPath) {
        setVideoOutputPath(data.videoOutputPath)
      }
      loadCharacters().then(() => {
        setLoading(false)
        setIsLoaded(true)
      })
    }).catch((err) => {
      console.error(err)
      setLoading(false)
      setIsLoaded(true)
    })
  }, [projectId])

  // Auto-save batch items whenever they change
  useEffect(() => {
    if (!project || !isLoaded) return
    const timer = setTimeout(() => {
      fetchAPI(`/api/projects/${projectId}/batch-data`, {
        method: 'POST',
        body: JSON.stringify({ items: batchItems, outputPath, videoOutputPath })
      }).catch(err => console.error('Failed to auto-save batch items:', err))
    }, 1000) // Debounce save
    return () => clearTimeout(timer)
  }, [batchItems, projectId, project, outputPath, videoOutputPath, isLoaded])

  if (loading) return <div className="p-8 text-center opacity-50">Loading...</div>
  if (!project) return <div className="p-8 text-center">Not found.</div>

  const tabs: Tab[] = ['Characters', 'Images', 'Videos']

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-bold transition-all border border-white/10">Back</button>
          <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2"><Badge label={project.language.toUpperCase()} /><Badge label={project.user_paygate_tier} /></div>
        </div>

        <div className="flex items-center gap-8 border-b border-white/10">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-bold transition-all relative ${tab === t ? 'text-blue-500' : 'opacity-40 hover:opacity-100'}`}>
              {t}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'Characters' && <CharactersTab project={project} characters={characters} loadCharacters={loadCharacters} outputPath={outputPath} />}
        {tab === 'Images' && <ImagesTab project={project} items={batchItems} setItems={setBatchItems} outputPath={outputPath} setOutputPath={setOutputPath} characters={characters} />}
        {tab === 'Videos' && <VideosTab project={project} items={batchItems} setItems={setBatchItems} videoOutputPath={videoOutputPath} setVideoOutputPath={setVideoOutputPath} />}
      </div>
    </div>
  )
}
