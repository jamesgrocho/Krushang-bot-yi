import React, { useContext, useState, useEffect, useRef } from 'react';
import { AppContext } from '../../App';
import { generateVideoTitle, findDuplicateTitle } from '../../utils/titleUtils';
import './VideoTitleSection.css';

export default function VideoTitleSection() {
  const { state, dispatch } = useContext(AppContext);
  const [open, setOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [titleOptions, setTitleOptions] = useState([]);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(null);
  // Accumulates every title ever generated this session so AI never repeats them
  const usedTitlesRef = useRef([]);

  // ── Scan existing titles whenever a song is selected (or on mount) ──
  useEffect(() => {
    const scanTitles = async () => {
      try {
        const folders = [
          { path: '/Volumes/Google Drive/Project Files/Quick Mini Movies',               label: 'Quick Mini Movies' },
          { path: '/Volumes/Google Drive/Project Files/Mini Movies | Countdowns | Motions', label: 'Mini Movies' },
        ];
        const titles = await window.electron.ipcRenderer.invoke('scan-existing-titles', { folders });
        dispatch({ type: 'SET_EXISTING_TITLES', payload: titles });
      } catch (err) {
        console.error('[VideoTitleSection] Scan error:', err);
      }
    };
    scanTitles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, !!state.selectedSong]);

  // Clear options + used-titles history when script changes (user edited the script)
  useEffect(() => {
    setTitleOptions([]);
    setSelectedOptionIdx(null);
    usedTitlesRef.current = [];
  }, [state.scriptText]);

  // Also fully reset when the project changes (new song selected = new project)
  useEffect(() => {
    setTitleOptions([]);
    setSelectedOptionIdx(null);
    usedTitlesRef.current = [];
  }, [state.selectedSong?.audioPath]);

  const handleGenerate = async () => {
    if (!state.scriptLines.length || isGenerating) return;
    setIsGenerating(true);
    setTitleOptions([]);
    setSelectedOptionIdx(null);
    try {
      const result = await window.electron.ipcRenderer.invoke('generate-title-ai', {
        topic: state.topic,
        scriptLines: state.scriptLines,
        excludeTitles: usedTitlesRef.current,  // pass full history so AI avoids all of them
      });
      if (result.success && result.titles && result.titles.length > 0) {
        // Add these new titles to the used list for next generation
        usedTitlesRef.current = [...usedTitlesRef.current, ...result.titles];
        setTitleOptions(result.titles);
        setSelectedOptionIdx(0);
        dispatch({ type: 'SET_VIDEO_TITLE', payload: result.titles[0] });
      } else if (result.success && result.title) {
        usedTitlesRef.current = [...usedTitlesRef.current, result.title];
        setTitleOptions([result.title]);
        setSelectedOptionIdx(0);
        dispatch({ type: 'SET_VIDEO_TITLE', payload: result.title });
      } else {
        const fallback = generateVideoTitle(state.topic, state.scriptLines);
        dispatch({ type: 'SET_VIDEO_TITLE', payload: fallback });
      }
    } catch {
      dispatch({ type: 'SET_VIDEO_TITLE', payload: generateVideoTitle(state.topic, state.scriptLines) });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (idx) => {
    setSelectedOptionIdx(idx);
    dispatch({ type: 'SET_VIDEO_TITLE', payload: titleOptions[idx] });
  };

  const dup = findDuplicateTitle(state.videoTitle, state.existingTitles);

  const OPTION_LABELS = ['Curiosity Gap', 'Direct & Bold', 'Benefit-Driven'];

  return (
    <div className="vt-card">

      {/* ── Header ── */}
      <button className="vt-header" onClick={() => setOpen(o => !o)}>
        <div className="vt-header-left">
          <span className="vt-label">Video Title</span>
          {state.topic && (
            <span className="vt-topic-pill"><span className="vt-topic-pill-label">Topic:</span> {state.topic}</span>
          )}
        </div>
        <span className="vt-toggle">{open ? '▾' : '▸'}</span>
      </button>

      {/* ── Body ── */}
      {open && (
        <div className="vt-body">

          {/* ── Generate button — left aligned, styled like Generate Script ── */}
          <div className="vt-actions-row">
            <button
              className={`vt-generate-btn ${isGenerating ? 'vt-generating' : ''}`}
              onClick={handleGenerate}
              disabled={!state.scriptLines.length || isGenerating}
              title={!state.scriptLines.length ? 'Add a script first' : 'Generate 3 title options from your script'}
            >
              {isGenerating ? '✦ Generating…' : '✦ Generate from Script'}
            </button>
          </div>

          {/* ── AI mode: 3 selectable blocks ── */}
          {titleOptions.length > 0 ? (
            <div className="vt-options">
              {titleOptions.map((title, idx) => (
                <button
                  key={idx}
                  className={`vt-option-block ${selectedOptionIdx === idx ? 'vt-option-selected' : ''}`}
                  onClick={() => handleSelectOption(idx)}
                >
                  <span className="vt-option-label">{OPTION_LABELS[idx] || `Option ${idx + 1}`}</span>
                  <span className="vt-option-title">{title}</span>
                </button>
              ))}
              <button className="vt-clear-options" onClick={() => { setTitleOptions([]); setSelectedOptionIdx(null); }}>
                ✎ Edit manually instead
              </button>
            </div>
          ) : (
            /* ── Manual mode: plain text input ── */
            <input
              className="vt-input"
              type="text"
              value={state.videoTitle}
              onChange={e => dispatch({ type: 'SET_VIDEO_TITLE', payload: e.target.value })}
              placeholder="Enter video title…"
            />
          )}

          {dup && (
            <div className="vt-warning">
              A folder named "{dup.name}" already exists in <strong>{dup.source}</strong>.
            </div>
          )}

        </div>
      )}

    </div>
  );
}
