import React, { useContext, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../../App';
import { generateVideoTitle } from '../../utils/titleUtils';
import '../sections.css';
import './ScriptSection.css';
import PhaseSection from '../PhaseSection';

// ── Font catalogue — weights[] = only what macOS actually ships ──
// macOS font weight support (verified against system font files):
//   Helvetica Neue: UltraLight(100) Thin(200) Light(300) Regular(400) Medium(500) Bold(700) Black(900)
//   Helvetica:      Regular(400) Bold(700)
//   Arial:          Regular(400) Bold(700)
//   Georgia:        Regular(400) Bold(700)
//   Futura:         Medium(500) Bold(700)
//   Gill Sans:      Light(300) Regular(400) SemiBold(600) Bold(700) UltraBold(800)
//   Optima:         Regular(400) Bold(700) ExtraBlack(900)
//   Trebuchet MS:   Regular(400) Bold(700)
export const ALL_WEIGHTS = [
  { label: 'UltraLight', value: 100 },
  { label: 'Thin',       value: 200 },
  { label: 'Light',      value: 300 },
  { label: 'Regular',    value: 400 },
  { label: 'Medium',     value: 500 },
  { label: 'SemiBold',   value: 600 },
  { label: 'Bold',       value: 700 },
  { label: 'ExtraBold',  value: 800 },
  { label: 'Black',      value: 900 },
];

export const FONTS = [
  { label: 'Helvetica Neue', value: 'HelveticaNeue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    weights: [100, 200, 300, 400, 500, 700, 900] },
  { label: 'Helvetica',      value: 'Helvetica',     stack: 'Helvetica, Arial, sans-serif',
    weights: [400, 700] },
  { label: 'Arial',          value: 'Arial',          stack: 'Arial, sans-serif',
    weights: [400, 700] },
  { label: 'Georgia',        value: 'Georgia',        stack: 'Georgia, "Times New Roman", serif',
    weights: [400, 700] },
  { label: 'Futura',         value: 'Futura',         stack: 'Futura, "Century Gothic", sans-serif',
    weights: [500, 700] },
  { label: 'Gill Sans',      value: 'GillSans',       stack: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif',
    weights: [300, 400, 600, 700, 800] },
  { label: 'Optima',         value: 'Optima',         stack: 'Optima, Candara, sans-serif',
    weights: [400, 700, 900] },
  { label: 'Trebuchet MS',   value: 'TrebuchetMS',    stack: '"Trebuchet MS", Helvetica, sans-serif',
    weights: [400, 700] },
];

// ── Sentence-case with sacred proper nouns always capitalised ─
const SACRED = new Set([
  'god', 'lord', 'jesus', 'christ', 'holy', 'spirit', 'father',
  'savior', 'saviour', 'messiah', 'emmanuel', 'immanuel',
  'jehovah', 'yahweh', 'king', 'shepherd', 'lamb',
]);

function toSentenceCase(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      const bare = word.replace(/[^a-z]/gi, '').toLowerCase();
      if (i === 0 || SACRED.has(bare)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

// ── Script pools by length ────────────────────────────────────
const POOLS = {
  short: {
    hope:    ['Hope rises', 'Living hope', 'Hope eternal', 'Unshaken hope', 'Hope remains'],
    light:   ['You are light', 'Light breaks in', 'Walk in light', 'Light of life', 'Shine on us'],
    grace:   ['Amazing grace', 'Grace abounds', 'By your grace', 'Grace prevails', 'Grace enough'],
    love:    ['Love endures', 'Perfect love', 'Love unfailing', 'Love saves all', 'Loved always'],
    praise:  ['We praise you', 'All praise rises', 'Worthy alone', 'Hallelujah', 'Praise him now'],
    faith:   ['By faith stand', 'Faith holds firm', 'Steadfast faith', 'Faith remains', 'Faith wins'],
    joy:     ['Joy rises up', 'Joy unspeakable', 'Overflowing joy', 'New joy daily', 'Joy breaks free'],
    peace:   ['Perfect peace', 'Peace like rivers', 'Still my soul', 'Peace reigns here', 'You are peace'],
    strong:  ['Mighty God', 'Strength renewed', 'Stand firm now', 'Power reigns', 'God is strong'],
    eternal: ['Forever faithful', 'He reigns always', 'Everlasting God', 'Never changing', 'Always faithful'],
    generic: ['We are yours', 'You reign', 'Holy ground', 'Spirit move', 'Draw us near',
              'Hearts open wide', 'Be glorified', 'Fully loved', 'Set apart', 'Come fill us'],
  },
  medium: {
    hope:    ['Hope is rising now', 'A living hope within', 'Hope breaks through the dark',
              'Our hope will never fail', 'Holding on to hope'],
    light:   ['Light breaks through the clouds', 'You are the light I need',
              'Walking in your light', 'Light of the world shines on', 'Your light dispels the dark'],
    grace:   ['Amazing grace flows free', 'Grace upon grace is given', 'By your grace we stand',
              'Your grace is all I need', 'Grace that covers every fall'],
    love:    ['Your love endures forever', 'Love that never lets me go', 'Unfailing love surrounds me',
              'Perfect love casts out all fear', 'Loved and fully known by you'],
    praise:  ['We give you all our praise', 'Worthy of the highest praise', 'Voices raised to glorify',
              'All praise belongs to you', 'Lifting up your holy name'],
    faith:   ['By faith we stand together', 'Faith that moves the mountains',
              'Walking boldly by your faith', 'Faith over every fear', 'Our faith is built on you'],
    joy:     ['Joy unspeakable and full', 'Joy comes in the morning light', 'Overflowing with your joy',
              'Dancing in your joy today', 'Joy that only you can bring'],
    peace:   ['Peace that passes understanding', 'Still my soul in your peace',
              'In perfect peace I trust you', 'Peace like a river flows', 'You are my peace and rest'],
    strong:  ['Strong in the strength you give', 'Mighty God you save us all', 'Power of the risen Lord',
              'Strength that is renewed each day', 'Standing firm in who you are'],
    eternal: ['Forever you are faithful Lord', 'Everlasting God you reign',
              'Your name endures through every age', 'Eternal King above all kings', 'Never changing never failing'],
    generic: ['You are worthy of it all', 'In your presence is fullness',
              'All things made new in you', 'Come and fill this place with glory',
              'Spirit move among us now', 'More of you and less of me',
              'Hearts surrendered at your feet', 'Eyes fixed only upon you'],
  },
  long: {
    hope:    ['Hope is rising in the darkest of our days', 'A living hope that anchors every storm',
              'Hope breaks through when nothing else remains', 'Our hope is built on nothing less than grace',
              'Holding fast to hope that never disappoints'],
    light:   ['Light breaks through the heavy clouds above us', 'You are the light that guides us through the night',
              'Walking in the light of your great love', 'Let your light shine in the darkest of our places',
              'Your light has overcome the deepest dark'],
    grace:   ['Amazing grace how sweet the sound that saved me', 'Grace upon grace is pouring over every soul',
              'By your grace we rise above the storms of life', 'Your grace is all I need to face each coming day',
              'Grace that covers every sin and every falling down'],
    love:    ['Your love endures through every trial and season', 'Love that never lets me go no matter where I turn',
              'Unfailing love surrounds me on every single side', 'Perfect love casts out the fear that held me captive',
              'Loved and fully known by the one who made me whole'],
    praise:  ['We give you all our praise for every single blessing', 'Worthy of the highest praise that we could ever bring',
              'Voices raised in praise for what your hands have done', 'All praise and honor rising up before your throne',
              'Lifting up your holy name above every other name'],
    faith:   ['By faith we step into the unknown trusting fully', 'Faith that moves the mountains blocking every path',
              'Walking boldly by your faith through every open door', 'Faith that overcomes the fear of what lies ahead',
              'Our faith is built on you the solid rock that holds'],
    joy:     ['Joy unspeakable and full is filling every corner', 'Joy comes in the morning after every weeping night',
              'Overflowing with a joy that nothing here can steal', 'Dancing in the overflow of your unending joy',
              'Joy that only comes from knowing you are fully mine'],
    peace:   ['Peace that passes all the understanding of this world', 'Still my soul and let your perfect peace surround me',
              'In your perfect peace I find the rest that I have longed for', 'Peace like a river flowing through the dry and thirsty land',
              'You are the peace I never knew that I was searching for'],
    strong:  ['Strong in the strength that only you alone can give to me', 'Mighty God who saves and holds us in your faithful hands',
              'Power of the risen Lord is rising up within these walls', 'Strength is renewed in those who wait upon the Lord their God',
              'Standing firm on every promise that you ever spoke to us'],
    eternal: ['Forever you are faithful through the changing of the ages', 'Everlasting God who reigns above all time and circumstance',
              'Your name endures through every generation yet to come', 'Eternal King above all kings who reigns forevermore in glory',
              'Never changing never failing always faithful to your word'],
    generic: ['You are worthy of every moment of our praise and adoration',
              'In your presence there is fullness of joy that satisfies',
              'All things are made completely new when you come into our lives',
              'Come and fill this place with glory till we cannot stand',
              'Spirit of the living God fall fresh upon us once again',
              'More of you and less of everything that holds us from your love',
              'Hearts completely surrendered lying open at your feet today',
              'Eyes that are fixed on you alone and nothing else that fades'],
  },
};

function generateScript(topic, count, lineLength) {
  if (!count || count < 1) return [];
  const pool = POOLS[lineLength] ?? POOLS.medium;
  const topicLower = (topic || '').toLowerCase();
  const matched = [];

  Object.entries(pool).forEach(([keyword, lines]) => {
    if (keyword !== 'generic' && topicLower.includes(keyword)) {
      matched.push(...lines);
    }
  });

  if (matched.length === 0) {
    Object.entries(pool).forEach(([keyword, lines]) => {
      if (keyword !== 'generic') matched.push(...lines);
    });
  }

  const shuffled = [...matched, ...pool.generic].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

// ── Line height constant — must match CSS exactly ─────────────
const LINE_HEIGHT_PX = 28; // px per line in the editor
const EDITOR_PADDING = 14; // matches .script-textarea padding-top

export default function ScriptSection() {
  const { state, dispatch } = useContext(AppContext);
  const textareaRef   = useRef(null);
  const lineNumRef    = useRef(null);
  const prevValidRef  = useRef(false);
  const [previewIdx, setPreviewIdx]     = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [gutterOffset, setGutterOffset] = useState(0); // px to translateY the line-num <pre>
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const fontPickerRef    = useRef(null);
  const fontTriggerRef   = useRef(null);
  const fontMenuRef      = useRef(null);
  const [fontMenuPos, setFontMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const [hasApiKey, setHasApiKey]       = useState(null); // null = not checked yet
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft]         = useState('');
  const [aiError, setAiError]           = useState(null);
  const [previewHeight, setPreviewHeight] = useState(200);
  const previewBgRef = useRef(null);

  // MUST be declared before the useEffect that depends on it (avoids TDZ crash)
  const isLocked = !state.selectedSong;

  // Measure the live preview's actual rendered height so font size exactly
  // matches the pipeline formula: ui_font_size * height / 1080.
  // Depends on isLocked: the preview div only exists in the DOM when !isLocked,
  // so we must re-run after the song is selected and the element is rendered.
  useEffect(() => {
    if (isLocked) return;
    let obs;
    // rAF ensures React has flushed the DOM before we measure
    const id = requestAnimationFrame(() => {
      const el = previewBgRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      if (h > 0) setPreviewHeight(h);
      obs = new ResizeObserver(([e]) => {
        const ch = e.contentRect.height;
        if (ch > 0) setPreviewHeight(ch);
      });
      obs.observe(el);
    });
    return () => {
      cancelAnimationFrame(id);
      obs?.disconnect();
    };
  }, [isLocked]); // eslint-disable-line

  // ── Sync line-number gutter with textarea scroll ───────────
  // overflow:hidden blocks scrollTop — so we translate the <pre> instead.
  // Native listener fires on every pixel, React onScroll can miss fast drags.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const syncScroll = () => setGutterOffset(ta.scrollTop);
    ta.addEventListener('scroll', syncScroll, { passive: true });
    return () => ta.removeEventListener('scroll', syncScroll);
  }, []);

  const handleScroll = () => {}; // kept for JSX prop; real work is above

  const handleScriptChange = (e) => {
    dispatch({ type: 'SET_SCRIPT', payload: e.target.value });
  };

  // Keep previewIdx in bounds
  useEffect(() => {
    if (previewIdx >= state.scriptLines.length && state.scriptLines.length > 0) {
      setPreviewIdx(0);
    }
  }, [state.scriptLines.length, previewIdx]);

  // ── Check for OpenAI key on mount ─────────────────────────
  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-openai-key').then(r => setHasApiKey(r.hasKey));
  }, []);

  const handleSaveKey = async () => {
    if (!keyDraft.trim()) return;
    const r = await window.electron.ipcRenderer.invoke('set-openai-key', keyDraft.trim());
    if (r.success) { setHasApiKey(true); setShowKeyInput(false); setKeyDraft(''); }
  };

  // ── Generate script via GPT-4o ─────────────────────────────
  const handleGenerate = async () => {
    if (!state.requiredLineCount) return;
    if (!hasApiKey) { setShowKeyInput(true); return; }

    setIsGenerating(true);
    setAiError(null);

    const result = await window.electron.ipcRenderer.invoke('generate-script-ai', {
      topic:      state.topic || '',
      lineCount:  state.requiredLineCount,
      lineLength: state.scriptLineLength || 'medium',
    });

    setIsGenerating(false);

    if (result.success) {
      dispatch({ type: 'SET_SCRIPT', payload: result.lines.join('\n') });
      setPreviewIdx(0);
    } else if (result.error === 'NO_KEY') {
      setShowKeyInput(true);
    } else {
      setAiError(result.error || 'Generation failed');
    }
  };

  // ── Auto-generate title when script first becomes valid ────
  useEffect(() => {
    const wasValid = prevValidRef.current;
    prevValidRef.current = state.isScriptValid;
    if (state.isScriptValid && !wasValid && !state.videoTitle && !state.titleLocked) {
      dispatch({ type: 'SET_VIDEO_TITLE', payload: generateVideoTitle(state.topic, state.scriptLines) });
      dispatch({ type: 'LOCK_TITLE' });
    }
  }, [state.isScriptValid]); // eslint-disable-line

  // ── Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo) ────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          // Redo: Ctrl+Shift+Z
          e.preventDefault();
          dispatch({ type: 'REDO_SCRIPT' });
        } else {
          // Undo: Ctrl+Z
          e.preventDefault();
          dispatch({ type: 'UNDO_SCRIPT' });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        // Redo: Ctrl+Y (Windows style)
        e.preventDefault();
        dispatch({ type: 'REDO_SCRIPT' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // ── Font picker: compute fixed position from trigger rect ──
  const updateFontMenuPos = useCallback(() => {
    if (!fontTriggerRef.current) return;
    const r = fontTriggerRef.current.getBoundingClientRect();
    setFontMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // ── Close font picker on outside click; reposition on scroll/resize ──
  useEffect(() => {
    if (!fontPickerOpen) return;
    updateFontMenuPos();
    const handleOut = (e) => {
      const inTrigger = fontPickerRef.current?.contains(e.target);
      const inMenu    = fontMenuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setFontPickerOpen(false);
    };
    document.addEventListener('mousedown', handleOut);
    window.addEventListener('scroll', updateFontMenuPos, true);
    window.addEventListener('resize', updateFontMenuPos);
    return () => {
      document.removeEventListener('mousedown', handleOut);
      window.removeEventListener('scroll', updateFontMenuPos, true);
      window.removeEventListener('resize', updateFontMenuPos);
    };
  }, [fontPickerOpen, updateFontMenuPos]);

  // ── Preview nav ────────────────────────────────────────────
  const prevLine = () => setPreviewIdx(i => Math.max(0, i - 1));
  const nextLine = () => setPreviewIdx(i => Math.min(state.scriptLines.length - 1, i + 1));

  // ── Derived ────────────────────────────────────────────────
  const lineCount   = state.scriptLineCount;
  const required    = state.requiredLineCount;
  const isValid     = state.isScriptValid;
  const delta       = lineCount - required;

  const rawLine     = state.scriptLines[previewIdx] ?? 'Your lyric line will appear here';
  const displayText = state.textCase === 'upper'
    ? rawLine.toUpperCase()
    : toSentenceCase(rawLine);  // sentence case: first word + sacred nouns capitalised

  const fontObj         = FONTS.find(f => f.value === state.selectedFont) ?? FONTS[0];
  const availableWeights = ALL_WEIGHTS.filter(w => fontObj.weights.includes(w.value));
  // If current fontWeight is not valid for new font, snap to nearest available
  const validWeight     = fontObj.weights.includes(state.fontWeight)
    ? state.fontWeight
    : fontObj.weights.reduce((prev, cur) =>
        Math.abs(cur - state.fontWeight) < Math.abs(prev - state.fontWeight) ? cur : prev
      );

  const totalLines  = state.scriptText.split('\n').length;
  const lineNums    = Array.from({ length: totalLines }, (_, i) => i + 1).join('\n');

  const vAlignMap   = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
  const vAlign      = vAlignMap[state.textPositionV] ?? 'center';

  const preview = isValid
    ? <>
        <span className="preview-pill done">{lineCount} lines</span>
        <span className="preview-pill">{fontObj.label}</span>
        <span className="preview-pill">{state.textCase === 'upper' ? 'UPPERCASE' : 'lowercase'}</span>
      </>
    : lineCount > 0
      ? <span className="preview-pill">{lineCount}/{required} lines</span>
      : <span className="preview-pill empty">No script</span>;

  return (
    <PhaseSection phaseNum={3} title="Script & Typography" preview={preview} locked={isLocked}>

      {isLocked && (
        <div className="phase-lock-notice">🔒 Select a song in Phase 2 first.</div>
      )}

      {!isLocked && (
        <div className="phase-content">
          <div className="script-two-col">

            {/* ══ LEFT COLUMN: Script + Controls ══ */}
            <div className="script-col-left">

              {/* ── Generate button (above line length) ── */}
              <div className="generate-btn-row">
                <button
                  className={`generate-script-btn ${isGenerating ? 'generating' : ''}`}
                  onClick={handleGenerate}
                  disabled={isGenerating || !state.requiredLineCount}
                >
                  {isGenerating ? '✦ Generating…' : '✦ Generate Script'}
                  {!isGenerating && state.requiredLineCount > 0 && (
                    <span className="generate-script-count">{state.requiredLineCount} lines</span>
                  )}
                </button>
              </div>

              {/* ── Line length ── */}
              <div className="generate-row">
                <div className="line-length-group">
                  <span className="typo-label">Line Length</span>
                  <div className="line-length-btns">
                    {['short', 'medium', 'long'].map(len => (
                      <button
                        key={len}
                        className={`line-length-btn ${state.scriptLineLength === len ? 'active' : ''}`}
                        onClick={() => dispatch({ type: 'SET_LINE_LENGTH', payload: len })}
                      >
                        {len.charAt(0).toUpperCase() + len.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── API key setup ── */}
              {showKeyInput && (
                <div className="ai-key-setup">
                  <p className="ai-key-label">Enter your OpenAI API key to enable AI script generation:</p>
                  <div className="ai-key-row">
                    <input
                      className="ai-key-input"
                      type="password"
                      placeholder="sk-..."
                      value={keyDraft}
                      onChange={e => setKeyDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                    />
                    <button className="ai-key-save-btn" onClick={handleSaveKey} disabled={!keyDraft.trim()}>
                      Save Key
                    </button>
                    <button className="ai-key-cancel-btn" onClick={() => setShowKeyInput(false)}>X</button>
                  </div>
                </div>
              )}

              {/* ── AI error ── */}
              {aiError && (
                <div className="ai-error-msg">{aiError}</div>
              )}

              {/* ── Line counter ── */}
              <div className="script-counter-row">
                <div className={`script-counter-badge ${isValid ? 'valid' : lineCount === 0 ? 'empty' : 'invalid'}`}>
                  {lineCount} / {required} lines
                </div>
                {!isValid && lineCount > 0 && (
                  <span className="script-counter-hint">
                    {delta > 0
                      ? `${delta} too many — remove ${delta}`
                      : `${Math.abs(delta)} missing — add ${Math.abs(delta)}`}
                  </span>
                )}
                {isValid && (
                  <span className="script-counter-hint valid-hint">✓ Matches marker count</span>
                )}
              </div>

              {/* ── Script editor ── */}
              <div className={`script-editor-wrap ${isValid ? 'editor-valid' : lineCount > 0 ? 'editor-invalid' : ''}`}>
                <div className="script-line-nums" ref={lineNumRef} aria-hidden="true">
                  <pre style={{ transform: `translateY(-${gutterOffset}px)` }}>{lineNums}</pre>
                </div>
                <textarea
                  ref={textareaRef}
                  className="script-textarea"
                  value={state.scriptText}
                  onChange={handleScriptChange}
                  onScroll={handleScroll}
                  placeholder={`Write ${required} lines — one per clip\n\nExample:\nHope is rising\nLight breaks through\nNew mercies every morning`}
                  spellCheck={false}
                />
              </div>

              {/* ── Typography controls ── */}
              <div className="typo-controls">

                <div className="typo-group">
                  <label className="typo-label">Font</label>
                  <div className="font-picker" ref={fontPickerRef}>
                    <button
                      ref={fontTriggerRef}
                      className="font-picker-trigger"
                      style={{ fontFamily: fontObj.stack }}
                      onClick={() => setFontPickerOpen(o => !o)}
                    >
                      <span>{fontObj.label}</span>
                      <span className="font-picker-caret">{fontPickerOpen ? '▲' : '▼'}</span>
                    </button>
                    {fontPickerOpen && createPortal(
                      <div
                        ref={fontMenuRef}
                        className="font-picker-menu"
                        style={{ position: 'fixed', top: fontMenuPos.top, left: fontMenuPos.left, width: fontMenuPos.width, zIndex: 99999 }}
                      >
                        {FONTS.map(f => (
                          <button
                            key={f.value}
                            className={`font-picker-item ${f.value === state.selectedFont ? 'active' : ''}`}
                            style={{ fontFamily: f.stack }}
                            onClick={() => {
                              dispatch({ type: 'SET_FONT', payload: f.value });
                              if (!f.weights.includes(state.fontWeight)) {
                                const snapped = f.weights.reduce((prev, cur) =>
                                  Math.abs(cur - state.fontWeight) < Math.abs(prev - state.fontWeight) ? cur : prev
                                );
                                dispatch({ type: 'SET_FONT_WEIGHT', payload: snapped });
                              }
                              setFontPickerOpen(false);
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                <div className="typo-group">
                  <label className="typo-label">Weight</label>
                  <select
                    className="typo-select typo-select-sm"
                    value={validWeight}
                    onChange={e => dispatch({ type: 'SET_FONT_WEIGHT', payload: Number(e.target.value) })}
                  >
                    {availableWeights.map(w => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>

                <div className="typo-group">
                  <label className="typo-label">Style</label>
                  <button
                    className={`typo-style-btn ${state.fontStyle === 'italic' ? 'active' : ''}`}
                    onClick={() => dispatch({
                      type: 'SET_FONT_STYLE',
                      payload: state.fontStyle === 'italic' ? 'normal' : 'italic'
                    })}
                  >
                    <em>I</em> Italic
                  </button>
                </div>

                <div className="typo-group typo-group-wide">
                  <label className="typo-label">Size — {state.fontSize}px</label>
                  <input
                    type="range"
                    className="typo-slider"
                    min={30}
                    max={140}
                    step={1}
                    value={state.fontSize}
                    onChange={e => dispatch({ type: 'SET_FONT_SIZE', payload: Number(e.target.value) })}
                  />
                </div>

                <div className="typo-group">
                  <label className="typo-label">Case</label>
                  <div className="case-btn-group">
                    <button
                      className={`case-btn ${state.textCase === 'upper' ? 'active' : ''}`}
                      onClick={() => dispatch({ type: 'SET_TEXT_CASE', payload: 'upper' })}
                    >UPPERCASE</button>
                    <button
                      className={`case-btn case-btn-sentence ${state.textCase === 'lower' ? 'active' : ''}`}
                      onClick={() => dispatch({ type: 'SET_TEXT_CASE', payload: 'lower' })}
                      title="First word + sacred names (God, Jesus, Lord…) capitalised"
                    >lowercase</button>
                  </div>
                </div>

                <div className="typo-group">
                  <label className="typo-label">Position</label>
                  <div className="position-btn-group">
                    {['top', 'center', 'bottom'].map(p => (
                      <button
                        key={p}
                        className={`position-btn ${state.textPositionV === p ? 'active' : ''}`}
                        onClick={() => dispatch({ type: 'SET_TEXT_POSITION_V', payload: p })}
                        title={p.charAt(0).toUpperCase() + p.slice(1)}
                      >
                        {p === 'top' ? '↑' : p === 'center' ? '+' : '↓'}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {isValid && (
                <div className="validation-success">
                  Script ready — continue to Video Title then Footage.
                </div>
              )}

            </div>{/* /script-col-left */}

            {/* ══ RIGHT COLUMN: Live Preview ══ */}
            <div className="script-col-right">
              <div className="script-preview-header">
                <span className="typo-label">Live Preview</span>
              </div>

              <div className="script-preview-box">
                <div className="script-preview-frame">
                  {/* Page nav — top-right corner inside preview */}
                  {state.scriptLines.length > 0 && (
                    <div className="preview-nav-overlay">
                      <button className="preview-nav-overlay-btn" onClick={prevLine} disabled={previewIdx === 0}>‹</button>
                      <span className="preview-nav-overlay-label">{previewIdx + 1} / {state.scriptLines.length}</span>
                      <button className="preview-nav-overlay-btn" onClick={nextLine} disabled={previewIdx >= state.scriptLines.length - 1}>›</button>
                    </div>
                  )}
                <div className="preview-video-bg" ref={previewBgRef} style={{ alignItems: vAlign }}>
                  <div
                    className="preview-text-overlay"
                    style={{
                      fontFamily:    fontObj.stack,
                      fontSize:      `${state.fontSize * previewHeight / 1080}px`,
                      fontWeight:    validWeight,
                      fontStyle:     state.fontStyle,
                      textTransform: 'none',
                      // No horizontal padding — keep it matching pipeline's 90%-of-width limit.
                      // Vertical padding only, for top/bottom position offset.
                      padding:       state.textPositionV === 'top'    ? '5% 0 0' :
                                     state.textPositionV === 'bottom' ? '0 0 7%' : '0',
                    }}
                  >
                    {displayText}
                  </div>
                </div>
                </div>{/* /script-preview-frame */}
              </div>{/* /script-preview-box */}
            </div>{/* /script-col-right */}

          </div>{/* /script-two-col */}
        </div>
      )}
    </PhaseSection>
  );
}
