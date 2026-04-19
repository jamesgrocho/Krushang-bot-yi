import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import './GodMode.css';

const TOPIC_FALLBACKS = [
  'Hope in Crisis', 'Strength Through Loss', 'Grace and Redemption', 'Light in Darkness',
  'New Beginnings', 'Faith and Doubt', 'Love Unbreakable', 'Healing Hands', 'Purpose Found',
  'Peace in the Storm', 'Bold Beginnings', 'Break the Chains', 'Divine Comfort',
  'Eternal Hope', 'Everlasting Peace', 'Fear Not', 'Forgiven and Free', 'Freedom and Praise',
  'His Glory', 'His Mercy', 'Joy is on the Way', 'Love Never Fails', 'Mighty Savior',
  'Never Alone', 'Power in Prayer', 'Redeemed and Free', 'Renewed Hope', 'Rooted in Christ',
];

// ── Script pools (fallback when no API key) ───────────────────
const POOLS = {
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
};

function generateScriptFallback(topic, count) {
  const pool = POOLS.medium;
  const topicLower = (topic || '').toLowerCase();
  const matched = [];
  Object.entries(pool).forEach(([keyword, lines]) => {
    if (keyword !== 'generic' && topicLower.includes(keyword)) matched.push(...lines);
  });
  if (matched.length === 0) {
    Object.entries(pool).forEach(([keyword, lines]) => {
      if (keyword !== 'generic') matched.push(...lines);
    });
  }
  const shuffled = [...matched, ...pool.generic].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Component ────────────────────────────────────────────────
export default function GodMode() {
  const { state, dispatch } = useContext(AppContext);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const canRun = state.availableSongs.length > 0;

  const [apiKeyReady, setApiKeyReady] = useState(false);
  useEffect(() => {
    window.electron.ipcRenderer.invoke('get-openai-key').then(r => setApiKeyReady(!!r?.hasKey));
  }, []);

  const handleGodMode = async () => {
    if (isRunning || !canRun) return;
    setIsRunning(true);

    // Small delay so the button animates before heavy work
    await new Promise(r => setTimeout(r, 60));

    // ── Phase 1: Topic ──────────────────────────────────────
    setStatusMsg('Picking topic…');
    let topic;
    if (apiKeyReady) {
      try {
        const result = await window.electron.ipcRenderer.invoke('generate-topic-ai');
        topic = (result.success && result.topic) ? result.topic : pick(TOPIC_FALLBACKS);
      } catch {
        topic = pick(TOPIC_FALLBACKS);
      }
    } else {
      topic = pick(TOPIC_FALLBACKS);
    }
    dispatch({ type: 'SET_TOPIC', payload: topic });

    // ── Phase 2: Song ───────────────────────────────────────
    setStatusMsg('Selecting song…');
    const song = pick(state.availableSongs);
    dispatch({ type: 'SELECT_SONG', payload: song });
    dispatch({ type: 'DISMISS_CASCADE_WARNINGS' });

    // Always use medium line length and 60px font for God Mode
    const lineLength = 'medium';
    dispatch({ type: 'SET_LINE_LENGTH', payload: lineLength });
    dispatch({ type: 'SET_FONT_SIZE', payload: 60 });

    // ── Phase 3: Script ─────────────────────────────────────
    setStatusMsg('Writing script…');
    let lines;
    if (apiKeyReady) {
      try {
        const result = await window.electron.ipcRenderer.invoke('generate-script-ai', {
          topic,
          lineCount:  song.requiredLines,
          lineLength,
        });
        if (result.success && result.lines?.length) {
          lines = result.lines;
        } else {
          lines = generateScriptFallback(topic, song.requiredLines);
        }
      } catch {
        lines = generateScriptFallback(topic, song.requiredLines);
      }
    } else {
      lines = generateScriptFallback(topic, song.requiredLines);
    }
    dispatch({ type: 'SET_SCRIPT', payload: lines.join('\n') });

    // ── Phase 4: Title ──────────────────────────────────────
    // Uses the topic + freshly generated script lines so the AI can see both
    setStatusMsg('Generating title…');
    let title;
    if (apiKeyReady) {
      try {
        const result = await window.electron.ipcRenderer.invoke('generate-title-ai', {
          topic,
          scriptLines: lines,
        });
        if (result.success && result.titles?.length) {
          // Auto-pick the first (Curiosity Gap) option in God Mode
          title = result.titles[0];
        } else if (result.success && result.title) {
          title = result.title;
        } else {
          title = topic;
        }
      } catch {
        title = topic;
      }
    } else {
      title = topic;
    }
    dispatch({ type: 'SET_VIDEO_TITLE', payload: title });
    dispatch({ type: 'LOCK_TITLE' });

    // ── Phase 5: Footage ────────────────────────────────────
    setStatusMsg('Filling footage…');
    dispatch({ type: 'GOD_MODE_TRIGGER' });

    setStatusMsg('');
    setIsRunning(false);
  };

  return (
    <div className="god-mode-bar">
      <div className="god-mode-stack">
        <div className="god-mode-gif-wrapper">
          <img src="./god-mode.gif" alt="" className="god-mode-gif" />
        </div>
        <div className="god-mode-ring">
          <button
            className={`god-mode-button ${isRunning ? 'god-mode-button--running' : ''}`}
            onClick={handleGodMode}
            disabled={isRunning || !canRun}
            title="Auto-fill every phase with AI-powered selections"
          >
            {isRunning ? (statusMsg || 'Running…') : 'God Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}
