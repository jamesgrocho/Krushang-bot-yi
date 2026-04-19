import React, { createContext, useReducer, useEffect, useRef, useState } from 'react';
import TopNavBar from './components/TopNavBar';
import SideNav from './components/SideNav';
import MainContent from './components/MainContent';
import TabBar from './components/TabBar';
import ProjectLoader from './components/ProjectLoader';
import './App.css';

export const AppContext = createContext();

// ─── Per-project initial state ────────────────────────────────────────────────
const initialProjectState = {
  // Phase 1: Topic
  topic: '',
  generatedTitle: '',
  userTitle: '',

  // Phase 2: Audio
  selectedSong: null,
  selectedSongPath: '',
  selectedSongAudioPath: '',
  markers: [],
  markerCount: 0,
  requiredLineCount: 0,
  previewTime: 0,
  isPlayingPreview: false,
  availableSongs: [],
  fadeMarkers: [],

  // Phase 3: Script
  scriptText: '',
  scriptLines: [],
  scriptLineCount: 0,
  videoTitle: '',
  titleLocked: false,
  selectedFont: 'HelveticaNeue',
  fontWeight: 700,
  fontStyle: 'normal',
  fontSize: 175,
  textCase: 'upper',
  textPositionV: 'center',
  scriptLineLength: 'medium',
  isScriptValid: false,
  validationErrors: [],
  existingTitles: [],
  scriptHistory: [],
  scriptHistoryIdx: -1,

  // Phase 4: Footage
  selectedFootageFolders: [],
  selectedClipPaths: [],
  allAvailableFolders: [],
  storyboard: [],
  isFootageStale: false,

  // Phase 5: Render
  renderedVideoPath: '',

  // Phase 6: Create Project
  isCreatingProject: false,
  projectStatus: { folders: false, docs: false, airtable: false },
  projectError: null,
  lastPublishedAt: null, // ISO timestamp of last successful Create Project

  // Global
  projectLoadId: 0,
  autoSaveTimestamp: Date.now(),
  renderQueue: [],
  cascadeWarnings: [],
  godModeCounter: 0,
};

