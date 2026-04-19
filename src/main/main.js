const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow file:// audio src from local disk
    },
  });

  // Always use production build (file://) unless VITE_DEV_SERVER is set
  const useDevServer = process.env.VITE_DEV_SERVER === 'true';
  const startUrl = useDevServer
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../../dist/index.html')}`;

  mainWindow.loadURL(startUrl);
};

app.on('ready', () => {
  createWindow();
  if (process.platform === 'darwin') {
    try {
      // Try ICNS first, fall back to PNG
      let iconPath = path.join(__dirname, '../../dist/kb-logo.icns');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '../../dist/kb-logo.png');
      }
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {
      console.log('Could not set dock icon:', e.message);
    }
  }
});

// ── Clean up preview temp files on exit ───────────────────────────────────────
app.on('before-quit', () => {
  try {
    const tmpDir = os.tmpdir();
    const files = fs.readdirSync(tmpDir).filter(f => /^kb_preview_.*\.mp4$/.test(f));
    files.forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)); } catch {} });
    if (files.length) console.log(`[quit] Cleaned up ${files.length} preview file(s)`);
  } catch {}
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aif', '.aiff'];

function findAudioFile(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.find(f => AUDIO_EXTS.includes(path.extname(f).toLowerCase())) || null;
  } catch {
    return null;
  }
}

function findLabelsFile(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.find(f => f.toLowerCase().startsWith('labels') && f.toLowerCase().endsWith('.txt')) || null;
  } catch {
    return null;
  }
}

function parseLabels(labelsPath) {
  try {
    const content = fs.readFileSync(labelsPath, 'utf8');
    const times = [];
    const fadeMarkers = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\t');
      if (parts[0] === '#FADE' && parts.length >= 5) {
        // #FADE type id time duration
        const rawTime = parts[3];
        fadeMarkers.push({
          type:     parts[1],
          id:       parts[2],
          time:     rawTime === 'first' ? 'first' : parseFloat(rawTime),
          duration: parseFloat(parts[4]),
          anchored: parts[1] === 'out', // fade-out end is anchored
        });
      } else if (parts[0] && !parts[0].startsWith('#')) {
        const t = parseFloat(parts[0]);
        if (!isNaN(t)) times.push(t);
      }
    }
    return { times: times.sort((a, b) => a - b), fadeMarkers };
  } catch {
    return { times: [], fadeMarkers: [] };
  }
}

