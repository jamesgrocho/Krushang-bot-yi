import React, { useState } from 'react';
import './PhaseSection.css';

export default function PhaseSection({ phaseNum, title, preview, locked, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const toggle = () => {
    setIsAnimating(true);
    setCollapsed(c => !c);
  };

  // After the CSS grid transition ends, stop suppressing overflow.
  // This lets dropdowns (song list, etc.) escape the phase body when fully open.
  const handleTransitionEnd = () => setIsAnimating(false);

  // overflow:hidden only while animating or fully collapsed (so the grid clip works).
  // overflow:visible once fully open so dropdowns / overlays aren't cut off.
  const bodyOverflow = (!collapsed && !isAnimating) ? 'visible' : 'hidden';

  return (
    <section className={`phase-wrap ${locked ? 'phase-locked' : ''}`}>

      {/* ── Always-visible header bar ── */}
      <div
        className={`phase-header-bar ${collapsed ? 'is-collapsed' : ''}`}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle()}
      >
        {/* Title — left side */}
        <span className="phase-title-text">{title}</span>

        {/* Preview pills — middle, only when collapsed */}
        {collapsed && preview && (
          <div className="phase-preview-strip">{preview}</div>
        )}

        {/* Chevron — always far right, top-aligned */}
        <span className={`phase-chevron ${collapsed ? 'collapsed' : ''}`}>›</span>
      </div>

      {/* ── Smooth collapsible body (CSS grid trick) ── */}
      <div
        className={`phase-body ${collapsed ? 'is-collapsed' : ''}`}
        onTransitionEnd={handleTransitionEnd}
      >
        {/*
          overflow:hidden lives here (on the grid item), NOT on the grid container.
          Padding lives on .phase-body-content (one level deeper) so that 0fr
          fully clips all visible space — including what would be padding bleed.
        */}
        <div className="phase-body-inner" style={{ overflow: bodyOverflow }}>
          <div className="phase-body-content">
            {children}
          </div>
        </div>
      </div>

    </section>
  );
}
