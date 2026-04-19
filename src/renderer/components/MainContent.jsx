import React from 'react';
import GodMode from './GodMode';
import TopicSection from './phases/TopicSection';
import AudioSection from './phases/AudioSection';
import ScriptSection from './phases/ScriptSection';
import VideoTitleSection from './phases/VideoTitleSection';
import FootageSection from './phases/FootageSection';
import RenderSection from './phases/RenderSection';
import CreateProjectSection from './phases/CreateProjectSection';
import './MainContent.css';

export default function MainContent() {
  return (
    <div className="main-content">
      <div className="waterfall-container">

        {/* God Mode — no anchor, dev tool */}
        <GodMode />

        {/* Phase 1: Topic */}
        <div id="section-topic">
          <TopicSection />
        </div>

        {/* Phase 2: Song */}
        <div id="section-song">
          <AudioSection />
        </div>

        {/* Phase 3: Script & Typography */}
        <div id="section-script">
          <ScriptSection />
        </div>

        {/* Video Title — standalone card */}
        <div id="section-title">
          <VideoTitleSection />
        </div>

        {/* Phase 4: Footage & Storyboard */}
        <div id="section-footage">
          <FootageSection />
        </div>

        {/* Phase 5: Render */}
        <div id="section-render">
          <RenderSection />
        </div>

        {/* Phase 6: Create Project */}
        <div id="section-publish">
          <CreateProjectSection />
        </div>

      </div>
    </div>
  );
}
