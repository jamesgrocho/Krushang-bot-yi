import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import './ProjectLoader.css';

// mode='startup' — shown once at launch; auto-dismisses when no projects; LOAD_PROJECT replaces current (blank) tab
// mode='browse'  — opened from Projects button; never auto-dismisses; ADD_TAB_WITH_PROJECT opens in new tab
export default function ProjectLoader({ onLoadComplete, mode = 'startup' }) {
  const { dispatch } = useContext(AppContext);
  const [projects, setProjects]       = useState([]);
  const [trash, setTrash]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [dismissed, setDismissed]     = useState(false);
  const [showTrash, setShowTrash]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // filePath pending confirm
  const [expandedHistory, setExpandedHistory] = useState({}); // { [title]: true/false }
  const [history, setHistory]         = useState({}); // { [title]: [...historyItems] }

  const refreshLists = async () => {
    const [projectList, trashList] = await Promise.all([
      window.electron.ipcRenderer.invoke('auto-load-projects'),
      window.electron.ipcRenderer.invoke('list-trash-projects'),
    ]);
    setProjects(projectList || []);
    setTrash(trashList || []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await refreshLists();
      } catch (err) {
        console.error('[ProjectLoader] Error:', err);
        setError(err.message);
        if (mode === 'startup') setDismissed(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Startup mode only: auto-dismiss when no projects at all so the app opens clean
  useEffect(() => {
    if (mode !== 'startup') return;
    if (!loading && projects.length === 0 && trash.length === 0) setDismissed(true);
  }, [loading, projects.length, trash.length, mode]);

  const handleLoad = async (filePath) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('load-project', filePath);
      if (result.success) {
        if (mode === 'browse') {
          // Open in a new tab — never replace what's already open
          dispatch({ type: 'ADD_TAB_WITH_PROJECT', payload: result.projectData });
        } else {
          // Startup: replace the initial blank tab
          dispatch({ type: 'LOAD_PROJECT', payload: result.projectData });
        }
        setDismissed(true);
        onLoadComplete?.();
      } else {
        setError(result.error || 'Failed to load project');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteClick = (filePath) => setConfirmDelete(filePath);
  const handleDeleteCancel = () => setConfirmDelete(null);

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const fp = confirmDelete;
    // Find the title before clearing confirmDelete
    const deletedProject = projects.find(p => p.filePath === fp);
    setConfirmDelete(null);
    await window.electron.ipcRenderer.invoke('delete-project-file', fp);
    // Close any open tab with this project title and stop auto-save for it
    if (deletedProject?.title) {
      dispatch({ type: 'CLOSE_TAB_BY_TITLE', payload: deletedProject.title });
    }
    await refreshLists();
  };

  const handleRestore = async (trashFilePath) => {
    const result = await window.electron.ipcRenderer.invoke('restore-project', trashFilePath);
    if (result.success) await refreshLists();
    else setError(result.error);
  };

  const handleDismiss = () => { setDismissed(true); onLoadComplete?.(); };

  const toggleHistory = async (title) => {
    const isExpanding = !expandedHistory[title];
    setExpandedHistory(prev => ({ ...prev, [title]: isExpanding }));

    if (isExpanding && !history[title]) {
      // Fetch history for this project
      try {
        const hist = await window.electron.ipcRenderer.invoke('get-project-history', title);
        setHistory(prev => ({ ...prev, [title]: hist }));
      } catch (err) {
        console.error(`[ProjectLoader] Error fetching history for ${title}:`, err);
      }
    }
  };

  const handleLoadHistory = async (historyPath) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('load-project', historyPath);
      if (result.success) {
        if (mode === 'browse') {
          dispatch({ type: 'ADD_TAB_WITH_PROJECT', payload: result.projectData });
        } else {
          dispatch({ type: 'LOAD_PROJECT', payload: result.projectData });
        }
        setDismissed(true);
        onLoadComplete?.();
      } else {
        setError(result.error || 'Failed to load history version');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const footerLabel = mode === 'browse' ? 'Close' : 'Start New Project';

  if (dismissed || loading) return null;

  const fmtDate = (ts) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="project-loader-overlay">
      <div className="project-loader-modal">
        <div className="project-loader-header">
          <h2 className="project-loader-title">Recent Projects</h2>
          <button className="project-loader-close" onClick={handleDismiss} title="Close">X</button>
        </div>

        {error && <div className="project-loader-error">{error}</div>}

        {/* Confirm delete overlay */}
        {confirmDelete && (
          <div className="pl-confirm-bar">
            <span className="pl-confirm-msg">Move this project to trash?</span>
            <button className="pl-confirm-yes" onClick={handleDeleteConfirm}>Delete</button>
            <button className="pl-confirm-no"  onClick={handleDeleteCancel}>Cancel</button>
          </div>
        )}

        <div className="project-loader-list">
          {projects.length === 0 && (
            <div className="pl-empty">No saved projects yet.</div>
          )}
          {projects.map((project) => (
            <div key={project.filePath} className="project-loader-item-group">
              <div className="project-loader-item">
                <div className="project-loader-item-info">
                  <div className="project-loader-item-title">{project.title}</div>
                  <div className="project-loader-item-time">{fmtDate(project.modifiedAt)}</div>
                  <button
                    className="pl-history-toggle-btn"
                    onClick={() => toggleHistory(project.title)}
                    title="Save history"
                  >
                    {expandedHistory[project.title] ? '▼' : '▶'} History
                  </button>
                </div>
                <div className="pl-item-actions">
                  <button
                    className="project-loader-item-btn"
                    onClick={() => handleLoad(project.filePath)}
                  >
                    Load
                  </button>
                  <button
                    className="pl-delete-btn"
                    onClick={() => handleDeleteClick(project.filePath)}
                    title="Delete project"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Save history dropdown */}
              {expandedHistory[project.title] && (
                <div className="pl-history-dropdown">
                  {(!history[project.title] || history[project.title].length === 0) && (
                    <div className="pl-history-empty">No save history yet</div>
                  )}
                  {history[project.title]?.map((histItem) => (
                    <div key={histItem.filePath} className="pl-history-item">
                      <div className="pl-history-info">
                        <div className="pl-history-label">{histItem.label || histItem.slot || 'Saved version'}</div>
                        <div className="pl-history-time">{fmtDate(histItem.savedAt)}</div>
                      </div>
                      <button
                        className="pl-history-load-btn"
                        onClick={() => handleLoadHistory(histItem.filePath)}
                      >
                        Load
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Trash section */}
        {trash.length > 0 && (
          <div className="pl-trash-section">
            <button className="pl-trash-toggle" onClick={() => setShowTrash(v => !v)}>
              {showTrash ? '▾' : '▸'} Deleted ({trash.length})
            </button>
            {showTrash && (
              <div className="pl-trash-list">
                {trash.map((item) => (
                  <div key={item.filePath} className="pl-trash-item">
                    <div className="pl-trash-info">
                      <div className="pl-trash-title">{item.title}</div>
                      <div className="pl-trash-time">Deleted {fmtDate(item.deletedAt)}</div>
                    </div>
                    <button className="pl-restore-btn" onClick={() => handleRestore(item.filePath)}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="project-loader-footer">
          {mode === 'startup' && (
            <button className="project-loader-footer-btn" onClick={handleDismiss}>
              Start New Project
            </button>
          )}
          {mode === 'browse' && (
            <button className="project-loader-footer-btn" onClick={handleDismiss}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
