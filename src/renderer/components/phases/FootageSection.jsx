import React, { useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AppContext } from '../../App';
import '../sections.css';
import './FootageSection.css';
import PhaseSection from '../PhaseSection';

const FOOTAGE_ROOT = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Footage';

const THEMES = [
  { name: 'Forest',           kw: ['forest', 'woodland', 'trees', 'mossy'] },
  { name: 'Mountain',         kw: ['mountain', 'mountainous', 'highland', 'peak', 'towering'] },
  { name: 'Beach & Ocean',    kw: ['beach', 'coastal', 'ocean', 'shore'] },
  { name: 'Desert & Vast',    kw: ['desert', 'arid', 'barren', 'desolate', 'erosion'] },
  { name: 'Snow & Ice',       kw: ['snow', 'snowy', 'icy', 'winter', 'wilderness'] },
  { name: 'Misty & Foggy',    kw: ['misty', 'foggy', 'mist', 'fog', 'drizzle', 'muddy'] },
  { name: 'Sunrise & Sunset', kw: ['sunrise', 'sunset', 'dusk', 'dawn', 'golden', 'church'] },
  { name: 'Abstract',         kw: ['abstract', 'swirl', 'fluid', 'futuristic', 'texture', 'technology', 'creamy', 'orange', 'pattern', 'mesmerizing'] },
  { name: 'Mystical',         kw: ['mystical', 'ethereal', 'cosmic', 'celestial', 'magical', 'mysterious', 'mystery', 'exploration'] },
  { name: 'People',           kw: ['family', 'children', 'community', 'helping', 'support', 'connection', 'warmth', 'bonding', 'patriotic', 'festive', 'cheerful', 'carefree', 'play'] },
  { name: 'Garden & Flora',   kw: ['garden', 'flowers', 'floral', 'sunflowers', 'tropical', 'springtime', 'vitality', 'cactus'] },
  { name: 'Nature',           kw: ['nature', 'natural', 'green', 'lush', 'ancient', 'landscape'] },
  { name: 'Calm & Serene',    kw: ['serene', 'tranquil', 'tranquility', 'peaceful', 'calm', 'serenity', 'solitude', 'solitary', 'contemplative', 'reflection', 'isolation', 'faithful', 'shadow', 'infinite', 'majestic', 'vast'] },
];

const STOP_WORDS = new Set([
  'the','and','for','you','are','all','our','with','this','that','will','from','have',
  'your','can','just','over','when','into','more','through','every','only','bring','brings',
  'each','come','upon','been','his','her','its','not','but','was','one','there',
  'we','my','by','of','in','to','a','an','is','it','at','be','if','on','so','do',
  'no','up','us','or','as','am','he','me','him','she','they','what','who',
]);

function clipBasename(p) { return p.split('/').pop().replace(/\.[^.]+$/, ''); }

function groupFoldersByTheme(folders) {
  const map = {};
  THEMES.forEach(t => { map[t.name] = []; });
  map.Other = [];
  folders.forEach(folder => {
    const name = folder.name.toLowerCase();
    let matched = false;
    for (const { name: theme, kw } of THEMES) {
      if (kw.some(k => name.includes(k))) { map[theme].push(folder); matched = true; break; }
    }
    if (!matched) map.Other.push(folder);
  });
  return [...THEMES.map(t => t.name), 'Other']
    .map(theme => ({ theme, folders: map[theme] }))
    .filter(({ folders }) => folders.length > 0);
}

function makeAssignments(clips, lineCount) {
  const shuffled = [...clips].sort(() => Math.random() - 0.5);
  const map = {};
  for (let i = 0; i < lineCount; i++) map[i] = i < shuffled.length ? shuffled[i] : null;
  return map;
}

// ── Shared thumbnail hook ──────────────────────────────────────
// Returns a file:// URL once extracted, null while pending.
function useThumbnail(clipPath) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!clipPath) return;
    let cancelled = false;
    window.electron.ipcRenderer.invoke('extract-video-thumbnail', clipPath).then(p => {
      if (!cancelled && p) setSrc(`file://${p}`);
    });
    return () => { cancelled = true; };
  }, [clipPath]);
  return src;
}

// ── Folder Preview Card ────────────────────────────────────────
const COLLAGE_COLS  = 4;
const COLLAGE_ROWS  = 2;
const COLLAGE_COUNT = COLLAGE_COLS * COLLAGE_ROWS;

function FolderPreviewThumb({ clipPath }) {
  const src = useThumbnail(clipPath);
  return (
    <div className="folder-preview-thumb">
      {src
        ? <img src={src} alt="" className="folder-preview-thumb-img" />
        : <div className="folder-preview-thumb-placeholder" />
      }
    </div>
  );
}

