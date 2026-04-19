import React, { useContext } from 'react';
import { AppContext } from '../App';
import './TabBar.css';

export default function TabBar() {
  const { tabs, activeTabId, renderStates, savingTabIds, dispatch } = useContext(AppContext);

  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const title    = tab.projectState.videoTitle?.trim() || 'New Project';
        const isActive = tab.id === activeTabId;
        const rs       = renderStates[tab.id] || {};
        const busy     = rs.isRendering || rs.isPreviewing;
        const saving   = savingTabIds?.has(tab.id);

        return (
          <div
            key={tab.id}
            className={`tab-item ${isActive ? 'tab-item--active' : ''} ${busy ? 'tab-item--busy' : ''}`}
            onClick={() => dispatch({ type: 'SWITCH_TAB', payload: tab.id })}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && dispatch({ type: 'SWITCH_TAB', payload: tab.id })}
          >
            {busy && <span className="tab-busy-dot" title={rs.isRendering ? 'Rendering…' : 'Previewing…'} />}
            {saving && !busy && <span className="tab-save-dot" title="Saving…" />}
            <span className="tab-label">{title}</span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'CLOSE_TAB', payload: tab.id });
                }}
                title="Close tab"
              >×</button>
            )}
          </div>
        );
      })}

      <button
        className="tab-add"
        onClick={() => dispatch({ type: 'ADD_TAB' })}
        title="New project tab"
      >+</button>
    </div>
  );
}
