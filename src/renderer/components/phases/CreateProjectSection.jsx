import React, { useContext, useState, useEffect, useCallback } from 'react';
import { AppContext } from '../../App';
import '../sections.css';
import './CreateProjectSection.css';
import PhaseSection from '../PhaseSection';

const STEPS = [
  { key: 'auth',      label: 'Authenticating with Google' },
  { key: 'folders',   label: 'Creating Drive folders' },
  { key: 'video',     label: 'Moving video to Drive' },
  { key: 'scriptdoc', label: 'Creating Script doc' },
  { key: 'descdoc',   label: 'Creating Description doc' },
  { key: 'ai',        label: 'Generating AI content (100 keywords + 100 verses)' },
  { key: 'airtable',  label: 'Creating Airtable record' },
];

// Map progress message strings to step keys
const MESSAGE_TO_STEP = {
  'Authenticating with Google':                        'auth',
  'Creating Drive folders':                            'folders',
  'Moving video to Drive':                             'video',
  'Creating Script doc':                               'scriptdoc',
  'Creating Description doc':                          'descdoc',
  'Generating AI content (100 keywords + 100 verses)': 'ai',
  'Creating Airtable record':                          'airtable',
};

function formatPublishedAt(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `today at ${time}` : `${d.toLocaleDateString()} at ${time}`;
}

function ReadinessRow({ ok, label, detail }) {
  return (
    <div className={`cp-check-row ${ok ? 'cp-check-row--ok' : 'cp-check-row--missing'}`}>
      <span className="cp-check-icon">{ok ? '✓' : '○'}</span>
      <span className="cp-check-label">{label}</span>
      <span className="cp-check-detail">{detail}</span>
    </div>
  );
}

