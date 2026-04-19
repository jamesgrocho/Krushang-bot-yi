'use strict';

const Airtable = require('airtable');

const config = {
  apiKey:    process.env.AIRTABLE_API_KEY,
  baseId:    process.env.AIRTABLE_BASE_ID || 'appQVRxAfaQ6tJMN6',
  tableName: 'Videos',
};

const base = new Airtable({ apiKey: config.apiKey }).base(config.baseId);

const testRecord = {
  'Video Title':         'TEST RECORD — delete me',
  'Script GDoc':         'https://docs.google.com/document/d/test-script/edit',
  'Description GDoc':    'https://docs.google.com/document/d/test-desc/edit',
  'GDrive Finals Folder':'https://drive.google.com/drive/folders/test-folder',
  'Project status':      '✅ Ready for Review',
  '🐤 Assigned To':      ['April'],
  '👨🏼‍🤝‍👨🏾 Collaborators': ['April', 'James', 'Bot'],
  'Video Type':          'SS Mini Movie',
  'Pre-Production Time': 1200,   // Duration field — seconds (20 min)
  'Script Cost':         0,
  'VO Cost':             0,
  'Other Worker Cost':   0,
  'Send To':             ['Easy Worship', 'Sermon Central', 'Skit Guys', 'Church Visuals'],
};

console.log('Creating Airtable test record...');
console.log('Fields:', JSON.stringify(testRecord, null, 2));

base(config.tableName).create([{ fields: testRecord }], (err, records) => {
  if (err) {
    console.error('\n❌ FAILED:', err.message);
    process.exit(1);
  }
  const r = records[0];
  console.log('\n✅ SUCCESS — Record created!');
  console.log('  Record ID:', r.getId());
  console.log('  Video Title:', r.get('Video Title'));
  console.log('\nGo delete "TEST RECORD — delete me" from Airtable.');
  process.exit(0);
});
