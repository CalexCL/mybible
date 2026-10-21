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
    assert.ok(!word.audioUrl||String(word.audioUrl).startsWith('https://'),'Curated audio URLs must use HTTPS');
  }
}
assert.ok(appSource.includes("document.querySelectorAll('.audio-rate-btn').forEach("),'Audio speed button update must use multi-element selector');
assert.ok(appSource.includes("if(!voice)utter.lang='en-US'"),'Romanized audio fallback must not masquerade as Greek/Hebrew audio');
const batch3NextQuotationLinks={
  "Genesis 2:7": [
    "1 Corinthians 15:45"
  ],
  "Genesis 15:5": [
    "Romans 4:18",
    "Hebrews 11:12"
  ],
  "Exodus 16:4": [
    "John 6:31-32"
  ],
  "Leviticus 19:2": [
    "1 Peter 1:16"
  ],
  "Deuteronomy 32:35": [
    "Romans 12:19",
    "Hebrews 10:30"
  ],
  "Psalm 14:1-3": [
    "Romans 3:10-12"
  ],
  "Psalm 24:1": [
    "1 Corinthians 10:26"
  ],
  "Psalm 32:1-2": [
    "Romans 4:7-8"
  ],
  "Psalm 40:6-8": [
    "Hebrews 10:5-7"
  ],
  "Psalm 68:18": [
    "Ephesians 4:8"
  ],
  "Psalm 91:11-12": [
    "Matthew 4:6",
    "Luke 4:10-11"
  ],
  "Psalm 104:4": [
    "Hebrews 1:7"
  ],
  "Psalm 110:1": [
    "Matthew 22:44",
    "Mark 12:36",
    "Luke 20:42-43",
    "Acts 2:34-35",
    "Hebrews 1:13"
  ],
  "Isaiah 8:14": [
    "Romans 9:33",
    "1 Peter 2:8"
  ],
  "Isaiah 25:8": [
    "1 Corinthians 15:54",
    "Revelation 21:4"
  ],
  "Isaiah 29:13": [
    "Matthew 15:8-9",
    "Mark 7:6-7"
  ],
  "Isaiah 45:23": [
    "Romans 14:11",
    "Philippians 2:10-11"
  ],
  "Isaiah 54:13": [
    "John 6:45"
  ],
  "Isaiah 64:4": [
    "1 Corinthians 2:9"
  ],
  "Jeremiah 9:24": [
    "1 Corinthians 1:31",
    "2 Corinthians 10:17"
  ]
};
for(const [source,targets] of Object.entries(batch3NextQuotationLinks)){
  assert.ok(Array.isArray(referenceIndex[source]),'Batch 3 next source missing: '+source);
  for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Batch 3 next link missing: '+source+' -> '+target);
}
assert.ok(appSource.includes("if(lang.includes('aramaic'))return '';"),'Aramaic must not be relabelled as Hebrew TTS');
assert.ok(appSource.includes("if(!prefix)return null;"),'Absent language must not match arbitrary device voices');
assert.ok(appSource.includes("===lang.toLowerCase()"),'Preferred voice must match language locale');
const batch3ScriptureLinks={
  "Genesis 12:1-3": [
    "Acts 7:2-3",
    "Hebrews 11:8"
  ],
  "Genesis 21:12": [
    "Romans 9:7",
    "Hebrews 11:18"
  ],
  "Exodus 9:16": [
    "Romans 9:17"
  ],
  "Exodus 19:6": [
    "1 Peter 2:9",
    "Revelation 1:6"
  ],
  "Deuteronomy 19:15": [
    "Matthew 18:16",
    "2 Corinthians 13:1"
  ],
  "Deuteronomy 21:23": [
    "Galatians 3:13"
  ],
  "Deuteronomy 24:1": [
    "Matthew 19:7",
    "Mark 10:4"
  ],
  "Psalm 2:1-2": [
    "Acts 4:25-26"
  ],
  "Psalm 8:2": [
    "Matthew 21:16"
  ],
  "Psalm 16:8-11": [
    "Acts 2:25-28"
  ],
  "Psalm 18:49": [
    "Romans 15:9"
  ],
  "Psalm 19:4": [
    "Romans 10:18"
  ],
  "Psalm 44:22": [
    "Romans 8:36"
  ],
  "Psalm 51:4": [
    "Romans 3:4"
  ],
  "Psalm 69:22-23": [
    "Romans 11:9-10"
  ],
  "Psalm 117:1": [
    "Romans 15:11"
  ],
  "Psalm 118:22-23": [
    "Matthew 21:42",
    "Mark 12:10-11",
    "Luke 20:17",
    "Acts 4:11",
    "1 Peter 2:7"
  ],
  "Isaiah 10:22-23": [
    "Romans 9:27-28"
  ],
  "Isaiah 11:10": [
    "Romans 15:12"
  ],
  "Isaiah 52:7": [
    "Romans 10:15"
  ],
  "Isaiah 53:1": [
    "John 12:38",
    "Romans 10:16"
  ],
  "Isaiah 65:1": [
    "Romans 10:20"
  ],
  "Isaiah 65:2": [
    "Romans 10:21"
  ]
};
for(const [source,targets] of Object.entries(batch3ScriptureLinks)){
  assert.ok(Array.isArray(referenceIndex[source]),'New Scripture source missing: '+source);
  for(const target of targets)assert.ok(referenceIndex[source].includes(target),'New Scripture target missing: '+source+' -> '+target);
}
assert.ok(appSource.includes("status:'unavailable'"),'Voice availability must distinguish no playable transliteration');
assert.ok(appSource.includes("audio.play().catch(()=>{if(btn)markAudioButton(btn,false)"),'Audio play rejection must reset playing state');
const nextBatchLinks={
  "Genesis 17:5": [
    "Romans 4:17"
  ],
  "Genesis 18:10": [
    "Romans 9:9"
  ],
  "Genesis 25:23": [
    "Romans 9:12"
  ],
  "Exodus 33:19": [
    "Romans 9:15"
  ],
  "Leviticus 18:5": [
    "Romans 10:5",
    "Galatians 3:12"
  ],
  "Deuteronomy 9:4": [
    "Romans 10:6"
  ],
  "Deuteronomy 30:12-14": [
    "Romans 10:6-8"
  ],
  "Deuteronomy 32:21": [
    "Romans 10:19"
  ],
  "Psalm 5:9": [
    "Romans 3:13"
  ],
  "Psalm 10:7": [
    "Romans 3:14"
  ],
  "Psalm 36:1": [
    "Romans 3:18"
  ],
  "Psalm 69:9": [
    "John 2:17",
    "Romans 15:3"
  ],
  "Psalm 143:2": [
    "Romans 3:20",
    "Galatians 2:16"
  ],
  "Isaiah 1:9": [
    "Romans 9:29"
  ],
  "Isaiah 29:16": [
    "Romans 9:20"
  ],
  "Isaiah 40:13": [
    "Romans 11:34",
    "1 Corinthians 2:16"
  ],
  "Isaiah 52:15": [
    "Romans 15:21"
  ],
  "Isaiah 59:7-8": [
    "Romans 3:15-17"
  ],
  "Isaiah 59:20-21": [
    "Romans 11:26-27"
  ],
  "Jeremiah 18:6": [
    "Romans 9:21"
  ]
};
for(const [source,targets] of Object.entries(nextBatchLinks)){
  assert.ok(Array.isArray(referenceIndex[source]),'Batch 3 reference source missing: '+source);
  for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Batch 3 target missing: '+source+' -> '+target);
}
assert.ok(appSource.includes('Latin transliteration approximation'),'Fallback audio must not imply original-language pronunciation');
const batch3HebrewsActsLinks={
  "Genesis 26:4": [
    "Acts 3:25",
    "Galatians 3:8"
  ],
  "Exodus 20:13-17": [
    "Matthew 19:18-19",
    "Romans 13:9"
  ],
  "Leviticus 19:18": [
    "Matthew 22:39",
    "Mark 12:31",
    "Romans 13:9",
    "Galatians 5:14",
    "James 2:8"
  ],
  "Numbers 14:21": [
    "Hebrews 3:17-19"
  ],
  "Deuteronomy 4:35": [
    "Mark 12:32"
  ],
  "Deuteronomy 32:43": [
    "Romans 15:10",
    "Hebrews 1:6"
  ],
  "Psalm 2:9": [
    "Revelation 2:27",
    "Revelation 12:5",
    "Revelation 19:15"
  ],
  "Psalm 22:22": [
    "Hebrews 2:12"
  ],
  "Psalm 45:6-7": [
    "Hebrews 1:8-9"
  ],
  "Psalm 95:7-8": [
    "Hebrews 3:7-8",
    "Hebrews 4:7"
  ],
  "Psalm 110:4": [
    "Hebrews 5:6",
    "Hebrews 7:17",
    "Hebrews 7:21"
  ],
  "Proverbs 3:34": [
    "James 4:6",
    "1 Peter 5:5"
  ],
  "Isaiah 8:17-18": [
    "Hebrews 2:13"
  ],
  "Isaiah 35:3": [
    "Hebrews 12:12"
  ],
  "Isaiah 49:6": [
    "Acts 13:47"
  ],
  "Isaiah 55:3": [
    "Acts 13:34"
  ],
  "Jeremiah 31:33": [
    "Hebrews 8:10",
    "Hebrews 10:16"
  ],
  "Hosea 1:10": [
    "Romans 9:26",
    "1 Peter 2:10"
  ],
  "Hosea 2:23": [
    "Romans 9:25",
    "1 Peter 2:10"
  ],
  "Zechariah 11:12-13": [
    "Matthew 27:9-10"
  ]
};
for(const [source,targets] of Object.entries(batch3HebrewsActsLinks)){
 assert.ok(Array.isArray(referenceIndex[source]),'Scripture source not indexed: '+source);
 for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Scripture target not indexed: '+source+' -> '+target);
}
assert.ok(appSource.includes('try{window.speechSynthesis.speak(utter);}catch'),'Speech engine errors must settle audio state');
const batch3MoreLinks={
  "Genesis 28:12": [
    "John 1:51"
  ],
  "Exodus 12:46": [
    "John 19:36"
  ],
  "Exodus 16:18": [
    "2 Corinthians 8:15"
  ],
  "Deuteronomy 17:6": [
    "Hebrews 10:28"
  ],
  "Deuteronomy 27:26": [
    "Galatians 3:10"
  ],
  "Psalm 34:12-16": [
    "1 Peter 3:10-12"
  ],
  "Psalm 116:10": [
    "2 Corinthians 4:13"
  ],
  "Psalm 118:6": [
    "Hebrews 13:6"
  ],
  "Psalm 132:11": [
    "Acts 2:30"
  ],
  "Proverbs 25:21-22": [
    "Romans 12:20"
  ],
  "Isaiah 6:1-10": [
    "John 12:39-41"
  ],
  "Isaiah 8:12-13": [
    "1 Peter 3:14-15"
  ],
  "Isaiah 22:22": [
    "Revelation 3:7"
  ],
  "Isaiah 28:11-12": [
    "1 Corinthians 14:21"
  ],
  "Isaiah 49:8": [
    "2 Corinthians 6:2"
  ],
  "Isaiah 53:4": [
    "Matthew 8:17"
  ],
  "Isaiah 66:1-2": [
    "Acts 7:49-50"
  ],
  "Jeremiah 31:34": [
    "Hebrews 8:12",
    "Hebrews 10:17"
  ],
  "Habakkuk 1:5": [
    "Acts 13:41"
  ]
};
for(const [source,targets] of Object.entries(batch3MoreLinks)){
 assert.ok(Array.isArray(referenceIndex[source]),'Missing source '+source);
 for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Missing cross reference '+source+' -> '+target);
}
assert.ok(appSource.includes('try{voices=window.speechSynthesis.getVoices()||[];}catch{return null;}'),'Speech voice discovery must fail safely');
const batch3CanonicalQuotationChecks={
  "Genesis 5:2": [
    "Matthew 19:4",
    "Mark 10:6"
  ],
  "Exodus 3:6": [
    "Matthew 22:32",
    "Mark 12:26",
    "Luke 20:37",
    "Acts 7:32"
  ],
  "Exodus 20:12": [
    "Matthew 15:4",
    "Mark 7:10",
    "Ephesians 6:2-3"
  ],
  "Deuteronomy 6:5": [
    "Matthew 22:37",
    "Mark 12:30",
    "Luke 10:27"
  ],
  "Deuteronomy 18:15": [
    "Acts 3:22",
    "Acts 7:37"
  ],
  "Psalm 16:10": [
    "Acts 2:27",
    "Acts 13:35"
  ],
  "Psalm 22:1": [
    "Matthew 27:46",
    "Mark 15:34"
  ],
  "Psalm 110:1": [
    "Matthew 22:44",
    "Mark 12:36",
    "Luke 20:42-43",
    "Acts 2:34-35",
    "Hebrews 1:13"
  ],
  "Isaiah 40:3": [
    "Matthew 3:3",
    "Mark 1:3",
    "Luke 3:4",
    "John 1:23"
  ],
  "Malachi 4:5-6": [
    "Luke 1:17"
  ]
};
for(const [source,targets] of Object.entries(batch3CanonicalQuotationChecks)){
 assert.ok(Array.isArray(referenceIndex[source]),'Quotation source missing: '+source);
 for(const target of targets)assert.ok(referenceIndex[source].includes(target),'Quotation link missing: '+source+' -> '+target);
}
assert.ok(appSource.includes("typeof window.speechSynthesis?.getVoices!=='function'"),'Missing speech engine APIs must be handled');
assert.ok(appSource.includes("const recordings=matching.filter(w=>w.audioUrl).length"),'Mixed curated audio groups must be counted accurately');
assert.ok(appSource.includes("device voices '+device"),'Partial audio report must count actual device voices');
assert.ok(appSource.includes("unavailable '+unavailable"),'Partial audio report must disclose unavailable words');
assert.ok(appSource.includes("audioVolume:'csb.originalAudioVolume'"),'Persist audio volume');
assert.ok(appSource.includes("utter.volume=Math.min(1,volume)"),'TTS obeys system volume limit');
assert.ok(appSource.includes("gain.gain.value=volume"),'Recorded audio gain available');
assert.ok(appSource.includes('data-volume="2"'),'Recorded audio boost control exists');
const indexSource=read('index.html');
assert.ok(indexSource.includes('id="globalAudioVolume"'),'Desktop audio selector must be present');
assert.ok(indexSource.includes('id="mobileAudioVolume"'),'Mobile audio selector must be present outside the header');
assert.ok(indexSource.indexOf('class="mobile-audio-dock"')<indexSource.indexOf('<div class="layout">'),'Volume toolbar should precede main layout, not float over controls');
assert.ok(appSource.includes("globalAudioVolume.addEventListener('change'"),'Global desktop/mobile volume selector must be interactive');
assert.ok(read('styles.css').includes('.global-audio-volume'),'Desktop volume requires styling');
assert.ok(read('styles.css').includes('.mobile-audio-dock{display:flex;position:sticky'),'Mobile volume dock must be fixed and visible');
assert.ok(appSource.includes("mobileAudioVolume.addEventListener('change'"),'Mobile volume control must have a change handler');
assert.ok(appSource.includes('window.__myBibleWordAudio.volume=Math.min(1,n)'),'Volume selector should update currently playing recordings');
assert.ok(appSource.includes('window.__myBibleAudioContext.close().catch(()=>{})'),'Stopping recordings must release audio graph resources');
assert.ok(read('scripts/smoke-chronology.mjs').includes("locator('#mobileAudioVolume').selectOption('1.5')"),'Mobile volume browser interaction test required');
assert.ok(read('scripts/smoke-chronology.mjs').includes("if(!(await page.locator('#bookSelect').isVisible()))"),'Smoke test must restore expanded reader menus before chapter selection');
assert.ok(read('scripts/smoke-chronology.mjs').includes("Audio dock must not overlap Hide Menus"),'Responsive audio overlap regression test required');
assert.ok(appSource.includes("addEventListener('voiceschanged',refreshOriginalAudioVoices)"),'Original language voice availability must refresh when device voices become ready');
assert.ok(appSource.includes('id="originalAudioVoiceStatus"'),'Audio status region must be refreshable');
assert.ok(appSource.includes("$('#refreshOriginalAudioVoices')?.addEventListener('click'"),'Manual refresh button must be connected');
assert.ok(appSource.includes("body.querySelectorAll('.word-audio-btn').forEach"),'Audio controls need a multi-element selector');
assert.ok(appSource.includes("document.querySelectorAll('#drawerBody .word-card')"),'Voice refresh must update only word cards inside the original-language drawer');
assert.ok(appSource.includes("recordings+'/'+matching.length"),'Audio source coverage should disclose partial recordings');
console.log('PASS targeted OT to NT Scripture quotation checks');
console.log('PASS Batch 3 more direct Scripture links');
console.log('PASS expanded Hebrews and Acts cross-reference checks');
console.log('PASS Batch 3 additional reference links: '+Object.keys(nextBatchLinks).length);
console.log('PASS added Scripture-reference source groups: '+Object.keys(batch3ScriptureLinks).length);
console.log('PASS Batch 3 next Scripture links: '+Object.keys(batch3NextQuotationLinks).length+' groups');
console.log('PASS Batch 3 direct Scripture quotation links: '+Object.keys(batch3QuotationLinks).length+' groups');
console.log('PASS cross-reference source integrity: '+Object.keys(referenceIndex).length+' source groups');
assert.ok(read('app.js').includes("s[m[0].length]"),'Cross-reference range matching checks verse token boundaries');
assert.ok(read('app.js').includes('savePreferences?.({audio_rate:n})'),'Original-language audio speed syncs between devices');
console.log('PASS chronology syntax, source links, arithmetic, relationships, ages, provenance, People integration');
console.log(JSON.stringify({plotted:people.size, other:other.size, explorer:study.people.length, family:data.family.length, direct:data.undatedPeople.reduce((n,p)=>n+(p.directEvents||[]).length,0)}));