function FolderPreviewCard({ folder, isSelected, onToggle }) {
  const previewClips = folder.clips.slice(0, COLLAGE_COUNT);

  return (
    <div
      className={`folder-preview-card ${isSelected ? 'folder-preview-card--selected' : ''}`}
      onClick={onToggle}
      title={`${folder.name} · ${folder.clipCount} clips`}
    >
      <div className="folder-preview-collage">
        {previewClips.map((clip) => (
          <FolderPreviewThumb key={clip} clipPath={clip} />
        ))}
        {Array.from({ length: Math.max(0, COLLAGE_COUNT - previewClips.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="folder-preview-thumb folder-preview-thumb--empty" />
        ))}
        {previewClips.length === 0 && (
          <div className="folder-preview-empty">No clips</div>
        )}
      </div>

      {/* Footer */}
      <div className="folder-preview-footer">
        <span className="folder-preview-name">{folder.name}</span>
        <span className="folder-preview-count">{folder.clipCount}</span>
      </div>

      {/* Selected overlay */}
      {isSelected && (
        <div className="folder-preview-selected-badge">✓</div>
      )}
    </div>
  );
}

// ── Search result clip card ────────────────────────────────────
function SearchClipCard({ clipPath, folderName, isSelected, onToggle }) {
  const src = useThumbnail(clipPath);
  const name = clipBasename(clipPath);
  return (
    <div
      className={`search-clip-card ${isSelected ? 'search-clip-card--selected' : ''}`}
      onClick={onToggle}
      title={`${name}\n${folderName}`}
    >
      <div className="search-clip-thumb">
        {src
          ? <img src={src} alt="" className="search-clip-img" />
          : <div className="search-clip-placeholder" />
        }
        {isSelected && <div className="search-clip-check">✓</div>}
      </div>
      <div className="search-clip-footer">
        <span className="search-clip-name">{name}</span>
        <span className="search-clip-folder">{folderName}</span>
      </div>
    </div>
  );
}

// ── Video Preview Modal ────────────────────────────────────────
function VideoPreviewModal({ clips, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx);
  const clip = clips[idx];

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, clips.length - 1));
      else if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clips.length, onClose]);

  if (!clip) return null;
  return (
    <div className="vp-overlay" onClick={onClose}>
      <div className="vp-modal" onClick={e => e.stopPropagation()}>
        <button className="vp-close" onClick={onClose}>X</button>
        <button className="vp-nav vp-nav--prev" onClick={() => setIdx(i => Math.max(i-1,0))} disabled={idx === 0}>‹</button>
        <div className="vp-body">
          <video
            key={clip.clipPath}
            src={`file://${clip.clipPath}`}
            className="vp-video"
            controls
            autoPlay
          />
          <div className="vp-meta">
            {clip.scriptLine && <div className="vp-script">{clip.scriptLine}</div>}
            <div className="vp-counter">#{clip.lineIdx + 1} &nbsp;·&nbsp; {idx + 1} of {clips.length}</div>
          </div>
        </div>
        <button className="vp-nav vp-nav--next" onClick={() => setIdx(i => Math.min(i+1,clips.length-1))} disabled={idx === clips.length - 1}>›</button>
      </div>
    </div>
  );
}