// ─── Per-project reducer ──────────────────────────────────────────────────────
function projectReducer(state, action) {
  switch (action.type) {
    case 'SET_TOPIC':
      return { ...state, topic: action.payload };
    case 'SET_TITLE':
      return { ...state, userTitle: action.payload };
    case 'SET_GENERATED_TITLE':
      return { ...state, generatedTitle: action.payload };
    case 'SET_AVAILABLE_SONGS':
      return { ...state, availableSongs: action.payload };
    case 'SELECT_SONG': {
      const song = action.payload;
      const hasScript = state.scriptLines.length > 0;
      const hasFootage = state.storyboard.length > 0;
      const shouldWarn = hasScript || hasFootage;
      return {
        ...state,
        selectedSong: song,
        selectedSongPath: song.path,
        selectedSongAudioPath: song.audioPath,
        markers: [...song.markers],
        markerCount: song.markerCount,
        requiredLineCount: song.requiredLines,
        isScriptValid: state.scriptLines.length === song.requiredLines,
        fadeMarkers: song.fadeMarkers && song.fadeMarkers.length > 0 ? song.fadeMarkers : [],
        cascadeWarnings: shouldWarn
          ? [{ phase: 'audio', message: `Song changed. Script and Footage may need updating (now need ${song.requiredLines} lines).` }]
          : [],
      };
    }
    case 'UPDATE_MARKERS': {
      const markers = action.payload;
      const reqLines = markers.length;
      return {
        ...state,
        markers,
        markerCount: markers.length,
        requiredLineCount: reqLines,
        isScriptValid: state.scriptLines.length === reqLines,
      };
    }
    case 'UPDATE_SONG_LABELS_PATH':
      return {
        ...state,
        selectedSong: state.selectedSong
          ? { ...state.selectedSong, labelsPath: action.payload }
          : state.selectedSong,
      };
    case 'SET_FADE_MARKERS':
      return { ...state, fadeMarkers: action.payload };
    case 'ADD_FADE_MARKER':
      return { ...state, fadeMarkers: [...state.fadeMarkers, action.payload] };
    case 'UPDATE_FADE_MARKER': {
      const { id, changes } = action.payload;
      return {
        ...state,
        fadeMarkers: state.fadeMarkers.map(fm => fm.id === id ? { ...fm, ...changes } : fm),
      };
    }
    case 'DELETE_FADE_MARKER':
      return { ...state, fadeMarkers: state.fadeMarkers.filter(fm => fm.id !== action.payload) };
    case 'RESTORE_HISTORY': {
      const { markers, fadeMarkers } = action.payload;
      const reqLines = markers.length;
      return {
        ...state,
        markers,
        markerCount: markers.length,
        requiredLineCount: reqLines,
        isScriptValid: state.scriptLines.length === reqLines,
        fadeMarkers,
      };
    }
    case 'DISMISS_CASCADE_WARNINGS':
      return { ...state, cascadeWarnings: [] };
    case 'SET_SCRIPT': {
      const lines = action.payload.split('\n').filter(l => l.trim());
      const newHistory = state.scriptHistory.slice(0, state.scriptHistoryIdx + 1);
      newHistory.push(action.payload);
      return {
        ...state,
        scriptText: action.payload,
        scriptLines: lines,
        scriptLineCount: lines.length,
        isScriptValid: lines.length === state.requiredLineCount,
        scriptHistory: newHistory,
        scriptHistoryIdx: newHistory.length - 1,
      };
    }
    case 'UNDO_SCRIPT': {
      if (state.scriptHistoryIdx <= 0) return state;
      const newIdx = state.scriptHistoryIdx - 1;
      const scriptText = state.scriptHistory[newIdx];
      const lines = scriptText.split('\n').filter(l => l.trim());
      return {
        ...state, scriptText, scriptLines: lines, scriptLineCount: lines.length,
        isScriptValid: lines.length === state.requiredLineCount, scriptHistoryIdx: newIdx,
      };
    }
    case 'REDO_SCRIPT': {
      if (state.scriptHistoryIdx >= state.scriptHistory.length - 1) return state;
      const newIdx = state.scriptHistoryIdx + 1;
      const scriptText = state.scriptHistory[newIdx];
      const lines = scriptText.split('\n').filter(l => l.trim());
      return {
        ...state, scriptText, scriptLines: lines, scriptLineCount: lines.length,
        isScriptValid: lines.length === state.requiredLineCount, scriptHistoryIdx: newIdx,
      };
    }
    case 'SET_VIDEO_TITLE':     return { ...state, videoTitle: action.payload };
    case 'LOCK_TITLE':          return { ...state, titleLocked: true };
    case 'UNLOCK_TITLE':        return { ...state, titleLocked: false };
    case 'SET_EXISTING_TITLES': return { ...state, existingTitles: action.payload };
    case 'SET_FONT':            return { ...state, selectedFont: action.payload };
    case 'SET_FONT_WEIGHT':     return { ...state, fontWeight: action.payload };
    case 'SET_FONT_STYLE':      return { ...state, fontStyle: action.payload };
    case 'SET_FONT_SIZE':       return { ...state, fontSize: action.payload };
    case 'SET_TEXT_CASE':       return { ...state, textCase: action.payload };
    case 'SET_TEXT_POSITION_V': return { ...state, textPositionV: action.payload };
    case 'SET_LINE_LENGTH':     return { ...state, scriptLineLength: action.payload };

    case 'SET_ALL_FOOTAGE_FOLDERS':
      return { ...state, allAvailableFolders: action.payload };
    case 'TOGGLE_FOOTAGE_FOLDER': {
      const folder = action.payload;
      const isOpen = state.selectedFootageFolders.some(f => f.path === folder.path);
      if (isOpen) {
        const updatedFolders = state.selectedFootageFolders.filter(f => f.path !== folder.path);
        const folderClipSet = new Set(folder.clips);
        const updatedClips = state.selectedClipPaths.filter(c => !folderClipSet.has(c));
        return { ...state, selectedFootageFolders: updatedFolders, selectedClipPaths: updatedClips };
      } else {
        const newClips = folder.clips.filter(c => !state.selectedClipPaths.includes(c));
        return {
          ...state,
          selectedFootageFolders: [...state.selectedFootageFolders, folder],
          selectedClipPaths: [...state.selectedClipPaths, ...newClips],
        };
      }
    }
    case 'TOGGLE_CLIP_PATH': {
      const clip = action.payload;
      const has = state.selectedClipPaths.includes(clip);
      return {
        ...state,
        selectedClipPaths: has
          ? state.selectedClipPaths.filter(c => c !== clip)
          : [...state.selectedClipPaths, clip],
      };
    }
    case 'CLEAR_ALL_FOOTAGE':
      return { ...state, selectedFootageFolders: [], selectedClipPaths: [] };
    case 'SET_FOOTAGE_FOLDERS': {
      const folders = action.payload;
      const clips = folders.flatMap(f => f.clips);
      return { ...state, selectedFootageFolders: folders, selectedClipPaths: clips };
    }
    case 'SET_STORYBOARD':
      return { ...state, storyboard: action.payload, isFootageStale: false };
    case 'MARK_FOOTAGE_STALE':
      return { ...state, isFootageStale: true };
    case 'GOD_MODE_TRIGGER':
      return { ...state, godModeCounter: state.godModeCounter + 1 };
    case 'SET_RENDERED_VIDEO_PATH':
      return { ...state, renderedVideoPath: action.payload };
    case 'AUTO_SAVE':
      return { ...state, autoSaveTimestamp: Date.now() };
    case 'CLEAR_ALL':
      return { ...initialProjectState };

    case 'LOAD_PROJECT': {
      const p = action.payload;
      const songObj = p.song ? {
        name:          p.song.name        || '',
        path:          p.song.path        || '',
        audioPath:     p.song.audioPath   || '',
        labelsPath:    p.song.labelsPath  || '',
        markerCount:   p.song.markerCount || 0,
        requiredLines: p.song.requiredLines || 0,
        markers:       p.markers || [],
      } : null;
      const loadedLines = (p.script?.lines) || [];
      const loadedText  = (p.script?.text)  || loadedLines.join('\n');
      const reqLines    = p.markers?.length || 0;
      return {
        ...initialProjectState,
        topic:                p.topic        || '',
        selectedSong:         songObj,
        selectedSongPath:     p.song?.path      || '',
        selectedSongAudioPath: p.song?.audioPath || '',
        markers:              p.markers          || [],
        markerCount:          p.song?.markerCount || 0,
        requiredLineCount:    reqLines,
        videoTitle:           p.videoTitle   || '',
        titleLocked:          !!(p.videoTitle),
        scriptText:           loadedText,
        scriptLines:          loadedLines,
        scriptLineCount:      loadedLines.length,
        isScriptValid:        loadedLines.length === reqLines,
        scriptHistory:        loadedText ? [loadedText] : [],
        scriptHistoryIdx:     loadedText ? 0 : -1,
        selectedFont:   p.textStyle?.font      || initialProjectState.selectedFont,
        fontWeight:     p.textStyle?.weight    || initialProjectState.fontWeight,
        fontStyle:      p.textStyle?.style     || initialProjectState.fontStyle,
        fontSize:       p.textStyle?.size      || initialProjectState.fontSize,
        textCase:       p.textStyle?.case      || initialProjectState.textCase,
        textPositionV:  p.textStyle?.positionV || initialProjectState.textPositionV,
        fadeMarkers: p.fadeMarkers || [],
        storyboard:        p.footage?.storyboard || [],
        selectedClipPaths: (p.footage?.storyboard || []).filter(Boolean),
        projectLoadId:     (state.projectLoadId || 0) + 1,
        renderedVideoPath: p.render?.renderedVideoPath || '',
        lastPublishedAt:   p.publish?.lastPublishedAt  || null,
        autoSaveTimestamp: Date.now(),
      };
    }
    case 'SET_LAST_PUBLISHED_AT':
      return { ...state, lastPublishedAt: action.payload };
    default:
      return state;
  }
}