export default function CreateProjectSection() {
  const { state, dispatch } = useContext(AppContext);

  const [isRunning, setIsRunning]       = useState(false);
  const [stepStates, setStepStates]     = useState({}); // key → 'pending' | 'active' | 'done'
  const [error, setError]               = useState(null);
  const [result, setResult]             = useState(null);

  const titleReady  = !!(state.videoTitle && state.videoTitle.trim());
  const renderReady = !!(state.renderedVideoPath && state.renderedVideoPath.trim());
  const allReady    = titleReady && renderReady;

  // Listen for progress events from main process
  useEffect(() => {
    const handler = (msg) => {
      const stepKey = MESSAGE_TO_STEP[msg];
      if (!stepKey) return;

      setStepStates(prev => {
        const next = { ...prev };
        const stepIndex = STEPS.findIndex(s => s.key === stepKey);

        // Mark all previous steps as done
        STEPS.forEach((s, i) => {
          if (i < stepIndex) next[s.key] = 'done';
        });

        // Mark current step as active
        next[stepKey] = 'active';

        return next;
      });
    };

    window.electron.ipcRenderer.on('create-project-progress', handler);
    return () => window.electron.ipcRenderer.removeListener('create-project-progress', handler);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!allReady || isRunning) return;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setStepStates({});

    const res = await window.electron.ipcRenderer.invoke('create-project', {
      videoTitle:        state.videoTitle,
      scriptLines:       state.scriptLines,
      renderedVideoPath: state.renderedVideoPath,
    });

    setIsRunning(false);

    if (res.success) {
      // Mark all steps as done
      const allDone = {};
      STEPS.forEach(s => { allDone[s.key] = 'done'; });
      setStepStates(allDone);
      setResult(res);
      dispatch({ type: 'SET_LAST_PUBLISHED_AT', payload: new Date().toISOString() });
    } else {
      setError(res.error || 'Unknown error');
    }
  }, [allReady, isRunning, state]);

  const handleOpenUrl = useCallback((url) => {
    window.electron.ipcRenderer.invoke('open-url', url);
  }, []);

  const handleTryAgain = () => {
    setError(null);
    setResult(null);
    setStepStates({});
    setIsRunning(false);
  };

  const isAuthError = error && error.toLowerCase().includes('auth');

  // Determine step display states
  const getStepState = (key) => {
    if (stepStates[key]) return stepStates[key];
    return 'pending';
  };

  const preview = result
    ? <span className="preview-pill done">Project created</span>
    : isRunning
      ? <span className="preview-pill pending">Creating…</span>
      : allReady
        ? <span className="preview-pill done">Ready</span>
        : <span className="preview-pill empty">Not ready</span>;

  const isLocked = !state.renderedVideoPath;

  return (
    <PhaseSection phaseNum={6} title="Create Project" preview={preview} locked={isLocked}>
      {isLocked && (
        <div className="phase-lock-notice">Complete a render first to create the project.</div>
      )}

      {!isLocked && (
        <div className="phase-content">

          {/* ── Readiness checklist ── */}
          <div className="cp-checklist">
            <ReadinessRow
              ok={titleReady}
              label="Video Title"
              detail={titleReady ? state.videoTitle : 'No title set — add one in Phase 3'}
            />
            <ReadinessRow
              ok={renderReady}
              label="Render Complete"
              detail={renderReady ? state.renderedVideoPath : 'No render found yet'}
            />
          </div>

          {/* ── Last published timestamp ── */}
          {state.lastPublishedAt && !isRunning && (
            <div className="cp-last-published">
              <span className="cp-last-published-icon">✓</span>
              Last published {formatPublishedAt(state.lastPublishedAt)}
            </div>
          )}

          {/* ── Create / Republish button (hide while running or showing fresh success) ── */}
          {!result && !isRunning && (
            <button
              className={`cp-create-btn ${allReady ? 'cp-create-btn--ready' : ''} ${state.lastPublishedAt ? 'cp-create-btn--republish' : ''}`}
              onClick={handleCreate}
              disabled={!allReady}
            >
              {state.lastPublishedAt ? '↺ Republish Project' : '✦ Create Project'}
            </button>
          )}

          {/* ── Re-create button shown after a fresh success ── */}
          {result && (
            <button
              className="cp-create-btn cp-create-btn--ready cp-create-btn--republish"
              onClick={() => { setResult(null); setStepStates({}); }}
            >
              ↺ Republish Project
            </button>
          )}

          {/* ── Step progress list ── */}
          {(isRunning || Object.keys(stepStates).length > 0) && !result && (
            <div className="cp-steps">
              {STEPS.map(step => {
                const state_ = getStepState(step.key);
                return (
                  <div key={step.key} className={`cp-step cp-step--${state_}`}>
                    <span className="cp-step-icon">
                      {state_ === 'done'   ? '✓' :
                       state_ === 'active' ? '...' :
                                             '○'}
                    </span>
                    <span className="cp-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Success state ── */}
          {result && (
            <div className="cp-success">
              <div className="cp-success-title">Project created successfully!</div>
              <div className="cp-success-links">
                <button
                  className="cp-link-btn"
                  onClick={() => handleOpenUrl(result.finalsFolderLink)}
                >
                  Open Finals Folder
                </button>
                <button
                  className="cp-link-btn"
                  onClick={() => handleOpenUrl(result.scriptDocLink)}
                >
                  Script Doc
                </button>
                <button
                  className="cp-link-btn"
                  onClick={() => handleOpenUrl(result.descDocLink)}
                >
                  📝 Description Doc
                </button>
              </div>
            </div>
          )}

          {/* ── Error state ── */}
          {error && (
            <div className="cp-error">
              <div className="cp-error-title">Failed to create project</div>
              <div className="cp-error-msg">{error}</div>
              {isAuthError && (
                <div className="cp-error-auth-note">
                  A browser tab will open for Google authorization — complete it and return here.
                </div>
              )}
              <button className="cp-error-retry-btn" onClick={handleTryAgain}>
                Try Again
              </button>
            </div>
          )}

        </div>
      )}
    </PhaseSection>
  );
}
