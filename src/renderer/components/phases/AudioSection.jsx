import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppContext } from '../../App';
import '../sections.css';
import './AudioSection.css';
import PhaseSection from '../PhaseSection';

const SONG_ROOT = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Song Choices/1 Line';
const REFRESH_INTERVAL = 5000;
const ZOOM_STEP = 1.6;
const ZOOM_MIN = 1;
const ZOOM_MAX = 16;

const MOOD_EMOJI = {
  'Joyful Celebratory':    '',
  'Peaceful Contemplative':'',
  'Powerful Inspiring':    '',
  'Sorrowful Reflective':  '',
  'Worshipful Intimate':   '',
};
const getMoodEmoji = (name) => MOOD_EMOJI[name] || '';

export default function AudioSection() {
  const { state, dispatch } = useContext(AppContext);
  const audioRef        = useRef(null);
  const seekerRef       = useRef(null);
  const canvasRef       = useRef(null);
  const rulerRef        = useRef(null);   // timecode ruler canvas
  const rawDataRef      = useRef(null);   // { data, globalMax, duration }
  const rafRef          = useRef(null);
  const saveDebounceRef = useRef(null);   // timer for labels auto-save
  const lastDragTimeRef = useRef(null);   // last time position during cut-marker drag

  // ── Marker undo/redo history (refs = no re-renders) ───────────
  const histStack          = useRef([]);   // array of { markers, fadeMarkers } snapshots
  const histIdx            = useRef(-1);   // pointer into histStack
  const liveMarkersRef     = useRef([]);   // always mirrors state.markers
  const liveFadeMarkersRef = useRef([]);   // always mirrors state.fadeMarkers
  const dragStartMarkers   = useRef(null); // snapshot taken on mousedown
  const dragStartFadeRef   = useRef(null); // fade marker snapshot on mousedown

  const [categories,          setCategories]          = useState([]);
  const [selectedCategory,    setSelectedCategory]    = useState(null);
  const [isSongDropdownOpen,  setIsSongDropdownOpen]  = useState(false);
  const selectedCategoryRef = useRef(null);
  const [audioDuration,       setAudioDuration]       = useState(0);
  const [currentTime,         setCurrentTime]         = useState(0);
  const [isPlaying,           setIsPlaying]           = useState(false);
  const [draggingMarkerIdx,   setDraggingMarkerIdx]   = useState(null);
  const [zoom,                setZoom]                = useState(1);
  const [viewStart,           setViewStart]           = useState(0);     // seconds

  // ── Fade marker state ─────────────────────────────────────────
  const [draggingFadeId,  setDraggingFadeId]  = useState(null);
  const [editingFadeId,   setEditingFadeId]   = useState(null);
  const [fadeDurDraft,    setFadeDurDraft]    = useState('');

  // ── Multi-select + group drag ─────────────────────────────────
  // Keys: 'cut:N' for cut marker index N, 'fade:ID' for fade marker ID
  const [selection,    setSelection]    = useState(new Set());
  const selectionRef                    = useRef(new Set());
  const [marqueeRect,  setMarqueeRect]  = useState(null); // { left, top, width, height } in px

  // ── Derived: visible time window ──────────────────────────────
  // MUST be before the closure refs that use visibleDuration
  const visibleDuration = audioDuration > 0 ? audioDuration / zoom : 1;

  // ── Stable refs for use inside closures (initialised after derived values) ──
  const visibleDurationRef = useRef(visibleDuration); // safe: visibleDuration now defined above
  const audioDurationRef   = useRef(audioDuration);
  const viewStartRef       = useRef(viewStart);
  const isPlayingRef       = useRef(isPlaying);

  const timeToPercent = useCallback((t) =>
    ((t - viewStart) / visibleDuration) * 100,
  [viewStart, visibleDuration]);

  // ── RAF-based smooth playhead ─────────────────────────────────
  useEffect(() => {
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Keep live refs in sync with global state ─────────────────
  useEffect(() => { liveMarkersRef.current     = state.markers; },         [state.markers]);
  useEffect(() => { liveFadeMarkersRef.current = state.fadeMarkers || []; }, [state.fadeMarkers]);
  useEffect(() => { selectionRef.current       = selection; },              [selection]);
  useEffect(() => { visibleDurationRef.current = visibleDuration; },        [visibleDuration]);
  useEffect(() => { audioDurationRef.current   = audioDuration; },          [audioDuration]);
  useEffect(() => { viewStartRef.current       = viewStart; },              [viewStart]);
  useEffect(() => { isPlayingRef.current       = isPlaying; },              [isPlaying]);

  // ── Auto-save labels file 800 ms after any marker change ─────
  // Writes Audacity-format labels1.txt back to the song folder.
  // If the song has no labels file yet, creates labels1.txt inside the song folder.
  useEffect(() => {
    const song = state.selectedSong;
    if (!song || (!state.markers.length && !(state.fadeMarkers || []).length)) return;

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);

    saveDebounceRef.current = setTimeout(async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('save-labels-file', {
          labelsPath:  song.labelsPath || null,
          songDir:     song.path,
          markers:     state.markers,
          fadeMarkers: state.fadeMarkers || [],
        });
        if (result.success) {
          console.log('[AudioSection] Labels saved:', result.labelsPath);
          // If a new labels file was just created, update state so future saves hit it
          if (!song.labelsPath && result.labelsPath) {
            dispatch({ type: 'UPDATE_SONG_LABELS_PATH', payload: result.labelsPath });
          }
        } else {
          console.warn('[AudioSection] Labels save failed:', result.error);
        }
      } catch (err) {
        console.error('[AudioSection] Labels save error:', err);
      }
    }, 800);

    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [state.markers, state.fadeMarkers, state.selectedSong?.labelsPath, state.selectedSong?.path]); // eslint-disable-line

  // Reset history when a new song is loaded
  useEffect(() => {
    if (!state.selectedSong) return;
    histStack.current = [{ markers: [...state.markers], fadeMarkers: [...(state.fadeMarkers || [])] }];
    histIdx.current   = 0;
  }, [state.selectedSong?.path]); // eslint-disable-line

  // Push a unified { markers, fadeMarkers } snapshot into history.
  // newFadeMarkers defaults to the current live value if not provided.
  const recordHistory = useCallback((newMarkers, newFadeMarkers) => {
    const fm = newFadeMarkers !== undefined ? newFadeMarkers : liveFadeMarkersRef.current;
    histStack.current = histStack.current.slice(0, histIdx.current + 1);
    histStack.current.push({ markers: [...newMarkers], fadeMarkers: [...fm] });
    histIdx.current = histStack.current.length - 1;
  }, []);

  // Keyboard shortcuts: Cmd+Z undo, Cmd+Shift+Z redo, Space = play/pause
  useEffect(() => {
    const onKey = (e) => {
      // Space = play/pause (skip if user is typing in an input)
      if (e.key === ' ') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          const audio = audioRef.current;
          if (audio) isPlayingRef.current ? audio.pause() : audio.play();
        }
        return;
      }

      // Plus/Equals = zoom in, Minus = zoom out
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(prev => Math.min(prev * 1.2, 8));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(prev => Math.max(prev / 1.2, 1));
        return;
      }

      const mod = navigator.platform.toUpperCase().includes('MAC') ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (histIdx.current <= 0) return;
        histIdx.current--;
        dispatch({ type: 'RESTORE_HISTORY', payload: histStack.current[histIdx.current] });
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        if (histIdx.current >= histStack.current.length - 1) return;
        histIdx.current++;
        dispatch({ type: 'RESTORE_HISTORY', payload: histStack.current[histIdx.current] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // ── Auto-pan: keep playhead visible while playing ─────────────
  useEffect(() => {
    if (!isPlaying || !audioDuration) return;
    if (currentTime < viewStart || currentTime > viewStart + visibleDuration) {
      const newStart = Math.max(0, Math.min(
        audioDuration - visibleDuration,
        currentTime - visibleDuration * 0.1,
      ));
      setViewStart(newStart);
    }
  }, [currentTime]); // eslint-disable-line

  // ── Waveform draw ─────────────────────────────────────────────
  const drawWaveformView = useCallback((vStart, zm) => {
    const canvas = canvasRef.current;
    const pcm    = rawDataRef.current;
    if (!canvas || !pcm) return;

    const { data, globalMax, duration } = pcm;
    const visDur    = duration / zm;
    const startFrac = Math.max(0, vStart / duration);
    const endFrac   = Math.min(1, (vStart + visDur) / duration);
    const startSamp = Math.floor(startFrac * data.length);
    const endSamp   = Math.floor(endFrac   * data.length);
    const sampCount = Math.max(1, endSamp - startSamp);

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;
    const blockSize = Math.max(1, Math.floor(sampCount / w));

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(80, 160, 255, 0.9)';

    for (let i = 0; i < w; i++) {
      let mn = 0, mx = 0;
      for (let j = 0; j < blockSize; j++) {
        const idx = startSamp + i * blockSize + j;
        if (idx < data.length) {
          const s = data[idx] / globalMax;
          if (s > mx) mx = s;
          if (s < mn) mn = s;
        }
      }
      const yTop = mid - mx * mid * 0.95;
      const yBot = mid - mn * mid * 0.95;
      ctx.fillRect(i, yTop, 1, Math.max(1, yBot - yTop));
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }, []);


  // ── Timecode ruler draw ───────────────────────────────────────
  const drawRuler = useCallback(() => {
    const canvas = rulerRef.current;
    if (!canvas || audioDuration === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;   // 1200 (fixed attribute, CSS stretches it)
    const h = canvas.height;  // 22

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(8, 16, 26, 0.94)';
    ctx.fillRect(0, 0, w, h);

    // Top border
    ctx.strokeStyle = 'rgba(0, 188, 212, 0.28)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();

    // Choose a nice tick interval so labels are at least ~55px apart
    const pixPerSec = w / visibleDuration;
    const rawInterval = 55 / pixPerSec;
    const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const interval = niceIntervals.find(n => n >= rawInterval) ?? 300;
    const minorInterval = interval / 5;

    const firstMinor = Math.ceil(viewStart / minorInterval) * minorInterval;
    for (let t = firstMinor; t <= viewStart + visibleDuration + 0.001; t += minorInterval) {
      const x       = ((t - viewStart) / visibleDuration) * w;
      const isMajor = (Math.round(t / minorInterval) % 5) === 0;

      if (isMajor) {
        ctx.strokeStyle = 'rgba(0, 210, 240, 0.55)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 10);
        ctx.stroke();

        const mins  = Math.floor(t / 60);
        const secs  = Math.floor(t % 60);
        const label = `${mins}:${secs.toString().padStart(2, '0')}`;
        ctx.fillStyle  = 'rgba(255, 255, 255, 0.9)';
        ctx.font       = '10px system-ui, -apple-system, sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText(label, x, h - 3);
      } else {
        ctx.strokeStyle = 'rgba(0, 188, 212, 0.22)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 5);
        ctx.stroke();
      }
    }
  }, [viewStart, visibleDuration, audioDuration]);

  // Redraw ruler whenever view changes
  useEffect(() => { drawRuler(); }, [drawRuler]);

  // Decode audio on song change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.selectedSongAudioPath) return;
    let cancelled = false;

    (async () => {
      try {
        const response    = await fetch(`file://${state.selectedSongAudioPath}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();
        if (cancelled) return;

        const data = audioBuffer.getChannelData(0);
        let globalMax = 0;
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]);
          if (a > globalMax) globalMax = a;
        }
        if (globalMax === 0) globalMax = 1;

        rawDataRef.current = { data, globalMax, duration: audioBuffer.duration };

        // Reset zoom/pan then draw
        setZoom(1);
        setViewStart(0);
        drawWaveformView(0, 1);
      } catch (err) {
        console.error('Waveform decode error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [state.selectedSongAudioPath, drawWaveformView]);

  // Redraw whenever zoom or viewStart changes
  useEffect(() => {
    drawWaveformView(viewStart, zoom);
  }, [zoom, viewStart, drawWaveformView]);


  // ── Audio events ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta  = () => setAudioDuration(audio.duration);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play',  onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play',  onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [state.selectedSong]);

  // Keep ref in sync so loadCategories doesn't need selectedCategory as a dep
  useEffect(() => { selectedCategoryRef.current = selectedCategory; }, [selectedCategory]);

  // ── Auto-restore category on project load ─────────────────────
  // When categories finish loading and a song is already selected (restored
  // project) but no mood card has been clicked yet, find and set the matching
  // category so the song dropdown is immediately clickable.
  useEffect(() => {
    if (!categories.length || !state.selectedSong || selectedCategoryRef.current) return;
    const match = categories.find(c => c.songs.some(s => s.path === state.selectedSong.path));
    if (match) setSelectedCategory(match);
  }, [categories, state.selectedSong]); // eslint-disable-line

  // ── Load categories ───────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    try {
      const cats = await window.electron.scanCategories(SONG_ROOT);
      setCategories(cats);
      // Publish all songs to global state so God Mode can pick one randomly
      dispatch({ type: 'SET_AVAILABLE_SONGS', payload: cats.flatMap(c => c.songs) });
      const sc = selectedCategoryRef.current;
      if (sc) {
        const refreshed = cats.find(c => c.path === sc.path);
        if (refreshed) setSelectedCategory(refreshed);
      }
    } catch (err) {
      console.error('Failed to scan categories:', err);
    }
  }, [dispatch]); // selectedCategory removed — read via ref to avoid reload loop

  useEffect(() => {
    loadCategories();
    const interval = setInterval(loadCategories, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadCategories]);

  // ── Group drag: move all selected markers + fade markers together ──
  const startGroupDrag = useCallback((e) => {
    e.stopPropagation();
    const startX        = e.clientX;
    const startMarkers  = [...liveMarkersRef.current];
    const startFades    = [...liveFadeMarkersRef.current];
    const sel           = new Set(selectionRef.current);

    const onMove = (ev) => {
      const rect = seekerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dt = ((ev.clientX - startX) / rect.width) * visibleDurationRef.current;
      const clamp = (t) => Math.max(0, Math.min(audioDurationRef.current, t));

      const newMarkers = startMarkers.map((t, i) =>
        sel.has(`cut:${i}`) ? clamp(t + dt) : t
      );
      const newFades = startFades.map(fm =>
        sel.has(`fade:${fm.id}`) && fm.time !== 'first'
          ? { ...fm, time: clamp(resolveFadeTime(fm) + dt) }
          : fm
      );
      dispatch({ type: 'UPDATE_MARKERS',   payload: newMarkers });
      dispatch({ type: 'SET_FADE_MARKERS', payload: newFades });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      const sorted = [...liveMarkersRef.current].sort((a, b) => a - b);
      dispatch({ type: 'UPDATE_MARKERS', payload: sorted });
      recordHistory(sorted, liveFadeMarkersRef.current);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [dispatch, recordHistory]);

  // ── Cut marker drag ───────────────────────────────────────────
  const handleMarkerMouseDown = (e, index) => {
    e.stopPropagation();
    const key = `cut:${index}`;

    if (e.shiftKey) {
      // Shift+click: toggle this marker in the selection
      const next = new Set(selectionRef.current);
      next.has(key) ? next.delete(key) : next.add(key);
      selectionRef.current = next;
      setSelection(next);
      return;
    }

    if (selectionRef.current.has(key) && selectionRef.current.size > 1) {
      // Drag the whole group
      startGroupDrag(e);
      return;
    }

    // Single drag — select just this one
    const next = new Set([key]);
    selectionRef.current = next;
    setSelection(next);
    dragStartMarkers.current = [...liveMarkersRef.current];
    setDraggingMarkerIdx(index);
  };

  useEffect(() => {
    if (draggingMarkerIdx === null) return;
    const handleMouseMove = (e) => {
      if (!seekerRef.current || !audioDuration) return;
      const rect    = seekerRef.current.getBoundingClientRect();
      const ratio   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = Math.max(0, Math.min(audioDuration, viewStart + ratio * visibleDuration));
      lastDragTimeRef.current = newTime;
      const newMarkers = [...state.markers];
      newMarkers[draggingMarkerIdx] = newTime;
      dispatch({ type: 'UPDATE_MARKERS', payload: newMarkers.sort((a, b) => a - b) });
    };
    const handleMouseUp = () => {
      if (dragStartMarkers.current) {
        const final   = liveMarkersRef.current;
        const changed = final.some((t, i) => t !== dragStartMarkers.current[i]);
        if (changed) recordHistory([...final]);
        dragStartMarkers.current = null;
      }
      // Seek to the dropped position and start playing
      const dropTime = lastDragTimeRef.current;
      lastDragTimeRef.current = null;
      if (dropTime !== null && audioRef.current) {
        audioRef.current.currentTime = dropTime;
        audioRef.current.play();
      }
      setDraggingMarkerIdx(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup',   handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup',   handleMouseUp);
    };
  }, [draggingMarkerIdx, state.markers, audioDuration, viewStart, visibleDuration, dispatch, recordHistory]);

  // ── Remove cut marker on right-click ─────────────────────────
  const handleMarkerRightClick = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const newMarkers = state.markers.filter((_, i) => i !== idx);
    recordHistory(newMarkers);
    dispatch({ type: 'UPDATE_MARKERS', payload: newMarkers });
    // Remove from selection
    const next = new Set(selectionRef.current);
    next.delete(`cut:${idx}`);
    selectionRef.current = next;
    setSelection(next);
  };

  // ── Add marker at current playhead position ───────────────────
  const handleAddMarkerAtPlayhead = () => {
    if (!audioDuration) return;
    const newMarkers = [...state.markers, currentTime].sort((a, b) => a - b);
    recordHistory(newMarkers);
    dispatch({ type: 'UPDATE_MARKERS', payload: newMarkers });
  };

  // ── Clear ALL markers and fade markers ───────────────────────
  const handleClearAll = () => {
    recordHistory([], []);
    dispatch({ type: 'UPDATE_MARKERS',   payload: [] });
    dispatch({ type: 'SET_FADE_MARKERS', payload: [] });
    selectionRef.current = new Set();
    setSelection(new Set());
  };

  // ── Seeker mousedown: marquee (top badge zone) vs pan/seek (waveform) ──
  const handleSeekerMouseDown = (e) => {
    if (!audioDuration) return;
    // Ignore if clicking directly on a marker badge/line
    if (e.target.closest(
      '.marker-num-badge, .seeker-fade-badge, .seeker-fade-line, .seeker-marker'
    )) return;

    const rect = seekerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relY = e.clientY - rect.top;

    // ── Top 32 px = badge zone → MARQUEE selection ──────────────
    if (relY < 32) {
      if (!e.shiftKey) {
        selectionRef.current = new Set();
        setSelection(new Set());
      }
      const startRelX = e.clientX - rect.left;
      const startRelY = relY;

      const onMove = (ev) => {
        const curRelX = ev.clientX - rect.left;
        const curRelY = ev.clientY - rect.top;
        setMarqueeRect({
          left:   Math.min(startRelX, curRelX),
          top:    Math.min(startRelY, curRelY),
          width:  Math.abs(curRelX - startRelX),
          height: Math.abs(curRelY - startRelY),
        });
      };

      const onUp = (ev) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        setMarqueeRect(null);

        const curRelX = ev.clientX - rect.left;
        const minX    = Math.min(startRelX, curRelX);
        const maxX    = Math.max(startRelX, curRelX);
        if (maxX - minX < 4) return; // tiny drag — ignore

        const minT = viewStartRef.current + (minX / rect.width) * visibleDurationRef.current;
        const maxT = viewStartRef.current + (maxX / rect.width) * visibleDurationRef.current;

        const next = new Set(e.shiftKey ? selectionRef.current : []);
        liveMarkersRef.current.forEach((t, i) => {
          if (t >= minT && t <= maxT) next.add(`cut:${i}`);
        });
        liveFadeMarkersRef.current.forEach(fm => {
          let t = fm.time;
          if (t === 'first') t = liveMarkersRef.current[0] ?? 0;
          if (t === 'last')  t = liveMarkersRef.current[liveMarkersRef.current.length - 1] ?? 0;
          if (typeof t === 'number' && t >= minT && t <= maxT) next.add(`fade:${fm.id}`);
        });
        selectionRef.current = next;
        setSelection(new Set(next));
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
      return;
    }

    // ── Below badge zone → PAN (drag) or SEEK (quick click) ─────
    selectionRef.current = new Set();
    setSelection(new Set());

    const startX         = e.clientX;
    const startViewStart = viewStartRef.current;
    let   hasMoved       = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) < 5) return;
      hasMoved = true;
      const dt  = -(dx / rect.width) * visibleDurationRef.current;
      const max = Math.max(0, audioDurationRef.current - visibleDurationRef.current);
      setViewStart(Math.max(0, Math.min(max, startViewStart + dt)));
    };

    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (!hasMoved) {
        if (!audioRef.current) return;
        const ratio = (ev.clientX - rect.left) / rect.width;
        const t = Math.max(0, Math.min(audioDurationRef.current,
          startViewStart + ratio * visibleDurationRef.current));
        audioRef.current.currentTime = t;
        if (!isPlayingRef.current) audioRef.current.play();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };

  // ── Scroll wheel: pan when zoomed ────────────────────────────
  const handleWheel = useCallback((e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    const delta = (e.deltaX || e.deltaY) / 400 * visibleDuration;
    setViewStart(v => Math.max(0, Math.min(audioDuration - visibleDuration, v + delta)));
  }, [zoom, visibleDuration, audioDuration]);

  useEffect(() => {
    const el = seekerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Zoom controls ─────────────────────────────────────────────
  const handleZoomIn = () => {
    setZoom(z => {
      const next = Math.min(ZOOM_MAX, z * ZOOM_STEP);
      // Keep playhead centered
      if (audioDuration) {
        const newVis = audioDuration / next;
        setViewStart(v => Math.max(0, Math.min(audioDuration - newVis, currentTime - newVis / 2)));
      }
      return next;
    });
  };
  const handleZoomOut = () => {
    setZoom(z => {
      const next = Math.max(ZOOM_MIN, z / ZOOM_STEP);
      if (next <= 1) setViewStart(0);
      return next;
    });
  };
  const handleZoomFit = () => { setZoom(1); setViewStart(0); };

  // ── Fade marker helpers ───────────────────────────────────────
  // fi-default is anchored to first cut marker; fo-default (initially 'last') is freely movable
  const resolveFadeTime = useCallback((fm) => {
    if (fm.time === 'first') return state.markers[0] ?? 0;
    if (fm.time === 'last')  return state.markers[state.markers.length - 1] ?? 0;
    return typeof fm.time === 'number' ? fm.time : 0;
  }, [state.markers, state.fadeMarkers]);

  // Snap to a nearby cut marker only when VERY close (~0.8% of visible window)
  const snapToMarker = useCallback((t) => {
    const thresh = visibleDuration * 0.008;
    for (const m of state.markers) {
      if (Math.abs(m - t) < thresh) return m;
    }
    return t;
  }, [state.markers, visibleDuration]);

  // ── Fade marker drag (single) or group drag ───────────────────
  const handleFadeMarkerMouseDown = (e, id) => {
    e.stopPropagation();
    const fm = (state.fadeMarkers || []).find(f => f.id === id);
    if (!fm || fm.time === 'first') return;  // fi-default is anchored — cannot drag
    const key = `fade:${id}`;

    if (e.shiftKey) {
      const next = new Set(selectionRef.current);
      next.has(key) ? next.delete(key) : next.add(key);
      selectionRef.current = next;
      setSelection(next);
      return;
    }

    if (selectionRef.current.has(key) && selectionRef.current.size > 1) {
      startGroupDrag(e);
      return;
    }

    const next = new Set([key]);
    selectionRef.current = next;
    setSelection(next);
    dragStartFadeRef.current = [...liveFadeMarkersRef.current];
    setDraggingFadeId(id);
  };

  useEffect(() => {
    if (!draggingFadeId) return;
    const handleMouseMove = (e) => {
      if (!seekerRef.current || !audioDuration) return;
      const rect  = seekerRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const raw   = Math.max(0, Math.min(audioDuration, viewStart + ratio * visibleDuration));
      dispatch({ type: 'UPDATE_FADE_MARKER', payload: { id: draggingFadeId, changes: { time: snapToMarker(raw) } } });
    };
    const handleMouseUp = () => {
      // Record history only if position actually changed
      if (dragStartFadeRef.current) {
        recordHistory(liveMarkersRef.current, liveFadeMarkersRef.current);
        dragStartFadeRef.current = null;
      }
      // Seek to the dropped fade marker position and start playing
      const dropped = liveFadeMarkersRef.current.find(f => f.id === draggingFadeId);
      if (dropped && typeof dropped.time === 'number' && audioRef.current) {
        audioRef.current.currentTime = dropped.time;
        audioRef.current.play();
      }
      setDraggingFadeId(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup',   handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup',   handleMouseUp);
    };
  }, [draggingFadeId, audioDuration, viewStart, visibleDuration, dispatch, snapToMarker, recordHistory]);

  // ── Fade marker add ───────────────────────────────────────────
  const handleAddFadeIn  = () => {
    if (!audioDuration) return;
    const newFm = { id: `fi-${Date.now()}`, type: 'in',  time: snapToMarker(currentTime), duration: 1.0 };
    const next  = [...liveFadeMarkersRef.current, newFm];
    recordHistory(liveMarkersRef.current, next);
    dispatch({ type: 'SET_FADE_MARKERS', payload: next });
  };
  const handleAddFadeOut = () => {
    if (!audioDuration) return;
    const newFm = { id: `fo-${Date.now()}`, type: 'out', time: snapToMarker(currentTime), duration: 1.0 };
    const next  = [...liveFadeMarkersRef.current, newFm];
    recordHistory(liveMarkersRef.current, next);
    dispatch({ type: 'SET_FADE_MARKERS', payload: next });
  };

  // ── Duration editing ──────────────────────────────────────────
  const handleFadeBadgeClick = (e, fm) => {
    e.stopPropagation();
    setEditingFadeId(fm.id);
    setFadeDurDraft(String(fm.duration));
  };
  const handleDurCommit = (id) => {
    const val = parseFloat(fadeDurDraft);
    if (!isNaN(val) && val > 0) {
      const clamped = Math.min(10, Math.round(val * 10) / 10);
      const next = liveFadeMarkersRef.current.map(fm => fm.id === id ? { ...fm, duration: clamped } : fm);
      recordHistory(liveMarkersRef.current, next);
      dispatch({ type: 'SET_FADE_MARKERS', payload: next });
    }
    setEditingFadeId(null);
  };

  // ── Fade ramp resize handle ───────────────────────────────────
  // Dragging the dot at the far end of the ramp extends/shrinks the fade duration.
  const handleFadeResizeMouseDown = useCallback((e, fm) => {
    e.stopPropagation();
    const startX   = e.clientX;
    const startDur = fm.duration;
    const fmId     = fm.id;

    const onMove = (ev) => {
      const rect = seekerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx     = ev.clientX - startX;
      const dt     = (dx / rect.width) * visibleDurationRef.current;
      const newDur = Math.max(0.1, Math.min(30, Math.round((startDur + dt) * 10) / 10));
      dispatch({ type: 'UPDATE_FADE_MARKER', payload: { id: fmId, changes: { duration: newDur } } });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      recordHistory(liveMarkersRef.current, liveFadeMarkersRef.current);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [dispatch, recordHistory]);

  // ── Song select ───────────────────────────────────────────────
  const handleSelectCategory = (cat) => { setSelectedCategory(cat); setIsSongDropdownOpen(true); };
  const handleSelectSong = (song) => {
    dispatch({ type: 'SELECT_SONG', payload: song });
    setIsSongDropdownOpen(false);
    setCurrentTime(0);
    setIsPlaying(false);
    setZoom(1);
    setViewStart(0);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    isPlaying ? audio.pause() : audio.play();
  };

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const playheadPercent = audioDuration ? timeToPercent(currentTime) : 0;
  const hasCascadeWarning = state.cascadeWarnings.some(w => w.phase === 'audio');

  const preview = state.selectedSong
    ? <>
        <span className="preview-pill done">{state.selectedSong.name}</span>
        <span className="preview-pill done">{state.markerCount} markers</span>
      </>
    : <span className="preview-pill empty">No song selected</span>;

  return (
    <PhaseSection phaseNum={2} title="Audio & Markers" preview={preview}>
      <div className="phase-content">

        {/* ── Mood Tiles ── */}
        <div className="form-group">
          {categories.length === 0 ? (
            <div className="mood-empty">No categories found. Add folders to the Song Choices directory.</div>
          ) : (
            <div className="mood-grid">
              {categories.map(cat => (
                <button
                  key={cat.path}
                  className={`mood-tile ${selectedCategory?.path === cat.path ? 'active' : ''}`}
                  onClick={() => handleSelectCategory(cat)}
                >
                  <span className="mood-emoji">{getMoodEmoji(cat.name)}</span>
                  <span className="mood-name">{cat.name}</span>
                  <span className="mood-count">{cat.songCount} song{cat.songCount !== 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Song Dropdown — always visible ── */}
        <div className="form-group">
          <label className="form-label">Select a Song</label>
          <div style={{ maxWidth: '50%' }}>
          <div className="song-dropdown-wrapper">
            <button
              className={`song-dropdown-trigger form-input ${!selectedCategory ? 'song-trigger-disabled' : ''}`}
              onClick={selectedCategory ? () => setIsSongDropdownOpen(o => !o) : undefined}
            >
              {state.selectedSong ? (
                <>
                  <span className="song-trigger-name">{state.selectedSong.name}</span>
                  <span className="song-trigger-meta">{state.selectedSong.requiredLines} lines needed</span>
                  {(() => {
                    const need = state.selectedSong.requiredLines;
                    const have = state.markers.length;
                    const diff = have - need;
                    if (diff === 0) return null;
                    return (
                      <span className="song-marker-warning">
                        {diff > 0
                          ? `⚠ ${diff} extra marker${diff > 1 ? 's' : ''}`
                          : `⚠ ${Math.abs(diff)} marker${Math.abs(diff) > 1 ? 's' : ''} missing`}
                      </span>
                    );
                  })()}
                </>
              ) : selectedCategory ? (
                <span className="song-trigger-placeholder">Choose a song from {selectedCategory.name}…</span>
              ) : (
                <span className="song-trigger-placeholder">Select a mood above first…</span>
              )}
              {selectedCategory && (
                <span className="song-dropdown-caret">{isSongDropdownOpen ? '▲' : '▼'}</span>
              )}
            </button>

            {isSongDropdownOpen && selectedCategory && (
              <div className="song-dropdown-menu">
                <div className="song-dropdown-list">
                  {selectedCategory.songs.length === 0 && (
                    <div className="song-dropdown-empty">No songs found in this category.</div>
                  )}
                  {selectedCategory.songs.map(song => (
                    <button
                      key={song.path}
                      className={`song-dropdown-item ${state.selectedSong?.path === song.path ? 'selected' : ''}`}
                      onClick={() => handleSelectSong(song)}
                    >
                      <span className="song-item-name">{song.name}</span>
                      <span className="song-item-meta">{song.requiredLines} lines · {song.markerCount} markers</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ── Audio Player — always visible, empty shell when no song ── */}
        <>
          {state.selectedSongAudioPath && (
            <audio ref={audioRef} src={`file://${state.selectedSongAudioPath}`} preload="metadata" />
          )}

          <hr className="audio-section-divider" />

          {/* Song title above controls */}
          {state.selectedSongName && (
            <div className="waveform-song-title">{state.selectedSongName}</div>
          )}

          {/* Waveform block: controls + seeker + play bar all in one connected container */}
          <div className="waveform-block">
          <div className="marker-toolbar">
            <div className="waveform-controls">
              <button
                className="waveform-ctrl-btn add-marker-btn"
                onClick={handleAddMarkerAtPlayhead}
                disabled={!audioDuration}
                title={audioDuration ? `Add marker at ${formatTime(currentTime)}` : 'Load a song first'}
              >
                ✚ Add Marker at {formatTime(currentTime)}
              </button>
              <button
                className="waveform-ctrl-btn fade-in-btn"
                onClick={handleAddFadeIn}
                disabled={!audioDuration}
                title="Add a Fade In marker at current playhead position"
              >
                ↗ Fade In
              </button>
              <button
                className="waveform-ctrl-btn fade-out-btn"
                onClick={handleAddFadeOut}
                disabled={!audioDuration}
                title="Add a Fade Out marker at current playhead position"
              >
                ↘ Fade Out
              </button>
              <button
                className="waveform-ctrl-btn clear-all-btn"
                onClick={handleClearAll}
                disabled={!audioDuration || (!state.markers.length && !(state.fadeMarkers?.length > 1))}
                title="Remove all cut markers and fade markers"
              >
                Clear All
              </button>
              <div className="zoom-controls">
                <button className="waveform-ctrl-btn" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out">−</button>
                <span className="zoom-label">{zoom <= 1 ? 'Fit' : `${zoom.toFixed(1)}×`}</span>
                <button className="waveform-ctrl-btn" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in">+</button>
                <button className="waveform-ctrl-btn zoom-fit-btn" onClick={handleZoomFit} disabled={zoom <= ZOOM_MIN} title="Fit full song in view">⊞ Fit</button>
              </div>
            </div>
          </div>

          {/* Waveform body: play button on left, seeker on right */}
          <div className="waveform-body">
          <button
            className={`play-btn ${isPlaying ? 'playing' : ''} ${!state.selectedSongAudioPath ? 'audio-player-empty' : ''}`}
            onClick={togglePlay}
            disabled={!state.selectedSongAudioPath}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div
              className="seeker-wrap"
              ref={seekerRef}
              onMouseDown={state.selectedSongAudioPath ? handleSeekerMouseDown : undefined}
              style={{ cursor: state.selectedSongAudioPath ? 'pointer' : 'default' }}
            >
              {/* Waveform canvas — always rendered, empty until song loaded */}
              <canvas ref={canvasRef} className="seeker-waveform" width={1200} height={80} />

              {/* Draggable number badges at top of waveform */}
              {audioDuration > 0 && state.markers.map((t, i) => {
                const pct = timeToPercent(t);
                if (pct < -2 || pct > 102) return null;
                const isSelected = selection.has(`cut:${i}`);
                return (
                  <div
                    key={`badge-${i}`}
                    className={`marker-num-badge ${draggingMarkerIdx === i ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
                    style={{ left: `${pct}%` }}
                    onMouseDown={(e) => handleMarkerMouseDown(e, i)}
                    onContextMenu={(e) => handleMarkerRightClick(e, i)}
                    title={`Marker ${i + 1} @ ${formatTime(t)} — drag · Shift+click to multi-select · right-click to delete`}
                  >
                    {i + 1}
                  </div>
                );
              })}

              {/* Track + thin line markers */}
              <div className="seeker-track">
                <div
                  className="seeker-progress"
                  style={{ width: `${Math.max(0, Math.min(100, playheadPercent))}%` }}
                />
                {audioDuration > 0 && state.markers.map((t, i) => {
                  const pct = timeToPercent(t);
                  if (pct < -1 || pct > 101) return null;
                  return (
                    <div
                      key={i}
                      className={`seeker-marker ${draggingMarkerIdx === i ? 'dragging' : ''} ${selection.has(`cut:${i}`) ? 'selected' : ''}`}
                      style={{ left: `${pct}%` }}
                      onMouseDown={(e) => handleMarkerMouseDown(e, i)}
                      onContextMenu={(e) => handleMarkerRightClick(e, i)}
                    />
                  );
                })}
              </div>

              {audioDuration > 0 && (
                <div
                  className="seeker-playhead"
                  style={{ left: `${Math.max(0, Math.min(100, playheadPercent))}%` }}
                />
              )}

              {/* ── Fade markers ── */}
              {audioDuration > 0 && (state.fadeMarkers || []).map(fm => {
                const t   = resolveFadeTime(fm);
                const pct = timeToPercent(t);
                if (pct < -10 || pct > 110) return null;
                // fi-default (time==='first') is anchored to the first cut marker
                const isAnchored = fm.time === 'first';
                const isFadeIn   = fm.type === 'in';
                const isEditing  = editingFadeId === fm.id;
                const isDragging = draggingFadeId === fm.id;
                // Duration ramp width as % of visible window
                const rampPct = (fm.duration / visibleDuration) * 100;

                return (
                  <React.Fragment key={fm.id}>
                    {/* Duration ramp wedge */}
                    <div
                      className={`seeker-fade-ramp seeker-fade-ramp--${fm.type}`}
                      style={{ left: `${pct}%`, width: `${Math.max(0.5, rampPct)}%` }}
                    />
                    {/* Vertical line */}
                    <div
                      className={`seeker-fade-line seeker-fade-line--${fm.type} ${isDragging ? 'dragging' : ''} ${isAnchored ? 'anchored' : ''}`}
                      style={{ left: `${pct}%` }}
                      onMouseDown={!isAnchored ? (e) => handleFadeMarkerMouseDown(e, fm.id) : undefined}
                      onContextMenu={!isAnchored ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = liveFadeMarkersRef.current.filter(f => f.id !== fm.id);
                        recordHistory(liveMarkersRef.current, next);
                        dispatch({ type: 'SET_FADE_MARKERS', payload: next });
                      } : undefined}
                    />
                    {/* Badge */}
                    <div
                      className={`seeker-fade-badge seeker-fade-badge--${fm.type} ${isAnchored ? 'anchored' : ''} ${isDragging ? 'dragging' : ''} ${selection.has(`fade:${fm.id}`) ? 'selected' : ''}`}
                      style={{ left: `${fm.type === 'out' ? pct + rampPct : pct}%` }}
                      onClick={(e) => handleFadeBadgeClick(e, fm)}
                      onMouseDown={!isAnchored ? (e) => handleFadeMarkerMouseDown(e, fm.id) : undefined}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = liveFadeMarkersRef.current.filter(f => f.id !== fm.id);
                        recordHistory(liveMarkersRef.current, next);
                        dispatch({ type: 'SET_FADE_MARKERS', payload: next });
                      }}
                      title={`${isFadeIn ? 'Fade In' : 'Fade Out'} @ ${formatTime(t)} · ${fm.duration}s — click to edit · Shift+drag to multi-select · right-click to delete`}
                    >
                      {isEditing ? (
                        <input
                          className="fade-dur-input"
                          value={fadeDurDraft}
                          onChange={e => setFadeDurDraft(e.target.value)}
                          onBlur={() => handleDurCommit(fm.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  handleDurCommit(fm.id);
                            if (e.key === 'Escape') setEditingFadeId(null);
                          }}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <svg className="fade-badge-icon" viewBox="0 0 14 14" width="14" height="14">
                            {isFadeIn
                              ? <line x1="1" y1="13" x2="13" y2="1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                              : <line x1="1" y1="1"  x2="13" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                            }
                          </svg>
                          <span className="fade-badge-dur">{fm.duration}s</span>
                        </>
                      )}
                    </div>
                    {/* Resize handle dot at the far-right end of the ramp */}
                    <div
                      className={`seeker-fade-resize-dot seeker-fade-resize-dot--${fm.type}`}
                      style={{ left: `${Math.max(0, Math.min(100, pct + rampPct))}%` }}
                      onMouseDown={(e) => handleFadeResizeMouseDown(e, fm)}
                      title={`Drag to change ${isFadeIn ? 'fade in' : 'fade out'} duration (currently ${fm.duration}s)`}
                    />
                  </React.Fragment>
                );
              })}

              {/* Empty state hint inside waveform */}
              {!state.selectedSongAudioPath && (
                <div className="seeker-empty-hint">Select a song to load waveform</div>
              )}

              {/* ── Timecode ruler at bottom of seeker ── */}
              <canvas
                ref={rulerRef}
                className="waveform-ruler"
                width={1200}
                height={22}
              />

              {/* ── Marquee selection rectangle ── */}
              {marqueeRect && marqueeRect.width > 3 && (
                <div
                  className="marquee-rect"
                  style={{
                    left:   `${marqueeRect.left}px`,
                    top:    `${marqueeRect.top}px`,
                    width:  `${marqueeRect.width}px`,
                    height: `${marqueeRect.height}px`,
                  }}
                />
              )}
            </div>
          </div>{/* end waveform-body */}
          </div>{/* end waveform-block */}

          {zoom > 1 && (
            <div className="zoom-hint">
              Scroll to pan · showing {formatTime(viewStart)}–{formatTime(Math.min(audioDuration, viewStart + visibleDuration))}
            </div>
          )}

          {state.selectedSongAudioPath && (
            hasCascadeWarning ? (
              <div className="cascade-warning">
                <span>🟡 {state.cascadeWarnings.find(w => w.phase === 'audio').message}</span>
                <button className="cascade-dismiss" onClick={() => dispatch({ type: 'DISMISS_CASCADE_WARNINGS' })}>
                  Dismiss
                </button>
              </div>
            ) : null
          )}
        </>

      </div>
    </PhaseSection>
  );
}
