import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../../App';
import '../sections.css';
import PhaseSection from '../PhaseSection';

const TOPIC_FALLBACKS = [
  'Hope in Crisis','Strength Through Loss','Grace and Redemption','Light in Darkness',
  'New Beginnings','Faith and Doubt','Love Unbreakable','Healing Hands','Purpose Found',
  'Peace in the Storm','Bold Beginnings','Break the Chains','Divine Comfort',
  'Eternal Hope','Everlasting Peace','Fear Not','Forgiven and Free','Freedom and Praise',
  'His Glory','His Mercy','Joy is on the Way','Love Never Fails','Mighty Savior',
  'Never Alone','Power in Prayer','Redeemed and Free','Renewed Hope','Rooted in Christ',
  'Sent with Purpose','The Great Commission','Together in Christ','Unfailing Love',
  'Unshakable Joy','Victory Belongs to the Lord','Walk in the Light','Worthy of All Praise',
];

export default function TopicSection() {
  const { state, dispatch } = useContext(AppContext);
  const [isGenerating, setIsGenerating] = useState(false);
  // Accumulates every topic generated for this project so AI never repeats one
  const usedTopicsRef = useRef([]);

  // Reset history when a new project is started (song changes = new project context)
  const prevSongPathRef = useRef(null);
  React.useEffect(() => {
    const currentPath = state.selectedSong?.audioPath ?? null;
    if (currentPath !== prevSongPathRef.current) {
      prevSongPathRef.current = currentPath;
      usedTopicsRef.current = [];
    }
  }, [state.selectedSong?.audioPath]);

  const handleTopicChange = (e) => {
    dispatch({ type: 'SET_TOPIC', payload: e.target.value });
  };

  const handleGenerateTopic = async () => {
    setIsGenerating(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('generate-topic-ai', {
        excludeTopics: usedTopicsRef.current,  // pass full history so AI avoids all of them
      });
      if (result.success && result.topic) {
        usedTopicsRef.current = [...usedTopicsRef.current, result.topic];
        dispatch({ type: 'SET_TOPIC', payload: result.topic });
      } else {
        // Fallback to local list — pick one not already used
        const unused = TOPIC_FALLBACKS.filter(t => !usedTopicsRef.current.includes(t));
        const pool = unused.length ? unused : TOPIC_FALLBACKS;
        const t = pool[Math.floor(Math.random() * pool.length)];
        usedTopicsRef.current = [...usedTopicsRef.current, t];
        dispatch({ type: 'SET_TOPIC', payload: t });
      }
    } catch {
      const unused = TOPIC_FALLBACKS.filter(t => !usedTopicsRef.current.includes(t));
      const pool = unused.length ? unused : TOPIC_FALLBACKS;
      const t = pool[Math.floor(Math.random() * pool.length)];
      usedTopicsRef.current = [...usedTopicsRef.current, t];
      dispatch({ type: 'SET_TOPIC', payload: t });
    } finally {
      setIsGenerating(false);
    }
  };

  const isTopicValid = state.topic.trim().length >= 3;

  const preview = isTopicValid
    ? <span className="preview-pill done">{state.topic}</span>
    : <span className="preview-pill empty">No topic set</span>;

  return (
    <PhaseSection phaseNum={1} title="Topic Engine" preview={preview}>
      <div className="phase-content">
        <div className="form-group">
          <label htmlFor="topic-input" className="form-label">
            Your Topic
          </label>
          <input
            id="topic-input"
            type="text"
            className="form-input"
            placeholder="e.g., Hope in Crisis, Strength Through Loss..."
            value={state.topic}
            onChange={handleTopicChange}
            maxLength={100}
          />
        </div>

        <div className="button-group">
          <button
            className={`generate-script-btn ${isGenerating ? 'generating' : ''}`}
            onClick={handleGenerateTopic}
            disabled={isGenerating}
            title="Generate a unique church topic with AI"
          >
            {isGenerating ? '✦ Generating…' : '✦ Generate Topic'}
          </button>
        </div>

        {!isTopicValid && state.topic.length > 0 && (
          <div className="validation-error">
            Topic must be at least 3 characters
          </div>
        )}

      </div>
    </PhaseSection>
  );
}
