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
  assert.ok(new Set(journey.stops.map(stop=>stop.place)).size===journey.stops.length, 'Duplicate journey stop: '+journey.id);
  for(const stop of journey.stops) {
    assert.ok(study.places.some(p=>p.name===stop.place), 'Journey place missing from Atlas: '+stop.place);
    assert.ok(stop.ref && /[A-Za-z]/.test(stop.ref), 'Journey Scripture reference missing: '+journey.id);
  }
}

const appSource = read('app.js');
assert.ok(!/(?<!\\$)\\$\\([^\\n;]*?\\)\\.forEach\\s*\\(/.test(appSource), 'A single-element $ selector is incorrectly used with forEach');
assert.ok(!/\\$\\$\\$\\(/.test(appSource), 'Undefined $$ selector breaks app startup');
console.log('PASS chronology syntax, source links, arithmetic, relationships, ages, provenance, People integration');
console.log(JSON.stringify({plotted:people.size, other:other.size, explorer:study.people.length, family:data.family.length, direct:data.undatedPeople.reduce((n,p)=>n+(p.directEvents||[]).length,0)}));
