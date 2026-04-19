import React, { useState, useEffect, useRef } from 'react';
import './SideNav.css';

const NAV_ITEMS = [
  { id: 'section-topic',   label: 'Topic'              },
  { id: 'section-song',    label: 'Song'               },
  { id: 'section-script',  label: 'Script & Type'      },
  { id: 'section-title',   label: 'Video Title'        },
  { id: 'section-footage', label: 'Footage'            },
  { id: 'section-render',  label: 'Render'             },
  { id: 'section-publish', label: 'Create Project'     },
];

export default function SideNav() {
  const [activeId, setActiveId] = useState('section-topic');
  const observersRef = useRef([]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  // Highlight the section currently in view as the user scrolls
  useEffect(() => {
    // Wait for sections to mount
    const setup = () => {
      const container = document.querySelector('.main-content');
      if (!container) return;

      observersRef.current.forEach(o => o.disconnect());
      observersRef.current = [];

      NAV_ITEMS.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (!el) return;

        const obs = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) setActiveId(id);
          },
          {
            root: container,
            // Trigger when the top part of the section crosses the upper 40% of the viewport
            rootMargin: '0px 0px -60% 0px',
            threshold: 0,
          }
        );
        obs.observe(el);
        observersRef.current.push(obs);
      });
    };

    // Small delay so section elements are in the DOM
    const t = setTimeout(setup, 200);
    return () => {
      clearTimeout(t);
      observersRef.current.forEach(o => o.disconnect());
    };
  }, []);

  return (
    <nav className="sidenav">
      <div className="sidenav-inner">
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            className={`sidenav-item ${activeId === id ? 'active' : ''}`}
            onClick={() => scrollTo(id)}
          >
            <span className="sidenav-dot" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