// Recursively walk directories up to maxDepth, collect song folders
function scanSongFolders(rootDir, maxDepth = 4) {
  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const audioFile = findAudioFile(dir);
    const labelsFile = findLabelsFile(dir);

    if (audioFile) {
      const audioPath  = path.join(dir, audioFile);
      const labelsPath = labelsFile ? path.join(dir, labelsFile) : null;
      const parsed     = labelsPath ? parseLabels(labelsPath) : { times: [], fadeMarkers: [] };
      const markers    = parsed.times;
      const fadeMarkers = parsed.fadeMarkers;
      results.push({
        name: path.basename(dir),
        path: dir,
        audioPath,
        audioFile,
        labelsPath,       // null if no labels file yet
        markerCount: markers.length,
        requiredLines: markers.length,
        markers,
        fadeMarkers,
      });
      return; // don't recurse inside a song folder
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  walk(rootDir, 0);
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// Scan one level of mood categories, each containing song subfolders
function scanCategories(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];

  let categoryEntries;
  try {
    categoryEntries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const categories = [];

  for (const entry of categoryEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const catPath = path.join(rootDir, entry.name);
    const songs = scanSongFolders(catPath, 2); // songs are one level inside category

    categories.push({
      name: entry.name,
      path: catPath,
      songCount: songs.length,
      songs,
    });
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────────────────────

ipcMain.handle('ping', () => 'pong');

ipcMain.handle('scan-song-folders', (event, rootDir) => {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  return scanSongFolders(rootDir);
});

ipcMain.handle('scan-categories', (event, rootDir) => {
  return scanCategories(rootDir);
});

ipcMain.handle('read-labels', (event, labelsPath) => {
  if (!labelsPath || !fs.existsSync(labelsPath)) return { times: [], fadeMarkers: [] };
  return parseLabels(labelsPath);
});

// ── Save labels file (auto-sync after marker edits in UI) ────
// Writes Audacity format: "START\tSTART\t" per line, sorted ascending.
// If labelsPath is null (song had no labels file), creates labels1.txt inside songDir.
ipcMain.handle('save-labels-file', async (event, { labelsPath, markers, songDir, fadeMarkers }) => {
  try {
    let targetPath = labelsPath;

    // Create labels1.txt if the song didn't have one yet
    if (!targetPath) {
      if (!songDir) return { success: false, error: 'No labelsPath or songDir provided' };
      targetPath = path.join(songDir, 'labels1.txt');
    }

    const sorted  = [...markers].sort((a, b) => a - b);
    const lines   = sorted.map(t => `${t.toFixed(6)}\t${t.toFixed(6)}\t`);

    // Append fade markers as special comment lines: #FADE type id time duration
    if (fadeMarkers && fadeMarkers.length > 0) {
      lines.push(''); // blank separator
      for (const fm of fadeMarkers) {
        // time can be 'first' (fade-in anchored to first marker) — store as-is
        const timeVal = fm.time === 'first' ? 'first' : Number(fm.time).toFixed(6);
        lines.push(`#FADE\t${fm.type}\t${fm.id}\t${timeVal}\t${fm.duration}`);
      }
    }

    fs.writeFileSync(targetPath, lines.join('\n') + '\n', 'utf8');
    console.log(`[save-labels-file] Wrote ${sorted.length} markers + ${(fadeMarkers||[]).length} fades → ${targetPath}`);
    return { success: true, labelsPath: targetPath };
  } catch (err) {
    console.error('[save-labels-file] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Footage folder scanner ───────────────────────────────────
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'];

function findVideoClips(dir, maxDepth = 6) {
  const clips = [];
  function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        walk(path.join(d, e.name), depth + 1);
      } else if (e.isFile() && VIDEO_EXTS.includes(path.extname(e.name).toLowerCase())) {
        clips.push(path.join(d, e.name));
      }
    }
  }
  walk(dir, 0);
  return clips;
}

function scanFootageFolders(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  let entries;
  try { entries = fs.readdirSync(rootDir, { withFileTypes: true }); } catch { return []; }

  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const folderPath = path.join(rootDir, entry.name);
    const clips = findVideoClips(folderPath);
    if (clips.length > 0) {
      folders.push({ name: entry.name, path: folderPath, clipCount: clips.length, clips });
    }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

ipcMain.handle('scan-footage-folders', (event, rootDir) => {
  console.log('[scan-footage-folders] rootDir received:', JSON.stringify(rootDir));
  const exists = rootDir && fs.existsSync(rootDir);
  console.log('[scan-footage-folders] exists:', exists);
  if (exists) {
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      console.log('[scan-footage-folders] top-level entries:', entries.map(e => `${e.isDirectory() ? 'DIR' : 'FILE'} ${e.name}`));
    } catch (e) {
      console.error('[scan-footage-folders] readdirSync error:', e.message);
    }
  }
  const result = scanFootageFolders(rootDir);
  console.log('[scan-footage-folders] result folders:', result.map(f => `${f.name} (${f.clipCount} clips)`));
  return result;
});

// ── Diagnostic: returns path info so the renderer can show a helpful error ──
ipcMain.handle('diagnose-footage-path', (event, rootDir) => {
  const info = { rootDir, exists: false, isDir: false, entries: [], error: null };
  try {
    info.exists = fs.existsSync(rootDir);
    if (info.exists) {
      info.isDir = fs.statSync(rootDir).isDirectory();
      if (info.isDir) {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        info.entries = entries.map(e => ({
          name: e.name,
          isDir: e.isDirectory(),
          clipCount: e.isDirectory() ? findVideoClips(path.join(rootDir, e.name)).length : 0,
        }));
      }
    }
  } catch (e) {
    info.error = e.message;
  }
  return info;
});

// ── Footage folder watcher — pushes live updates to renderer ──
let footageWatcher = null;
let footageWatchDebounce = null;

ipcMain.handle('watch-footage-folder', (event, rootDir) => {
  if (footageWatcher) { try { footageWatcher.close(); } catch {} footageWatcher = null; }
  if (!rootDir || !fs.existsSync(rootDir)) return false;
  try {
    footageWatcher = fs.watch(rootDir, { recursive: true }, () => {
      clearTimeout(footageWatchDebounce);
      footageWatchDebounce = setTimeout(() => {
        const folders = scanFootageFolders(rootDir);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('footage-updated', folders);
        }
      }, 800);
    });
    return true;
  } catch (err) {
    console.error('footage watcher error:', err);
    return false;
  }
});

ipcMain.handle('stop-footage-watcher', () => {
  if (footageWatcher) { try { footageWatcher.close(); } catch {} footageWatcher = null; }
});

// ── Video thumbnail extraction ──────────────────────────────
const { exec } = require('child_process');
const thumbCache   = new Map(); // path → thumbnail file path
const thumbPending = new Map(); // path → Promise (in-flight dedup)
const THUMB_CONCURRENCY = 4;
let   thumbActive  = 0;
const thumbQueue   = []; // { videoPath, resolve }

function processThumbQueue() {
  while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length > 0) {
    const { videoPath, resolve } = thumbQueue.shift();
    thumbActive++;

    const safeFilename = path.basename(videoPath).replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const outputPath   = path.join(app.getPath('temp'), `thumb_${safeFilename}.jpg`);

    // If output already exists on disk (from a previous session) skip ffmpeg
    if (fs.existsSync(outputPath)) {
      thumbCache.set(videoPath, outputPath);
      thumbPending.delete(videoPath);
      resolve(outputPath);
      thumbActive--;
      processThumbQueue();
      continue;
    }

    const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    exec(
      `${ffmpegPath} -y -i "${videoPath}" -ss 0 -vframes 1 -vf scale=320:180 -q:v 4 "${outputPath}"`,
      { timeout: 8000 },
      (err) => {
        thumbActive--;
        if (!err && fs.existsSync(outputPath)) {
          thumbCache.set(videoPath, outputPath);
          resolve(outputPath);
        } else {
          resolve(null);
        }
        thumbPending.delete(videoPath);
        processThumbQueue();
      }
    );
  }
}

ipcMain.handle('extract-video-thumbnail', (event, videoPath) => {
  // Return in-memory cached result immediately
  if (thumbCache.has(videoPath)) {
    const cached = thumbCache.get(videoPath);
    if (fs.existsSync(cached)) return Promise.resolve(cached);
    thumbCache.delete(videoPath);
  }

  // Check disk synchronously — covers files from previous sessions
  const safeFilename = path.basename(videoPath).replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  const outputPath   = path.join(app.getPath('temp'), `thumb_${safeFilename}.jpg`);
  if (fs.existsSync(outputPath)) {
    thumbCache.set(videoPath, outputPath);
    return Promise.resolve(outputPath);
  }

  // Deduplicate: if already in-flight, return same promise
  if (thumbPending.has(videoPath)) return thumbPending.get(videoPath);

  const p = new Promise((resolve) => {
    thumbQueue.push({ videoPath, resolve });
    processThumbQueue();
  });
  thumbPending.set(videoPath, p);
  return p;
});

// ── Render pipeline ──────────────────────────────────────────
const { spawn } = require('child_process');
const { shell, dialog } = require('electron');

const PIPELINE_PATH = '/Users/jamesgrochowalski/Downloads/MarkerGenerator/pipeline.py';
const RENDERS_DIR   = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Renders';
const PROJECTS_DIR  = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Projects';
const TRASH_DIR     = '/Users/jamesgrochowalski/Desktop/Krushang Bot/Projects/Trash';

ipcMain.handle('show-save-dialog', async (event, defaultName) => {
  // Ensure Renders dir exists
  try { if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true }); } catch {}
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(RENDERS_DIR, defaultName),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('open-in-finder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('render-complete', (event, filePath) => {
  // Play macOS system "Glass" ding — video stays in-app, no external player
  exec('afplay /System/Library/Sounds/Glass.aiff');
});

ipcMain.handle('save-project', async (event, { projectData, suggestedName }) => {
  try { if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: path.join(PROJECTS_DIR, suggestedName),
    filters: [{ name: 'Krushang Bot Project', extensions: ['kbp'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, cancelled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Per-tab render processes — supports parallel rendering across multiple tabs
const renderProcs = new Map(); // tabId -> child process

ipcMain.handle('cancel-render', (event, { tabId } = {}) => {
  if (tabId && renderProcs.has(tabId)) {
    try { renderProcs.get(tabId).kill('SIGTERM'); } catch {}
    renderProcs.delete(tabId);
  } else {
    // Fallback: kill all active renders
    for (const [id, proc] of renderProcs) {
      try { proc.kill('SIGTERM'); } catch {}
      renderProcs.delete(id);
    }
  }
});

const { createProject } = require('./createProject');

ipcMain.handle('create-project', async (event, { videoTitle, scriptLines, renderedVideoPath }) => {
  const sendProgress = (msg) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('create-project-progress', msg);
  };
  try {
    const result = await createProject({ videoTitle, scriptLines, renderedVideoPath }, sendProgress);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-url', (event, url) => {
  shell.openExternal(url);
});

// ── OpenAI config (key stored in Krushang Bot folder) ────────
const CONFIG_PATH = path.join('/Users/jamesgrochowalski/Desktop/Krushang Bot', 'openai_config.json');

function readOpenAIKey() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return cfg.apiKey || null;
  } catch { return null; }
}

ipcMain.handle('get-openai-key', () => {
  const key = readOpenAIKey();
  return { hasKey: !!key };
});

ipcMain.handle('set-openai-key', (event, apiKey) => {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey }, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── AI Script Generator ───────────────────────────────────────
// Reads all .txt scripts from the MarkerGenerator folder as style examples,
// then calls GPT-4o to write lines about the given topic in the same style.
const SCRIPTS_DIR = '/Users/jamesgrochowalski/Downloads/MarkerGenerator';

function loadExampleScripts() {
  const examples = [];
  try {
    const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('_script.txt'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8').trim();
      if (content) examples.push({ name: file.replace('_script.txt', '').replace(/_/g, ' '), lines: content });
    }
  } catch {}
  return examples;
}

ipcMain.handle('generate-script-ai', async (event, { topic, lineCount, lineLength }) => {
  const apiKey = readOpenAIKey();
  if (!apiKey) return { success: false, error: 'NO_KEY' };

  const examples = loadExampleScripts();

  const examplesText = examples.length
    ? examples.map(e => `Topic: "${e.name}"\n${e.lines}`).join('\n\n---\n\n')
    : '';

  const lineLengthGuide = {
    short:  '2–3 words per line (e.g. "Hope Remains", "Walk By Faith", "He Is Faithful")',
    medium: '4–6 words per line (e.g. "Hope Is Rising Now", "Light Breaks Through The Dark")',
    long:   '7–12 words per line (e.g. "Hope Is Rising In The Darkest Of Our Days")',
  };
  const lengthInstruction = lineLengthGuide[lineLength] || lineLengthGuide.medium;

  const styleSection = examplesText
    ? `\nHere are example scripts from our Quick Mini Movies library that show our exact style — blend this narration style into your output:\n\n${examplesText}\n\n---\n`
    : '';

  const prompt = `Act as a Viral Church Media Strategist and Scriptwriter for 2026. I will provide a topic, and you will write a high-impact 30-60 second video script broken into exactly ${lineCount} overlay text lines.

Topic: "${topic}"
${styleSection}
Script Requirements:

The Hook (first 1-2 lines): Use a 'Contrarian' or 'Curiosity' hook to stop the scroll. (Example: "Stop trying to find your purpose...")

The Narrative (middle lines): Use a conversational, raw, and empathetic tone. Avoid jargon like 'embarking,' 'enchanting,' or 'fellowship.' Speak like a person, not a brochure. Blend the lyric-style narration from our Quick Mini Movies examples above.

The Call to Action (last 1-2 lines): Provide a clear next step that fits any worship service (e.g., "Let's open our hearts for what's next").

Additional Rules:
- Write exactly ${lineCount} lines total
- LINE LENGTH: ${lengthInstruction} — keep every line within this range
- Title case
- Lines flow as a narrative arc: Hook → Narrative → Call to Action
- Output ONLY the lines, one per line, no numbering, no labels, no extra text`;

  try {
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 500,
    });

    const text = response.choices[0].message.content.trim();
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .slice(0, lineCount);

    return { success: true, lines };
  } catch (err) {
    console.error('[generate-script-ai]', err.message);
    return { success: false, error: err.message };
  }
});

// ── AI Topic Generator ────────────────────────────────────────────
const TOPIC_EXAMPLES = [
  'Hope in Crisis','Strength Through Loss','Grace and Redemption','Light in Darkness',
  'New Beginnings','Faith and Doubt','Love Unbreakable','Healing Hands','Purpose Found',
  'Peace in the Storm','A Fathers Calling','Anchored in Trust','Bold Beginnings',
  'Break the Chains','Built on Christ','Called to Lead with Grace','Christ our Foundation',
  'Divine Comfort','Divine Guidance','Eternal Hope','Everlasting Peace','Exalt His Name',
  'Fear Not','Filled With The Spirit','Firm Foundation','Forever Worthy','Forgiven and Free',
  'Freedom and Praise','From Darkness to Glory','God of all Creation','God\'s Majesty',
  'God\'s Provision','Grace Changes Everything','He Has Risen','Heart of Worship',
  'Held in Him','His Glory','His Mercy','Home in Your Presence','Hope That Overflows',
  'I Stand Redeemed','I Will Stand','Joy is on the Way','Joyful Faith',
  'Let Your Presence Rise','Love Never Fails','Love in Action','Mighty Savior',
  'Never Alone','Nothing is Impossible','Peace that Surpasses','Power in Prayer',
  'Redeemed and Free','Renewed Hope','Rooted in Christ','Salvation and Hope',
  'Sent with Purpose','Strength','The Armor of God','The Battle Belongs to God',
  'The Gospel','The Great Commission','The Power of Forgiveness','Together in Christ',
  'Unfailing Love','Unshakable Joy','Victory Belongs to the Lord','Walk in the Light',
  'We Are His People','Worthy of All Praise','You Remain Forever','Your Promises Remain',
];

const UNIVERSAL_TOPICS_100 = [
  'Finding Peace in a Chaotic World', 'The Power of Forgiveness', 'Living with Purpose',
  'Faith in the Workplace', 'Overcoming Fear and Anxiety', 'The Gospel-Centered Life',
  'Spiritual Disciplines', 'The Words of Jesus', 'Grace Over Guilt',
  'Relationships: Marriage & Family', 'Faith in Trials', 'Hope for the Future',
  'The Theology of Sabbath', 'The Power of Humility', 'The Book of Nehemiah',
  'Proverbs for Modern Life', 'Questions Jesus Asked', 'The Armor of God',
  'Generosity & Finances', 'The Beatitudes', 'Healing is for You',
  'The Miracles of Jesus', 'Finding Joy in Every Season', 'Walking in the Spirit',
  'The Ten Commandments', 'Old Testament Prophecies', 'The Great Commission',
  'Identity in Christ', 'The Power of Words', 'Dealing with Doubt',
  'Navigating Change', 'Trusting God\'s Timing', 'The Attributes of God',
  'Living a Life of Gratitude', 'The Importance of Community', 'True Freedom in Christ',
  'The Book of Romans', 'The Book of Acts', 'The Life of Peter',
  'The Theology of Wonder', 'A Place to Belong', 'You Were Made to Worship',
  'Today is the Day', 'Awaken Worship Intro', 'Let Us Worship',
  'The Invitation', 'Psalm 150: Let Everything Praise', 'God is Good',
  'It\'s Time For Church', 'The God of Endless Worth', 'Awake My Soul',
  'Psalm 100: Enter His Gates', 'Taste and See', 'All Eyes On You',
  'Way Maker Intro', 'Sizzlin\' Summer', 'Created to Worship',
  'You Are Welcome Here', 'Magnify', 'Welcome Home',
  'Unstoppable', 'Rooted in Christ', 'Resilient',
  'Significant', 'Good in Tension', 'The Mount',
  'Living Sacrifice', 'Encountering Jesus', 'Testament Textures',
  'The Book of Isaiah', 'For the Love of Money', 'Faith Without Works',
  'Sharing the Good News', 'Salt + Light', 'The Whole Story',
  'Last Words', 'Heal Your Hurting Mind', 'The Creed',
  'The Connected Life', 'Thy Kingdom Come', 'The Light in the Darkness',
  'We Cry Hallelujah', 'The Gardener', 'Journey of the Cross',
  'Greater Love', 'New Life Begins', 'Cross Equals Love',
  'The Unexpected King', 'Death is Not the End', 'A Journey of Renewal',
  'Seed (The Work of Easter)', 'Where It All Comes Together', 'This is Jesus',
  'The Prodigal', 'Work For His Glory', 'This is Prayer',
  'The Ten Commandments (Narrative)', 'Missing the Boat', 'The Name of Jesus',
  'New Every Morning',
];

ipcMain.handle('generate-topic-ai', async (event, { excludeTopics = [] } = {}) => {
  const apiKey = readOpenAIKey();
  if (!apiKey) return { success: false, error: 'NO_KEY' };

  const topicsText = UNIVERSAL_TOPICS_100.join(', ');
  const excludeSection = excludeTopics.length
    ? `\nDo NOT generate any of these topics — they have already been used:\n${excludeTopics.map(t => `- ${t}`).join('\n')}\n`
    : '';

  const prompt = `Act as a Universal Church Content Strategist. Your goal is to generate ONE brand-new, unique video topic for a church service.

The Seed List: ${topicsText}
${excludeSection}
Instructions:

Analyze & Remix: Review the seed list to understand the core themes (e.g., spiritual rest, overcoming anxiety, biblical narrative, identity). Do NOT select a topic from the list. Instead, generate a completely new topic that is similar in spirit but uses different wording.

Randomization Protocol: Internally 'roll a die' to choose one of three categories: (1) Sermon Series Theme, (2) Worship Intro, or (3) Sermon Bumper.

Universal Constraint: The topic must be 'church-agnostic.' It must work for any church, in any location, without mentioning specific staff, buildings, or local updates.

No Specific Timing: Do not focus on a specific year or seasonal trend unless it is a major holiday (like Christmas or Easter). Focus on timeless spiritual 'felt needs.'

Output: Provide only the topic name. Do not add any extra text, category labels, or explanation.`;

  try {
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.1,
      max_tokens: 20,
    });
    const topic = response.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/^Topic:\s*/i, '');
    return { success: true, topic };
  } catch (err) {
    console.error('[generate-topic-ai]', err.message);
    return { success: false, error: err.message };
  }
});

// ── AI Title Generator (returns 3 options) ────────────────────────────────────────────
ipcMain.handle('generate-title-ai', async (event, { topic, scriptLines, excludeTitles = [] }) => {
  const apiKey = readOpenAIKey();
  if (!apiKey) return { success: false, error: 'NO_KEY' };

  const scriptText = (scriptLines || []).join('\n');

  // Load Quick Mini Movies example titles from saved script filenames for style reference
  const exampleTitles = loadExampleScripts().map(e => e.name).join(', ');
  const styleRef = exampleTitles
    ? `\nOur Quick Mini Movies title style for reference (short, evocative, poetic — study these): ${exampleTitles}\n`
    : '';

  const excludeSection = excludeTitles.length
    ? `\nDo NOT generate any of these titles — they have already been shown to the user:\n${excludeTitles.map(t => `- ${t}`).join('\n')}\n`
    : '';

  const prompt = `Act as a Digital Marketing Expert for Church Media who also deeply understands the poetic, cinematic title style used in Quick Mini Movies for Sunday worship.

I will provide a topic and script, and you will generate 3 video title options.
${styleRef}${excludeSection}
Topic: "${topic || ''}"

Script:
${scriptText}

Title Rules:

One title must be a 'Curiosity Gap' — creates intrigue and stops the scroll (e.g., 'The One Thing Holding You Back', 'What Fear Never Told You').

One title must be 'Direct & Bold' — plain, punchy, no fluff (e.g., 'Why You Feel Burned Out', 'Stop Running From This').

One title must be 'Benefit-Driven' in the Quick Mini Movies poetic style — short, evocative, feels like a film title (e.g., 'Finding Peace in 30 Seconds', 'Light in the Dark', 'Hope Still Rises').

Constraints:
- Keep ALL titles under 10 words
- No emojis
- No quotes around the titles
- The Benefit-Driven title should feel like a cinematic 2–5 word phrase, not a marketing tagline
- Provide the 3 options in this exact format with no extra text:
1. [Curiosity Gap title]
2. [Direct & Bold title]
3. [Benefit-Driven title]`;

  try {
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 120,
    });

    const raw = response.choices[0].message.content.trim();
    // Parse numbered list: "1. Title\n2. Title\n3. Title"
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
    const titles = lines
      .map(l => l.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, '').trim())
      .filter(t => t.length > 0)
      .slice(0, 3);

    if (titles.length >= 2) {
      return { success: true, titles };
    }
    // Fallback: return what we got as a single title
    return { success: true, titles: [raw.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, '').trim()] };
  } catch (err) {
    console.error('[generate-title-ai]', err.message);
    return { success: false, error: err.message };
  }
});