// ─── Tab helpers ──────────────────────────────────────────────────────────────
let tabCounter = 1;
function makeTabId() { return `tab-${++tabCounter}`; }

function createTab(id, projectState = null) {
  return { id, projectState: projectState ? { ...projectState } : { ...initialProjectState } };
}

// ─── Meta-state (tabs + render states) ───────────────────────────────────────
const metaInitialState = {
  tabs:          [createTab('tab-1')],
  activeTabId:   'tab-1',
  renderStates:  {},
  deletedTitles: new Set(), // titles deleted from the project picker; auto-save skips these
};

function appReducer(metaState, action) {
  switch (action.type) {

    case 'ADD_TAB': {
      const newId = makeTabId();
      return {
        ...metaState,
        tabs: [...metaState.tabs, createTab(newId)],
        activeTabId: newId,
        // Fresh tab always starts with empty render state
        renderStates: { ...metaState.renderStates, [newId]: {} },
      };
    }

    case 'ADD_TAB_WITH_PROJECT': {
      // If this project is already open in a tab, just switch to it
      const projectTitle = action.payload?.videoTitle;
      if (projectTitle) {
        const existingTab = metaState.tabs.find(t => t.projectState?.videoTitle === projectTitle);
        if (existingTab) {
          return { ...metaState, activeTabId: existingTab.id };
        }
      }
      const newId = makeTabId();
      const loadedState = projectReducer({ ...initialProjectState }, {
        type: 'LOAD_PROJECT',
        payload: action.payload,
      });
      return {
        ...metaState,
        tabs: [...metaState.tabs, { id: newId, projectState: loadedState }],
        activeTabId: newId,
        // Fresh tab always starts with empty render state (no stale video players)
        renderStates: { ...metaState.renderStates, [newId]: {} },
      };
    }

    case 'CLOSE_TAB': {
      const tabId = action.payload;
      if (metaState.tabs.length === 1) return metaState; // always keep ≥1 tab
      const newTabs = metaState.tabs.filter(t => t.id !== tabId);
      const newActiveId = metaState.activeTabId === tabId
        ? newTabs[Math.max(0, newTabs.length - 1)].id
        : metaState.activeTabId;
      const newRS = { ...metaState.renderStates };
      delete newRS[tabId];
      return { ...metaState, tabs: newTabs, activeTabId: newActiveId, renderStates: newRS };
    }

    case 'CLOSE_TAB_BY_TITLE': {
      // Close every open tab whose videoTitle matches the deleted project title,
      // and add the title to deletedTitles so auto-save never re-creates the file.
      const title = action.payload; // the videoTitle string
      const newDeletedTitles = new Set(metaState.deletedTitles);
      newDeletedTitles.add(title);

      const tabsToClose = metaState.tabs.filter(
        t => t.projectState.videoTitle?.trim() === title.trim()
      );
      if (tabsToClose.length === 0) {
        // No open tab for this title — just mark deleted so auto-save skips it
        return { ...metaState, deletedTitles: newDeletedTitles };
      }

      let newTabs = metaState.tabs.filter(
        t => t.projectState.videoTitle?.trim() !== title.trim()
      );
      // Always keep at least one tab
      if (newTabs.length === 0) newTabs = [createTab(makeTabId())];

      const closedIds = new Set(tabsToClose.map(t => t.id));
      const newActiveId = closedIds.has(metaState.activeTabId)
        ? newTabs[newTabs.length - 1].id
        : metaState.activeTabId;

      const newRS = { ...metaState.renderStates };
      for (const id of closedIds) delete newRS[id];

      return {
        ...metaState,
        tabs: newTabs,
        activeTabId: newActiveId,
        renderStates: newRS,
        deletedTitles: newDeletedTitles,
      };
    }

    case 'SWITCH_TAB':
      return { ...metaState, activeTabId: action.payload };

    case 'SET_RENDER_STATE': {
      const { tabId, changes } = action.payload;
      return {
        ...metaState,
        renderStates: {
          ...metaState.renderStates,
          [tabId]: { ...(metaState.renderStates[tabId] || {}), ...changes },
        },
      };
    }

    default: {
      // Forward all project-level actions to the active tab
      const activeIdx = metaState.tabs.findIndex(t => t.id === metaState.activeTabId);
      if (activeIdx === -1) return metaState;
      const updatedProject = projectReducer(metaState.tabs[activeIdx].projectState, action);
      if (updatedProject === metaState.tabs[activeIdx].projectState) return metaState;
      const updatedTabs = metaState.tabs.map((t, i) =>
        i === activeIdx ? { ...t, projectState: updatedProject } : t
      );
      return { ...metaState, tabs: updatedTabs };
    }
  }
}

