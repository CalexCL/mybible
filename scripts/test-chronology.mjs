import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const data = JSON.parse(read('data/people_chronology.json'));
const study = JSON.parse(read('data/study.json'));
const html = read('chronology.html');
const sw = read('service-worker.js');

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Chronology inline JavaScript missing');
new vm.Script(script, {filename: 'chronology-inline.js'});
assert.ok(html.includes("fetch('data/people_chronology.json')"), 'Chronology JSON loader missing');
assert.ok(sw.includes("'./chronology.html'"), 'Chronology page absent from PWA cache');
assert.ok(sw.includes("'./data/people_chronology.json'"), 'Chronology JSON absent from PWA cache');

const people = new Map();
for (const p of data.people) {
  assert.ok(p.name && !people.has(p.name), 'Duplicate plotted person: ' + p.name);
  assert.ok(Number.isFinite(p.birth) && Number.isFinite(p.life) && p.life > 0 && p.end === p.birth + p.life, 'Lifespan arithmetic: ' + p.name);
  people.set(p.name, p);
}
for (const link of data.family) {
  const parent = people.get(link.parent), child = people.get(link.child);
  assert.ok(parent && child && parent.birth + link.age === child.birth, 'Genealogy mismatch: ' + link.parent + ' -> ' + link.child);
  assert.ok(link.ref, 'Genealogy source missing');
}
for (const e of data.lifeEvents) {
  const p = people.get(e.person);
  assert.ok(p && Number.isFinite(e.age) && e.age >= 0 && e.age <= p.life && e.ref, 'Invalid major age event: ' + e.person);
}
const other = new Map();
for (const p of data.undatedPeople) {
  assert.ok(p.name && !other.has(p.name), 'Duplicate undated person: ' + p.name);
  assert.ok(p.life === null || Number.isFinite(p.life) && p.life > 0, 'Invalid lifespan: ' + p.name);
  assert.ok(p.era && p.era !== 'Unplaced', 'Missing narrative era: ' + p.name);
  for (const e of p.events || []) assert.ok(e.ref && Number.isFinite(e.age) && e.age >= 0 && (p.life === null || e.age <= p.life), 'Invalid age event: ' + p.name);
  for (const e of p.directEvents || []) assert.ok(e.ref && e.relation === 'named-person-in-scripture-event', 'Invalid direct event: ' + p.name);
  for (const e of p.timelineConnections || []) assert.ok(e.ref && e.relation === 'period-context-only', 'Invalid period event: ' + p.name);
  for (const link of p.placeConnections || []) { assert.ok(study.places.some(place => place.name === link.place), 'Unknown place linked to ' + p.name + ': ' + link.place); assert.ok(link.ref && link.relation === 'scripture-linked-place', 'Unverified geographic relation: ' + p.name); }
  const directKeys = new Set((p.directEvents || []).map(e => e.ref + '|' + e.titleZh));
  for (const e of p.timelineConnections || []) assert.ok(!directKeys.has(e.ref + '|' + e.titleZh), 'Duplicate direct and context event: ' + p.name);
  other.set(p.name, p);
}
for (const p of study.people) assert.ok(people.has(p.name) || other.has(p.name), 'People Explorer unmatched: ' + p.name);
for (const journey of study.journeys || []) {
  assert.ok(journey.id && journey.person && journey.stops?.length, 'Journey metadata missing');
  assert.ok(study.timeline.some(event=>event.era===journey.era),'Journey timeline era missing: '+journey.id);
  assert.ok(study.timeline.some(event=>event.era===journey.era && event.ref===journey.timelineRef),'Journey Timeline event reference missing: '+journey.id);
  assert.ok(study.timeline.some(event=>event.era===journey.era && event.ref===journey.timelineRef && event.titleZh && event.titleEn),'Journey event bilingual title missing: '+journey.id);
  assert.ok(new Set(journey.stops.map(stop=>stop.place)).size===journey.stops.length, 'Duplicate journey stop: '+journey.id);
  for(const stop of journey.stops) {
    assert.ok(study.places.some(p=>p.name===stop.place), 'Journey place missing from Atlas: '+stop.place);
    assert.ok(stop.ref && /[A-Za-z]/.test(stop.ref), 'Journey Scripture reference missing: '+journey.id);
    assert.ok(stop.ref.split(';').every(ref=>/^[A-Za-z0-9 ]+\s+\d+(?::\d+)?(?:-\d+(?::\d+)?)?$/.test(ref.trim())),'Malformed Scripture passage in journey '+journey.id+': '+stop.ref);
  }
}