// ── Storyboard card ────────────────────────────────────────────
function StoryboardCard({
  entry, isAssigned, isMissing, isDragging, isDragTarget,
  onDragStart, onDragEnd, onDoubleClick, slotDuration, onDurationKnown,
}) {
  const thumbSrc                    = useThumbnail(entry.clipPath);
  const [hovering, setHovering]     = useState(false);
  const [clipDuration, setClipDuration] = useState(null);
  const videoRef                    = useRef(null);

  // Load clip duration when video metadata is available
  const handleVideoMeta = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      setClipDuration(d);
      if (onDurationKnown && entry.clipPath) onDurationKnown(entry.clipPath, d);
    }
  };

  const isTooShort = isAssigned && clipDuration !== null && slotDuration > 0 && clipDuration < slotDuration;

  const handleEnter = () => {
    if (!entry.clipPath) return;
    setHovering(true);
    videoRef.current?.play().catch(() => {});
  };
  const handleLeave = () => {
    setHovering(false);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  };

  const cardClass = ['sb-card',
    isMissing   ? 'sb-card--missing'     : isAssigned ? 'sb-card--assigned' : 'sb-card--unassigned',
    isTooShort  ? 'sb-card--too-short'   : '',
    isDragging  ? 'sb-card--dragging'    : '',
    isDragTarget? 'sb-card--drop-target' : '',
  ].filter(Boolean).join(' ');

  if (isMissing) {
    return (
      <div className={cardClass} data-line-idx={entry.lineIdx}>
        <div className="sb-card-num">#{entry.lineIdx + 1}</div>
        <div className="sb-card-thumb sb-card-thumb--empty">
          <span className="sb-card-missing-label">No clip</span>
        </div>
        <div className="sb-card-script">{entry.scriptLine}</div>
      </div>
    );
  }

  return (
    <div
      className={cardClass}
      data-line-idx={entry.lineIdx}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
    >
      <div className="sb-card-header">
        <span className="sb-card-num">{isAssigned ? `#${entry.lineIdx + 1}` : 'unused'}</span>
        {!isAssigned && <span className="sb-card-x">X</span>}
      </div>

      <div className="sb-card-thumb" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {/* Thumbnail image — hidden while hovering */}
        {thumbSrc && (
          <img
            src={thumbSrc}
            alt=""
            className="sb-card-img"
            style={{ opacity: hovering ? 0 : 1, transition: 'opacity 0.15s' }}
          />
        )}
        {!thumbSrc && !hovering && <div className="sb-card-thumb--placeholder" />}

        {/* Hover video autoplay — preload metadata to get duration */}
        {entry.clipPath && (
          <video
            ref={videoRef}
            src={`file://${entry.clipPath}`}
            className="sb-card-video"
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={handleVideoMeta}
            style={{ opacity: hovering ? 1 : 0, transition: 'opacity 0.15s' }}
          />
        )}

        {/* Too-short warning badge */}
        {isTooShort && (
          <div className="sb-card-too-short-badge" title={`Clip is ${clipDuration.toFixed(1)}s but slot needs ${slotDuration.toFixed(1)}s — will loop`}>
            Too Short
          </div>
        )}

        {/* Double-click hint */}
        {hovering && !isTooShort && (
          <div className="sb-card-hover-hint">double-click to expand</div>
        )}
      </div>

      {isAssigned && entry.scriptLine && (
        <div className="sb-card-script">{entry.scriptLine}</div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────
export default function FootageSection() {
  const { state, dispatch } = useContext(AppContext);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [search, setSearch]         = useState('');
  const [diagInfo, setDiagInfo]     = useState(null);
  const [expandedThemes, setExpandedThemes] = useState(new Set());
  const [assignments, setAssignmentsRaw]    = useState({});
  const [previewModal, setPreviewModal]     = useState(null); // { clips, startIdx }

  // ── Storyboard undo history ───────────────────────────────────
  const sbHistoryRef  = useRef([{}]); // array of assignment snapshots
  const sbHistoryIdx  = useRef(0);    // current position in history
  const skipHistoryRef = useRef(false); // set true when restoring from history
  const [canUndo, setCanUndo] = useState(false); // drives button disabled state

  // Wrap raw setter: push to history unless flagged to skip
  const setAssignments = useCallback((updater) => {
    setAssignmentsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!skipHistoryRef.current) {
        // Trim any forward history, then push
        sbHistoryRef.current = sbHistoryRef.current.slice(0, sbHistoryIdx.current + 1);
        sbHistoryRef.current.push({ ...next });
        sbHistoryIdx.current = sbHistoryRef.current.length - 1;
        setCanUndo(sbHistoryIdx.current > 0);
      }
      return next;
    });
  }, []);

  // Undo: step back one snapshot
  const handleSbUndo = useCallback(() => {
    if (sbHistoryIdx.current <= 0) return;
    sbHistoryIdx.current -= 1;
    const snap = sbHistoryRef.current[sbHistoryIdx.current];
    skipHistoryRef.current = true;
    setAssignmentsRaw({ ...snap });
    skipHistoryRef.current = false;
    setCanUndo(sbHistoryIdx.current > 0);
  }, []);

  // Track known clip durations so Shuffle All can skip too-short clips
  const clipDurationsRef = useRef({}); // clipPath → duration (seconds)
  const registerClipDuration = useCallback((clipPath, duration) => {
    clipDurationsRef.current[clipPath] = duration;
  }, []);

  const prevClipPathsRef    = useRef([]);
  const skipAssignEffect    = useRef(false); // set true when auto-fill manages assignments directly
  const godModeCounterRef   = useRef(0);     // tracks which god-mode runs we've already handled
  const godModePendingRef   = useRef(false); // true when god mode is waiting for scan to finish
  // Storyboard drag-to-reorder
  const dragSourceLineIdx  = useRef(null);  // lineIdx of card being dragged
  const dragUnassignedClip = useRef(null);  // clipPath if dragging from unassigned pool
  const dragOverRef        = useRef(null);  // ref copy so onDragOver guard works without stale closure
  const dragInsertAtRef    = useRef(null);  // computed insert index (for grid-level drop)
  const dragHoverCardRef   = useRef(null);  // actual hovered card lineIdx (for unassigned drops)
  const sbGridRef          = useRef(null);  // ref to the sb-grid container
  const [draggingIdx, setDraggingIdx]         = useState(null); // state-tracked so isDragging rerenders
  const [dragOverLineIdx, setDragOverLineIdx] = useState(null); // triggers indicator re-render

  const isLocked = !state.selectedSong;

  // ── Scan ──────────────────────────────────────────────────────
  const scanFolders = useCallback(async () => {
    setIsScanning(true); setDiagInfo(null);
    try {
      const folders = await window.electron.ipcRenderer.invoke('scan-footage-folders', FOOTAGE_ROOT);
      dispatch({ type: 'SET_ALL_FOOTAGE_FOLDERS', payload: folders });
      if (!folders.length) {
        const diag = await window.electron.ipcRenderer.invoke('diagnose-footage-path', FOOTAGE_ROOT);
        setDiagInfo(diag);
      }
    } catch (err) { setDiagInfo({ error: err.message }); }
    finally { setIsScanning(false); setHasScanned(true); }
  }, [dispatch]);

  useEffect(() => { if (!isLocked && !hasScanned) scanFolders(); }, [isLocked]); // eslint-disable-line

  useEffect(() => {
    if (isLocked) return;
    window.electron.ipcRenderer.invoke('watch-footage-folder', FOOTAGE_ROOT);
    const handler = updated => dispatch({ type: 'SET_ALL_FOOTAGE_FOLDERS', payload: updated });
    window.electron.ipcRenderer.on('footage-updated', handler);
    return () => {
      window.electron.ipcRenderer.removeListener('footage-updated', handler);
      window.electron.ipcRenderer.invoke('stop-footage-watcher');
    };
  }, [isLocked, dispatch]);

  // ── God Mode: auto-fill when triggered ───────────────────────
  useEffect(() => {
    if (state.godModeCounter === 0) return;
    if (state.godModeCounter === godModeCounterRef.current) return;
    godModeCounterRef.current = state.godModeCounter;
    if (!state.scriptLines.length) return;

    if (state.allAvailableFolders.length > 0) {
      // Folders already loaded — fill immediately
      handleAutoFill();
    } else {
      // Folders not scanned yet — mark pending so the completion effect fires.
      // Always kick off a scan (don't guard on isScanning — duplicate calls are
      // harmless and the guard was preventing the pending fill from ever running).
      godModePendingRef.current = true;
      if (!isScanning) scanFolders();
    }
  }, [state.godModeCounter]); // eslint-disable-line

  // ── Complete pending God Mode fill once folders are loaded ────
  useEffect(() => {
    if (!godModePendingRef.current) return;
    if (!state.allAvailableFolders.length || !state.scriptLines.length) return;
    godModePendingRef.current = false;
    handleAutoFill();
  }, [state.allAvailableFolders]); // eslint-disable-line

  // ── Restore saved storyboard on project load ──────────────────
  // Fires whenever a project is explicitly loaded (projectLoadId increments).
  // Seeds local assignments from state.storyboard and blocks the smart-assign
  // effect from randomizing over the restored order.
  useEffect(() => {
    if (!state.projectLoadId) return; // 0 = no project loaded yet
    if (!state.storyboard || !state.storyboard.some(Boolean)) return;
    const seeded = {};
    state.storyboard.forEach((clipPath, i) => { seeded[i] = clipPath || null; });
    setAssignments(seeded);
    skipAssignEffect.current = true;
    prevClipPathsRef.current = state.storyboard.filter(Boolean);
  }, [state.projectLoadId]); // eslint-disable-line

  // ── Smart assignment: append, don't replace ───────────────────
  useEffect(() => {
    const prev = prevClipPathsRef.current;
    const curr = state.selectedClipPaths;
    prevClipPathsRef.current = curr;

    if (!state.scriptLines.length || !curr.length) { setAssignments({}); return; }

    // Auto-fill manages assignments directly — skip this effect once
    if (skipAssignEffect.current) { skipAssignEffect.current = false; return; }

    const removedSet   = new Set(prev.filter(c => !curr.includes(c)));
    const isFirstLoad  = prev.length === 0;
    const lineCount    = state.scriptLines.length;

    setAssignments(prevMap => {
      const next = { ...prevMap };
      for (let i = 0; i < lineCount; i++) if (!(i in next)) next[i] = null;
      for (let i = 0; i < lineCount; i++) if (next[i] && removedSet.has(next[i])) next[i] = null;

      if (isFirstLoad) {
        const shuffled = [...curr].sort(() => Math.random() - 0.5);
        for (let i = 0; i < lineCount; i++) next[i] = i < shuffled.length ? shuffled[i] : null;
        return next;
      }

      const assigned = new Set(Object.values(next).filter(Boolean));
      const pool = curr.filter(c => !assigned.has(c));
      for (let i = 0; i < lineCount && pool.length; i++) if (!next[i]) next[i] = pool.shift();
      return next;
    });
  }, [state.selectedClipPaths, state.scriptLines]); // eslint-disable-line

  // ── Storyboard ────────────────────────────────────────────────
  const storyboard = useMemo(() => {
    if (!state.scriptLines.length) return { assigned: [], unassigned: [] };
    const assigned = state.scriptLines.map((line, i) => ({
      lineIdx: i, scriptLine: line,
      clipPath: assignments[i] || null,
      clipName: assignments[i] ? clipBasename(assignments[i]) : null,
    }));
    const usedSet = new Set(assigned.map(a => a.clipPath).filter(Boolean));
    const unassigned = state.selectedClipPaths.filter(c => !usedSet.has(c)).map(c => ({
      clipPath: c, clipName: clipBasename(c),
    }));
    return { assigned, unassigned };
  }, [state.scriptLines, state.selectedClipPaths, assignments]);


  // Sync storyboard assignments to global state so Phase 5 can read them
  useEffect(() => {
    const ordered = state.scriptLines.map((_, i) => assignments[i] || null);
    dispatch({ type: 'SET_STORYBOARD', payload: ordered });
  }, [assignments, state.scriptLines.length]); // eslint-disable-line

  // ── Shuffle / Clear / Auto-fill ───────────────────────────────
  const handleShuffleBoard = () => {
    setAssignments(prev => {
      const clips = state.scriptLines.map((_, i) => prev[i]).filter(Boolean);
      const shuffled = [...clips].sort(() => Math.random() - 0.5);
      const next = { ...prev }; let si = 0;
      for (let i = 0; i < state.scriptLines.length; i++) if (next[i]) next[i] = shuffled[si++];
      return next;
    });
  };

  const handleShuffleAll = () => {
    if (!state.selectedClipPaths.length || !state.scriptLines.length) return;
    const markers = state.markers || [];
    const lineCount = state.scriptLines.length;

    // Build per-slot durations from markers
    const slotDurations = Array.from({ length: lineCount }, (_, i) =>
      (markers[i] !== undefined && markers[i + 1] !== undefined)
        ? markers[i + 1] - markers[i]
        : 0
    );

    // Partition clips into "long enough for at least one slot" and the rest
    const knownDurs = clipDurationsRef.current;
    const allClips  = [...state.selectedClipPaths];

    // For each slot, pick a clip that is long enough (if one exists).
    // Falls back to any available clip so we never leave a slot empty.
    const shuffled = [...allClips].sort(() => Math.random() - 0.5);
    const remaining = [...shuffled];
    const next = {};

    for (let i = 0; i < lineCount; i++) {
      const need = slotDurations[i];
      if (!remaining.length) { next[i] = null; continue; }

      // Try to find a clip long enough for this slot
      const goodIdx = need > 0
        ? remaining.findIndex(c => {
            const d = knownDurs[c];
            return d === undefined || d >= need; // unknown duration: optimistically allow
          })
        : 0;

      const pickIdx = goodIdx >= 0 ? goodIdx : 0; // fall back to first available
      next[i] = remaining.splice(pickIdx, 1)[0];
    }

    setAssignments(next);
  };

  const handleClearAll = () => {
    dispatch({ type: 'CLEAR_ALL_FOOTAGE' });
    setAssignments({});
    prevClipPathsRef.current = [];
    // Reset undo history
    sbHistoryRef.current = [{}];
    sbHistoryIdx.current = 0;
    setCanUndo(false);
  };

  // Auto Fill: score folders by script keywords, select enough folders,
  // then assign best-matching clips per line. Works with zero pre-selected clips.
  const handleAutoFill = () => {
    if (!state.scriptLines.length || !state.allAvailableFolders.length) return;
    const lineCount   = state.scriptLines.length;
    const lines       = state.scriptLines;

    // Score every folder by how many script words match its name
    const scriptWords = new Set(
      state.scriptText.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
    );

    const scoredFolders = [...state.allAvailableFolders]
      .map(f => ({
        f,
        score: f.name.toLowerCase().split(/[\s_-]+/).filter(w => scriptWords.has(w)).length,
      }))
      .sort((a, b) => b.score - a.score || b.f.clipCount - a.f.clipCount);

    // Greedily pick folders until we have enough clips to fill all lines
    const pickedFolders = [];
    const poolClips = [];
    for (const { f } of scoredFolders) {
      if (poolClips.length >= lineCount) break;
      pickedFolders.push(f);
      poolClips.push(...f.clips);
    }
    // If still not enough (shouldn't happen with large libraries), just use all
    if (!pickedFolders.length) return;

    // Build assignments: for each line, find best-matching clip by keywords
    const available = [...poolClips];
    const newAssignments = {};
    for (let i = 0; i < lineCount; i++) {
      if (!available.length) break;
      const lineWords = new Set(
        lines[i].toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
      );
      let best = available[0], bestScore = -1;
      for (const c of available) {
        const score = [...lineWords].filter(w => clipBasename(c).toLowerCase().includes(w)).length;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      newAssignments[i] = best;
      available.splice(available.indexOf(best), 1);
    }

    // Tell the assignment useEffect to skip — we're managing it here
    skipAssignEffect.current = true;
    prevClipPathsRef.current = poolClips; // keep ref in sync

    // Atomically update folder selection and clips
    dispatch({ type: 'SET_FOOTAGE_FOLDERS', payload: pickedFolders });
    setAssignments(newAssignments);
  };

  // ── Drag: insert-reorder with white-line drop indicator ───────
  const handleSbDragStart = useCallback((e, lineIdx) => {
    dragSourceLineIdx.current = lineIdx;
    dragUnassignedClip.current = null;
    dragOverRef.current = null;
    dragInsertAtRef.current = null;
    dragHoverCardRef.current = null;
    setDraggingIdx(lineIdx);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Grid-level dragover: use getBoundingClientRect on each card to find
  // which card the cursor is over and whether it's the left or right half.
  // Left half → insert before that card; right half → insert after it.
  // This eliminates the +1 jump caused by child-element dragover misfires.
  const handleSbGridDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const isDraggingStoryboard = dragSourceLineIdx.current !== null;
    const isDraggingUnassigned = dragUnassignedClip.current !== null;
    if (!isDraggingStoryboard && !isDraggingUnassigned) return;

    const from = dragSourceLineIdx.current;
    const grid = sbGridRef.current;
    if (!grid) return;

    const cards = [...grid.querySelectorAll('[data-line-idx]')];
    let hoverCard = null;
    let isRightHalf = false;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        hoverCard = parseInt(card.dataset.lineIdx, 10);
        isRightHalf = e.clientX > rect.left + rect.width / 2;
        break;
      }
    }

    dragHoverCardRef.current = hoverCard;
    if (hoverCard === null) return;

    if (isDraggingStoryboard) {
      if (hoverCard === from) return; // hovering the source card — no indicator

      // Compute where the card will be spliced in after removal of `from`
      let insertAt, indicatorIdx;
      if (isRightHalf) {
        // Drop after hoverCard
        insertAt    = hoverCard >= from ? hoverCard : hoverCard + 1;
        indicatorIdx = hoverCard + 1; // show line before the next card
      } else {
        // Drop before hoverCard
        insertAt    = hoverCard > from ? hoverCard - 1 : hoverCard;
        indicatorIdx = hoverCard;      // show line before this card
      }

      dragInsertAtRef.current = insertAt;
      if (dragOverRef.current !== indicatorIdx) {
        dragOverRef.current = indicatorIdx;
        setDragOverLineIdx(indicatorIdx);
      }
    } else {
      // Unassigned clip drag — show indicator directly on hovered card
      dragInsertAtRef.current = null;
      if (dragOverRef.current !== hoverCard) {
        dragOverRef.current = hoverCard;
        setDragOverLineIdx(hoverCard);
      }
    }
  }, []);

  const handleSbDragEnd = useCallback(() => {
    dragSourceLineIdx.current = null;
    dragUnassignedClip.current = null;
    dragOverRef.current = null;
    dragInsertAtRef.current = null;
    dragHoverCardRef.current = null;
    setDraggingIdx(null);
    setDragOverLineIdx(null);
  }, []);

  // Grid-level drop: reads insertAt (storyboard reorder) or hoverCard (unassigned swap)
  const handleSbGridDrop = useCallback((e) => {
    e.preventDefault();
    const from     = dragSourceLineIdx.current;
    const insertAt = dragInsertAtRef.current;

    // Re-resolve hover card at drop position (more reliable than cached ref)
    let hoverCard = dragHoverCardRef.current;
    const grid = sbGridRef.current;
    if (grid && hoverCard === null) {
      const cards = [...grid.querySelectorAll('[data-line-idx]')];
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom) {
          hoverCard = parseInt(card.dataset.lineIdx, 10);
          break;
        }
      }
    }

    if (from !== null && insertAt !== null && insertAt !== from) {
      setAssignments(prev => {
        const lineCount = state.scriptLines.length;
        const clips = Array.from({ length: lineCount }, (_, i) => prev[i] ?? null);
        const [moved] = clips.splice(from, 1);
        clips.splice(insertAt, 0, moved);
        const next = {};
        for (let i = 0; i < lineCount; i++) next[i] = clips[i];
        return next;
      });
    }

    // Unassigned → storyboard swap: also handle case where source is null (pure unassigned drag)
    if (dragUnassignedClip.current && hoverCard !== null) {
      const clipToPlace = dragUnassignedClip.current;
      setAssignments(prev => ({ ...prev, [hoverCard]: clipToPlace }));
    }

    dragSourceLineIdx.current = null;
    dragUnassignedClip.current = null;
    dragInsertAtRef.current = null;
    dragHoverCardRef.current = null;
    dragOverRef.current = null;
    setDraggingIdx(null);
    setDragOverLineIdx(null);
  }, [state.scriptLines.length]);

  const handleUnassignedDragStart = useCallback((e, clipPath) => {
    dragSourceLineIdx.current = null;
    dragUnassignedClip.current = clipPath;
    dragInsertAtRef.current = null;
    dragHoverCardRef.current = null;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // ── Preview modal ─────────────────────────────────────────────
  const openPreview = (lineIdx) => {
    const clips = storyboard.assigned.filter(a => a.clipPath);
    const startIdx = Math.max(0, clips.findIndex(a => a.lineIdx === lineIdx));
    setPreviewModal({ clips, startIdx });
  };

  // ── Theme toggle ──────────────────────────────────────────────
  const toggleTheme = (theme) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      next.has(theme) ? next.delete(theme) : next.add(theme);
      return next;
    });
  };

  // ── Folder suggestions from script ────────────────────────────
  const folderSuggestions = useMemo(() => {
    if (!state.scriptText || !state.allAvailableFolders.length) return [];
    const words = new Set(
      state.scriptText.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
    );
    if (!words.size) return [];
    const sel = new Set(state.selectedFootageFolders.map(f => f.path));
    return state.allAvailableFolders
      .filter(f => !sel.has(f.path))
      .map(f => ({ f, score: f.name.toLowerCase().split(/[\s_-]+/).filter(w => words.has(w)).length }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6).map(({ f }) => f);
  }, [state.scriptText, state.allAvailableFolders, state.selectedFootageFolders]);

  // ── Grouped folders ───────────────────────────────────────────
  const groupedFolders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term) return null; // search mode — handled separately
    return groupFoldersByTheme(state.allAvailableFolders);
  }, [state.allAvailableFolders, search]);

  // ── Search results: flat list of matching clips ───────────────
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const results = [];
    for (const folder of state.allAvailableFolders) {
      for (const clip of folder.clips) {
        if (clipBasename(clip).toLowerCase().includes(term) || folder.name.toLowerCase().includes(term)) {
          results.push({ clip, folderName: folder.name, folder });
        }
      }
    }
    return results;
  }, [state.allAvailableFolders, search]);

  const assignedCount = storyboard.assigned.filter(a => a.clipPath).length;
  const isReady = assignedCount === state.scriptLines.length && state.scriptLines.length > 0;

  const preview = state.selectedFootageFolders.length > 0
    ? <>
        <span className="preview-pill done">{state.selectedFootageFolders.length} folder{state.selectedFootageFolders.length !== 1 ? 's' : ''}</span>
        <span className="preview-pill done">{state.selectedClipPaths.length} clips</span>
        {storyboard.assigned.length > 0 && <span className="preview-pill done">{assignedCount}/{state.scriptLines.length} assigned</span>}
      </>
    : <span className="preview-pill empty">No footage selected</span>;

  return (
    <PhaseSection phaseNum={4} title="Footage" preview={preview} locked={isLocked}>

      {/* Preview modal */}
      {previewModal && (
        <VideoPreviewModal
          clips={previewModal.clips}
          startIdx={previewModal.startIdx}
          onClose={() => setPreviewModal(null)}
        />
      )}

      {isLocked && <div className="phase-lock-notice">Select a song first.</div>}

      {!isLocked && (
        <div className="phase-content">

          {/* Search + Refresh */}
          <div className="footage-top-row">
            <div className="footage-search-wrap">
              <span className="footage-search-icon">⌕</span>
              <input className="footage-search-input" type="text" placeholder="Search folders or clips…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="footage-search-clear" onClick={() => setSearch('')}>X</button>}
            </div>
            <button className="footage-refresh-btn" onClick={scanFolders} disabled={isScanning}>
              {isScanning ? 'Scanning…' : 'Refresh'}
            </button>
          </div>

          {/* Script-based folder suggestions + Auto Fill in same row */}
          {(folderSuggestions.length > 0 || (state.scriptLines.length > 0 && state.allAvailableFolders.length > 0)) && (
            <div className="footage-suggestions-row">
              <span className="footage-suggestions-label">Suggested:</span>
              {folderSuggestions.map(folder => (
                <button key={folder.path} className="footage-suggestion-chip"
                  onClick={() => dispatch({ type: 'TOGGLE_FOOTAGE_FOLDER', payload: folder })}
                  title={`${folder.clipCount} clips — click to add`}>
                  + {folder.name} <span className="suggestion-chip-count">{folder.clipCount}</span>
                </button>
              ))}
              {state.scriptLines.length > 0 && state.allAvailableFolders.length > 0 && (
                <button className="footage-suggestion-chip footage-autofill-chip" onClick={handleAutoFill}>
                  ✦ Auto Fill
                </button>
              )}
            </div>
          )}

          {/* Status */}
          {isScanning && <div className="footage-status">Scanning…</div>}
          {!isScanning && hasScanned && !state.allAvailableFolders.length && (
            <div className="footage-status footage-status-empty">
              {diagInfo?.error
                ? <div className="diag-row diag-error">Error: {diagInfo.error}</div>
                : <>No footage found — folder may be empty or still processing.<br /><code>{FOOTAGE_ROOT}</code></>}
              <span style={{ fontSize: 11, color: '#555', marginTop: 8, display: 'block' }}>Click Refresh to scan again.</span>
            </div>
          )}

          {/* Search results — flat clip grid */}
          {searchResults && (
            <div className="footage-themes-section">
              <div className="footage-section-label">
                {searchResults.length === 0
                  ? 'No clips found'
                  : <>{searchResults.length} clip{searchResults.length !== 1 ? 's' : ''} found</>}
              </div>
              {searchResults.length > 0 && (
                <div className="footage-search-results-grid">
                  {searchResults.map(({ clip, folderName }) => (
                    <SearchClipCard
                      key={clip}
                      clipPath={clip}
                      folderName={folderName}
                      isSelected={state.selectedClipPaths.includes(clip)}
                      onToggle={() => dispatch({ type: 'TOGGLE_CLIP_PATH', payload: clip })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Folder themes — shown when not searching */}
          {!searchResults && groupedFolders && groupedFolders.length > 0 && (
            <div className="footage-themes-section">
              <div className="footage-section-label">
                Folders <span className="footage-section-count">{state.allAvailableFolders.length}</span>
              </div>
              {groupedFolders.map(({ theme, folders }) => {
                const isExpanded = expandedThemes.has(theme);
                const selCount = folders.filter(f => state.selectedFootageFolders.some(sf => sf.path === f.path)).length;
                return (
                  <div key={theme} className="footage-theme-group">
                    <button className="footage-theme-header" onClick={() => toggleTheme(theme)}>
                      <span className="footage-theme-chevron">{isExpanded ? '▼' : '▸'}</span>
                      <span className="footage-theme-name">{theme}</span>
                      {!isExpanded && selCount > 0 && (
                        <span className="footage-theme-selected-count">{selCount} selected</span>
                      )}
                      <span className="footage-theme-count">{folders.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="footage-theme-preview-grid">
                        {folders.map(folder => {
                          const isSelected = state.selectedFootageFolders.some(f => f.path === folder.path);
                          return (
                            <FolderPreviewCard
                              key={folder.path}
                              folder={folder}
                              isSelected={isSelected}
                              onToggle={() => dispatch({ type: 'TOGGLE_FOOTAGE_FOLDER', payload: folder })}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected folders summary */}
          {state.selectedFootageFolders.length > 0 && (
            <div className="footage-selected-summary">
              <span className="footage-selected-summary-label">Selected folders</span>
              <div className="footage-selected-chips">
                {state.selectedFootageFolders.map(folder => (
                  <div key={folder.path} className="footage-selected-chip">
                    <span className="footage-selected-chip-name">{folder.name}</span>
                    <span className="footage-selected-chip-count">{folder.clipCount}</span>
                    <button className="footage-selected-chip-remove"
                      onClick={() => dispatch({ type: 'TOGGLE_FOOTAGE_FOLDER', payload: folder })}
                      title="Remove">X</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Storyboard */}
          {state.selectedClipPaths.length > 0 && state.scriptLines.length > 0 && (
            <div className="footage-storyboard-section">
              <div className="footage-section-label">
                Storyboard
                <span className="footage-section-count">{assignedCount}/{state.scriptLines.length} assigned</span>
                <div className="storyboard-action-btns">
                  <button
                    className="storyboard-undo-btn"
                    onClick={handleSbUndo}
                    disabled={!canUndo}
                    title="Undo last storyboard change"
                  >
                    ↩ Undo
                  </button>
                  <button className="storyboard-shuffle-btn" onClick={handleShuffleBoard} title="Shuffle only clips in storyboard">
                    Shuffle Storyboard
                  </button>
                  <button className="storyboard-shuffle-btn" onClick={handleShuffleAll} title="Reshuffle all clips, skipping too-short ones">
                    Shuffle All
                  </button>
                  <button className="storyboard-clear-btn" onClick={handleClearAll}>Clear All</button>
                </div>
              </div>

              <div
                className="sb-grid"
                ref={sbGridRef}
                onDragOver={handleSbGridDragOver}
                onDrop={handleSbGridDrop}
              >
                {storyboard.assigned.map(entry => {
                  // Slot duration = time between this marker and the next
                  const markers = state.markers || [];
                  const i = entry.lineIdx;
                  const slotDuration = (markers[i] !== undefined && markers[i + 1] !== undefined)
                    ? markers[i + 1] - markers[i]
                    : 0;
                  return (
                    <StoryboardCard
                      key={entry.lineIdx}
                      entry={entry}
                      isAssigned={true}
                      isMissing={!entry.clipPath}
                      isDragging={entry.lineIdx === draggingIdx}
                      isDragTarget={entry.lineIdx === dragOverLineIdx && dragOverLineIdx !== null && entry.lineIdx !== draggingIdx}
                      onDragStart={e => entry.clipPath && handleSbDragStart(e, entry.lineIdx)}
                      onDragEnd={handleSbDragEnd}
                      onDoubleClick={() => entry.clipPath && openPreview(entry.lineIdx)}
                      slotDuration={slotDuration}
                      onDurationKnown={registerClipDuration}
                    />
                  );
                })}
              </div>

              {storyboard.unassigned.length > 0 && (
                <div className="footage-unassigned-section">
                  <div className="footage-unassigned-label">
                    Unused ({storyboard.unassigned.length}) — drag onto a storyboard card to swap
                  </div>
                  <div className="sb-grid sb-grid--unassigned">
                    {storyboard.unassigned.map(entry => (
                      <StoryboardCard
                        key={entry.clipPath}
                        entry={entry}
                        isAssigned={false}
                        isMissing={false}
                        isDragging={false}
                        isDragTarget={false}
                        onDragStart={e => handleUnassignedDragStart(e, entry.clipPath)}
                        onDragEnd={handleSbDragEnd}
                        onDoubleClick={() => openPreview(-1)}
                        onDurationKnown={registerClipDuration}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      )}
    </PhaseSection>
  );
}
