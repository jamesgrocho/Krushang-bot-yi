import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../../App';
import '../sections.css';
import './RenderSection.css';
import PhaseSection from '../PhaseSection';

const RENDERS_DIR = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Renders';

function defaultOutputName(videoTitle, songName) {
  const base = (videoTitle && videoTitle.trim())
    ? videoTitle.trim().replace(/[^a-z0-9\s-]/gi, '').trim()
    : (songName || 'render').replace(/[^a-z0-9\s-]/gi, '').trim();
  return `${base}.mp4`;
}

// Resolve 'first'/'last' anchor strings → numeric times before sending to pipeline
function resolveFadeMarkers(fadeMarkers, markers) {
  if (!fadeMarkers || !markers) return [];
  return fadeMarkers
    .map(fm => {
      let t = fm.time;
      if (t === 'first') t = markers[0] ?? 0;
      if (t === 'last')  t = markers[markers.length - 1] ?? 0;
      if (typeof t !== 'number') return null;
      return { type: fm.type, time: t, duration: fm.duration };
    })
    .filter(Boolean);
}

export default function RenderSection() {
  const { state, dispatch, activeTabId, renderStates } = useContext(AppContext);

  // Read render state for this tab from global store (survives tab switches)
  const rs = renderStates[activeTabId] || {};
  const isRendering      = rs.isRendering      || false;
  const isAERender       = rs.isAERender       || false;
  const renderDone       = rs.renderDone       || false;
  const renderError      = rs.renderError      || null;
  const progress         = rs.progress         || 0;
  const isPreviewing     = rs.isPreviewing     || false;
  const previewProgress  = rs.previewProgress  || 0;
  const previewError     = rs.previewError     || null;
  const previewVideoPath = rs.previewVideoPath || null;
  const previewTimestamp = rs.previewTimestamp || null;

  // Helper: update only this tab's render state
  const setRS = useCallback((changes) => {
    dispatch({ type: 'SET_RENDER_STATE', payload: { tabId: activeTabId, changes } });
  }, [dispatch, activeTabId]);

  // Output path — kept as local state (derives from song/title, no need to survive tab switch)
  const [outputPath, setOutputPath] = useState('');

  useEffect(() => {
    if (state.selectedSong) {
      const name = defaultOutputName(state.videoTitle, state.selectedSong.name);
      setOutputPath(`${RENDERS_DIR}/${name}`);
    }
  }, [state.selectedSong?.name, state.videoTitle]);

  // Compute readiness
  const songReady    = !!state.selectedSong;
  const scriptReady  = state.isScriptValid;
  const titleReady   = !!(state.videoTitle && state.videoTitle.trim());
  const orderedClips = state.storyboard || [];
  const footageReady = orderedClips.length > 0 && orderedClips.every(c => c !== null);
  const allReady     = songReady && scriptReady && titleReady && footageReady;

  const handleCancel = useCallback(async () => {
    await window.electron.ipcRenderer.invoke('cancel-render', { tabId: activeTabId });
    setRS({ isRendering: false, progress: 0 });
  }, [activeTabId, setRS]);

  const handleRender = useCallback(async () => {
    if (!allReady || isRendering) return;
    setRS({ isRendering: true, renderDone: false, renderError: null, progress: 0 });

    const result = await window.electron.ipcRenderer.invoke('render-video', {
      tabId:       activeTabId,
      audioPath:   state.selectedSongAudioPath,
      labelsPath:  state.selectedSong.labelsPath,
      scriptLines: state.scriptLines,
      clipPaths:   orderedClips,
      outputPath,
      fontName:    state.selectedFont,
      fontWeight:  state.fontWeight,
      fontStyle:   state.fontStyle,
      fontSize:    state.fontSize,
      fadeMarkers: resolveFadeMarkers(state.fadeMarkers, state.markers),
    });

    if (result.success) {
      setRS({ isRendering: false, progress: 100, renderDone: true });
      dispatch({ type: 'SET_RENDERED_VIDEO_PATH', payload: result.outputPath || outputPath });
      window.electron.ipcRenderer.invoke('render-complete', result.outputPath || outputPath);
    } else if (result.cancelled) {
      setRS({ isRendering: false, progress: 0 });
    } else {
      setRS({ isRendering: false, renderError: result.error || 'Unknown error' });
    }
  }, [allReady, isRendering, state, orderedClips, outputPath, activeTabId, dispatch, setRS]);

  const handleAERender = useCallback(async () => {
    if (!allReady || isRendering) return;
    setRS({ isRendering: true, isAERender: true, renderDone: false, renderError: null, progress: 0 });

    const result = await window.electron.ipcRenderer.invoke('render-video-ae', {
      tabId:       activeTabId,
      audioPath:   state.selectedSongAudioPath,
      labelsPath:  state.selectedSong.labelsPath,
      scriptLines: state.scriptLines,
      clipPaths:   orderedClips,
      outputPath,
      fontName:    state.selectedFont,
      fontWeight:  state.fontWeight,
      fontStyle:   state.fontStyle,
      fontSize:    state.fontSize,
      fadeMarkers: resolveFadeMarkers(state.fadeMarkers, state.markers),
      videoTitle:  state.videoTitle,
    });

    if (result.success) {
      setRS({ isRendering: false, isAERender: false, progress: 100, renderDone: true });
      dispatch({ type: 'SET_RENDERED_VIDEO_PATH', payload: result.outputPath || outputPath });
      window.electron.ipcRenderer.invoke('render-complete', result.outputPath || outputPath);
    } else if (result.cancelled) {
      setRS({ isRendering: false, isAERender: false, progress: 0 });
    } else {
      setRS({ isRendering: false, isAERender: false, renderError: result.error || 'Unknown error' });
    }
  }, [allReady, isRendering, state, orderedClips, outputPath, activeTabId, dispatch, setRS]);

  const handleAEPreview = useCallback(async () => {
    if (!allReady || isPreviewing || isRendering) return;
    setRS({ isPreviewing: true, previewProgress: 0, previewError: null });

    const safeTitle = (state.videoTitle || 'KB_Preview').replace(/[^a-z0-9\s-]/gi, '').trim();
    const previewOutputPath = `${RENDERS_DIR}/${safeTitle}_AE_Preview.mp4`;

    const result = await window.electron.ipcRenderer.invoke('render-video-ae-preview', {
      tabId:       activeTabId,
      audioPath:   state.selectedSongAudioPath,
      labelsPath:  state.selectedSong.labelsPath,
      scriptLines: state.scriptLines,
      clipPaths:   orderedClips,
      outputPath:  previewOutputPath,
      fontName:    state.selectedFont,
      fontWeight:  state.fontWeight,
      fontStyle:   state.fontStyle,
      fontSize:    state.fontSize,
      fadeMarkers: resolveFadeMarkers(state.fadeMarkers, state.markers),
      videoTitle:  state.videoTitle,
    });

    if (result.success) {
      setRS({ isPreviewing: false, previewProgress: 0, previewVideoPath: result.outputPath || previewOutputPath, previewTimestamp: Date.now() });
    } else if (!result.cancelled) {
      setRS({ isPreviewing: false, previewError: result.error || 'AE Preview failed', previewProgress: 0 });
    } else {
      setRS({ isPreviewing: false, previewProgress: 0 });
    }
  }, [allReady, isPreviewing, isRendering, state, orderedClips, activeTabId, setRS]);

  const handleOpenInFinder = useCallback(() => {
    window.electron.ipcRenderer.invoke('open-in-finder', outputPath);
  }, [outputPath]);

  const handleReset = () => {
    setRS({ renderDone: false, renderError: null, progress: 0 });
    dispatch({ type: 'SET_RENDERED_VIDEO_PATH', payload: '' });
  };

  const handleQuickPreview = useCallback(async () => {
    if (!allReady || isPreviewing || isRendering) return;
    setRS({ isPreviewing: true, previewProgress: 0, previewError: null });

    const result = await window.electron.ipcRenderer.invoke('preview-video', {
      tabId:       activeTabId,
      audioPath:   state.selectedSongAudioPath,
      labelsPath:  state.selectedSong.labelsPath,
      scriptLines: state.scriptLines,
      clipPaths:   orderedClips,
      fontName:    state.selectedFont,
      fontWeight:  state.fontWeight,
      fontStyle:   state.fontStyle,
      fontSize:    state.fontSize,
      fadeMarkers: resolveFadeMarkers(state.fadeMarkers, state.markers),
    });

    if (result.success) {
      setRS({ isPreviewing: false, previewProgress: 0, previewVideoPath: result.previewPath, previewTimestamp: Date.now() });
    } else if (!result.cancelled) {
      setRS({ isPreviewing: false, previewError: result.error || 'Preview failed', previewProgress: 0 });
    } else {
      setRS({ isPreviewing: false, previewProgress: 0 });
    }
  }, [allReady, isPreviewing, isRendering, state, orderedClips, activeTabId, setRS]);

  const handleDismissPreview = useCallback(() => {
    setRS({ previewVideoPath: null });
  }, [setRS]);

  const handleDismissRender = useCallback(() => {
    dispatch({ type: 'SET_RENDERED_VIDEO_PATH', payload: '' });
  }, [dispatch]);

  // Preview pill
  const preview = renderDone
    ? <span className="preview-pill done">Render complete</span>
    : isRendering
      ? <span className="preview-pill pending">Rendering…</span>
      : allReady
        ? <span className="preview-pill done">Ready to render</span>
        : <span className="preview-pill empty">Not ready</span>;

  const isLocked = !state.selectedSong;
  const renderedPath = state.renderedVideoPath;

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <PhaseSection phaseNum={5} title="Render" preview={preview} locked={isLocked}>
      {isLocked && <div className="phase-lock-notice">Select a song first.</div>}

      {!isLocked && (
        <div className="phase-content">

          {/* ── Readiness checklist ── */}
          <div className="render-checklist">
            <ReadinessRow ok={songReady}    label="Song"
              detail={songReady ? `${state.selectedSong.name} · ${state.markerCount} markers` : 'No song selected'} />
            <ReadinessRow ok={scriptReady}  label="Script"
              detail={scriptReady
                ? `${state.scriptLineCount} lines — matches ${state.requiredLineCount} required`
                : `${state.scriptLineCount} lines — need ${state.requiredLineCount}`} />
            <ReadinessRow ok={titleReady}   label="Title"
              detail={titleReady ? state.videoTitle : 'No title set — add one in Phase 3'} />
            <ReadinessRow ok={footageReady} label="Storyboard"
              detail={footageReady
                ? `${orderedClips.length} clips assigned`
                : orderedClips.length === 0
                  ? 'No clips assigned yet'
                  : `${orderedClips.filter(Boolean).length}/${orderedClips.length} clips assigned`} />
          </div>

          {/* ── Action buttons row ── */}
          {!renderDone && !renderError && (
            <div className="render-action-row">
              {/* Quick Preview (pipeline) */}
              <div className="render-preview-wrap">
                <button
                  className={`render-preview-btn ${allReady && !isPreviewing && !isRendering ? 'render-preview-btn--ready' : ''}`}
                  onClick={handleQuickPreview}
                  disabled={!allReady || isPreviewing || isRendering}
                  title="Fast 480p render to check timing — opens automatically when done"
                >
                  {isPreviewing ? `Previewing… ${previewProgress}%` : 'Quick Preview'}
                </button>
                {isPreviewing && (
                  <div className="render-preview-bar-wrap">
                    <div className="render-preview-bar-fill" style={{ width: `${previewProgress}%` }} />
                  </div>
                )}
                {previewError && <div className="render-preview-error">{previewError}</div>}
              </div>

              {/* AE Quick Preview (half-res draft) */}
              <div className="render-preview-wrap">
                <button
                  className={`render-preview-btn render-preview-btn--ae ${allReady && !isPreviewing && !isRendering ? 'render-preview-btn--ready' : ''}`}
                  onClick={handleAEPreview}
                  disabled={!allReady || isPreviewing || isRendering}
                  title="AE draft render — half resolution, preserves zoom & fades"
                >
                  {isPreviewing ? `⚡ AE ${previewProgress}%` : '⚡ AE Preview'}
                </button>
                {isPreviewing && (
                  <div className="render-preview-bar-wrap">
                    <div className="render-preview-bar-fill" style={{ width: `${previewProgress}%` }} />
                  </div>
                )}
                {previewError && <div className="render-preview-error">{previewError}</div>}
              </div>

              {/* Full Render */}
              <button
                className={`render-btn ${allReady && !isRendering ? 'render-btn--ready' : ''}`}
                onClick={handleRender}
                disabled={!allReady || isRendering || isPreviewing}
              >
                Render Video
              </button>

              {/* AE Fast Render */}
              <button
                className={`render-btn render-btn--ae ${allReady && !isRendering ? 'render-btn--ready' : ''}`}
                onClick={handleAERender}
                disabled={!allReady || isRendering || isPreviewing}
                title="Render via After Effects — preserves text zoom & fades, faster render"
              >
                ⚡ AE Render
              </button>
            </div>
          )}

          {/* ── Render modal overlay ── */}
          {isRendering && (
            <div className="render-modal-overlay">
              <div className="render-modal">
                <video className="render-modal-video" src="/cooking.mp4" autoPlay loop muted playsInline />
                <div className="render-modal-filename">
                  {state.videoTitle?.trim() || 'Rendering…'}
                </div>
                <div className="render-modal-tagline">
                  {isAERender ? '⚡ After Effects is rendering…' : 'Krushang Bot cookin up some spicy curry!'}
                </div>
                <div className="render-modal-bar-wrap">
                  <div className="render-modal-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="render-modal-pct" style={isAERender ? { color: '#a78bfa' } : {}}>
                  {progress > 0 ? `${progress}%` : isAERender ? 'Building project…' : '0%'}
                </div>
                <button className="render-modal-cancel" onClick={handleCancel}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Success state ── */}
          {renderDone && (
            <div className="render-success">
              <div className="render-success-icon">✓</div>
              <div className="render-success-text">
                <div className="render-success-title">Video rendered successfully</div>
                <div className="render-success-path">{outputPath}</div>
              </div>
              <div className="render-success-actions">
                <button className="render-open-btn" onClick={handleOpenInFinder}>Open in Finder</button>
                <button className="render-again-btn" onClick={handleReset}>Render Again</button>
              </div>
            </div>
          )}

          {/* ── Error state ── */}
          {renderError && (
            <div className="render-error-wrap">
              <div className="render-error-title">Render failed</div>
              <div className="render-error-msg">{renderError}</div>
              <button className="render-again-btn" onClick={handleReset}>Try Again</button>
            </div>
          )}

          {/* ── Quick preview video player ── */}
          {previewVideoPath && (
            <div className="render-video-preview">
              <div className="render-video-preview-label">
                <span>{previewVideoPath.includes('_AE_Preview') ? '⚡ AE Preview · Half-res' : 'Quick Preview · 360p'}</span>
                <div className="render-video-preview-right">
                  {previewTimestamp && (
                    <span className="render-video-preview-timestamp">{formatTimestamp(previewTimestamp)}</span>
                  )}
                  <span className="render-video-preview-filename">
                    {state.videoTitle ? state.videoTitle.trim() : previewVideoPath.split('/').pop()}
                  </span>
                  <button className="render-video-dismiss" onClick={handleDismissPreview} title="Close preview">✕</button>
                </div>
              </div>
              <video
                key={previewVideoPath}
                className="render-video-player"
                src={`file://${previewVideoPath.split('/').map(encodeURIComponent).join('/')}`}
                controls
                playsInline
              />
            </div>
          )}

          {/* ── Full render video player ── */}
          {renderedPath && !isRendering && (
            <div className="render-video-preview">
              <div className="render-video-preview-label">
                <span>Full Render · 1080p</span>
                <div className="render-video-preview-right">
                  <span className="render-video-preview-timestamp">{formatTimestamp(Date.now())}</span>
                  <span className="render-video-preview-filename">
                    {renderedPath.split('/').pop()}
                  </span>
                  <button className="render-video-dismiss" onClick={handleDismissRender} title="Close render">✕</button>
                </div>
              </div>
              <video
                key={renderedPath}
                className="render-video-player"
                src={`file://${renderedPath.split('/').map(encodeURIComponent).join('/')}`}
                controls
                playsInline
              />
            </div>
          )}

        </div>
      )}
    </PhaseSection>
  );
}

function ReadinessRow({ ok, label, detail }) {
  return (
    <div className={`render-check-row ${ok ? 'render-check-row--ok' : 'render-check-row--missing'}`}>
      <span className="render-check-icon">{ok ? '✓' : '○'}</span>
      <span className="render-check-label">{label}</span>
      <span className="render-check-detail">{detail}</span>
    </div>
  );
}