const appSource = read('app.js');
assert.ok(!appSource.includes("const cards=$('[data-journey-era]',grid)"),'Journey sorting must select all cards');
assert.ok(appSource.includes("Psalms:['Psalm','Psa','Pss']"),'Psalms aliases required for Scripture cross-reference links');
assert.ok(appSource.includes("Matthew:['Matt','Mt']"),'Common book abbreviations must be supported');
assert.ok(!/(?<!\$)\$\([^\n;]*?\)\.forEach\s*\(/.test(appSource), 'A single-element $ selector is incorrectly used with forEach');
assert.ok(!/\$\$\$\(/.test(appSource), 'Undefined $$$ selector breaks app startup');
const backendSource = read('backend.js');
assert.ok(backendSource.includes("onConflict:'user_id,verse_ref'"),'Cloud study sync must upsert by user and verse');
assert.ok(!backendSource.includes("this.client.from(table).delete().eq('user_id', uid)"),'Cloud study sync must never delete entire user collections');
assert.ok(backendSource.includes("this.saveQueue=pending"),'Cloud study saves must be serialized');
const readerSource = read('app.js');
assert.ok(readerSource.includes("if(window.MyBibleAuth?.user)"),'Signed-in cloud failure cannot show guest data');
const accountSource=read('auth.js');
assert.ok(accountSource.includes("previousUserId!==(state.user?.id||null)"),'Account switching forces personal data reload');
assert.ok(read('auth.js').indexOf("if(event==='PASSWORD_RECOVERY')") < read('auth.js').indexOf("if(previousUserId!=="),'Password recovery is handled before identity-change reload');
assert.ok(read('auth.js').includes("redirectUrl()+'reset.html'"),'Recovery email must link to dedicated reset page');
assert.ok(read('reset.html').includes('exchangeCodeForSession'),'Reset page must support PKCE recovery');
assert.ok(read('reset.html').includes("type:'recovery'"),'Reset page must support token-hash recovery');
assert.ok(read('auth.js').includes("if(recoveryMode)"),'Recovery callback must preserve reset UI after session refresh');
assert.ok(read('auth.js').includes("cleanRecoveryLink();"),'Successful reset must clear recovery URL');
assert.ok(read('app.js').includes("clean===target||refTouchesSelection(clean)"),'Cross reference list excludes self links');
assert.ok(read('app.js').includes("Array.isArray(targets)?targets:[]"),'Cross references tolerate malformed index entries');
const referenceIndex=study.crossReferences||{};
const invalidReferences=[];
for(const [source,targets] of Object.entries(referenceIndex)){
  if(!Array.isArray(targets)){invalidReferences.push(source+': not an array');continue;}
  if(new Set(targets).size!==targets.length)invalidReferences.push(source+': duplicates');
  for(const target of targets){
    if(typeof target!=='string'||!target.trim())invalidReferences.push(source+': blank target');
    if(target===source)invalidReferences.push(source+': self reference');
  }
}
assert.deepEqual(invalidReferences,[],'Curated cross-reference index must have no duplicates or self links');
assert.ok(Object.keys(referenceIndex).length>=45,'Expanded cross-reference network has at least 45 source groups');
for(const ref of ['Isaiah 40:3','Jeremiah 31:31-34','Zechariah 9:9','Psalm 118:22'])assert.ok(Array.isArray(referenceIndex[ref])&&referenceIndex[ref].length,'New OT/NT cross-reference '+ref+' is indexed');
const batch3QuotationLinks={
  "Hosea 11:1": [
    "Matthew 2:15"
  ],
  "Joel 2:28-32": [
    "Acts 2:16-21",
    "Romans 10:13"
  ],
  "Amos 9:11-12": [
    "Acts 15:16-17"
  ],
  "Habakkuk 2:4": [
    "Romans 1:17",
    "Galatians 3:11",
    "Hebrews 10:38"
  ],
  "Deuteronomy 8:3": [
    "Matthew 4:4",
    "Luke 4:4"
  ],
  "Deuteronomy 6:16": [
    "Matthew 4:7",
    "Luke 4:12"
  ],
  "Deuteronomy 6:13": [
    "Matthew 4:10",
    "Luke 4:8"
  ],
  "Isaiah 53:7-8": [
    "Acts 8:32-33"
  ],
  "Isaiah 61:1-2": [
    "Luke 4:18-19"
  ],
  "Zechariah 12:10": [
    "John 19:37",
    "Revelation 1:7"
  ],
  "Zechariah 13:7": [
    "Matthew 26:31",
    "Mark 14:27"
  ],
  "Malachi 3:1": [
    "Matthew 11:10",
    "Mark 1:2",
    "Luke 7:27"
  ],
  "Psalm 22:18": [
    "Matthew 27:35",
    "John 19:24"
  ],
  "Psalm 34:20": [
    "John 19:36"
  ],
  "Psalm 41:9": [
    "John 13:18"
  ],
  "Psalm 69:21": [
    "Matthew 27:34",
    "John 19:28-29"
  ]
};
for(const [source,targets] of Object.entries(batch3QuotationLinks)){
  assert.ok(Array.isArray(referenceIndex[source]),'Batch 3 Scripture source missing: '+source);
  for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Batch 3 direct Scripture link missing: '+source+' -> '+target);
}
const originalWordGroups=Object.values(study.originalWords||{});
for(const words of originalWordGroups){
  assert.ok(Array.isArray(words),'Original-language word entries must be arrays');
  for(const word of words){
    assert.ok(['Greek','Hebrew','Aramaic'].includes(word.language),'Unknown audio language: '+word.language);
    assert.ok(typeof word.original==='string'&&word.original.trim(),'Original-language audio item lacks original script');
    assert.ok(!word.audioUrl||/^https:\\/\\//.test(word.audioUrl),'Curated audio URLs must use HTTPS');
  }
}
assert.ok(appSource.includes("document.querySelectorAll('.audio-rate-btn').forEach("),'Audio speed button update must use multi-element selector');
assert.ok(appSource.includes("if(!voice)utter.lang='en-US'"),'Romanized audio fallback must not masquerade as Greek/Hebrew audio');
console.log('PASS Batch 3 direct Scripture quotation links: '+Object.keys(batch3QuotationLinks).length+' groups');
console.log('PASS cross-reference source integrity: '+Object.keys(referenceIndex).length+' source groups');
assert.ok(read('app.js').includes("s[m[0].length]"),'Cross-reference range matching checks verse token boundaries');
assert.ok(read('app.js').includes('savePreferences?.({audio_rate:n})'),'Original-language audio speed syncs between devices');
console.log('PASS chronology syntax, source links, arithmetic, relationships, ages, provenance, People integration');
console.log(JSON.stringify({plotted:people.size, other:other.size, explorer:study.people.length, family:data.family.length, direct:data.undatedPeople.reduce((n,p)=>n+(p.directEvents||[]).length,0)}));