// ─── App component ────────────────────────────────────────────────────────────
export default function App() {
  const [metaState, dispatch] = useReducer(appReducer, metaInitialState);
  const [projectLoaderDone, setProjectLoaderDone] = React.useState(false);
  const [showProjectLoader, setShowProjectLoader] = React.useState(false);

  // Stable ref so intervals/effects always read fresh meta-state
  const metaStateRef = useRef(metaState);
  useEffect(() => { metaStateRef.current = metaState; }, [metaState]);

  // Active project state (what all existing components consume)
  const activeTab = metaState.tabs.find(t => t.id === metaState.activeTabId)
    || metaState.tabs[0];
  const activeProjectState = activeTab.projectState;

  // Per-tab previous title map — keyed by tabId so multi-tab saves never
  // confuse one project's old title with another project's current title.
  // (A single shared ref caused cross-tab deletes when looping through all tabs.)
  const previousTitlesRef = useRef({}); // { [tabId]: string }

  // Debounce timer ref for the immediate auto-save on state changes
  const immediateSaveTimerRef = useRef(null);

  // Track which tabs are currently saving (shows indicator on tab)
  const [savingTabIds, setSavingTabIds] = useState(new Set());

  // ── Global render/preview progress listener ────────────────────────────────
  // Runs once; handles progress for ALL tabs, even when not active.
  useEffect(() => {
    const onRenderProgress = ({ pct, tabId }) => {
      dispatch({ type: 'SET_RENDER_STATE', payload: { tabId, changes: { progress: pct } } });
    };
    const onPreviewProgress = ({ pct, tabId }) => {
      dispatch({ type: 'SET_RENDER_STATE', payload: { tabId, changes: { previewProgress: pct } } });
    };
    window.electron.ipcRenderer.on('render-progress',  onRenderProgress);
    window.electron.ipcRenderer.on('preview-progress', onPreviewProgress);
    return () => {
      window.electron.ipcRenderer.removeListener('render-progress',  onRenderProgress);
      window.electron.ipcRenderer.removeListener('preview-progress', onPreviewProgress);
    };
  }, []);

  // ── Auto-save every 10 min — saves ALL tabs that have a videoTitle ───────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const { tabs } = metaStateRef.current;
      // Prune previousTitles for tabs that no longer exist
      const liveIds = new Set(tabs.map(t => t.id));
      for (const id of Object.keys(previousTitlesRef.current)) {
        if (!liveIds.has(id)) delete previousTitlesRef.current[id];
      }
      const { deletedTitles } = metaStateRef.current;
      for (const tab of tabs) {
        const ps = tab.projectState;
        if (!ps.videoTitle?.trim()) continue;
        // Skip tabs whose project was deleted from the project picker
        if (deletedTitles.has(ps.videoTitle.trim())) continue;
        try {
          const projectData = {
            version: '1.0',
            savedAt: new Date().toISOString(),
            topic:      ps.topic,
            videoTitle: ps.videoTitle,
            song: {
              name:          ps.selectedSong?.name,
              path:          ps.selectedSong?.path,
              audioPath:     ps.selectedSongAudioPath,
              labelsPath:    ps.selectedSong?.labelsPath,
              markerCount:   ps.markerCount,
              requiredLines: ps.requiredLineCount,
            },
            markers:     ps.markers,
            fadeMarkers: ps.fadeMarkers,
            script:      { text: ps.scriptText, lines: ps.scriptLines },
            textStyle: {
              font:      ps.selectedFont,
              weight:    ps.fontWeight,
              style:     ps.fontStyle,
              size:      ps.fontSize,
              case:      ps.textCase,
              positionV: ps.textPositionV,
            },
            footage: {
              selectedFolderPaths: ps.selectedFootageFolders.map(f => f.path),
              storyboard: ps.storyboard,
            },
            render:   { renderedVideoPath: ps.renderedVideoPath },
            publish:  { lastPublishedAt: ps.lastPublishedAt || null },
          };
          // Use per-tab previous title so saving Tab B never deletes Tab A's file
          const prevTitle = previousTitlesRef.current[tab.id] || '';
          await window.electron.ipcRenderer.invoke('auto-save-project', {
            projectData,
            videoTitle:    ps.videoTitle,
            previousTitle: prevTitle,
          });
          previousTitlesRef.current[tab.id] = ps.videoTitle;
          dispatch({ type: 'AUTO_SAVE' });
        } catch {}
      }
    }, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // ── Immediate auto-save on every activeProjectState change (debounced 2s) ──
  // Writes only to the main .kbp file — NO history snapshot (that's the 10-min job).
  useEffect(() => {
    const ps = activeProjectState;
    if (!ps.videoTitle?.trim()) return;
    if (metaState.deletedTitles?.has(ps.videoTitle.trim())) return;

    if (immediateSaveTimerRef.current) clearTimeout(immediateSaveTimerRef.current);

    const tabId = metaState.activeTabId;
    immediateSaveTimerRef.current = setTimeout(async () => {
      setSavingTabIds(prev => new Set([...prev, tabId]));
      try {
        const projectData = {
          version: '1.0',
          savedAt: new Date().toISOString(),
          topic:      ps.topic,
          videoTitle: ps.videoTitle,
          song: {
            name:          ps.selectedSong?.name,
            path:          ps.selectedSong?.path,
            audioPath:     ps.selectedSongAudioPath,
            labelsPath:    ps.selectedSong?.labelsPath,
            markerCount:   ps.markerCount,
            requiredLines: ps.requiredLineCount,
          },
          markers:     ps.markers,
          fadeMarkers: ps.fadeMarkers,
          script:      { text: ps.scriptText, lines: ps.scriptLines },
          textStyle: {
            font:      ps.selectedFont,
            weight:    ps.fontWeight,
            style:     ps.fontStyle,
            size:      ps.fontSize,
            case:      ps.textCase,
            positionV: ps.textPositionV,
          },
          footage: {
            selectedFolderPaths: ps.selectedFootageFolders.map(f => f.path),
            storyboard: ps.storyboard,
          },
          render:   { renderedVideoPath: ps.renderedVideoPath },
          publish:  { lastPublishedAt: ps.lastPublishedAt || null },
        };
        const prevTitle = previousTitlesRef.current[metaState.activeTabId] || '';
        await window.electron.ipcRenderer.invoke('auto-save-project-immediate', {
          projectData,
          videoTitle:    ps.videoTitle,
          previousTitle: prevTitle,
        });
        previousTitlesRef.current[metaState.activeTabId] = ps.videoTitle;
      } catch {}
      finally {
        setSavingTabIds(prev => { const s = new Set(prev); s.delete(tabId); return s; });
      }
    }, 2000);

    return () => {
      if (immediateSaveTimerRef.current) clearTimeout(immediateSaveTimerRef.current);
    };
  }, [activeProjectState, metaState.activeTabId]); // eslint-disable-line

  return (
    <AppContext.Provider value={{
      state:             activeProjectState,
      dispatch,
      tabs:              metaState.tabs,
      activeTabId:       metaState.activeTabId,
      renderStates:      metaState.renderStates,
      savingTabIds,
      openProjectLoader: () => setShowProjectLoader(true),
    }}>
      {/* Startup loader — shown once on launch if projects exist */}
      {!projectLoaderDone && (
        <ProjectLoader
          mode="startup"
          onLoadComplete={() => setProjectLoaderDone(true)}
        />
      )}
      {/* On-demand loader — opened from the Projects button */}
      {showProjectLoader && (
        <ProjectLoader
          mode="browse"
          onLoadComplete={() => setShowProjectLoader(false)}
        />
      )}
      <div className="app">
        <TopNavBar />
        <TabBar />
        <div className="body-row">
          <SideNav />
          <MainContent />
        </div>
      </div>
    </AppContext.Provider>
  );
}
