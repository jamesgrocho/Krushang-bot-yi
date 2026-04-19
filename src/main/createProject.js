'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { shell } = require('electron');

const CONFIG_PATH = '/Users/jamesgrochowalski/Desktop/Krushang Bot/kb-config.json';
const TOKEN_PATH  = '/Users/jamesgrochowalski/Desktop/Krushang Bot/kb-google-token.json';

// ─────────────────────────────────────────────────────────────
// Config loader
// ─────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found at: ${CONFIG_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse config file: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Google OAuth2
// ─────────────────────────────────────────────────────────────

async function getAuthClient(config) {
  const { google } = require('googleapis');
  const { clientId, clientSecret, redirectUri } = config.google;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Try cached token first
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2.setCredentials(tokens);

      // If access token is still valid (expiry_date in future), return immediately
      if (tokens.expiry_date && tokens.expiry_date > Date.now() + 60000) {
        return oauth2;
      }

      // Try to refresh using refresh_token
      if (tokens.refresh_token) {
        const { credentials } = await oauth2.refreshAccessToken();
        oauth2.setCredentials(credentials);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2), 'utf8');
        return oauth2;
      }
    } catch (err) {
      // Cached token invalid — fall through to full OAuth flow
    }
  }

  // Full OAuth flow: open browser, listen on the port from redirectUri
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
  });

  // Parse port and path from the configured redirectUri so they always match
  const redirectUrl  = new URL(config.google.redirectUri);
  const serverPort   = parseInt(redirectUrl.port, 10) || 80;
  const callbackPath = redirectUrl.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, config.google.redirectUri);
        if (url.pathname !== callbackPath) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="font-family:sans-serif;background:#111;color:#f55;padding:40px">
            <h2>Authorization failed</h2><p>${error}</p>
            <p>You may close this tab.</p></body></html>`);
          server.close();
          reject(new Error(`OAuth authorization failed: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end('Missing code');
          return;
        }

        const { tokens } = await oauth2.getToken(code);
        oauth2.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:40px;text-align:center">
          <div style="max-width:420px;margin:60px auto;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px">
            <div style="font-size:48px;margin-bottom:16px">✓</div>
            <h2 style="color:#4cd964;margin:0 0 12px">Google Authorization Successful</h2>
            <p style="color:#888;font-size:14px">You can close this tab and return to Krushang Bot.</p>
          </div></body></html>`);

        server.close();
        resolve(oauth2);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error: ' + err.message);
        server.close();
        reject(err);
      }
    });

    server.listen(serverPort, () => {
      shell.openExternal(authUrl);
    });

    server.on('error', (err) => {
      reject(new Error(`OAuth server error: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Google authorization timed out (5 minutes). Please try again.'));
    }, 5 * 60 * 1000);
  });
}

// ─────────────────────────────────────────────────────────────
// Drive helpers
// ─────────────────────────────────────────────────────────────

async function findFolderByName(drive, name, parentId = null) {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  return res.data.files.length > 0 ? res.data.files[0] : null;
}

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id, name',
  });
  return res.data;
}

async function getOrCreateFolder(drive, name, parentId) {
  const existing = await findFolderByName(drive, name, parentId);
  if (existing) return existing;
  return createFolder(drive, name, parentId);
}

