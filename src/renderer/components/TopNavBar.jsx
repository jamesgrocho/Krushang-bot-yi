import React, { useContext } from 'react';
import { AppContext } from '../App';
import './TopNavBar.css';

export default function TopNavBar() {
  const { state, dispatch, openProjectLoader } = useContext(AppContext);

  const handleClearAll = () => dispatch({ type: 'ADD_TAB' });
  const projectTitle = state.videoTitle?.trim() || null;

  return (
    <nav className="topnav">
      {/* Left: mascot + wordmark */}
      <div className="topnav-left">
        <div className="topnav-mascot-wrap">
          <img className="topnav-mascot-img" src="./kb-logo-anim.gif" alt="Krushang Bot" />
        </div>
        <div className="topnav-brand">
          <span className="topnav-brand-krushang">Krushang</span>
          <span className="topnav-brand-bot"> Bot</span>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="topnav-right">
        <button className="topnav-button" onClick={openProjectLoader}>
          📂 Projects
        </button>
        <button className="topnav-button topnav-button--new" onClick={handleClearAll}>
          ✦ New Project
        </button>
      </div>
    </nav>
  );
}
