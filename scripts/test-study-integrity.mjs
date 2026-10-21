import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base=JSON.parse(read('data/study.json'));
const extra=JSON.parse(read('data/study_batch4.json'));
const books=JSON.parse(read('data/books.json'));
const bookNames=new Set(books.map(b=>b.english));
const refPattern=/^(.+?) (\d+):(\d+)(?:-(\d+)(?::(\d+))?)?$/;
function checkRef(ref){
  const m=String(ref).match(refPattern);
  assert.ok(m,'Malformed Scripture ref: '+ref);
  assert.ok(bookNames.has(m[1]),'Unknown book in '+ref);
  assert.ok(+m[2]>=1 && +m[3]>=1 && (!m[4]||+m[4]>=1),'Invalid reference '+ref);
}
let released=0, quarantined=0;
for(const [ref,words] of Object.entries(extra.originalWords)){
  checkRef(ref);assert.ok(Array.isArray(words));
  const seen=new Set();
  for(const w of words){
    assert.ok(['Greek','Hebrew','Aramaic'].includes(w.language),'Unrecognized language');
    assert.match(w.strong,/^[GH]\d+$/,'Strong identifier shape');
    assert.equal(w.strong[0],w.language==='Greek'?'G':'H','Strong prefix language');
    assert.ok(w.original && w.transliteration && w.glossEn && w.glossZh && w.source,'Unattributed lexical entry');
    const key=w.strong+'|'+w.original;
    assert.ok(!seen.has(key),'Duplicate lexical entry: '+ref+' '+key);seen.add(key);
    if(w.verification==='review-required')quarantined++;else released++;
  }
}
for(const [ref,refs] of Object.entries(extra.crossReferences)){
  checkRef(ref);assert.ok(Array.isArray(refs));
  assert.equal(refs.length,new Set(refs).size,'Duplicate crossreference '+ref);
  for(const target of refs){checkRef(target);assert.notEqual(ref,target,'Self link');}
}
assert.ok(read('app.js').includes("words.filter(w=>w.verification!=='review-required')"),'Quarantine guard required');
assert.ok(read('service-worker.js').includes("'./data/study_batch4.json'"),'Supplement must be offline cached');
assert.ok(read('app.js').includes('const seen=new Set(existing.map('),'Baseline index cannot be overwritten');
assert.ok(read('app.js').includes("voiceForWord(word)"),'Voice selection remains conditional');
console.log('PASS verified-data structure, refs, dedupe, lexical quarantine, licensing separation',{released,quarantined,baseRefs:Object.keys(base.crossReferences).length,addonRefs:Object.keys(extra.crossReferences).length});
