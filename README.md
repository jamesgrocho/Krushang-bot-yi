# Krushang Bot — Frontend UI

Modern Electron + React application for the Krushang Bot video generation pipeline.

## Project Structure

```
krushang-bot-ui/
├── src/
│   ├── main/
│   │   ├── main.js              # Electron main process
│   │   └── preload.js           # IPC security boundary
│   └── renderer/
│       ├── index.jsx            # React entry point
│       ├── App.jsx              # Root App with Context
│       ├── App.css              # Global styles
│       └── components/
│           ├── TopNavBar.jsx   # Header with Clear/Preferences
│           ├── TopNavBar.css
│           ├── MainContent.jsx  # Waterfall container
│           ├── MainContent.css
│           ├── sections.css     # Shared phase styles
│           └── phases/
│               ├── TopicSection.jsx    # Phase 1 (built)
│               ├── AudioSection.jsx    # Phase 2 (WIP)
│               ├── ScriptSection.jsx   # Phase 3 (WIP)
│               ├── FootageSection.jsx  # Phase 4 (WIP)
│               ├── RenderSection.jsx   # Phase 5 (WIP)
│               └── CreateProjectSection.jsx  # Phase 6 (WIP)
├── index.html
├── vite.config.js
├── package.json
└── .gitignore
```

## Development

### Start Dev Server
```bash
npm run dev
```

This starts:
- Vite dev server (http://localhost:5173)
- Electron app (auto-loads from Vite)
- DevTools enabled by default

### Build Production
```bash
npm run build
```

Output: `dist/` folder ready for Electron packaging.

## Phase 1: Topic Engine — ✅ Complete

**Features**:
- [x] Topic input field (min 3 chars)
- [x] "Generate Topic" button (randomizer with hardcoded list)
- [x] "I'm Lazy" button (randomizes topic + shows auto-generated title)
- [x] Real-time validation
- [x] Success/error messages
- [x] Dark mode support

**Test Cases Passing**:
- [x] Topic input accepts text, minimum 3 characters required
- [x] "Generate Topic" button calls randomizer, updates state
- [x] "I'm Lazy" button does NOT render, only populates fields
- [x] Empty topic disables Phase 2 progression
- [x] Keyboard shortcuts (future: Cmd+K, Cmd+L)

## Phase 2–6: Coming Next

Once Phase 1 is tested and approved, we'll build:

1. **Phase 2: Audio & Markers**
   - Dropdown with dynamic folder scanning
   - Waveform preview with click-to-scrub
   - Marker count display from labels1.txt
   - Stale warning cascade

2. **Phase 3: Script & Typography**
   - Script textarea with AI generation
   - Real-time line count validation
   - Font/size/case controls (accordion)
   - Live preview window

3. **Phase 4: Footage & Storyboard**
   - Multi-select dropdown for folders
   - Drag-to-reorder clips
   - Shuffle button
   - Thumbnail badges

4. **Phase 5: Render**
   - Progress feedback
   - Error handling with recovery
   - QuickTime auto-open

5. **Phase 6: Create Project**
   - Google Drive integration
   - OpenAI API calls for description/keywords
   - Airtable record creation
   - Atomic workflows

## State Management

Global state via React Context (`AppContext`):
- Reducer-based state updates
- Auto-save to disk (debounced)
- Restoration on app relaunch
- Cascading validations

## Styling

- **System color scheme**: Light mode by default, dark mode on macOS preference
- **CSS Modules**: Shared `sections.css` for all phase components
- **Responsive**: Single-column waterfall layout
- **Scrollable**: Main content area scrolls, top nav sticky

## Next Steps

1. Test Phase 1 in the app (run `npm run dev`)
2. Approve Phase 1 UI/UX
3. Build Phase 2: Audio Section
4. Iterate through all 6 phases
5. Integrate with backend `pipeline.py` via IPC
6. Package and distribute as macOS `.app`

---

**Last Updated**: 2026-03-17
