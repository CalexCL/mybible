import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tables={bible_notes:[{user_id:'u1',verse_ref:'Genesis 1:1',note_text:'Original',updated_at:new Date().toISOString()}],bible_bookmarks:[],bible_highlights:[]};
const writes=[];
let offline=false;
const client={
 from(table){
  return {
   select(){return {eq(){return Promise.resolve(offline?{data:null,error:new Error('offline')}:{data:tables[table].map(x=>({...x})),error:null})}}},
   upsert(rows){
    if(offline)return Promise.resolve({error:new Error('offline')});
    writes.push({type:'upsert',table,refs:Array.from(rows,r=>r.verse_ref)});
    for(const row of rows){const i=tables[table].findIndex(x=>x.user_id===row.user_id&&x.verse_ref===row.verse_ref);if(i>=0)tables[table][i]={...tables[table][i],...row};else tables[table].push({...row});}
    return Promise.resolve({error:null});
   },
   delete(){return {eq(key,value){return {eq(key2,value2){writes.push({type:'delete',table,ref:value2});tables[table]=tables[table].filter(x=>!(x[key]===value&&x[key2]===value2));return Promise.resolve({error:null})}}}}}
  };
 }
};
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
const window={MyBibleAuth:{client,user:{id:'u1'}}};
vm.runInNewContext(fs.readFileSync('backend.js','utf8'),{window,localStorage,console});
const backend=new window.MyBibleBackend.SupabaseStudyBackend({});
await backend.init();
let state=await backend.loadStudyData();
assert.equal(state.notes['Genesis 1:1'].text,'Original');
state.notes['Genesis 1:2']={text:'New note'};
await backend.saveStudyData(state);
assert.deepEqual(writes.filter(w=>w.type==='upsert').map(w=>w.refs),[['Genesis 1:2']],'Only new note is upserted');
assert.equal(tables.bible_notes.length,2,'Existing note remains');
writes.length=0;
state.highlights['Genesis 1:1']={color:'blue'};
await backend.saveStudyData(state);
assert.deepEqual(writes.map(w=>w.table),['bible_highlights'],'Only changed highlights are written');
writes.length=0;
delete state.notes['Genesis 1:2'];
await backend.saveStudyData(state);
assert.deepEqual(writes,[{type:'delete',table:'bible_notes',ref:'Genesis 1:2'}],'Delete only requested verse');
assert.equal(tables.bible_notes[0].note_text,'Original');
writes.length=0;
const p1=backend.saveStudyData({...state,notes:{'Genesis 1:1':{text:'First'}}});
const p2=backend.saveStudyData({...state,notes:{'Genesis 1:1':{text:'Last'}}});
await Promise.all([p1,p2]);
assert.equal(tables.bible_notes[0].note_text,'Last','Rapid saves keep newest note');
assert.equal(writes.filter(w=>w.type==='delete'&&w.ref==='Genesis 1:1').length,0);
offline=true;
const offlineState={...state,notes:{'Genesis 1:1':{text:'Offline note'}}};
await assert.rejects(backend.saveStudyData(offlineState),/offline/);
assert.equal(JSON.parse(storage.get('mybible.cloudBackup.u1')).pending,true,'Failed sync stores recoverable pending changes');
const newSession=new window.MyBibleBackend.SupabaseStudyBackend({});
await newSession.init();
const recovered=await newSession.loadStudyData();
assert.equal(recovered.notes['Genesis 1:1'].text,'Offline note','Offline restart restores signed-in notes');
offline=false;
const restoredSession=new window.MyBibleBackend.SupabaseStudyBackend({});
await restoredSession.init();
const reconciled=await restoredSession.loadStudyData();
assert.equal(reconciled.notes['Genesis 1:1'].text,'Offline note','Reconnect sends pending changes to cloud');
assert.equal(tables.bible_notes[0].note_text,'Offline note','Cloud receives preserved offline note');
assert.equal(JSON.parse(storage.get('mybible.cloudBackup.u1')).pending,false,'Successful reconnect clears pending flag');
console.log('PASS cloud sync: non-destructive per-verse saves, targeted delete and queued updates');