// ── Auto-save project (silent, no dialog) ──────────────────────────
// Maintains 10 named history slots: 10min.kbp … 100min.kbp (rotating)
// Each slot is overwritten in round-robin order on every 10-min trigger.
const HISTORY_SLOTS = ['10min','20min','30min','40min','50min','60min','70min','80min','90min','100min'];

ipcMain.handle('auto-save-project', async (event, { projectData, videoTitle, previousTitle }) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }

    // Delete old file if title changed
    if (previousTitle && previousTitle !== videoTitle) {
      const oldPath = path.join(PROJECTS_DIR, `${previousTitle}.kbp`);
      const oldHistoryDir = path.join(PROJECTS_DIR, `.${previousTitle}_history`);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (err) {
          console.warn(`[auto-save] Could not delete old project file: ${oldPath}`, err.message);
        }
      }
      if (fs.existsSync(oldHistoryDir)) {
        try { fs.rmSync(oldHistoryDir, { recursive: true, force: true }); } catch {}
      }
    }

    // Save current version
    const filePath = path.join(PROJECTS_DIR, `${videoTitle}.kbp`);
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf8');

    // ── Save to named history slot (rotating 10min → 20min → … → 100min) ──
    const historyDir = path.join(PROJECTS_DIR, `.${videoTitle}_history`);
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    // Find the next empty slot; if all full, rotate (oldest by mtime)
    const existingSlots = HISTORY_SLOTS.filter(s =>
      fs.existsSync(path.join(historyDir, `${s}.kbp`))
    );

    let targetSlot;
    if (existingSlots.length < HISTORY_SLOTS.length) {
      // Pick the first empty slot
      targetSlot = HISTORY_SLOTS.find(s => !existingSlots.includes(s));
    } else {
      // All 10 slots full — overwrite the oldest by mtime
      const withMtime = HISTORY_SLOTS.map(s => ({
        slot: s,
        mtime: fs.statSync(path.join(historyDir, `${s}.kbp`)).mtimeMs,
      }));
      withMtime.sort((a, b) => a.mtime - b.mtime);
      targetSlot = withMtime[0].slot;
    }

    const historyPath = path.join(historyDir, `${targetSlot}.kbp`);
    fs.writeFileSync(historyPath, JSON.stringify(projectData, null, 2), 'utf8');

    // ── Also save script to AI style library ───────────────────
    const scriptText = projectData?.script?.text || (projectData?.script?.lines || []).join('\n');
    if (scriptText && scriptText.trim()) {
      const safeName   = videoTitle.replace(/[^a-zA-Z0-9_\- ]/g, '_');
      const scriptPath = path.join(SCRIPTS_DIR, `${safeName}_script.txt`);
      try { fs.writeFileSync(scriptPath, scriptText.trim(), 'utf8'); } catch {}
    }

    return { success: true, filePath };
  } catch (err) {
    console.error('[auto-save-project] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Immediate auto-save (debounced, on every state change) ─────────
// Writes ONLY the main .kbp file — no history snapshot.
// History snapshots are reserved for the 10-minute interval above.
ipcMain.handle('auto-save-project-immediate', async (event, { projectData, videoTitle, previousTitle }) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }

    // Delete old file if title changed
    if (previousTitle && previousTitle !== videoTitle) {
      const oldPath = path.join(PROJECTS_DIR, `${previousTitle}.kbp`);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (err) {
          console.warn(`[auto-save-immediate] Could not delete old project file: ${oldPath}`, err.message);
        }
      }
    }

    // Save current version to main .kbp file only
    const filePath = path.join(PROJECTS_DIR, `${videoTitle}.kbp`);
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf8');

    return { success: true, filePath };
  } catch (err) {
    console.error('[auto-save-project-immediate] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Load saved projects list ───────────────────────────────────────
ipcMain.handle('auto-load-projects', async (event) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(PROJECTS_DIR);
    const projects = files
      .filter(f => f.endsWith('.kbp'))
      .map(f => {
        const filePath = path.join(PROJECTS_DIR, f);
        const stats = fs.statSync(filePath);
        const title = f.replace('.kbp', '');
        return {
          title,
          filePath,
          modifiedAt: stats.mtime.getTime(),
        };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt); // newest first

    return projects;
  } catch (err) {
    console.error('[auto-load-projects] Error:', err.message);
    return [];
  }
});

// ── Get save history for a project ─────────────────────────────────
ipcMain.handle('get-project-history', async (event, videoTitle) => {
  try {
    const historyDir = path.join(PROJECTS_DIR, `.${videoTitle}_history`);
    if (!fs.existsSync(historyDir)) return [];

    const slots = HISTORY_SLOTS
      .map(slot => {
        const filePath = path.join(historyDir, `${slot}.kbp`);
        if (!fs.existsSync(filePath)) return null;
        const stats = fs.statSync(filePath);
        return {
          label: `${slot} ago`,
          slot,
          filePath,
          savedAt: stats.mtime.getTime(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt); // newest first

    return slots;
  } catch (err) {
    console.error('[get-project-history] Error:', err.message);
    return [];
  }
});

// ── Load specific project ──────────────────────────────────────────
ipcMain.handle('load-project', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Project file not found' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const projectData = JSON.parse(content);
    return { success: true, projectData };
  } catch (err) {
    console.error('[load-project] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Delete project → move to Trash (recoverable) ─────────────────
ipcMain.handle('delete-project-file', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: true };
    try { fs.mkdirSync(TRASH_DIR, { recursive: true }); } catch {}
    const title = path.basename(filePath, '.kbp');
    const ts    = Date.now();
    const dest  = path.join(TRASH_DIR, `${title}__${ts}.kbp`);
    fs.renameSync(filePath, dest);
    return { success: true };
  } catch (err) {
    console.error('[delete-project-file] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── List trash ────────────────────────────────────────────────────
ipcMain.handle('list-trash-projects', async () => {
  try {
    if (!fs.existsSync(TRASH_DIR)) return [];
    return fs.readdirSync(TRASH_DIR)
      .filter(f => f.endsWith('.kbp') && f.includes('__'))
      .map(f => {
        const filePath = path.join(TRASH_DIR, f);
        const stats    = fs.statSync(filePath);
        const parts    = f.replace('.kbp', '').split('__');
        const title    = parts[0];
        const deletedAt = parseInt(parts[1], 10) || stats.mtimeMs;
        return { title, filePath, deletedAt };
      })
      .sort((a, b) => b.deletedAt - a.deletedAt);
  } catch (err) {
    console.error('[list-trash-projects] Error:', err.message);
    return [];
  }
});

// ── Restore from trash ───────────────────────────────────────────
ipcMain.handle('restore-project', async (event, trashFilePath) => {
  try {
    if (!fs.existsSync(trashFilePath)) return { success: false, error: 'File not found in trash' };
    try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}
    const fname    = path.basename(trashFilePath);
    const title    = fname.replace('.kbp', '').split('__')[0];
    let   destPath = path.join(PROJECTS_DIR, `${title}.kbp`);
    // Avoid collision — append suffix if name already taken
    if (fs.existsSync(destPath)) {
      destPath = path.join(PROJECTS_DIR, `${title}_restored.kbp`);
    }
    fs.renameSync(trashFilePath, destPath);
    return { success: true, filePath: destPath };
  } catch (err) {
    console.error('[restore-project] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Scan existing video titles ───────────────────────────────────
// folders: array of { path: string, label: string }
// returns: array of { name: string, source: string }
ipcMain.handle('scan-existing-titles', (event, { folders }) => {
  const titles = [];

  for (const folder of folders) {
    const folderPath = typeof folder === 'string' ? folder : folder.path;
    const source     = typeof folder === 'string' ? folderPath : folder.label;

    if (!folderPath || !fs.existsSync(folderPath)) continue;

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          titles.push({ name: entry.name, source });
        }
      }
    } catch (err) {
      console.error(`[scan-existing-titles] Error reading ${folderPath}:`, err.message);
    }
  }

  return titles.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle('render-video', (event, { tabId, audioPath, labelsPath, scriptLines, clipPaths, outputPath, fontName, fontWeight, fontStyle, fontSize, fadeMarkers }) => {
  // Ensure output dir exists
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}

  const ts = Date.now();

  // Write temp script file (one line per clip, in storyboard order)
  const tmpScriptPath = path.join(os.tmpdir(), `kb_script_${ts}.txt`);
  fs.writeFileSync(tmpScriptPath, scriptLines.join('\n'), 'utf8');

  // Write temp clips file (one clip path per line, in storyboard order)
  const tmpClipsPath = path.join(os.tmpdir(), `kb_clips_${ts}.txt`);
  fs.writeFileSync(tmpClipsPath, clipPaths.join('\n'), 'utf8');

  // Write fade markers as JSON — pipeline reads this to drive the black overlay
  const tmpFadesPath = path.join(os.tmpdir(), `kb_fades_${ts}.json`);
  fs.writeFileSync(tmpFadesPath, JSON.stringify(fadeMarkers || []), 'utf8');

  // Gather unique parent folders (pipeline requires at least one --footage arg)
  const footageFolders = [...new Set(clipPaths.map(p => path.dirname(p)))];

  const args = [
    PIPELINE_PATH,
    '--song',    audioPath,
    '--footage', ...footageFolders,
    '--script',  tmpScriptPath,
    '--clips',   tmpClipsPath,
    '--labels',  labelsPath,
    '--output',  outputPath,
    '--fades',   tmpFadesPath,
    ...(fontName   ? ['--font-name',   fontName]                    : []),
    ...(fontWeight ? ['--font-weight', String(fontWeight)]          : []),
    ...(fontStyle  ? ['--font-style',  fontStyle]                   : []),
    ...(fontSize   ? ['--font-size',   String(fontSize)]            : []),
  ];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('python3', args, { env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (err) {
      resolve({ success: false, error: err.message });
      return;
    }

    if (tabId) renderProcs.set(tabId, proc);

    // Parse stdout/stderr for progress percentage
    let stdBuf = '';
    const parseProgress = (text) => {
      stdBuf += text;
      const lines = stdBuf.split(/[\r\n]/);
      stdBuf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        let pct = null;
        if      (line.includes('[1/3]'))       pct = 5;
        else if (line.includes('[2/3]'))       pct = 20;
        else if (line.includes('[3/3]'))       pct = 35;
        else if (line.includes('Rendering →')) pct = 40;
        else if (line.includes('Done!'))       pct = 100;
        else {
          const m = line.match(/(\d+)%\|/);
          if (m) pct = 40 + Math.round(parseInt(m[1]) * 0.55);
        }
        if (pct !== null && mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('render-progress', { pct, tabId });
      }
    };

    proc.stdout.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.stderr.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.on('close', (code, signal) => {
      if (tabId) renderProcs.delete(tabId);
      try { fs.unlinkSync(tmpScriptPath); } catch {}
      try { fs.unlinkSync(tmpClipsPath);  } catch {}
      try { fs.unlinkSync(tmpFadesPath);  } catch {}
      if (signal === 'SIGTERM' || code === null)
        resolve({ success: false, cancelled: true, error: 'Render cancelled' });
      else if (code === 0)
        resolve({ success: true, outputPath });
      else
        resolve({ success: false, error: `Pipeline exited with code ${code}` });
    });
    proc.on('error', err => { if (tabId) renderProcs.delete(tabId); resolve({ success: false, error: err.message }); });
  });
});

// ── After Effects fast render ────────────────────────────────────
const AE_PIPELINE_PATH = '/Users/jamesgrochowalski/Downloads/MarkerGenerator/build_ae_project.py';

ipcMain.handle('render-video-ae', (event, { tabId, audioPath, labelsPath, scriptLines, clipPaths, outputPath, fontName, fontWeight, fontStyle, fontSize, fadeMarkers, videoTitle }) => {
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}

  const ts = Date.now();
  const tmpScriptPath = path.join(os.tmpdir(), `kb_ae_script_${ts}.txt`);
  const tmpClipsPath  = path.join(os.tmpdir(), `kb_ae_clips_${ts}.txt`);
  const tmpFadesPath  = path.join(os.tmpdir(), `kb_ae_fades_${ts}.json`);

  fs.writeFileSync(tmpScriptPath, scriptLines.join('\n'), 'utf8');
  fs.writeFileSync(tmpClipsPath,  clipPaths.join('\n'),   'utf8');
  fs.writeFileSync(tmpFadesPath,  JSON.stringify(fadeMarkers || []), 'utf8');

  const args = [
    AE_PIPELINE_PATH,
    '--song',    audioPath,
    '--script',  tmpScriptPath,
    '--clips',   tmpClipsPath,
    '--output',  outputPath,
    '--fades',   tmpFadesPath,
    '--title',   videoTitle || 'KB_Project',
    ...(labelsPath  ? ['--labels',      labelsPath]              : []),
    ...(fontName    ? ['--font-name',   fontName]                : []),
    ...(fontWeight  ? ['--font-weight', String(fontWeight)]      : []),
    ...(fontStyle   ? ['--font-style',  fontStyle]               : []),
    ...(fontSize    ? ['--font-size',   String(fontSize)]        : []),
  ];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('python3', args, { env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (err) {
      resolve({ success: false, error: err.message });
      return;
    }

    if (tabId) renderProcs.set(tabId, proc);

    let stdBuf = '';
    const parseProgress = (text) => {
      stdBuf += text;
      const lines = stdBuf.split(/[\r\n]/);
      stdBuf = lines.pop();
      for (const line of lines) {
        let pct = null;
        if      (line.includes('[1/3]'))  pct = 2;
        else if (line.includes('[2/3]'))  pct = 10;
        else if (line.includes('[3/3]'))  pct = 15;
        else if (line.includes('Done!'))  pct = 100;
        else {
          // aerender outputs: "PROGRESS:  X.XX %"
          const m = line.match(/PROGRESS:\s*([\d.]+)\s*%/i);
          if (m) pct = 15 + Math.round(parseFloat(m[1]) * 0.84);
        }
        if (pct !== null && mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('render-progress', { pct, tabId });
      }
    };

    proc.stdout.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.stderr.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.on('close', (code, signal) => {
      if (tabId) renderProcs.delete(tabId);
      try { fs.unlinkSync(tmpScriptPath); } catch {}
      try { fs.unlinkSync(tmpClipsPath);  } catch {}
      try { fs.unlinkSync(tmpFadesPath);  } catch {}
      if (signal === 'SIGTERM' || code === null) {
        resolve({ success: false, cancelled: true, error: 'Render cancelled' });
      } else if (code === 0) {
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: `AE pipeline exited with code ${code}` });
      }
    });
    proc.on('error', err => { if (tabId) renderProcs.delete(tabId); resolve({ success: false, error: err.message }); });
  });
});

// ── After Effects quick preview (half-res, draft quality) ───────
ipcMain.handle('render-video-ae-preview', (event, { tabId, audioPath, labelsPath, scriptLines, clipPaths, outputPath, fontName, fontWeight, fontStyle, fontSize, fadeMarkers, videoTitle }) => {
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}

  const ts = Date.now();
  const tmpScriptPath = path.join(os.tmpdir(), `kb_ae_prev_script_${ts}.txt`);
  const tmpClipsPath  = path.join(os.tmpdir(), `kb_ae_prev_clips_${ts}.txt`);
  const tmpFadesPath  = path.join(os.tmpdir(), `kb_ae_prev_fades_${ts}.json`);

  fs.writeFileSync(tmpScriptPath, scriptLines.join('\n'), 'utf8');
  fs.writeFileSync(tmpClipsPath,  clipPaths.join('\n'),   'utf8');
  fs.writeFileSync(tmpFadesPath,  JSON.stringify(fadeMarkers || []), 'utf8');

  const args = [
    AE_PIPELINE_PATH,
    '--song',    audioPath,
    '--script',  tmpScriptPath,
    '--clips',   tmpClipsPath,
    '--output',  outputPath,
    '--fades',   tmpFadesPath,
    '--title',   videoTitle || 'KB_Project',
    '--preview',
    ...(labelsPath  ? ['--labels',      labelsPath]              : []),
    ...(fontName    ? ['--font-name',   fontName]                : []),
    ...(fontWeight  ? ['--font-weight', String(fontWeight)]      : []),
    ...(fontStyle   ? ['--font-style',  fontStyle]               : []),
    ...(fontSize    ? ['--font-size',   String(fontSize)]        : []),
  ];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('python3', args, { env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (err) {
      resolve({ success: false, error: err.message });
      return;
    }

    if (tabId) renderProcs.set(tabId, proc);

    let stdBuf = '';
    const parseProgress = (text) => {
      stdBuf += text;
      const lines = stdBuf.split(/[\r\n]/);
      stdBuf = lines.pop();
      for (const line of lines) {
        let pct = null;
        if      (line.includes('[1/3]'))  pct = 2;
        else if (line.includes('[2/3]'))  pct = 10;
        else if (line.includes('[3/3]'))  pct = 15;
        else if (line.includes('Done!'))  pct = 100;
        else {
          // aerender outputs: "PROGRESS:  X.XX %"
          const m = line.match(/PROGRESS:\s*([\d.]+)\s*%/i);
          if (m) pct = 15 + Math.round(parseFloat(m[1]) * 0.84);
        }
        if (pct !== null && mainWindow && !mainWindow.isDestroyed())
          // Send as preview-progress so UI uses the preview progress bar
          mainWindow.webContents.send('preview-progress', { pct, tabId });
      }
    };

    proc.stdout.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.stderr.on('data', data => {
      const str = data.toString();
      parseProgress(str);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('render-log', str);
    });
    proc.on('close', (code, signal) => {
      if (tabId) renderProcs.delete(tabId);
      try { fs.unlinkSync(tmpScriptPath); } catch {}
      try { fs.unlinkSync(tmpClipsPath);  } catch {}
      try { fs.unlinkSync(tmpFadesPath);  } catch {}
      if (signal === 'SIGTERM' || code === null) {
        resolve({ success: false, cancelled: true, error: 'Preview cancelled' });
      } else if (code === 0) {
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: `AE preview exited with code ${code}` });
      }
    });
    proc.on('error', err => { if (tabId) renderProcs.delete(tabId); resolve({ success: false, error: err.message }); });
  });
});

// ── Quick Preview render (480p, ultrafast) ─────────────────────
ipcMain.handle('preview-video', (event, { tabId, audioPath, labelsPath, scriptLines, clipPaths, fontName, fontWeight, fontStyle, fontSize, fadeMarkers }) => {
  const ts           = Date.now();
  const previewPath  = path.join(os.tmpdir(), `kb_preview_${ts}.mp4`);
  const tmpScriptPath = path.join(os.tmpdir(), `kb_script_${ts}.txt`);
  const tmpClipsPath  = path.join(os.tmpdir(), `kb_clips_${ts}.txt`);
  const tmpFadesPath  = path.join(os.tmpdir(), `kb_fades_${ts}.json`);

  fs.writeFileSync(tmpScriptPath, scriptLines.join('\n'), 'utf8');
  fs.writeFileSync(tmpClipsPath,  clipPaths.join('\n'),   'utf8');
  fs.writeFileSync(tmpFadesPath,  JSON.stringify(fadeMarkers || []), 'utf8');

  const footageFolders = [...new Set(clipPaths.map(p => path.dirname(p)))];

  const args = [
    PIPELINE_PATH,
    '--song',    audioPath,
    '--footage', ...footageFolders,
    '--script',  tmpScriptPath,
    '--clips',   tmpClipsPath,
    '--labels',  labelsPath,
    '--output',  previewPath,
    '--preview',
    '--fades',   tmpFadesPath,
    ...(fontName   ? ['--font-name',   fontName]           : []),
    ...(fontWeight ? ['--font-weight', String(fontWeight)] : []),
    ...(fontStyle  ? ['--font-style',  fontStyle]          : []),
    ...(fontSize   ? ['--font-size',   String(fontSize)]   : []),
  ];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('python3', args, { env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (err) {
      resolve({ success: false, error: err.message });
      return;
    }

    if (tabId) renderProcs.set(tabId, proc);

    let stdBuf = '';
    const parseProgress = (text) => {
      stdBuf += text;
      const lines = stdBuf.split(/[\r\n]/);
      stdBuf = lines.pop();
      for (const line of lines) {
        let pct = null;
        if      (line.includes('[1/3]'))       pct = 5;
        else if (line.includes('[2/3]'))       pct = 20;
        else if (line.includes('[3/3]'))       pct = 35;
        else if (line.includes('Rendering →')) pct = 40;
        else if (line.includes('Done!'))       pct = 100;
        else {
          const m = line.match(/(\d+)%\|/);
          if (m) pct = 40 + Math.round(parseInt(m[1]) * 0.55);
        }
        if (pct !== null && mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('preview-progress', { pct, tabId });
      }
    };

    proc.stdout.on('data', data => { parseProgress(data.toString()); });
    proc.stderr.on('data', data => { parseProgress(data.toString()); });

    proc.on('close', (code, signal) => {
      if (tabId) renderProcs.delete(tabId);
      try { fs.unlinkSync(tmpScriptPath); } catch {}
      try { fs.unlinkSync(tmpClipsPath);  } catch {}
      try { fs.unlinkSync(tmpFadesPath);  } catch {}
      if (signal === 'SIGTERM' || code === null) {
        resolve({ success: false, cancelled: true });
      } else if (code === 0) {
        resolve({ success: true, previewPath });
      } else {
        resolve({ success: false, error: `Preview pipeline exited with code ${code}` });
      }
    });
    proc.on('error', err => { if (tabId) renderProcs.delete(tabId); resolve({ success: false, error: err.message }); });
  });
});

