(() => {
  'use strict';

  const CONFIG = window.MYBIBLE_CONFIG || {};
  let backend = null;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE = {
    theme: 'csb.theme', font: 'csb.fontScale', uiScale:'csb.uiScale', audioRate:'csb.originalAudioRate', notes:'csb.notes', bookmarks:'csb.bookmarks', highlights:'csb.highlights', position:'csb.position'
  };
  const themes = ['light','dark','sepia','oled'];
  const themeLabels = {light:'☀️ Light',dark:'🌙 Dark',sepia:'📜 Sepia',oled:'⚫ OLED'};
  const collectionInfo = {
    namesOfGod:{icon:'👑',title:'神的名字与称号',sub:'Names, titles & biblical descriptions',type:'names'},
    godMiracles:{icon:'✦',title:'神所行的神迹',sub:'God’s acts, signs & deliverance',type:'cards'},
    jesusMiracles:{icon:'✝',title:'耶稣所行的神迹',sub:'Gospel miracles with parallels',type:'cards'},
    parables:{icon:'💬',title:'耶稣的比喻',sub:'Parables, themes & Gospel parallels',type:'cards'},
    prophecies:{icon:'🔗',title:'预言与应验',sub:'OT prophecy → explicit NT use',type:'prophecy'},
    covenants:{icon:'🤝',title:'圣经中的约',sub:'Noah → Abraham → Sinai → David → New Covenant',type:'covenants'},
    people:{icon:'👥',title:'圣经人物',sub:'People, roles & related passages',type:'people'},
    places:{icon:'🗺',title:'圣经地图与地点',sub:'Schematic atlas + geography references',type:'places'},
    originalWords:{icon:'אΩ',title:'原文研读',sub:'Hebrew · Aramaic · Greek starter index',type:'original'},
    crossReferences:{icon:'↗',title:'串珠网络',sub:'Scripture-to-Scripture connections',type:'crossrefs'}
  };

  const state = {
    books:[], nkjv:[], cuvsLocal:[], study:null, chronology:null, englishBookCache:new Map(), englishChapter:[],
    bookIndex:0, chapter:1, mode:'parallel', selectedVerse:1, selectedRef:'Genesis 1:1', selectedTab:'study',
    chineseBookCache:new Map(), collection:'namesOfGod', testament:'ALL', timelineEra:'ALL', originalLangFilter:'ALL'
  };

  const personal = { notes:{}, bookmarks:{}, highlights:{} };

  function loadJSON(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
  async function savePersonal(){
    if (backend) {
      try { await backend.saveStudyData(personal); return; }
      catch (err) { console.warn('[MyBible] personal-data save failed:', err); }
    }
    localStorage.setItem(STORAGE.notes, JSON.stringify(personal.notes));
    localStorage.setItem(STORAGE.bookmarks, JSON.stringify(personal.bookmarks));
    localStorage.setItem(STORAGE.highlights, JSON.stringify(personal.highlights));
  }

  async function loadPersonal(){
    backend = await window.MyBibleBackend.createBackend();
    const data = await backend.loadStudyData();
    personal.notes = data.notes || {};
    personal.bookmarks = data.bookmarks || {};
    personal.highlights = data.highlights || {};
  }
  function escapeHTML(v=''){ return String(v).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add('hidden'),1800); }
  function canonicalRef(bookIndex, chapter, verse){ return `${state.books[bookIndex].english} ${chapter}:${verse}`; }
  function displayRef(bookIndex, chapter, verse){ const b=state.books[bookIndex]; return `${b.chinese} ${chapter}:${verse} · ${b.english} ${chapter}:${verse}`; }
  function currentBook(){ return state.books[state.bookIndex]; }
  function currentEnglishChapter(){ return state.englishChapter || []; }

  async function init(){
    await (window.MyBibleAuthReady || Promise.resolve());
    applyStoredAppearance();
    await loadPersonal();
    const nkjvPromise = CONFIG.scripture?.nkjv?.enabled && CONFIG.scripture?.nkjv?.dataUrl
      ? fetchJSON(CONFIG.scripture.nkjv.dataUrl)
      : Promise.resolve([]);
    const [books,nkjv,cuvsLocal,study] = await Promise.all([
      fetchJSON('data/books.json'), nkjvPromise, fetchJSON(CONFIG.scripture?.cuvs?.localDataUrl || 'data/cuvs_local.json'), fetchJSON('data/study.json')
    ]);
    state.books=books; state.nkjv=nkjv; state.cuvsLocal=cuvsLocal; state.study=study;
    try { state.chronology=await fetchJSON('data/people_chronology.json'); } catch(err) { console.warn('[MyBible] Chronology unavailable:',err); }
    let pos=loadJSON(STORAGE.position,{bookIndex:0,chapter:1,mode:'parallel'});
    const cloudPrefs=window.MyBibleAuth?.preferences||null;
    if(cloudPrefs?.last_book){
      const cloudBookIndex=state.books.findIndex(b=>b.osis===cloudPrefs.last_book);
      if(cloudBookIndex>=0){
        pos={
          bookIndex:cloudBookIndex,
          chapter:Number(cloudPrefs.last_chapter)||1,
          mode:cloudPrefs.last_mode||pos.mode||'parallel'
        };
        localStorage.setItem(STORAGE.position,JSON.stringify(pos));
      }
    }
    state.bookIndex=Math.min(Math.max(+pos.bookIndex||0,0),65);
    state.chapter=Math.min(Math.max(+pos.chapter||1,1),state.books[state.bookIndex].chapters);
    state.mode=['parallel','zh','en'].includes(pos.mode)?pos.mode:'parallel';
    if(!CONFIG.scripture?.kjv?.enabled && state.mode!=='zh') state.mode='zh';
    bindUI();
    if('speechSynthesis' in window){
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged=()=>{
        if(state.selectedTab==='original'&&$('#studyDrawer')?.classList.contains('open'))renderDrawer();
      };
    }
    configureTranslationAvailability(); renderBookNavigation(); populateSelectors(); renderStudyCoverage(); renderExploreCategories(); renderSources(); renderTimeline(); renderPersonal();
    setMode(state.mode,false); await renderReader();
    const deep=new URLSearchParams(location.search);
    if(deep.get('view')==='explore'){showPage('explore',false);const collection=deep.get('collection');if(collection==='places'){state.collection='places';const place=deep.get('place');$('#collectionFilter').value=place&&state.study.places.some(p=>p.name===place)?place:'';renderExploreCategories();}}
    if(deep.get('view')==='timeline'){
      const era=deep.get('era');
      if(era&&state.study.timeline.some(e=>e.era===era))state.timelineEra=era;
      renderTimeline();showPage('timeline',false);
      const ref=deep.get('ref');
      if(ref){const target=[...document.querySelectorAll('#timelineList .timeline-ref')].find(b=>b.dataset.ref===ref);if(target){target.closest('.timeline-item')?.scrollIntoView({block:'center'});target.closest('.timeline-item')?.classList.add('selected-timeline-event');}}
    }
  }

  async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }


  function configureTranslationAvailability(){
    const enabled = !!CONFIG.scripture?.kjv?.enabled;
    $$('.mode-btn[data-mode="en"], .mode-btn[data-mode="parallel"]').forEach(btn=>{
      btn.disabled = !enabled;
      btn.title = enabled ? 'KJV · King James Version' : 'English Bible currently unavailable';
    });
  }

  function bindUI(){
    $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
    $('.brand').addEventListener('click',()=>showPage('reader'));
    const globalBack=$('#backNavigationBtn');
    if(globalBack){document.body.appendChild(globalBack);globalBack.hidden=false;globalBack.addEventListener('click',restorePreviousView);}

    $('#mobileNavBtn').addEventListener('click',()=>$('#bookSidebar').classList.toggle('open'));
    $$('.testament-btn').forEach(b=>b.addEventListener('click',()=>{state.testament=b.dataset.testament; $$('.testament-btn').forEach(x=>x.classList.toggle('active',x===b)); renderBookNavigation();}));
    $('#bookSelect').addEventListener('change',async e=>{state.bookIndex=+e.target.value; state.chapter=1; syncChapterSelect(); await renderReader();});
    $('#chapterSelect').addEventListener('change',async e=>{state.chapter=+e.target.value; await renderReader();});
    $$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,true)));
    $('#prevChapter').addEventListener('click',()=>moveChapter(-1)); $('#nextChapter').addEventListener('click',()=>moveChapter(1));
    $('#closeDrawer').addEventListener('click',()=>{stopOriginalAudio();$('#studyDrawer').classList.remove('open');});
    $$('.drawer-tab').forEach(b=>b.addEventListener('click',()=>switchDrawerTab(b.dataset.tab)));
    $('#themeBtn').addEventListener('click',cycleTheme);
    $('#fontPlus').addEventListener('click',()=>changeFont(.08)); $('#fontMinus').addEventListener('click',()=>changeFont(-.08)); $('#uiFontPlus')?.addEventListener('click',()=>changeUIScale(.10)); $('#uiFontMinus')?.addEventListener('click',()=>changeUIScale(-.10)); $('#uiFontReset')?.addEventListener('click',resetUIScale);
    $('#searchBtn').addEventListener('click',openSearch); $('#closeSearch').addEventListener('click',closeSearch); $('#searchModal').addEventListener('click',e=>{if(e.target.id==='searchModal')closeSearch();});
    $('#globalSearch').addEventListener('input',debounce(runSearch,170));
    $('#collectionFilter').addEventListener('input',()=>renderCollection());
    $('#newPrayerBtn')?.addEventListener('click',()=>openPrayerEditor());
    $('#newStudyBtn')?.addEventListener('click',()=>openStudyEditor());
    $('#closePrayerModal')?.addEventListener('click',closePrayerEditor);
    $('#closeStudyModal')?.addEventListener('click',closeStudyEditor);
    $('#prayerForm')?.addEventListener('submit',savePrayerFromForm);
    $('#studyForm')?.addEventListener('submit',saveStudyFromForm);
    $('#closeVocabStudy')?.addEventListener('click',closeVocabStudy);
    $('#vocabStudyModal')?.addEventListener('click',e=>{if(e.target.id==='vocabStudyModal')closeVocabStudy();});
    $('#deletePrayerBtn')?.addEventListener('click',async()=>{
      const id=$('#prayerId').value;if(!id)return;
      await window.MyBibleAuth.deletePrayerEntry(id);closePrayerEditor();await renderPrayerJournal();toast('祷告记录已删除');
    });
    $('#deleteStudyBtn')?.addEventListener('click',async()=>{
      const id=$('#studyId').value;if(!id)return;
      await window.MyBibleAuth.deleteStudy(id);closeStudyEditor();await renderSavedStudies();toast('研读已删除');
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeSearch(); closeVocabStudy(); stopOriginalAudio(); $('#studyDrawer').classList.remove('open'); $('#bookSidebar').classList.remove('open');} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();} });
  }

  const viewHistory=[];
  const safePreviousDocument=(()=>{try{const url=new URL(document.referrer);return url.origin===location.origin&&url.pathname!==location.pathname?url.href:null;}catch{return null;}})();
  function updateBackButton(){
    const b=$('#backNavigationBtn');
    if(b)b.hidden=false;
  }
  function restorePreviousView(){
    // Within Places Atlas, Back first clears the chosen location and restores all map pins.
    if(document.querySelector('#explorePage.active') && state.collection==='places' && $('#collectionFilter').value.trim()){
      $('#collectionFilter').value='';
      renderCollection();
      updateBackButton();
      return;
    }
    const prior=viewHistory.pop();
    if(!prior){if(safePreviousDocument){location.href=safePreviousDocument;return;}if(history.length>1&&document.referrer){history.back();return;}if(document.querySelector('#readerPage.active')){showPage('explore',false);}else{showPage('reader',false);}updateBackButton();return;}
    state.collection=prior.collection;
    state.timelineEra=prior.timelineEra;
    $('#collectionFilter').value=prior.filter;
    renderExploreCategories();renderTimeline();
    showPage(prior.page,false);
    updateBackButton();
  }
  function showPage(page,record=true){
    const active=document.querySelector('.page.active')?.id.replace(/Page$/,'');
    if(record&&active&&active!==page){
      viewHistory.push({page:active,collection:state.collection,timelineEra:state.timelineEra,filter:$('#collectionFilter').value});
      if(viewHistory.length>35)viewHistory.shift();
    }
    updateBackButton();
    stopOriginalAudio();
    $$('.page').forEach(p=>p.classList.remove('active')); $(`#${page}Page`).classList.add('active');
    $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    $('#mainContent').scrollTop=0; $('#bookSidebar').classList.remove('open');
    if(page==='mybible')renderPersonal();
    updateBackButton();
  }

  function applyUIScale(){
    const raw=Number(localStorage.getItem(STORAGE.uiScale)||1);
    const scale=Math.min(1.5,Math.max(.85,raw||1));
    document.documentElement.style.setProperty('--ui-scale',scale.toFixed(2));
    const label=$('#uiFontReset'); if(label) label.textContent=Math.round(scale*100)+'%';
  }
  function changeUIScale(delta){
    const current=Number(localStorage.getItem(STORAGE.uiScale)||1);
    const nextScale=Math.min(1.5,Math.max(.85,current+delta));
    localStorage.setItem(STORAGE.uiScale,nextScale.toFixed(2));
    applyUIScale();
    window.MyBibleAuth?.savePreferences?.({ui_scale:nextScale});
  }
  function resetUIScale(){
    localStorage.setItem(STORAGE.uiScale,'1');
    applyUIScale();
    window.MyBibleAuth?.savePreferences?.({ui_scale:1});
  }
  function applyStoredAppearance(){
    const theme=localStorage.getItem(STORAGE.theme)||'light'; document.documentElement.dataset.theme=themes.includes(theme)?theme:'light';
    const font=Number(localStorage.getItem(STORAGE.font)||1); document.documentElement.style.setProperty('--font-scale',String(Math.min(1.5,Math.max(.82,font))));
    applyUIScale();
  }
  function cycleTheme(){ const cur=document.documentElement.dataset.theme||'light'; const next=themes[(themes.indexOf(cur)+1)%themes.length]; document.documentElement.dataset.theme=next; localStorage.setItem(STORAGE.theme,next); window.MyBibleAuth?.savePreferences?.({theme:next}); toast(themeLabels[next]); }
  function changeFont(delta){ const root=document.documentElement; const v=Number(getComputedStyle(root).getPropertyValue('--font-scale'))||1; const nv=Math.min(1.5,Math.max(.82,v+delta)); root.style.setProperty('--font-scale',nv.toFixed(2)); localStorage.setItem(STORAGE.font,nv.toFixed(2)); window.MyBibleAuth?.savePreferences?.({font_scale:nv}); }

  function renderBookNavigation(){
    const list=$('#bookList'); list.innerHTML=''; let last='';
    state.books.forEach((b,i)=>{
      if(state.testament!=='ALL'&&b.testament!==state.testament)return;
      if(b.testament!==last){const l=document.createElement('div');l.className='book-section-label';l.textContent=b.testament==='OT'?'旧约 · OLD TESTAMENT':'新约 · NEW TESTAMENT';list.appendChild(l);last=b.testament;}
      const btn=document.createElement('button');btn.className='book-item'+(i===state.bookIndex?' active':'');btn.innerHTML=`<span><span class="zh">${escapeHTML(b.chinese)}</span><span class="en">${escapeHTML(b.english)}</span></span><span class="book-num">${b.chapters}</span>`;
      btn.addEventListener('click',async()=>{state.bookIndex=i;state.chapter=1;populateSelectors();renderBookNavigation();showPage('reader');await renderReader();$('#bookSidebar').classList.remove('open');}); list.appendChild(btn);
    });
  }

  function populateSelectors(){
    const bs=$('#bookSelect'); bs.innerHTML=state.books.map((b,i)=>`<option value="${i}" ${i===state.bookIndex?'selected':''}>${b.chinese} · ${b.english}</option>`).join(''); syncChapterSelect();
  }
  function syncChapterSelect(){ const b=currentBook(); $('#chapterSelect').innerHTML=Array.from({length:b.chapters},(_,i)=>`<option value="${i+1}" ${i+1===state.chapter?'selected':''}>${i+1}</option>`).join(''); $('#bookSelect').value=String(state.bookIndex); }
  function savePosition(){
    localStorage.setItem(STORAGE.position,JSON.stringify({bookIndex:state.bookIndex,chapter:state.chapter,mode:state.mode}));
    const b=currentBook();
    if(b) window.MyBibleAuth?.saveReadingPosition?.({book_osis:b.osis,chapter:state.chapter,last_verse:state.selectedVerse||1,mode:state.mode});
  }
  function setMode(mode,render=true){ if((mode==='en'||mode==='parallel')&&!CONFIG.scripture?.kjv?.enabled){toast('KJV 经文来源尚未启用');return;} state.mode=mode; $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode)); savePosition(); if(render)renderReader(); }
  async function moveChapter(dir){
    let bi=state.bookIndex,ch=state.chapter+dir;
    if(ch<1){if(bi===0)return;bi--;ch=state.books[bi].chapters;}
    if(ch>state.books[bi].chapters){if(bi===65)return;bi++;ch=1;}
    state.bookIndex=bi;state.chapter=ch;populateSelectors();renderBookNavigation();await renderReader(); $('#mainContent').scrollTop=0;
  }

  async function getChineseChapter(){
    const b=currentBook(), cacheKey=`${b.osis}:${state.chapter}`;
    const saved=loadJSON(`csb.cuvs.${cacheKey}`,null); if(saved?.verses?.length)return {verses:saved.verses,source:'structured-cache'};
    try{
      let bookData=state.chineseBookCache.get(b.osis);
      if(!bookData){
        const template=CONFIG.scripture?.cuvs?.remoteBookTemplate || 'https://raw.githubusercontent.com/midvash/bible-data/main/versions/zh/cuvs/books/{osis}.json';
        const url=template.replace('{osis}', b.osis);
        const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),3500);
        const r=await fetch(url,{signal:controller.signal,cache:'force-cache'}); clearTimeout(timer); if(!r.ok)throw new Error('network'); bookData=await r.json(); state.chineseBookCache.set(b.osis,bookData);
      }
      const ch=bookData.chapters.find(x=>+x.chapter===state.chapter); if(!ch)throw new Error('missing chapter');
      const verses=ch.verses.map(v=>({verse:+(v.number??v.verse),text:v.text}));
      try{localStorage.setItem(`csb.cuvs.${cacheKey}`,JSON.stringify({verses}));}catch{}
      return {verses,source:'structured-online'};
    }catch(err){
      const local=state.cuvsLocal[state.bookIndex]?.chapters?.[state.chapter-1];
      if(local?.verified && local.verses?.length)return {verses:local.verses,source:'uploaded-pdf-fallback'};
      return {verses:[],source:'unavailable'};
    }
  }

  async function getEnglishChapter(){
    const b=currentBook(), key=b.osis+':'+state.chapter;
    const cached=loadJSON('mybible.kjv.'+key,null);
    if(cached?.verses?.length)return {verses:cached.verses,source:'structured-cache'};
    try{
      let bookData=state.englishBookCache.get(b.osis);
      if(!bookData){
        const template=CONFIG.scripture.kjv.remoteBookTemplate;
        const response=await fetch(template.replace('{osis}',encodeURIComponent(b.osis)),{cache:'force-cache'});
        if(!response.ok)throw new Error('KJV HTTP '+response.status);
        bookData=await response.json();
        if(bookData.version!=='kjv'||!Array.isArray(bookData.chapters))throw new Error('Unexpected KJV schema');
        state.englishBookCache.set(b.osis,bookData);
      }
      const chapter=bookData.chapters.find(c=>Number(c.chapter)===state.chapter);
      if(!chapter||!Array.isArray(chapter.verses))throw new Error('KJV chapter missing');
      const verses=chapter.verses.map(v=>({verse:Number(v.number),text:String(v.text||'')}));
      if(!verses.length||verses.some((v,i)=>v.verse!==i+1||!v.text))throw new Error('Invalid KJV verse ordering');
      try{localStorage.setItem('mybible.kjv.'+key,JSON.stringify({verses}));}catch{}
      return {verses,source:'structured-online'};
    }catch(err){console.warn('[MyBible] KJV temporarily unavailable',err);return {verses:[],source:'unavailable'};}
  }

  async function renderReader(){
    savePosition(); renderBookNavigation(); syncChapterSelect();
    const b=currentBook(); $('#testamentKicker').textContent=b.testament==='OT'?'旧约 · OLD TESTAMENT':'新约 · NEW TESTAMENT'; $('#passageTitle').textContent=`${b.chinese} · ${b.english} ${state.chapter}`; $('#chapterStatus').textContent='正在载入经文与研读层…';
    const list=$('#verseList'); list.className=`verse-list ${state.mode==='zh'?'zh-only':state.mode==='en'?'en-only':''}`; list.innerHTML='<div class="loading"><div class="spinner"></div>正在载入经文…</div>';
    const currentBookIndex=state.bookIndex,currentChapter=state.chapter; const [enResult,zhResult]=await Promise.all([state.mode==='zh'?Promise.resolve({verses:[],source:'not-needed'}):getEnglishChapter(),state.mode==='en'?Promise.resolve({verses:[],source:'not-needed'}):getChineseChapter()]); if(currentBookIndex!==state.bookIndex||currentChapter!==state.chapter)return; state.englishChapter=enResult.verses; const en=enResult.verses,zh=zhResult.verses;
    const notice=$('#scriptureNotice'); notice.classList.add('hidden');
    if(state.mode!=='en'){
      if(zhResult.source==='uploaded-pdf-fallback') {notice.innerHTML='<strong>离线回退：</strong> 当前中文章来自所附 CUVS PDF 的结构化抽取，并通过本章节数检查；联网时会优先使用结构化 CUVS 镜像。';notice.classList.remove('hidden');}
      if(zhResult.source==='unavailable') {notice.innerHTML='<strong>中文经文暂时无法载入：</strong> 本章的 PDF 抽取未通过完整性检查，并且结构化 CUVS 网络来源目前无法连接。为了不显示错误经文，本系统宁可留空。';notice.classList.remove('hidden');}
    }
    const max=Math.max(en.length,zh.length); let html='';
    for(let i=1;i<=max;i++){
      const zv=zh.find(v=>+v.verse===i), ev=en.find(v=>+v.verse===i); const ref=canonicalRef(state.bookIndex,state.chapter,i); const isHi=!!personal.highlights[ref];
      html+=`<div class="verse-row ${isHi?'highlighted':''}" data-verse="${i}">
        <div class="verse-cell zh-cell" data-side="zh"><span class="verse-num">${i}</span>${zv?escapeHTML(zv.text):'<span class="muted">—</span>'}<div class="verse-actions"><button class="mini-action" data-action="bookmark" title="Bookmark">🔖</button><button class="mini-action" data-action="highlight" title="Highlight">🖍</button><button class="mini-action" data-action="study" title="Study">✦</button></div></div>
        <div class="verse-cell en-cell" data-side="en"><span class="verse-num">${i}</span>${ev?escapeHTML(ev.text):'<span class="muted">—</span>'}</div>
      </div>`;
    }
    if(!max)html='<div class="loading">No verse data available for this chapter.</div>';
    list.innerHTML=html;
    list.onclick=handleVerseClick;
    const nkjvLabel=state.mode==='parallel'?' + KJV':'';
    const sourceText=state.mode==='en'?'KJV · midvash/bible-data public-domain edition':zhResult.source==='structured-online'?`CUVS · structured public-domain transport${nkjvLabel}`:zhResult.source==='structured-cache'?`CUVS · cached structured text${nkjvLabel}`:`CUVS · uploaded PDF fallback${nkjvLabel}`;
    $('#chapterStatus').textContent=`${sourceText} · 点击任一节打开研读面板`; if(state.mode!=='zh'&&enResult.source==='unavailable'){notice.innerHTML='<strong>KJV 经文未能载入：</strong>请检查网络后重试，不会把缺失的英文经文当作 NKJV。';notice.classList.remove('hidden');}
  }

  function handleVerseClick(e){
    const row=e.target.closest('.verse-row'); if(!row)return; const verse=+row.dataset.verse; const ref=canonicalRef(state.bookIndex,state.chapter,verse);
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='bookmark'){ e.stopPropagation(); toggleBookmark(ref); return; }
    if(action==='highlight'){ e.stopPropagation(); toggleHighlight(ref,row); return; }
    state.selectedVerse=verse;state.selectedRef=ref; $$('.verse-row').forEach(r=>r.classList.toggle('selected',r===row)); openDrawer();
  }
  function toggleBookmark(ref){ if(personal.bookmarks[ref])delete personal.bookmarks[ref];else personal.bookmarks[ref]={created:Date.now()};savePersonal();renderPersonal();toast(personal.bookmarks[ref]?'已加入书签':'已移除书签'); }
  function toggleHighlight(ref,row){ if(personal.highlights[ref])delete personal.highlights[ref];else personal.highlights[ref]={color:'gold',created:Date.now()};savePersonal();renderPersonal();row?.classList.toggle('highlighted',!!personal.highlights[ref]);toast(personal.highlights[ref]?'已标记经文':'已取消标记'); }

  function openDrawer(){ $('#studyRef').textContent=displayRef(state.bookIndex,state.chapter,state.selectedVerse); $('#studyDrawer').classList.add('open'); renderDrawer(); }
  function normalizeStrongId(v=''){
    const s=String(v||'').trim().toUpperCase();
    const m=s.match(/^([GH])(\d+)$/);
    if(!m)return s;
    return m[1]+String(Number(m[2])).padStart(4,'0');
  }
  function lookupGreekLexicon(strong){
    const key=normalizeStrongId(strong);
    return state.study?.greekLexicon?.[key]||null;
  }

  function stepBibleUrl(book=currentBook(),chapter=state.chapter,verse=state.selectedVerse){
    if(!book)return 'https://www.stepbible.org/';
    const ref=book.osis+'.'+Number(chapter||1)+'.'+Number(verse||1);
    return 'https://www.stepbible.org/?q='+encodeURIComponent('version=ESV@reference='+ref);
  }

  function getSelectedTexts(){
    const en=currentEnglishChapter().find(v=>+v.verse===state.selectedVerse)?.text||'';
    const row=$(`.verse-row[data-verse="${state.selectedVerse}"]`); let zh=row?.querySelector('.zh-cell')?.textContent||''; zh=zh.replace(/^\d+/,'').replace(/🔖|🖍|✦/g,'').trim();
    return {zh,en};
  }

  function normalizeRefText(v=''){return String(v||'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();}
  function selectedBookChapterVerse(){
    return {book:currentBook()?.english||'',chapter:Number(state.chapter)||1,verse:Number(state.selectedVerse)||1};
  }
  function refTouchesSelection(refText){
    const target=selectedBookChapterVerse();
    const s=normalizeRefText(refText);
    if(!s||!target.book)return false;
    const escaped=target.book.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('^'+escaped+'\\s+(\\d+)(?::(\\d+))?(?:-(?:(\\d+):)?(\\d+))?','i');
    const m=s.match(re);
    if(!m)return false;
    const startCh=Number(m[1]), startV=m[2]?Number(m[2]):1;
    const endCh=m[3]?Number(m[3]):startCh;
    const endV=m[4]?Number(m[4]):(m[2]?startV:999);
    if(target.chapter<startCh||target.chapter>endCh)return false;
    if(startCh===endCh)return target.verse>=startV&&target.verse<=endV;
    if(target.chapter===startCh)return target.verse>=startV;
    if(target.chapter===endCh)return target.verse<=endV;
    return true;
  }
  function collectCrossReferences(){
    const index=state.study?.crossReferences||{};
    const found=new Map();
    const add=(ref,direction)=>{
      const clean=normalizeRefText(ref);
      if(!clean)return;
      const prev=found.get(clean);
      if(!prev || (prev.direction==='reverse'&&direction==='direct')) found.set(clean,{ref:clean,direction});
    };
    Object.entries(index).forEach(([source,targets])=>{
      if(refTouchesSelection(source)){
        (targets||[]).forEach(t=>add(t,'direct'));
      }
      (targets||[]).forEach(t=>{
        if(refTouchesSelection(t)) add(source,'reverse');
      });
    });
    return [...found.values()];
  }

  function itemTouchesSelection(item){
    const refs=[];
    if(item.ref)refs.push(...String(item.ref).split(';'));
    if(item.refs)refs.push(...item.refs);
    if(item.prophecy)refs.push(item.prophecy);
    if(item.fulfillment)refs.push(...String(item.fulfillment).split(';'));
    if(item.first)refs.push(item.first);
    return refs.some(refTouchesSelection);
  }
  function collectVerseConnections(){
    const s=state.study||{};
    const groups=[];
    const add=(label,icon,items,titleFn,subFn,refsFn)=>{
      const matches=(items||[]).filter(itemTouchesSelection).slice(0,8);
      if(matches.length)groups.push({label,icon,matches,titleFn,subFn,refsFn});
    };
    add('神的名字','👑',s.namesOfGod,x=>x.zh+' · '+x.name,x=>x.meaning,x=>x.refs||[x.first]);
    add('神迹','✦',s.godMiracles,x=>x.titleZh+' · '+x.titleEn,x=>x.category,x=>String(x.ref||'').split(';'));
    add('耶稣神迹','✝',s.jesusMiracles,x=>x.titleZh+' · '+x.titleEn,x=>(x.category||'')+(x.place?' · '+x.place:''),x=>x.refs||[]);
    add('比喻','💬',s.parables,x=>x.titleZh+' · '+x.titleEn,x=>x.theme,x=>x.refs||[]);
    add('预言与应验','🔗',s.prophecies,x=>x.topic,x=>x.evidence,x=>[x.prophecy,...String(x.fulfillment||'').split(';')]);
    add('圣约','🤝',s.covenants,x=>x.nameZh+' · '+x.nameEn,x=>x.parties,x=>String(x.ref||'').split(';'));
    add('人物','👥',s.people,x=>x.zh+' · '+x.name,x=>x.role,x=>x.refs||[]);
    add('地点','🗺',s.places,x=>x.zh+' · '+x.name,x=>x.note,x=>x.refs||[]);
    add('时间线','⏳',s.timeline,x=>x.titleZh+' · '+x.titleEn,x=>x.date,x=>String(x.ref||'').split(';'));
    return groups;
  }
  function originalAudioRate(){
    const n=Number(localStorage.getItem(STORAGE.audioRate)||1);
    return [0.75,1,1.25].includes(n)?n:1;
  }
  function setOriginalAudioRate(rate){
    const n=Number(rate);
    if(![0.75,1,1.25].includes(n))return;
    localStorage.setItem(STORAGE.audioRate,String(n));
    $$('.audio-rate-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===n));
  }
  function audioLanguage(word){
    const lang=String(word?.language||'').toLowerCase();
    if(lang.includes('greek'))return 'el-GR';
    if(lang.includes('hebrew'))return 'he-IL';
    if(lang.includes('aramaic'))return 'he-IL';
    return '';
  }
  function voiceForWord(word){
    if(!('speechSynthesis' in window))return null;
    const lang=audioLanguage(word);
    const prefix=lang.split('-')[0].toLowerCase();
    return window.speechSynthesis.getVoices().find(v=>String(v.lang||'').toLowerCase().startsWith(prefix))||null;
  }
  function audioSystemLabel(word){
    if(word?.audioUrl)return word.audioSystem||'Curated audio';
    const lang=String(word?.language||'').toLowerCase();
    const voice=voiceForWord(word);
    if(voice){
      if(lang.includes('greek'))return 'Device voice · Modern Greek ('+voice.name+')';
      if(lang.includes('hebrew'))return 'Device voice · Modern Hebrew ('+voice.name+')';
      if(lang.includes('aramaic'))return 'Device Hebrew voice approximation ('+voice.name+')';
      return 'Device voice · '+voice.name;
    }
    if(word?.transliteration)return 'Transliteration fallback · no matching '+(lang.includes('greek')?'Greek':lang.includes('hebrew')?'Hebrew':'original-language')+' voice on this device';
    return 'Audio unavailable on this device';
  }
  function voiceAvailabilitySummary(words=[]){
    const langs=[...new Set(words.map(w=>String(w.language||'')).filter(Boolean))];
    return langs.map(lang=>{
      const word=words.find(w=>String(w.language||'')===lang);
      if(word?.audioUrl)return {lang,status:'curated',label:lang+' audio ready'};
      const voice=voiceForWord(word);
      return voice?{lang,status:'device',label:lang+' device voice ready'}:{lang,status:'fallback',label:lang+' transliteration fallback'};
    });
  }
  function markAudioButton(btn,playing){
    $$('.word-audio-btn').forEach(b=>{b.classList.remove('playing');b.textContent='🔊';});
    if(btn&&playing){btn.classList.add('playing');btn.textContent='◼';}
  }
  function stopOriginalAudio(){
    window.__myBibleAudioSequence=(window.__myBibleAudioSequence||0)+1;
    if(window.__myBibleWordAudio){
      try{window.__myBibleWordAudio.pause();window.__myBibleWordAudio.currentTime=0;}catch{}
      window.__myBibleWordAudio=null;
    }
    if('speechSynthesis' in window)window.speechSynthesis.cancel();
    if(window.__myBibleAudioResolve){const done=window.__myBibleAudioResolve;window.__myBibleAudioResolve=null;done();}
    markAudioButton(null,false);
    const seq=$('#playIndexedWords'); if(seq){seq.classList.remove('playing');seq.textContent='▶ 播放已收录字词';}
  }

  function speakWordOnce(word,btn=null){
    return new Promise(resolve=>{
      if(!word){resolve();return;}
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;if(window.__myBibleAudioResolve===finish)window.__myBibleAudioResolve=null;resolve();};
      window.__myBibleAudioResolve=finish;
      const rate=originalAudioRate();
      if(word.audioUrl){
        try{
          const audio=new Audio(word.audioUrl);
          window.__myBibleWordAudio=audio;
          audio.playbackRate=rate;
          if(btn)markAudioButton(btn,true);
          audio.onended=()=>{if(btn)markAudioButton(btn,false);window.__myBibleWordAudio=null;finish();};
          audio.onerror=()=>{if(btn)markAudioButton(btn,false);window.__myBibleWordAudio=null;finish();};
          audio.play().catch(()=>finish());
          return;
        }catch{finish();return;}
      }
      if(!('speechSynthesis' in window)){finish();return;}
      const lang=audioLanguage(word);
      const voice=voiceForWord(word);
      const spoken=voice?String(word.original||word.transliteration||''):String(word.transliteration||word.original||'');
      const utter=new SpeechSynthesisUtterance(spoken);
      if(voice){
        utter.voice=voice;
        if(lang)utter.lang=lang;
      }
      utter.rate=rate;
      if(btn)markAudioButton(btn,true);
      utter.onend=()=>{if(btn)markAudioButton(btn,false);finish();};
      utter.onerror=()=>{if(btn)markAudioButton(btn,false);finish();};
      window.speechSynthesis.speak(utter);
    });
  }

  async function playIndexedOriginalWords(words=[]){
    if(!words.length)return;
    stopOriginalAudio();
    const token=window.__myBibleAudioSequence;
    const btn=$('#playIndexedWords');
    if(btn){btn.classList.add('playing');btn.textContent='◼ 播放中 · Playing';}
    for(const word of words){
      if(token!==window.__myBibleAudioSequence)break;
      await speakWordOnce(word,null);
      if(token!==window.__myBibleAudioSequence)break;
      await new Promise(r=>setTimeout(r,120));
    }
    if(token===window.__myBibleAudioSequence && btn){btn.classList.remove('playing');btn.textContent='▶ 播放已收录字词';}
  }

  async function playOriginalWord(word,btn){
    if(!word)return;
    stopOriginalAudio();
    if(!word.audioUrl && !('speechSynthesis' in window)){
      toast('此装置不支持语音播放');
      return;
    }
    await speakWordOnce(word,btn);
  }

  function renderDrawer(){
    const body=$('#drawerBody'), ref=state.selectedRef, texts=getSelectedTexts(), crossRefs=collectCrossReferences(), refs=crossRefs.map(x=>x.ref), words=state.study.originalWords[ref]||[];
    if(state.selectedTab==='study'){
      body.innerHTML=`<div class="study-verse">${texts.zh?`<div>${escapeHTML(texts.zh)}</div>`:''}${texts.en?`<div class="muted" style="margin-top:8px;font-size:14px">${escapeHTML(texts.en)}</div>`:''}</div>
      <div class="study-section"><h3>快捷研读</h3><div class="tool-row"><button class="tool-btn ${personal.bookmarks[ref]?'active':''}" id="drawerBookmark">🔖 书签</button><button class="tool-btn ${personal.highlights[ref]?'active':''}" id="drawerHighlight">🖍 标记</button><button class="tool-btn" id="drawerCross">↗ ${refs.length||'TSK'} 串珠</button><button class="tool-btn" id="drawerConnections">◎ 关联</button><button class="tool-btn" id="drawerOriginal">אΩ 原文</button></div></div>
      <div class="study-section"><h3>知识图谱入口</h3><p class="muted">本节将逐步连接：人物、地点、事件、主题、时间线、预言、圣约、神迹与原文。V0.1 已建立统一接口，资料会按来源逐项扩充。</p></div>
      <div class="source-foot">SCRIPTURE 与 STUDY DATA 严格分层。研读资料不会修改经文。</div>`;
      $('#drawerBookmark')?.addEventListener('click',()=>{toggleBookmark(ref);renderDrawer();}); $('#drawerHighlight')?.addEventListener('click',()=>{toggleHighlight(ref,$(`.verse-row[data-verse="${state.selectedVerse}"]`));renderDrawer();}); $('#drawerCross')?.addEventListener('click',()=>switchDrawerTab('crossrefs')); $('#drawerConnections')?.addEventListener('click',()=>switchDrawerTab('connections')); $('#drawerOriginal')?.addEventListener('click',()=>switchDrawerTab('original'));
    } else if(state.selectedTab==='original'){
      const stepUrl=stepBibleUrl(), rate=originalAudioRate();
      body.innerHTML=words.length?`<div class="original-audio-toolbar"><div><strong>🔊 原文字词发音 · Pronunciation</strong><div class="muted">优先使用策展录音；没有录音时检查装置语言语音。若装置没有对应 Greek/Hebrew voice，则只朗读现有 transliteration，并明确标示为 fallback。</div><div class="audio-voice-status">${voiceAvailabilitySummary(words).map(v=>`<span class="audio-status-chip ${v.status}">${escapeHTML(v.label)}</span>`).join('')}</div></div><div class="original-audio-actions"><div class="audio-rate-controls"><button class="audio-rate-btn ${rate===0.75?'active':''}" data-rate="0.75">0.75×</button><button class="audio-rate-btn ${rate===1?'active':''}" data-rate="1">1×</button><button class="audio-rate-btn ${rate===1.25?'active':''}" data-rate="1.25">1.25×</button></div><div class="audio-sequence-controls"><button id="playIndexedWords" class="quiet-btn" type="button">▶ 播放已收录字词</button><button id="stopOriginalAudio" class="quiet-btn" type="button">■ 停止</button></div></div></div>`+words.map((w,i)=>{
        const lex=w.strong?lookupGreekLexicon(w.strong):null;
        return `<div class="word-card"><div class="word-title-row"><div class="word-original">${escapeHTML(w.original)}</div><button class="word-audio-btn" type="button" data-audio-index="${i}" title="播放发音 · Play pronunciation">🔊</button></div><div class="word-meta"><span>${escapeHTML(w.language)}</span>${w.strong?`<span>${escapeHTML(w.strong)}</span>`:''}<span>${escapeHTML(w.transliteration)}</span></div><div class="word-gloss">${escapeHTML(w.glossZh)} · ${escapeHTML(w.glossEn)}</div><div class="audio-source-note">${escapeHTML(audioSystemLabel(w))}</div>${lex?`<div class="lexicon-brief"><div class="card-meta">STEPBible TBESG · ${escapeHTML(lex.pos||'')}</div><strong>${escapeHTML(lex.lemma)} · ${escapeHTML(lex.transliteration)}</strong><p>${escapeHTML(lex.briefZh)} · ${escapeHTML(lex.briefEn)}</p></div>`:''}<div class="source-foot">Source layer: ${escapeHTML(lex?'STEPBible TBESG · CC BY 4.0':w.source+' / Tyndale House reference framework')}</div></div>`;
      }).join('')+`<div class="study-section external-study-card"><div><strong>STEP Bible · Full Original-Language Tools</strong><p class="muted">打开当前经节的 Hebrew / Aramaic / Greek、词形与词汇研读。</p></div><a class="primary-btn external-study-link" target="_blank" rel="noopener" href="${escapeHTML(stepUrl)}">打开当前经节 ↗</a></div>`:`<div class="empty-state">本节的本机原文卡尚未导入。</div><div class="study-section external-study-card"><div><strong>STEP Bible · Full Original-Language Tools</strong><p class="muted">MyBible 会直接打开当前经节，作为完整原文资料导入前的安全研读入口。</p></div><a class="primary-btn external-study-link" target="_blank" rel="noopener" href="${escapeHTML(stepUrl)}">打开当前经节 ↗</a></div><div class="source-foot">外部原文研读：STEP Bible / Tyndale House。MyBible 不会把外部注释混入经文本身。</div>`;
      $$('.word-audio-btn',body).forEach(btn=>btn.addEventListener('click',()=>playOriginalWord(words[Number(btn.dataset.audioIndex)],btn)));
      $$('.audio-rate-btn',body).forEach(btn=>btn.addEventListener('click',()=>setOriginalAudioRate(Number(btn.dataset.rate))));
    } else if(state.selectedTab==='crossrefs'){
      const direct=crossRefs.filter(x=>x.direction==='direct');
      const reverse=crossRefs.filter(x=>x.direction==='reverse');
      body.innerHTML=crossRefs.length?
        (direct.length?`<div class="study-section"><h3>直接串珠 · Direct</h3><div class="ref-chips">${direct.map(x=>`<button class="ref-chip drawer-ref" data-ref="${escapeHTML(x.ref)}">${escapeHTML(x.ref)}</button>`).join('')}</div></div>`:'')+
        (reverse.length?`<div class="study-section"><h3>反向关联 · Linked From</h3><div class="ref-chips">${reverse.map(x=>`<button class="ref-chip drawer-ref reverse-ref" data-ref="${escapeHTML(x.ref)}">${escapeHTML(x.ref)}</button>`).join('')}</div></div>`:'')+
        '<div class="source-foot">TSK starter network · 现在同时显示直接串珠与反向经文连接。完整 TSK 导入将在后续数据阶段继续扩充。</div>':
        '<div class="empty-state">本节尚未写入本机串珠索引。完整 TSK 数据接口已列入下一数据阶段。<br><br><a target="_blank" rel="noopener" href="https://www.thetreasuryofscriptureknowledge.com/">打开 Treasury of Scripture Knowledge ↗</a></div>';
      $$('.drawer-ref',body).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));

    } else if(state.selectedTab==='connections'){
      const groups=collectVerseConnections();
      body.innerHTML=groups.length?groups.map(g=>'<div class="connection-group"><div class="connection-group-title">'+g.icon+' '+escapeHTML(g.label)+'</div>'+g.matches.map(x=>'<article class="connection-card"><h4>'+escapeHTML(g.titleFn(x))+'</h4>'+(g.subFn(x)?'<p>'+escapeHTML(g.subFn(x))+'</p>':'')+'<div class="ref-chips">'+(g.refsFn(x)||[]).filter(Boolean).map(refChip).join('')+'</div></article>').join('')+'</div>').join('')+'<div class="source-foot">关联资料来自 MyBible 已审核的 study data 层；不改写经文本身。</div>':'<div class="empty-state">这一节目前没有已建立的知识图谱关联。后续数据阶段会继续扩充人物、地点、事件、神迹、预言、圣约等连接。</div>';
      $$('.ref-chip',body).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
    } else if(state.selectedTab==='notes'){
      body.innerHTML=`<div class="study-section"><h3>我的笔记 · ${escapeHTML(ref)}</h3><textarea id="noteArea" class="note-area" placeholder="写下观察、问题、祷告或研读笔记…">${escapeHTML(personal.notes[ref]?.text||'')}</textarea></div><button id="saveNote" class="primary-btn">保存笔记</button><div class="source-foot">USER layer · 当前使用 ${backend?.name==='supabase'?'Supabase 云端同步':'浏览器本机储存'}。</div>`;
      $('#saveNote').addEventListener('click',()=>{const text=$('#noteArea').value.trim();if(text)personal.notes[ref]={text,updated:Date.now()};else delete personal.notes[ref];savePersonal();renderPersonal();toast('笔记已保存');});
    }
  }
  function switchDrawerTab(tab){if(tab!=='original')stopOriginalAudio();state.selectedTab=tab;$$('.drawer-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));renderDrawer();}

  function renderStudyCoverage(){
    const el=$('#studyCoverage'); if(!el||!state.study)return;
    const metrics=[
      {key:'crossReferences',icon:'↗',label:'串珠',sub:'Cross References',count:Object.keys(state.study.crossReferences||{}).length},
      {key:'originalWords',icon:'אΩ',label:'原文',sub:'Original Language',count:Object.keys(state.study.greekLexicon||{}).length+Object.values(state.study.originalWords||{}).flat().filter(w=>String(w.language||'').toLowerCase().includes('hebrew')).length},
      {key:'people',icon:'👥',label:'人物',sub:'People',count:(state.study.people||[]).length},
      {key:'places',icon:'🗺',label:'地点',sub:'Places',count:(state.study.places||[]).length},
      {key:'timeline',icon:'⏳',label:'事件',sub:'Timeline',count:(state.study.timeline||[]).length},
      {key:'jesusMiracles',icon:'✝',label:'耶稣神迹',sub:'Jesus Miracles',count:(state.study.jesusMiracles||[]).length}
    ];
    el.innerHTML='<div class="coverage-head"><div><div class="kicker">BIBLE INTELLIGENCE COVERAGE</div><h2>研读资料覆盖</h2><p>当前为已审核的基础资料层；数字代表已建立的索引入口，不代表整本圣经已穷尽完成。</p></div></div>'+
      '<div class="coverage-grid">'+metrics.map(m=>'<button class="coverage-card" data-coverage="'+m.key+'"><span class="coverage-icon">'+m.icon+'</span><strong>'+m.count+'</strong><span>'+m.label+'</span><small>'+m.sub+'</small></button>').join('')+'</div>';
    $$('.coverage-card',el).forEach(btn=>btn.addEventListener('click',()=>{
      const key=btn.dataset.coverage;
      if(collectionInfo[key]){
        state.collection=key;
        $$('.category-card').forEach(x=>x.classList.toggle('active',x.dataset.collection===key));
        $('#collectionFilter').value='';
        renderCollection();
        $('#collectionTitle')?.scrollIntoView({behavior:'smooth',block:'center'});
      }else if(key==='timeline'){
        showPage('timeline');
      }
    }));
  }

  function renderExploreCategories(){
    $('#exploreCategories').innerHTML=Object.entries(collectionInfo).map(([key,c])=>`<button class="category-card ${key===state.collection?'active':''}" data-collection="${key}"><div class="category-icon">${c.icon}</div><div class="category-title">${c.title}</div><div class="category-sub">${c.sub}</div></button>`).join('');
    $$('.category-card').forEach(b=>b.addEventListener('click',()=>{if(state.collection!==b.dataset.collection){viewHistory.push({page:'explore',collection:state.collection,timelineEra:state.timelineEra,filter:$('#collectionFilter').value});updateBackButton();}state.collection=b.dataset.collection;$$('.category-card').forEach(x=>x.classList.toggle('active',x===b));$('#collectionFilter').value='';renderCollection();})); renderCollection();
  }

  function originalStudyItems(){
    const filter=$('#collectionFilter')?.value.trim().toLowerCase()||'';
    const linked=Object.entries(state.study?.originalWords||{}).flatMap(([ref,arr])=>arr.map(x=>({...x,ref,itemType:'verse-word'})));
    const linkedStrong=new Set(linked.map(x=>normalizeStrongId(x.strong)).filter(Boolean));
    const lexicon=Object.values(state.study?.greekLexicon||{}).filter(x=>!linkedStrong.has(normalizeStrongId(x.strong))).map(x=>({...x,itemType:'lexicon',language:'Greek'}));
    let items=[...linked,...lexicon];
    if(filter)items=items.filter(x=>JSON.stringify(x).toLowerCase().includes(filter));
    if(state.originalLangFilter!=='ALL')items=items.filter(x=>(x.itemType==='lexicon'?'Greek':String(x.language||''))===state.originalLangFilter);
    return items;
  }

  function vocabWord(item){
    return item?.itemType==='lexicon'
      ?{original:item.lemma,transliteration:item.transliteration,strong:item.strong,language:'Greek',zh:item.briefZh,en:item.briefEn,source:'STEPBible TBESG'}
      :{original:item.original,transliteration:item.transliteration,strong:item.strong,language:item.language,zh:item.glossZh,en:item.glossEn,ref:item.ref,source:item.source||'STEP'};
  }

  function renderVocabStudyCard(){
    const body=$('#vocabStudyBody'); if(!body)return;
    const items=state.vocabStudyItems||[];
    if(!items.length){body.innerHTML='<div class="empty-state">当前筛选没有可学习的原文字词。</div>';return;}
    state.vocabStudyIndex=Math.min(Math.max(Number(state.vocabStudyIndex)||0,0),items.length-1);
    const item=items[state.vocabStudyIndex], w=vocabWord(item);
    body.innerHTML=`
      <div class="vocab-progress">${state.vocabStudyIndex+1} / ${items.length}</div>
      <section class="vocab-flashcard">
        <div class="card-meta">${escapeHTML(w.language||'Original Language')}${w.strong?' · '+escapeHTML(w.strong):''}</div>
        <div class="vocab-original">${escapeHTML(w.original||'')}</div>
        <div class="vocab-transliteration">${escapeHTML(w.transliteration||'')}</div>
        <button id="vocabAudioBtn" class="word-audio-btn vocab-audio-btn" type="button">🔊</button>
        <div id="vocabAnswer" class="vocab-answer hidden">
          <strong>${escapeHTML(w.zh||'')}</strong>
          <span>${escapeHTML(w.en||'')}</span>
          ${w.ref?'<button id="vocabRefBtn" class="ref-chip" data-ref="'+escapeHTML(w.ref)+'">'+escapeHTML(w.ref)+'</button>':''}
          <small>${escapeHTML(w.source||'')}</small>
        </div>
        <button id="vocabRevealBtn" class="primary-btn" type="button">显示意思 · Reveal Meaning</button>
      </section>
      <div class="vocab-nav">
        <button id="vocabPrevBtn" class="quiet-btn" type="button" ${state.vocabStudyIndex===0?'disabled':''}>← 上一个</button>
        <button id="vocabNextBtn" class="quiet-btn" type="button" ${state.vocabStudyIndex===items.length-1?'disabled':''}>下一个 →</button>
      </div>`;
    $('#vocabAudioBtn')?.addEventListener('click',e=>playOriginalWord(w,e.currentTarget));
    $('#vocabRevealBtn')?.addEventListener('click',()=>{
      $('#vocabAnswer')?.classList.remove('hidden');
      $('#vocabRevealBtn')?.classList.add('hidden');
    });
    $('#vocabRefBtn')?.addEventListener('click',e=>{closeVocabStudy();navigateReference(e.currentTarget.dataset.ref);});
    $('#vocabPrevBtn')?.addEventListener('click',()=>{state.vocabStudyIndex--;renderVocabStudyCard();});
    $('#vocabNextBtn')?.addEventListener('click',()=>{state.vocabStudyIndex++;renderVocabStudyCard();});
  }

  function openVocabStudy(items=[]){
    stopOriginalAudio();
    state.vocabStudyItems=items;
    state.vocabStudyIndex=0;
    $('#vocabStudyModal')?.classList.remove('hidden');
    renderVocabStudyCard();
  }
  function closeVocabStudy(){
    stopOriginalAudio();
    $('#vocabStudyModal')?.classList.add('hidden');
  }

  function renderCollectionTools(items=[]){
    const tools=$('#collectionTools'); if(!tools)return;
    if(state.collection!=='originalWords'){stopOriginalAudio();tools.innerHTML='';return;}
    const langCounts={Greek:0,Hebrew:0,Aramaic:0};
    items.forEach(x=>{
      const lang=x.itemType==='lexicon'?'Greek':String(x.language||'');
      if(langCounts[lang]!==undefined)langCounts[lang]++;
    });
    const visible=state.originalLangFilter==='ALL'?items:items.filter(x=>{
      const lang=x.itemType==='lexicon'?'Greek':String(x.language||'');
      return lang===state.originalLangFilter;
    });
    tools.innerHTML=`
      <div class="collection-tool-row">
        <div class="language-filter-group">
          ${['ALL','Greek','Hebrew','Aramaic'].map(lang=>`<button class="chip ${state.originalLangFilter===lang?'active':''}" data-original-lang="${lang}">${lang==='ALL'?'全部 · All':lang} ${lang==='ALL'?items.length:(langCounts[lang]||0)}</button>`).join('')}
        </div>
        <div class="collection-tool-actions">
          <span class="collection-count">${visible.length} items</span>
          <button id="startVocabStudy" class="quiet-btn" type="button">🎓 学习模式 · Study</button>
          <button id="playVisibleOriginal" class="quiet-btn" type="button">▶ 播放当前字词</button>
          <button id="stopVisibleOriginal" class="quiet-btn" type="button">■ 停止</button>
        </div>
      </div>`;
    $$('[data-original-lang]',tools).forEach(btn=>btn.addEventListener('click',()=>{
      stopOriginalAudio();
      state.originalLangFilter=btn.dataset.originalLang;
      renderCollection();
    }));
    $('#playVisibleOriginal')?.addEventListener('click',()=>{
      const words=visible.map(x=>x.itemType==='lexicon'
        ?{original:x.lemma,transliteration:x.transliteration,language:'Greek'}
        :{original:x.original,transliteration:x.transliteration,language:x.language}
      );
      playIndexedOriginalWords(words);
    });
    $('#stopVisibleOriginal')?.addEventListener('click',stopOriginalAudio);
    $('#startVocabStudy')?.addEventListener('click',()=>openVocabStudy(originalStudyItems()));
  }


  function bindOriginalCollectionAudio(grid){
    $$('[data-lex-audio]',grid).forEach(btn=>btn.addEventListener('click',()=>{
      const lex=state.study.greekLexicon?.[normalizeStrongId(btn.dataset.lexAudio)];
      if(lex)playOriginalWord({original:lex.lemma,transliteration:lex.transliteration,language:'Greek'},btn);
    }));
    $$('[data-linked-audio]',grid).forEach(btn=>btn.addEventListener('click',()=>{
      const parts=String(btn.dataset.linkedAudio||'').split('|');
      playOriginalWord({strong:parts[1],original:parts[2],transliteration:parts[3],language:parts[4]},btn);
    }));
  }

  function renderCollection(){
    stopOriginalAudio();
    const key=state.collection, info=collectionInfo[key], filter=$('#collectionFilter').value.trim().toLowerCase(); $('#collectionTitle').textContent=info.title; const grid=$('#collectionGrid');
    if(key==='places'){ renderPlaces(grid,filter); return; }
    let items=[];
    if(key==='originalWords'){
      const linked=Object.entries(state.study.originalWords||{}).flatMap(([ref,arr])=>arr.map(x=>({...x,ref,itemType:'verse-word'})));
      const linkedStrong=new Set(linked.map(x=>normalizeStrongId(x.strong)).filter(Boolean));
      const lexicon=Object.values(state.study.greekLexicon||{}).filter(x=>!linkedStrong.has(normalizeStrongId(x.strong))).map(x=>({...x,itemType:'lexicon',language:'Greek'}));
      items=[...linked,...lexicon];
      if(filter)items=items.filter(x=>JSON.stringify(x).toLowerCase().includes(filter));
      renderCollectionTools(items);
      if(state.originalLangFilter!=='ALL')items=items.filter(x=>(x.itemType==='lexicon'?'Greek':String(x.language||''))===state.originalLangFilter);
    } else {
      renderCollectionTools([]);
      if(key==='crossReferences') items=Object.entries(state.study.crossReferences).map(([ref,refs])=>({ref,refs,titleZh:ref,titleEn:`${refs.length} connected passages`}));
      else items=state.study[key]||[];
      if(filter)items=items.filter(x=>JSON.stringify(x).toLowerCase().includes(filter));
    }
    const note='<div class="starter-note">Study Data '+escapeHTML(state.study.meta?.version||'')+' · '+escapeHTML(state.study.meta?.status||'foundation')+'。当前为已审核的扩展索引；完整穷尽式索引仍会逐项导入并保留来源审计。</div>';
    grid.innerHTML=note+items.map(x=>collectionCard(key,x)).join('');
    $$('.ref-chip',grid).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
    if(key==='originalWords')bindOriginalCollectionAudio(grid);

  }

  function collectionCard(key,x){
    if(key==='namesOfGod')return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.kind)}</div><div class="original">${escapeHTML(x.original||'')}</div><h3>${escapeHTML(x.zh)} · ${escapeHTML(x.name)}</h3><p>${escapeHTML(x.meaning)}</p><div class="ref-chips">${x.refs.map(refChip).join('')}</div></article>`;
    if(key==='covenants')return `<article class="collection-card"><div class="card-meta">COVENANT</div><h3>${escapeHTML(x.nameZh)} · ${escapeHTML(x.nameEn)}</h3><p><strong>Parties:</strong> ${escapeHTML(x.parties)}<br><strong>Sign:</strong> ${escapeHTML(x.sign)}</p><div class="ref-chips">${splitRefs(x.ref).map(refChip).join('')}</div></article>`;
    if(key==='prophecies')return `<article class="collection-card"><div class="card-meta">PROPHECY → FULFILLMENT</div><h3>${escapeHTML(x.topic)}</h3><p>${escapeHTML(x.evidence)}</p><div class="ref-chips">${refChip(x.prophecy)}${splitRefs(x.fulfillment).map(refChip).join('')}</div></article>`;
    if(key==='people'){const cp=state.chronology?.people?.find(p=>p.name===x.name),later=state.chronology?.undatedPeople?.find(p=>p.name===x.name),age=cp||later;return `<article class="collection-card"><div class="card-meta">PERSON</div><h3>${escapeHTML(x.zh)} · ${escapeHTML(x.name)}</h3><p>${escapeHTML(x.role)}</p>${age?`<p>${age.life==null?'寿数：经文未明确记载':`寿数：${age.life} 年${age.derived?'（根据经文推算）':''}`} · <small>${cp?'相对年份基于特定家谱模型推算':'没有确证的共同年代坐标'}</small></p><a class="quiet-btn" href="chronology.html?person=${encodeURIComponent(age.name)}">⏳ 查看人物年龄与年代 ↗</a>`:''}<div class="ref-chips">${x.refs.map(refChip).join('')}</div></article>`;}
    if(key==='originalWords'){
      if(x.itemType==='lexicon')return `<article class="collection-card original-lexicon-card"><div class="card-meta">STEPBible TBESG · ${escapeHTML(x.pos||'Greek')}</div><div class="collection-original-row"><div class="original">${escapeHTML(x.lemma)}</div><button class="word-audio-btn collection-audio-btn" type="button" data-lex-audio="${escapeHTML(x.strong)}" title="播放发音 · Play pronunciation">🔊</button></div><h3>${escapeHTML(x.transliteration)} · ${escapeHTML(x.strong)}</h3><p>${escapeHTML(x.briefZh)} · ${escapeHTML(x.briefEn)}</p><div class="source-foot">STEPBible TBESG · CC BY 4.0 · 中文简释为 MyBible 翻译</div></article>`;
      return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.language)} · ${escapeHTML(x.ref)}</div><div class="collection-original-row"><div class="original">${escapeHTML(x.original)}</div><button class="word-audio-btn collection-audio-btn" type="button" data-linked-audio="${escapeHTML(x.ref)}|${escapeHTML(x.strong||'')}|${escapeHTML(x.original||'')}|${escapeHTML(x.transliteration||'')}|${escapeHTML(x.language||'')}" title="播放发音 · Play pronunciation">🔊</button></div><h3>${escapeHTML(x.transliteration)} ${x.strong?`· ${escapeHTML(x.strong)}`:''}</h3><p>${escapeHTML(x.glossZh)} · ${escapeHTML(x.glossEn)}</p><div class="ref-chips">${refChip(x.ref)}</div></article>`;
    }
    const title=x.titleZh||x.titleEn||x.ref, en=x.titleEn||'', refs=x.refs||splitRefs(x.ref||'');
    return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.category||x.theme||'BIBLE STUDY')}</div><h3>${escapeHTML(title)}${en&&en!==title?` · ${escapeHTML(en)}`:''}</h3>${x.place?`<p>📍 ${escapeHTML(x.place)}</p>`:''}${x.theme?`<p>${escapeHTML(x.theme)}</p>`:''}<div class="ref-chips">${refs.map(refChip).join('')}</div></article>`;
  }
  function refChip(r){ const first=String(r).split(';')[0].trim(); return `<button class="ref-chip" data-ref="${escapeHTML(first)}">${escapeHTML(r)}</button>`; }
  function splitRefs(s){return String(s||'').split(';').map(x=>x.trim()).filter(Boolean);}

  function renderPlaces(grid,filter){
    const exact=state.study.places.find(p=>p.name.toLowerCase()===filter||p.zh.toLowerCase()===filter);
    let places=exact?[exact]:state.study.places.filter(x=>!filter||JSON.stringify(x).toLowerCase().includes(filter));
    const mapped=places.filter(p=>Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)));
    const journeys=(state.study.journeys||[]).filter(j=>j.stops.some(stop=>places.some(p=>p.name===stop.place)));
    const journeyCount=journeys.length;
    const journeyHtml=journeyCount?'<section class="atlas-journeys"><h3>📜 圣经旅程 · Scripture Journey Sequences (<span id="journeyVisibleCount">'+journeyCount+'</span>/'+journeyCount+')</h3><div class="atlas-journey-controls"><label>🔎 搜寻旅程 · Search journeys<input id="journeySearch" type="search" placeholder="人物、地点、经文 · Person, place, Scripture" autocomplete="off"></label><label>📅 圣经时期 · Era<select id="journeyEraFilter"><option value="">全部时期 · All eras</option>'+[...new Set(journeys.map(j=>j.era))].map(era=>'<option value="'+escapeHTML(era)+'">'+escapeHTML(era)+'</option>').join('')+'</select></label><label>📖 类型 · Type<select id="journeyTypeFilter"><option value="">全部 · All</option><option value="journey">旅程 · Multi-place journeys</option><option value="event">地点事件 · Single-site events</option></select></label><button type="button" id="journeyReset">重设 · Reset</button></div><p id="journeyEmpty" class="muted" hidden>没有符合的旅程 · No journeys match these filters.</p><p class="muted">经文记载的地点顺序；不代表已确认的道路、距离或精确坐标。</p>'+journeys.map(j=>'<article class="atlas-journey" data-journey-type="'+(j.stops.length>1?'journey':'event')+'" data-journey-era="'+escapeHTML(j.era)+'" data-journey-search="'+escapeHTML([j.titleZh,j.titleEn,j.person,j.era,j.timelineRef,...j.stops.flatMap(stop=>[stop.place,stop.ref,stop.noteZh,stop.noteEn])].join(' ').toLowerCase())+'"><button type="button" class="atlas-journey-map" data-journey="'+escapeHTML(j.id)+'">🗺 Show on map</button><strong>'+escapeHTML(j.titleZh)+' · '+escapeHTML(j.titleEn)+'</strong><div class="atlas-journey-stops">'+j.stops.map((stop,i)=>'<button type="button" class="atlas-journey-stop" data-journey-place="'+escapeHTML(stop.place)+'" title="'+escapeHTML(stop.ref)+'">'+(i+1)+'. '+escapeHTML(stop.place)+'</button>').join('<span aria-hidden="true"> → </span>')+'</div><div class="atlas-journey-notes">'+j.stops.map((stop,i)=>'<div class="atlas-stop-note"><strong>'+(i+1)+'. '+escapeHTML(stop.place)+'</strong><p>'+escapeHTML(stop.noteZh||'')+'</p><p>'+escapeHTML(stop.noteEn||'')+'</p><div class="ref-chips">'+splitRefs(stop.ref).map(refChip).join('')+'</div></div>').join('')+'</div><div class="atlas-journey-links"><a class="quiet-btn" href="chronology.html?person='+encodeURIComponent(j.person)+'&from=atlas">👤 人物 · '+escapeHTML(j.person)+'</a><a class="quiet-btn" href="?view=timeline&era='+encodeURIComponent(j.era)+'&ref='+encodeURIComponent(j.timelineRef||'')+'">⌛ '+escapeHTML((state.study.timeline||[]).find(e=>e.era===j.era&&e.ref===j.timelineRef)?.titleZh||'对应事件')+' · '+escapeHTML((state.study.timeline||[]).find(e=>e.era===j.era&&e.ref===j.timelineRef)?.titleEn||'Timeline Event')+'</a></div><small>'+escapeHTML(j.note)+'</small></article>').join('')+'</section>':'';
    const verifiedGeo={"Rome":[41.9028,12.4964],"Ur":[30.9625,46.1053],"Haran":[36.867,39.029],"Canaan":[31.8,35],"Egypt":[30.0444,31.2357],"Jericho":[31.871,35.443],"Jerusalem":[31.778,35.235],"Bethlehem":[31.705,35.202],"Nazareth":[32.6996,35.3035],"Capernaum":[32.881,35.575],"Sea of Galilee":[32.817,35.583],"Jordan River":[31.84,35.55],"Damascus":[33.5138,36.2765],"Antioch":[36.204,36.161],"Bethel":[31.94,35.224],"Hebron":[31.532,35.099],"Beersheba":[31.252,34.791],"Shechem":[32.214,35.276],"Shiloh":[32.056,35.289],"Mount Carmel":[32.75,35],"Samaria":[32.28,35.19],"Bethany":[31.77,35.263],"Cana":[32.75,35.34],"Bethsaida":[32.91,35.64],"Caesarea Philippi":[33.246,35.693],"Caesarea":[32.502,34.891],"Corinth":[37.938,22.933],"Ephesus":[37.94,27.34],"Philippi":[41.01,24.29],"Thessalonica":[40.64,22.94],"Patmos":[37.31,26.55],"Mount of Olives":[31.778,35.246],"Gethsemane":[31.779,35.24],"Babylon":[32.536,44.421],"Nineveh":[36.36,43.15]};
    const geographic=places.filter(p=>verifiedGeo[p.name]);
    const mapHtml=geographic.length?'<div id="realBibleAtlas" class="real-bible-atlas" role="region" aria-label="Interactive biblical geography map"></div>':'';
    grid.innerHTML=`<div class="atlas-wrap ${filter&&places.length===1?'atlas-focused':''}"><div class="card-meta">BIBLE ATLAS · SCHEMATIC ${filter&&places.length===1?'· SELECTED LOCATION':''}</div>${filter&&places.length===1?`<div class="atlas-selected-summary"><strong>📍 ${escapeHTML(places[0].zh)} · ${escapeHTML(places[0].name)}</strong><span>Scripture-linked location · not a geographic route</span></div>`:`${mapHtml}`}<div class="place-list">${places.map(p=>`<article class="place-card"><h4>${escapeHTML(p.zh)} · ${escapeHTML(p.name)}</h4><div class="card-meta">${escapeHTML(p.type)}</div><p>${escapeHTML(p.note)}</p><div class="ref-chips">${(p.refs||[]).map(refChip).join('')}</div>${([...(state.chronology?.people||[]),...(state.chronology?.undatedPeople||[])]).filter(person=>(person.placeConnections||[]).some(link=>link.place===p.name)).map(person=>{const links=(person.placeConnections||[]).filter(link=>link.place===p.name);return `<div class="atlas-person-link"><a class="quiet-btn" href="chronology.html?person=${encodeURIComponent(person.name)}&from=atlas&place=${encodeURIComponent(p.name)}">👤 ${escapeHTML(person.zh)} · ${escapeHTML(person.name)}</a><div class="ref-chips">${links.map(link=>refChip(link.ref)).join('')}</div></div>`;}).join('')}<a target="_blank" rel="noopener" href="https://www.bibleplaces.com/?s=${encodeURIComponent(p.name)}">BiblePlaces photo/geography reference ↗</a></article>`).join('')}</div>${journeyHtml}<p class="muted" style="font-size:10px">地图仅显示已有示意坐标的地点；完整地点清单仍显示在下方。不会把有争议地点画成确定坐标。</p></div>`;
    $$('.ref-chip',grid).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
    if(grid.querySelector('#realBibleAtlas')&&window.L){
      const map=L.map('realBibleAtlas',{scrollWheelZoom:false}).setView([34,34],4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenStreetMap contributors'}).addTo(map);
      const markers=[];
      geographic.forEach(p=>{
        const m=L.marker(verifiedGeo[p.name]).addTo(map);
        m.bindPopup('<strong>'+escapeHTML(p.zh)+' · '+escapeHTML(p.name)+'</strong><br><button type="button" data-atlas-place="'+escapeHTML(p.name)+'">View location</button>');
        m.on('click',()=>{map.panTo(verifiedGeo[p.name]);});
        markers.push(m);
      });
      $$('[data-journey]',grid).forEach(btn=>btn.addEventListener('click',()=>{
        const journey=(state.study.journeys||[]).find(j=>j.id===btn.dataset.journey);
        if(!journey)return;
        const stops=journey.stops.filter(stop=>verifiedGeo[stop.place]);
        if(!stops.length)return;
        const coords=stops.map(stop=>verifiedGeo[stop.place]);
        if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(.3));
        else map.setView(coords[0],7);
        L.popup().setLatLng(coords[0]).setContent('<strong>'+escapeHTML(journey.titleEn)+'</strong><br>'+stops.map((st,i)=>(i+1)+'. '+escapeHTML(st.place)).join('<br>')+'<br><small>Recorded stops only — no inferred route</small>').openOn(map);
        grid.querySelector('#realBibleAtlas')?.scrollIntoView({behavior:'smooth',block:'center'});
      }));
      if(markers.length>1)map.fitBounds(L.featureGroup(markers).getBounds().pad(.15));
      map.on('popupopen',e=>{const btn=e.popup.getElement()?.querySelector('[data-atlas-place]');btn?.addEventListener('click',()=>{const name=btn.dataset.atlasPlace;$('#collectionFilter').value=name;renderPlaces(grid,name.toLowerCase());});});
      setTimeout(()=>map.invalidateSize(),80);
    }
    const journeySearch=grid.querySelector('#journeySearch');
    const journeyEra=grid.querySelector('#journeyEraFilter');
    const journeyType=grid.querySelector('#journeyTypeFilter');
    const filterJourneys=()=>{
      const query=(journeySearch?.value||'').trim().toLowerCase();
      const era=journeyEra?.value||'';
      const type=journeyType?.value||'';
      let visible=0;
      $$('[data-journey-era]',grid).forEach(card=>{
        card.hidden=!!(era&&card.dataset.journeyEra!==era || type&&card.dataset.journeyType!==type || query&&!card.dataset.journeySearch.includes(query));
        if(!card.hidden)visible++;
      });
      const count=grid.querySelector('#journeyVisibleCount');
      if(count)count.textContent=String(visible);
      const empty=grid.querySelector('#journeyEmpty');
      if(empty)empty.hidden=visible!==0;
    };
    journeySearch?.addEventListener('input',filterJourneys);
    journeyEra?.addEventListener('change',filterJourneys);
    journeyType?.addEventListener('change',filterJourneys);
    grid.querySelector('#journeyReset')?.addEventListener('click',()=>{journeySearch.value='';journeyEra.value='';journeyType.value='';filterJourneys();});
    $$('[data-journey-place]',grid).forEach(btn=>btn.addEventListener('click',()=>{
      const place=btn.dataset.journeyPlace;
      if(!state.study.places.some(p=>p.name===place))return;
      $('#collectionFilter').value=place;
      renderPlaces(grid,place.toLowerCase());
      grid.querySelector('.atlas-selected-summary')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }));
    $$('[data-atlas-place]',grid).forEach(b=>b.addEventListener('click',()=>{
      const place=b.dataset.atlasPlace;
      if(!state.study.places.some(p=>p.name===place))return;
      $('#collectionFilter').value=place;
      renderPlaces(grid,place.toLowerCase());
      grid.querySelector('.place-card')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }));
  }

  function renderTimeline(){
    const timeline=state.study.timeline||[];
    const controls=$('#timelineControls');
    const eras=[...new Set(timeline.map(x=>x.era).filter(Boolean))];
    if(state.timelineEra!=='ALL'&&!eras.includes(state.timelineEra))state.timelineEra='ALL';
    const eraZh={Primeval:'太古时期',Patriarchs:'列祖时期',Exodus:'出埃及时期',Wilderness:'旷野时期',Conquest:'征服迦南',Judges:'士师时期','United Kingdom':'统一王国','Divided Kingdom':'分裂王国','Assyrian period':'亚述时期','Babylonian period':'巴比伦时期',Exile:'被掳时期','Persian period':'波斯时期',Intertestamental:'两约之间',Jesus:'耶稣时期','Early Church':'初期教会',Apostolic:'使徒时期'};
    const eraLabel=era=>era==='ALL'?'全部时期 · All periods':(eraZh[era]?eraZh[era]+' · '+era:era);
    if(controls){
      controls.innerHTML=['ALL',...eras].map(era=>`<button class="chip ${state.timelineEra===era?'active':''}" data-era="${escapeHTML(era)}">${escapeHTML(eraLabel(era))}</button>`).join('');
      $$('.chip[data-era]',controls).forEach(b=>b.addEventListener('click',()=>{state.timelineEra=b.dataset.era;renderTimeline();}));
    }
    const items=timeline.filter(x=>state.timelineEra==='ALL'||x.era===state.timelineEra);
    $('#timelineList').innerHTML=items.map(x=>`<article class="timeline-item"><div><div class="timeline-era">${escapeHTML(eraLabel(x.era))}</div><div class="timeline-date">${escapeHTML(x.date)}</div></div><div><h3>${escapeHTML(x.titleZh)} · ${escapeHTML(x.titleEn)}</h3></div><button class="timeline-ref" data-ref="${escapeHTML(String(x.ref).split(';')[0])}">${escapeHTML(x.ref)}</button></article>`).join('');
    $$('.timeline-ref[data-ref]').forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
  }

  function renderSources(){
    $('#sourceCards').innerHTML=state.study.sourceRegistry.map(s=>`<article class="source-card"><span class="source-pill ${s.type==='SCRIPTURE'?'scripture':s.type.includes('LANGUAGE')?'language':s.type.includes('CROSS')?'crossref':'historical'}">${escapeHTML(s.type)}</span><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.use)}</p><div class="card-meta">${escapeHTML(s.policy)}</div></article>`).join('');
  }

  async function renderDashboard(){
    const el=$('#myDashboard'); if(!el)return;
    const auth=window.MyBibleAuth;
    const user=auth?.user||null;
    const profile=auth?.profile||null;
    const sync=backend?.name==='supabase';
    const current=currentBook();
    const counts={
      bookmarks:Object.keys(personal.bookmarks||{}).length,
      notes:Object.keys(personal.notes||{}).length,
      highlights:Object.keys(personal.highlights||{}).length
    };

    if(!user){
      el.innerHTML=`
        <section class="dashboard-welcome guest">
          <div>
            <div class="kicker">PERSONAL BIBLE</div>
            <h2>你的研读空间 · Your Study Space</h2>
            <p>现在以访客模式使用。本机内容会保留；登录后可启用 Supabase 云端同步与跨设备保存。</p>
          </div>
          <button id="dashboardSignIn" class="primary-btn" type="button">登录 / 注册 · Sign In / Sign Up</button>
        </section>
        <div class="dashboard-stats">
          <div class="dashboard-stat"><strong>${counts.bookmarks}</strong><span>书签 · Bookmarks</span></div>
          <div class="dashboard-stat"><strong>${counts.notes}</strong><span>笔记 · Notes</span></div>
          <div class="dashboard-stat"><strong>${counts.highlights}</strong><span>标记 · Highlights</span></div>
          <div class="dashboard-stat"><strong>Local</strong><span>储存模式 · Storage</span></div>
        </div>`;
      $('#dashboardSignIn')?.addEventListener('click',()=>auth?.open?.('login'));
      return;
    }

    let cloud={authenticated:true,readingCount:0,lastReading:null};
    try{ cloud=await auth?.getDashboardData?.() || cloud; }catch(err){ console.warn('[MyBible] dashboard data failed:',err); }

    const last=cloud.lastReading;
    const lastBook=last?.book_osis || auth?.preferences?.last_book || current?.osis || '';
    const lastChapter=last?.chapter || auth?.preferences?.last_chapter || state.chapter;
    const lastVerse=last?.last_verse || 1;
    const name=profile?.display_name || user.user_metadata?.display_name || 'Reader';
    const lastText=lastBook ? `${lastBook} ${lastChapter}:${lastVerse}` : '—';
    const updated=last?.last_read_at ? new Date(last.last_read_at).toLocaleString() : '—';

    el.innerHTML=`
      <section class="dashboard-welcome signed-in">
        <div>
          <div class="kicker">MYBIBLE CLOUD</div>
          <h2>欢迎回来，${escapeHTML(name)}</h2>
          <p><span class="dashboard-sync-dot"></span>${sync?'Supabase 云端同步已启用':'本机模式'} · 你的个人研读资料受到 RLS 保护。</p>
        </div>
        <div class="dashboard-actions">
          <button id="dashboardContinue" class="primary-btn" type="button">继续阅读 · Continue</button>
          <button id="dashboardAccount" class="quiet-btn" type="button">帐户 · Account</button>
        </div>
      </section>
      <div class="dashboard-stats">
        <div class="dashboard-stat"><strong>${counts.bookmarks}</strong><span>书签 · Bookmarks</span></div>
        <div class="dashboard-stat"><strong>${counts.notes}</strong><span>笔记 · Notes</span></div>
        <div class="dashboard-stat"><strong>${counts.highlights}</strong><span>标记 · Highlights</span></div>
        <div class="dashboard-stat"><strong>${cloud.readingCount||0}</strong><span>已读章节 · Reading</span></div>
      </div>
      <div class="dashboard-reading">
        <div>
          <div class="kicker">LAST READING</div>
          <strong>${escapeHTML(lastText)}</strong>
          <div class="muted">最近阅读 · ${escapeHTML(updated)}</div>
        </div>
        <div class="dashboard-cloud-badge">☁ ${sync?'Cloud Sync':'Local'}</div>
      </div>`;

    $('#dashboardAccount')?.addEventListener('click',()=>auth?.open?.('profile'));
    $('#dashboardContinue')?.addEventListener('click',async()=>{
      if(lastBook){
        const bi=state.books.findIndex(b=>b.osis===lastBook);
        if(bi>=0){
          await navigateTo(bi,Number(lastChapter)||1,Number(lastVerse)||1);
          return;
        }
      }
      showPage('reader');
    });
  }

  async function renderPrayerJournal(){
    const list=$('#prayerList'); if(!list)return;
    const auth=window.MyBibleAuth;
    if(!auth?.user){
      list.innerHTML='<div class="empty-state">登录后可使用云端祷告日记。</div>';
      $('#newPrayerBtn')?.setAttribute('disabled','disabled');
      return;
    }
    $('#newPrayerBtn')?.removeAttribute('disabled');
    try{
      const rows=await auth.getPrayerEntries();
      if(!rows.length){list.innerHTML='<div class="empty-state">还没有祷告记录。</div>';return;}
      list.innerHTML=rows.slice(0,30).map(r=>`<div class="personal-item prayer-item" data-id="${r.id}">
        <button class="personal-title" data-prayer-id="${r.id}">${escapeHTML(r.title||'Prayer')}</button>
        <div class="personal-meta">${escapeHTML(r.status)}${r.linked_verse_ref?' · '+escapeHTML(r.linked_verse_ref):''}</div>
        <div class="muted personal-preview">${escapeHTML((r.body||'').slice(0,110))}${(r.body||'').length>110?'…':''}</div>
      </div>`).join('');
      $$('[data-prayer-id]',list).forEach(b=>b.addEventListener('click',()=>openPrayerEditor(rows.find(r=>r.id===b.dataset.prayerId))));
    }catch(err){list.innerHTML='<div class="empty-state">祷告日记暂时无法载入。</div>';console.warn(err);}
  }

  async function renderSavedStudies(){
    const list=$('#savedStudyList'); if(!list)return;
    const auth=window.MyBibleAuth;
    if(!auth?.user){
      list.innerHTML='<div class="empty-state">登录后可保存个人研读。</div>';
      $('#newStudyBtn')?.setAttribute('disabled','disabled');
      return;
    }
    $('#newStudyBtn')?.removeAttribute('disabled');
    try{
      const rows=await auth.getSavedStudies();
      if(!rows.length){list.innerHTML='<div class="empty-state">还没有保存的研读。</div>';return;}
      list.innerHTML=rows.slice(0,30).map(r=>`<div class="personal-item study-item" data-id="${r.id}">
        <button class="personal-title" data-study-id="${r.id}">${escapeHTML(r.title||'Study')}</button>
        <div class="muted personal-preview">${escapeHTML((r.description||'').slice(0,120))}${(r.description||'').length>120?'…':''}</div>
      </div>`).join('');
      $$('[data-study-id]',list).forEach(b=>b.addEventListener('click',()=>openStudyEditor(rows.find(r=>r.id===b.dataset.studyId))));
    }catch(err){list.innerHTML='<div class="empty-state">研读收藏暂时无法载入。</div>';console.warn(err);}
  }

  function openPrayerEditor(row=null){
    const auth=window.MyBibleAuth;
    if(!auth?.user){auth?.open?.('login');return;}
    $('#prayerId').value=row?.id||'';
    $('#prayerTitle').value=row?.title||'';
    $('#prayerBody').value=row?.body||'';
    $('#prayerVerse').value=row?.linked_verse_ref||state.selectedRef||'';
    $('#prayerStatus').value=row?.status||'praying';
    $('#prayerEditorTitle').textContent=row?'编辑祷告 · Edit Prayer':'新祷告 · New Prayer';
    $('#deletePrayerBtn').classList.toggle('hidden',!row);
    $('#prayerModal').classList.remove('hidden');
  }
  function closePrayerEditor(){ $('#prayerModal').classList.add('hidden'); }

  function openStudyEditor(row=null){
    const auth=window.MyBibleAuth;
    if(!auth?.user){auth?.open?.('login');return;}
    $('#studyId').value=row?.id||'';
    $('#studyTitle').value=row?.title||'';
    $('#studyDescription').value=row?.description||'';
    $('#studyContent').value=row?.content?.text||'';
    $('#studyEditorTitle').textContent=row?'编辑研读 · Edit Study':'新研读 · New Study';
    $('#deleteStudyBtn').classList.toggle('hidden',!row);
    $('#studyModal').classList.remove('hidden');
  }
  function closeStudyEditor(){ $('#studyModal').classList.add('hidden'); }

  async function savePrayerFromForm(e){
    e.preventDefault();
    try{
      await window.MyBibleAuth.savePrayerEntry({
        id:$('#prayerId').value||null,
        title:$('#prayerTitle').value,
        body:$('#prayerBody').value,
        linked_verse_ref:$('#prayerVerse').value,
        status:$('#prayerStatus').value
      });
      closePrayerEditor(); await renderPrayerJournal(); toast('祷告日记已保存');
    }catch(err){toast('保存失败');console.warn(err);}
  }

  async function saveStudyFromForm(e){
    e.preventDefault();
    try{
      await window.MyBibleAuth.saveStudy({
        id:$('#studyId').value||null,
        title:$('#studyTitle').value,
        description:$('#studyDescription').value,
        content:{text:$('#studyContent').value}
      });
      closeStudyEditor(); await renderSavedStudies(); toast('研读已保存');
    }catch(err){toast('保存失败');console.warn(err);}
  }

  async function renderPersonal(){
    renderDashboard();
    renderPersonalList('#bookmarkList',personal.bookmarks,'bookmark');
    renderPersonalList('#noteList',personal.notes,'note');
    renderPersonalList('#highlightList',personal.highlights,'highlight');
    await Promise.all([renderPrayerJournal(),renderSavedStudies()]);
  }
  function renderPersonalList(sel,obj,type){
    const el=$(sel), entries=Object.entries(obj).sort((a,b)=>(b[1].updated||b[1].created||0)-(a[1].updated||a[1].created||0)); if(!entries.length){el.innerHTML='<div class="empty-state">还没有内容。点击经文即可加入。</div>';return;}
    el.innerHTML=entries.slice(0,40).map(([ref,data])=>`<div class="personal-item"><button data-ref="${escapeHTML(ref)}">${escapeHTML(ref)}</button>${type==='note'?`<div class="muted" style="margin-top:4px">${escapeHTML((data.text||'').slice(0,85))}${(data.text||'').length>85?'…':''}</div>`:''}</div>`).join(''); $$('button[data-ref]',el).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
  }

  function openSearch(){ $('#searchModal').classList.remove('hidden'); $('#globalSearch').focus(); runSearch(); }
  function closeSearch(){ $('#searchModal').classList.add('hidden'); }
  function runSearch(){
    const q=$('#globalSearch').value.trim(), out=$('#searchResults'); if(!q){out.innerHTML='<div class="empty-state" style="padding:24px">输入经文地址或英文关键词。快捷键 Ctrl/Cmd + K。</div>';return;}
    const parsed=parseReference(q); if(parsed){out.innerHTML=`<button class="search-result" data-jump="${parsed.bookIndex}|${parsed.chapter}|${parsed.verse||1}"><div class="rref">跳转 · ${escapeHTML(displayRef(parsed.bookIndex,parsed.chapter,parsed.verse||1))}</div><div class="rtext">Open passage</div></button>`; bindSearchResults();return;}
    if(q.length<2){out.innerHTML='<div class="empty-state">请输入至少两个字符。</div>';return;}
    const low=q.toLowerCase(); const results=[];
    outerZh: for(let bi=0;bi<state.cuvsLocal.length;bi++){
      for(const ch of (state.cuvsLocal[bi]?.chapters||[])){
        if(!ch?.verses?.length) continue;
        for(const v of ch.verses){
          if(String(v.text||'').toLowerCase().includes(low)){results.push({bi,ch:ch.chapter||((state.cuvsLocal[bi]?.chapters||[]).indexOf(ch)+1),v:v.verse,text:v.text,lang:'zh'});if(results.length>=60)break outerZh;}
        }
      }
    }
    if(results.length<60 && CONFIG.scripture?.nkjv?.enabled){
      outerEn: for(let bi=0;bi<state.nkjv.length;bi++)for(const ch of state.nkjv[bi].chapters)for(const v of ch.verses){if(v.text.toLowerCase().includes(low)){results.push({bi,ch:ch.chapter,v:v.verse,text:v.text,lang:'en'});if(results.length>=60)break outerEn;}}
    }
    out.innerHTML=results.length?results.map(r=>`<button class="search-result" data-jump="${r.bi}|${r.ch}|${r.v}"><div class="rref">${escapeHTML(displayRef(r.bi,r.ch,r.v))} · ${r.lang==='zh'?'CUVS':'NKJV'}</div><div class="rtext">${highlightText(r.text,q)}</div></button>`).join(''):'<div class="empty-state" style="padding:24px">没有找到匹配结果。未通过本机完整性检查的 CUVS 章节不会被全文搜索收录。</div>';bindSearchResults();
  }
  function bindSearchResults(){ $$('#searchResults .search-result').forEach(b=>b.addEventListener('click',()=>{const [bi,ch,v]=b.dataset.jump.split('|').map(Number);closeSearch();navigateTo(bi,ch,v);})); }
  function highlightText(text,q){const safe=escapeHTML(text), idx=text.toLowerCase().indexOf(q.toLowerCase());if(idx<0)return safe;return escapeHTML(text.slice(0,idx))+'<mark>'+escapeHTML(text.slice(idx,idx+q.length))+'</mark>'+escapeHTML(text.slice(idx+q.length));}
  function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}

  function parseReference(input){
    const s=input.trim().replace(/[：]/g,':').replace(/\s+/g,' ');
    for(let i=0;i<state.books.length;i++){
      const b=state.books[i]; const names=[b.english,b.chinese,b.source_heading_zh].filter(Boolean).sort((a,b)=>b.length-a.length);
      for(const name of names){
        const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const re=new RegExp(`^${escaped}\\s*(\\d+)(?:\\s*:\\s*(\\d+))?`,'i'); const m=s.match(re); if(m){const chapter=+m[1],verse=m[2]?+m[2]:1;if(chapter>=1&&chapter<=b.chapters)return{bookIndex:i,chapter,verse};}
      }
    }
    return null;
  }
  function findBookByPrefix(name){const norm=name.trim().toLowerCase();return state.books.findIndex(b=>b.english.toLowerCase()===norm||b.chinese===name.trim());}
  function navigateReference(ref){
    const clean=String(ref).split(/[;,]/)[0].trim().replace(/(\d+):(\d+)-(\d+)/,'$1:$2'); const p=parseReference(clean); if(!p){toast('这个参考地址将在下一版解析器扩充');return;} navigateTo(p.bookIndex,p.chapter,p.verse);
  }
  async function navigateTo(bi,ch,v=1){ state.bookIndex=bi;state.chapter=ch;state.selectedVerse=v;state.selectedRef=canonicalRef(bi,ch,v);populateSelectors();renderBookNavigation();showPage('reader');await renderReader();setTimeout(()=>{const row=$(`.verse-row[data-verse="${v}"]`);if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('selected');}},80); }

  init().catch(err=>{console.error(err); document.body.innerHTML=`<div style="padding:40px;font-family:system-ui"><h1>App could not start</h1><p>${escapeHTML(err.message)}</p><p>请通过网页服务器打开本项目；GitHub Pages 部署后会自动满足此要求。</p></div>`;});
})();