async function findFileByName(drive, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  let q = `name='${escaped}' and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  return res.data.files.length > 0 ? res.data.files[0] : null;
}

async function findDocByName(drive, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  let q = `name='${escaped}' and trashed=false and mimeType='application/vnd.google-apps.document'`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  return res.data.files.length > 0 ? res.data.files[0] : null;
}

async function uploadFileToDrive(drive, localPath, name, parentId) {
  const { Readable } = require('stream');
  const fileContent = fs.readFileSync(localPath);
  const stream = Readable.from(fileContent);

  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
    },
    media: {
      mimeType: 'video/mp4',
      body: stream,
    },
    fields: 'id, name',
  });
  return res.data;
}

async function replaceFileToDrive(drive, localPath, name, parentId) {
  // Delete existing file with same name in the folder, then upload fresh
  const existing = await findFileByName(drive, name, parentId);
  if (existing) {
    await drive.files.delete({ fileId: existing.id });
  }
  return uploadFileToDrive(drive, localPath, name, parentId);
}

async function replaceGoogleDocContent(docs, docId, text) {
  // Get current doc to find end index, then delete all and reinsert
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body.content.reduce((max, el) => {
    if (el.endIndex) return Math.max(max, el.endIndex);
    return max;
  }, 1);

  const requests = [];
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  }
  if (text) {
    requests.push({ insertText: { location: { index: 1 }, text } });
  }
  if (requests.length > 0) {
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
  }
}

async function makeFilePublic(drive, fileId) {
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });
}

function driveFileLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function driveFolderLink(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function docsLink(docId) {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

// ─────────────────────────────────────────────────────────────
// Docs helpers
// ─────────────────────────────────────────────────────────────

async function createGoogleDoc(drive, docs, name, parentId, text) {
  // Create the doc via Drive (to place it in the right folder)
  const driveRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    },
    fields: 'id, name',
  });

  const docId = driveRes.data.id;

  // Insert text at index 1 (beginning of document body)
  if (text) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text,
            },
          },
        ],
      },
    });
  }

  return driveRes.data;
}

// ─────────────────────────────────────────────────────────────
// Claude description generation
// ─────────────────────────────────────────────────────────────

async function generateDescription(openaiApiKey, videoTitle) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: openaiApiKey });

  const prompt = `TASK: Create a finalized video information document.
Title: ${videoTitle}

Description Rules:
* 3–5 sentences.
* Poetic and inspiring.
* Do NOT mention scripts, scripting, or writing.
* Do NOT start with "This script is about".
* Do NOT ever use the word 'divine'.
* Description MUST: Contain explicit Christian language, including at least TWO of: Jesus, Jesus Christ, Christ, Savior, God, Lord. Be clearly grounded in biblical Christian faith, not abstract spirituality. Avoid vague or cosmic language (stars, universe, energy, light). Use plain sentences only. Do NOT use dashes (-), em dashes (—), or bullet-style punctuation.

Keywords:
* Generate EXACTLY 100 UNIQUE YouTube keywords.
* Comma-separated only. No numbering. No line breaks.

Verses:
* Generate EXACTLY 100 UNIQUE Bible verse references.
* Comma-separated only. References only.

MANDATORY COUNTING: Count internally to ensure total equals EXACTLY 100 for both keywords and verses. Do NOT stop early.

Format your response EXACTLY as:
TITLE:
${videoTitle}

DESCRIPTION:
[description text]

KEYWORDS:
[100 comma-separated keywords]

VERSES:
[100 comma-separated verse references]`;

  const message = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────
// Airtable record creation
// ─────────────────────────────────────────────────────────────

async function upsertAirtableRecord(airtableConfig, { title, scriptDocLink, descDocLink, finalsFolderLink }) {
  const Airtable = require('airtable');
  const base = new Airtable({ apiKey: airtableConfig.apiKey }).base(airtableConfig.baseId);
  const table = airtableConfig.tableName || 'Videos';

  // Look for an existing record with the same Video Title
  const existing = await new Promise((resolve, reject) => {
    const found = [];
    base(table).select({
      filterByFormula: `{Video Title} = '${title.replace(/'/g, "\\'")}'`,
      maxRecords: 1,
    }).eachPage(
      (records, next) => { found.push(...records); next(); },
      (err) => { if (err) reject(new Error(`Airtable search error: ${err.message}`)); else resolve(found); }
    );
  });

  const fields = {
    'Script GDoc': scriptDocLink,
    'Description GDoc': descDocLink,
    'GDrive Finals Folder': finalsFolderLink,
    'Project status': '✅ Ready for Review',
  };

  if (existing.length > 0) {
    // Update existing record — only overwrite the link fields
    return new Promise((resolve, reject) => {
      base(table).update(existing[0].id, fields, (err, record) => {
        if (err) reject(new Error(`Airtable update error: ${err.message}`));
        else resolve(record);
      });
    });
  }

  // Create new record
  return new Promise((resolve, reject) => {
    base(table).create(
      [{
        fields: {
          'Video Title': title,
          ...fields,
          '🐤 Assigned To': ['April'],
          '👨🏼‍🤝‍👨🏾 Collaborators': ['April', 'James', 'Bot'],
          'Video Type': 'SS Mini Movie',
          'Pre-Production Time': 1200,
          'Script Cost': 0,
          'VO Cost': 0,
          'Other Worker Cost': 0,
          'Send To': ['Easy Worship', 'Sermon Central', 'Skit Guys', 'Church Visuals'],
        },
      }],
      (err, records) => {
        if (err) reject(new Error(`Airtable error: ${err.message}`));
        else resolve(records[0]);
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

async function createProject({ videoTitle, scriptLines, renderedVideoPath }, sendProgress) {
  const config = loadConfig();

  // ── Step 1: Authenticate ──────────────────────────────────
  sendProgress('Authenticating with Google');
  const auth = await getAuthClient(config);

  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });
  const docs  = google.docs({ version: 'v1', auth });

  // ── Step 2: Create Drive folder structure ─────────────────
  sendProgress('Creating Drive folders');

  // Try to find "Quick Mini Movies" folder specifically inside "Project Files"
  // If that fails, create the hierarchy from scratch at the root
  let qmmInsidePF;

  try {
    // Search for "Project Files" at root level (no parent specified)
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='Project Files' and trashed=false and 'root' in parents`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    let projectFilesFolder;
    if (res.data.files.length > 0) {
      projectFilesFolder = res.data.files[0];
    } else {
      // Create it at root if it doesn't exist
      projectFilesFolder = await createFolder(drive, 'Project Files', null);
    }

    // Now look for "Quick Mini Movies" inside that "Project Files"
    qmmInsidePF = await getOrCreateFolder(drive, 'Quick Mini Movies', projectFilesFolder.id);
  } catch (err) {
    throw new Error(`Failed to navigate folder structure: ${err.message}`);
  }

  // Create [Video Title] folder
  const titleFolder = await getOrCreateFolder(drive, videoTitle, qmmInsidePF.id);

  // Create "Finals" and "Script" subfolders
  const finalsFolder = await getOrCreateFolder(drive, 'Finals', titleFolder.id);
  const scriptFolder = await getOrCreateFolder(drive, 'Script', titleFolder.id);

  const finalsFolderLink = driveFolderLink(finalsFolder.id);

  // ── Step 3: Upload rendered video ────────────────────────
  sendProgress('Moving video to Drive');

  const videoFileName = path.basename(renderedVideoPath);
  await replaceFileToDrive(drive, renderedVideoPath, videoFileName, finalsFolder.id);

  // ── Step 4: Create or update Script doc ──────────────────
  const scriptDocName = `${videoTitle} (Script)`;
  const scriptText = (scriptLines || []).join('\n\n');
  const existingScriptDoc = await findDocByName(drive, scriptDocName, scriptFolder.id);

  let scriptDoc;
  if (existingScriptDoc) {
    sendProgress('Updating Script doc');
    await replaceGoogleDocContent(docs, existingScriptDoc.id, scriptText);
    scriptDoc = existingScriptDoc;
  } else {
    sendProgress('Creating Script doc');
    scriptDoc = await createGoogleDoc(drive, docs, scriptDocName, scriptFolder.id, scriptText);
  }
  await makeFilePublic(drive, scriptDoc.id);
  const scriptDocLink = docsLink(scriptDoc.id);

  // ── Step 5: Create or update Description doc ─────────────
  const descDocName = `${videoTitle} (Description)`;
  const existingDescDoc = await findDocByName(drive, descDocName, finalsFolder.id);

  // ── Step 6: Generate AI content ──────────────────────────
  sendProgress('Generating AI content (100 keywords + 100 verses)');

  const descriptionContent = await generateDescription(config.openai.apiKey, videoTitle);

  let descDoc;
  if (existingDescDoc) {
    sendProgress('Updating Description doc');
    await replaceGoogleDocContent(docs, existingDescDoc.id, descriptionContent);
    descDoc = existingDescDoc;
  } else {
    sendProgress('Creating Description doc');
    descDoc = await createGoogleDoc(drive, docs, descDocName, finalsFolder.id, descriptionContent);
  }

  await makeFilePublic(drive, descDoc.id);
  const descDocLink = docsLink(descDoc.id);

  // ── Step 7: Create or update Airtable record ─────────────
  sendProgress('Saving Airtable record');

  await upsertAirtableRecord(config.airtable, {
    title: videoTitle,
    scriptDocLink,
    descDocLink,
    finalsFolderLink,
  });

  return {
    success: true,
    finalsFolderLink,
    scriptDocLink,
    descDocLink,
  };
}

module.exports = { createProject };
