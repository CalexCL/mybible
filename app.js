(() => {
  'use strict';

  const CONFIG = window.MYBIBLE_CONFIG || {};
  let backend = null;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE = {
    theme: 'csb.theme', font: 'csb.fontScale', notes:'csb.notes', bookmarks:'csb.bookmarks', highlights:'csb.highlights', position:'csb.position'
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
    books:[], nkjv:[], cuvsLocal:[], study:null,
    bookIndex:0, chapter:1, mode:'parallel', selectedVerse:1, selectedRef:'Genesis 1:1', selectedTab:'study',
    chineseBookCache:new Map(), collection:'namesOfGod', testament:'ALL', timelineEra:'ALL'
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
  function currentEnglishChapter(){ return CONFIG.scripture?.nkjv?.enabled ? (state.nkjv[state.bookIndex]?.chapters?.[state.chapter-1]?.verses || []) : []; }

  async function init(){
    applyStoredAppearance();
    await loadPersonal();
    const nkjvPromise = CONFIG.scripture?.nkjv?.enabled && CONFIG.scripture?.nkjv?.dataUrl
      ? fetchJSON(CONFIG.scripture.nkjv.dataUrl)
      : Promise.resolve([]);
    const [books,nkjv,cuvsLocal,study] = await Promise.all([
      fetchJSON('data/books.json'), nkjvPromise, fetchJSON(CONFIG.scripture?.cuvs?.localDataUrl || 'data/cuvs_local.json'), fetchJSON('data/study.json')
    ]);
    state.books=books; state.nkjv=nkjv; state.cuvsLocal=cuvsLocal; state.study=study;
    const pos=loadJSON(STORAGE.position,{bookIndex:0,chapter:1,mode:'parallel'});
    state.bookIndex=Math.min(Math.max(+pos.bookIndex||0,0),65);
    state.chapter=Math.min(Math.max(+pos.chapter||1,1),state.books[state.bookIndex].chapters);
    state.mode=['parallel','zh','en'].includes(pos.mode)?pos.mode:'parallel';
    if(!CONFIG.scripture?.nkjv?.enabled && state.mode!=='zh') state.mode='zh';
    bindUI();
    configureTranslationAvailability(); renderBookNavigation(); populateSelectors(); renderExploreCategories(); renderSources(); renderTimeline(); renderPersonal();
    setMode(state.mode,false); await renderReader();
  }

  async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }


  function configureTranslationAvailability(){
    const enabled = !!CONFIG.scripture?.nkjv?.enabled;
    $$('.mode-btn[data-mode="en"], .mode-btn[data-mode="parallel"]').forEach(btn=>{
      btn.disabled = !enabled;
      btn.title = enabled ? '' : (CONFIG.scripture?.nkjv?.reason || 'NKJV is unavailable in this public build.');
    });
  }

  function bindUI(){
    $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
    $('.brand').addEventListener('click',()=>showPage('reader'));
    $('#mobileNavBtn').addEventListener('click',()=>$('#bookSidebar').classList.toggle('open'));
    $$('.testament-btn').forEach(b=>b.addEventListener('click',()=>{state.testament=b.dataset.testament; $$('.testament-btn').forEach(x=>x.classList.toggle('active',x===b)); renderBookNavigation();}));
    $('#bookSelect').addEventListener('change',async e=>{state.bookIndex=+e.target.value; state.chapter=1; syncChapterSelect(); await renderReader();});
    $('#chapterSelect').addEventListener('change',async e=>{state.chapter=+e.target.value; await renderReader();});
    $$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,true)));
    $('#prevChapter').addEventListener('click',()=>moveChapter(-1)); $('#nextChapter').addEventListener('click',()=>moveChapter(1));
    $('#closeDrawer').addEventListener('click',()=>$('#studyDrawer').classList.remove('open'));
    $$('.drawer-tab').forEach(b=>b.addEventListener('click',()=>{state.selectedTab=b.dataset.tab; $$('.drawer-tab').forEach(x=>x.classList.toggle('active',x===b)); renderDrawer();}));
    $('#themeBtn').addEventListener('click',cycleTheme);
    $('#fontPlus').addEventListener('click',()=>changeFont(.08)); $('#fontMinus').addEventListener('click',()=>changeFont(-.08));
    $('#searchBtn').addEventListener('click',openSearch); $('#closeSearch').addEventListener('click',closeSearch); $('#searchModal').addEventListener('click',e=>{if(e.target.id==='searchModal')closeSearch();});
    $('#globalSearch').addEventListener('input',debounce(runSearch,170));
    $('#collectionFilter').addEventListener('input',()=>renderCollection());
    $$('.chip[data-era]').forEach(b=>b.addEventListener('click',()=>{state.timelineEra=b.dataset.era; $$('.chip[data-era]').forEach(x=>x.classList.toggle('active',x===b)); renderTimeline();}));
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeSearch(); $('#studyDrawer').classList.remove('open'); $('#bookSidebar').classList.remove('open');} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();} });
  }

  function showPage(page){
    $$('.page').forEach(p=>p.classList.remove('active')); $(`#${page}Page`).classList.add('active');
    $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    $('#mainContent').scrollTop=0; $('#bookSidebar').classList.remove('open');
    if(page==='mybible')renderPersonal();
  }

  function applyStoredAppearance(){
    const theme=localStorage.getItem(STORAGE.theme)||'light'; document.documentElement.dataset.theme=themes.includes(theme)?theme:'light';
    const font=Number(localStorage.getItem(STORAGE.font)||1); document.documentElement.style.setProperty('--font-scale',String(Math.min(1.5,Math.max(.82,font))));
  }
  function cycleTheme(){ const cur=document.documentElement.dataset.theme||'light'; const next=themes[(themes.indexOf(cur)+1)%themes.length]; document.documentElement.dataset.theme=next; localStorage.setItem(STORAGE.theme,next); toast(themeLabels[next]); }
  function changeFont(delta){ const root=document.documentElement; const v=Number(getComputedStyle(root).getPropertyValue('--font-scale'))||1; const nv=Math.min(1.5,Math.max(.82,v+delta)); root.style.setProperty('--font-scale',nv.toFixed(2)); localStorage.setItem(STORAGE.font,nv.toFixed(2)); }

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
  function savePosition(){ localStorage.setItem(STORAGE.position,JSON.stringify({bookIndex:state.bookIndex,chapter:state.chapter,mode:state.mode})); }
  function setMode(mode,render=true){ if((mode==='en'||mode==='parallel')&&!CONFIG.scripture?.nkjv?.enabled){toast('NKJV 公开版暂未启用：等待合法授权数据源');return;} state.mode=mode; $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode)); savePosition(); if(render)renderReader(); }
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

  async function renderReader(){
    savePosition(); renderBookNavigation(); syncChapterSelect();
    const b=currentBook(); $('#testamentKicker').textContent=b.testament==='OT'?'旧约 · OLD TESTAMENT':'新约 · NEW TESTAMENT'; $('#passageTitle').textContent=`${b.chinese} · ${b.english} ${state.chapter}`; $('#chapterStatus').textContent='正在载入经文与研读层…';
    const list=$('#verseList'); list.className=`verse-list ${state.mode==='zh'?'zh-only':state.mode==='en'?'en-only':''}`; list.innerHTML='<div class="loading"><div class="spinner"></div>正在载入经文…</div>';
    const en=currentEnglishChapter(); const zhResult=state.mode==='en'?{verses:[],source:'not-needed'}:await getChineseChapter(); const zh=zhResult.verses;
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
    const nkjvLabel=CONFIG.scripture?.nkjv?.enabled?' + NKJV':'';
    const sourceText=state.mode==='en'?'NKJV':zhResult.source==='structured-online'?`CUVS · structured public-domain transport${nkjvLabel}`:zhResult.source==='structured-cache'?`CUVS · cached structured text${nkjvLabel}`:`CUVS · uploaded PDF fallback${nkjvLabel}`;
    $('#chapterStatus').textContent=`${sourceText} · 点击任一节打开研读面板`;
  }

  function handleVerseClick(e){
    const row=e.target.closest('.verse-row'); if(!row)return; const verse=+row.dataset.verse; const ref=canonicalRef(state.bookIndex,state.chapter,verse);
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='bookmark'){ e.stopPropagation(); toggleBookmark(ref); return; }
    if(action==='highlight'){ e.stopPropagation(); toggleHighlight(ref,row); return; }
    state.selectedVerse=verse;state.selectedRef=ref; $$('.verse-row').forEach(r=>r.classList.toggle('selected',r===row)); openDrawer();
  }
  function toggleBookmark(ref){ if(personal.bookmarks[ref])delete personal.bookmarks[ref];else personal.bookmarks[ref]={created:Date.now()};savePersonal();toast(personal.bookmarks[ref]?'已加入书签':'已移除书签'); }
  function toggleHighlight(ref,row){ if(personal.highlights[ref])delete personal.highlights[ref];else personal.highlights[ref]={color:'gold',created:Date.now()};savePersonal();row?.classList.toggle('highlighted',!!personal.highlights[ref]);toast(personal.highlights[ref]?'已标记经文':'已取消标记'); }

  function openDrawer(){ $('#studyRef').textContent=displayRef(state.bookIndex,state.chapter,state.selectedVerse); $('#studyDrawer').classList.add('open'); renderDrawer(); }
  function getSelectedTexts(){
    const en=currentEnglishChapter().find(v=>+v.verse===state.selectedVerse)?.text||'';
    const row=$(`.verse-row[data-verse="${state.selectedVerse}"]`); let zh=row?.querySelector('.zh-cell')?.textContent||''; zh=zh.replace(/^\d+/,'').replace(/🔖|🖍|✦/g,'').trim();
    return {zh,en};
  }
  function renderDrawer(){
    const body=$('#drawerBody'), ref=state.selectedRef, texts=getSelectedTexts(), refs=state.study.crossReferences[ref]||[], words=state.study.originalWords[ref]||[];
    if(state.selectedTab==='study'){
      body.innerHTML=`<div class="study-verse">${texts.zh?`<div>${escapeHTML(texts.zh)}</div>`:''}${texts.en?`<div class="muted" style="margin-top:8px;font-size:14px">${escapeHTML(texts.en)}</div>`:''}</div>
      <div class="study-section"><h3>快捷研读</h3><div class="tool-row"><button class="tool-btn ${personal.bookmarks[ref]?'active':''}" id="drawerBookmark">🔖 书签</button><button class="tool-btn ${personal.highlights[ref]?'active':''}" id="drawerHighlight">🖍 标记</button><button class="tool-btn" id="drawerCross">↗ ${refs.length||'TSK'} 串珠</button><button class="tool-btn" id="drawerOriginal">אΩ 原文</button></div></div>
      <div class="study-section"><h3>知识图谱入口</h3><p class="muted">本节将逐步连接：人物、地点、事件、主题、时间线、预言、圣约、神迹与原文。V0.1 已建立统一接口，资料会按来源逐项扩充。</p></div>
      <div class="source-foot">SCRIPTURE 与 STUDY DATA 严格分层。研读资料不会修改经文。</div>`;
      $('#drawerBookmark')?.addEventListener('click',()=>{toggleBookmark(ref);renderDrawer();}); $('#drawerHighlight')?.addEventListener('click',()=>{toggleHighlight(ref,$(`.verse-row[data-verse="${state.selectedVerse}"]`));renderDrawer();}); $('#drawerCross')?.addEventListener('click',()=>switchDrawerTab('crossrefs')); $('#drawerOriginal')?.addEventListener('click',()=>switchDrawerTab('original'));
    } else if(state.selectedTab==='original'){
      body.innerHTML=words.length?words.map(w=>`<div class="word-card"><div class="word-original">${escapeHTML(w.original)}</div><div class="word-meta"><span>${escapeHTML(w.language)}</span>${w.strong?`<span>${escapeHTML(w.strong)}</span>`:''}<span>${escapeHTML(w.transliteration)}</span></div><div class="word-gloss">${escapeHTML(w.glossZh)} · ${escapeHTML(w.glossEn)}</div><div class="source-foot">Source layer: ${escapeHTML(w.source)} / Tyndale House reference framework</div></div>`).join('')+`<div class="study-section"><a target="_blank" rel="noopener" href="https://www.stepbible.org/">在 STEP Bible 继续原文研读 ↗</a></div>`:`<div class="empty-state">本节的本机原文卡尚未导入。<br><br><a target="_blank" rel="noopener" href="https://www.stepbible.org/">打开 STEP Bible 原文研读 ↗</a><p>完整 Hebrew / Aramaic / Greek 词形资料将在下一数据导入阶段接入。</p></div>`;
    } else if(state.selectedTab==='crossrefs'){
      body.innerHTML=refs.length?`<div class="study-section"><h3>TSK-backed starter references</h3><div class="ref-chips">${refs.map(r=>`<button class="ref-chip drawer-ref" data-ref="${escapeHTML(r)}">${escapeHTML(r)}</button>`).join('')}</div></div><div class="source-foot">Local starter set is derived from Scripture-to-Scripture TSK-style references. Exhaustive TSK import is the next cross-reference data phase.</div>`:`<div class="empty-state">本节尚未写入本机串珠索引。完整 TSK 数据接口已列入下一数据阶段。<br><br><a target="_blank" rel="noopener" href="https://www.thetreasuryofscriptureknowledge.com/">打开 Treasury of Scripture Knowledge ↗</a></div>`;
      $$('.drawer-ref',body).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
    } else if(state.selectedTab==='notes'){
      body.innerHTML=`<div class="study-section"><h3>我的笔记 · ${escapeHTML(ref)}</h3><textarea id="noteArea" class="note-area" placeholder="写下观察、问题、祷告或研读笔记…">${escapeHTML(personal.notes[ref]?.text||'')}</textarea></div><button id="saveNote" class="primary-btn">保存笔记</button><div class="source-foot">USER layer · 当前使用 ${backend?.name==='supabase'?'Supabase 云端同步':'浏览器本机储存'}。</div>`;
      $('#saveNote').addEventListener('click',()=>{const text=$('#noteArea').value.trim();if(text)personal.notes[ref]={text,updated:Date.now()};else delete personal.notes[ref];savePersonal();toast('笔记已保存');});
    }
  }
  function switchDrawerTab(tab){state.selectedTab=tab;$$('.drawer-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));renderDrawer();}

  function renderExploreCategories(){
    $('#exploreCategories').innerHTML=Object.entries(collectionInfo).map(([key,c])=>`<button class="category-card ${key===state.collection?'active':''}" data-collection="${key}"><div class="category-icon">${c.icon}</div><div class="category-title">${c.title}</div><div class="category-sub">${c.sub}</div></button>`).join('');
    $$('.category-card').forEach(b=>b.addEventListener('click',()=>{state.collection=b.dataset.collection;$$('.category-card').forEach(x=>x.classList.toggle('active',x===b));$('#collectionFilter').value='';renderCollection();})); renderCollection();
  }

  function renderCollection(){
    const key=state.collection, info=collectionInfo[key], filter=$('#collectionFilter').value.trim().toLowerCase(); $('#collectionTitle').textContent=info.title; const grid=$('#collectionGrid');
    if(key==='places'){ renderPlaces(grid,filter); return; }
    let items=[];
    if(key==='originalWords') items=Object.entries(state.study.originalWords).flatMap(([ref,arr])=>arr.map(x=>({...x,ref})));
    else if(key==='crossReferences') items=Object.entries(state.study.crossReferences).map(([ref,refs])=>({ref,refs,titleZh:ref,titleEn:`${refs.length} connected passages`}));
    else items=state.study[key]||[];
    if(filter)items=items.filter(x=>JSON.stringify(x).toLowerCase().includes(filter));
    const note='<div class="starter-note">V0.1 为“可运行的基础版 + 精选起始资料”。完整穷尽式索引会在后续数据阶段逐项导入并保留来源审计。</div>';
    grid.innerHTML=note+items.map(x=>collectionCard(key,x)).join('');
    $$('.ref-chip',grid).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
  }

  function collectionCard(key,x){
    if(key==='namesOfGod')return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.kind)}</div><div class="original">${escapeHTML(x.original||'')}</div><h3>${escapeHTML(x.zh)} · ${escapeHTML(x.name)}</h3><p>${escapeHTML(x.meaning)}</p><div class="ref-chips">${x.refs.map(refChip).join('')}</div></article>`;
    if(key==='covenants')return `<article class="collection-card"><div class="card-meta">COVENANT</div><h3>${escapeHTML(x.nameZh)} · ${escapeHTML(x.nameEn)}</h3><p><strong>Parties:</strong> ${escapeHTML(x.parties)}<br><strong>Sign:</strong> ${escapeHTML(x.sign)}</p><div class="ref-chips">${splitRefs(x.ref).map(refChip).join('')}</div></article>`;
    if(key==='prophecies')return `<article class="collection-card"><div class="card-meta">PROPHECY → FULFILLMENT</div><h3>${escapeHTML(x.topic)}</h3><p>${escapeHTML(x.evidence)}</p><div class="ref-chips">${refChip(x.prophecy)}${splitRefs(x.fulfillment).map(refChip).join('')}</div></article>`;
    if(key==='people')return `<article class="collection-card"><div class="card-meta">PERSON</div><h3>${escapeHTML(x.zh)} · ${escapeHTML(x.name)}</h3><p>${escapeHTML(x.role)}</p><div class="ref-chips">${x.refs.map(refChip).join('')}</div></article>`;
    if(key==='originalWords')return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.language)} · ${escapeHTML(x.ref)}</div><div class="original">${escapeHTML(x.original)}</div><h3>${escapeHTML(x.transliteration)} ${x.strong?`· ${escapeHTML(x.strong)}`:''}</h3><p>${escapeHTML(x.glossZh)} · ${escapeHTML(x.glossEn)}</p><div class="ref-chips">${refChip(x.ref)}</div></article>`;
    const title=x.titleZh||x.titleEn||x.ref, en=x.titleEn||'', refs=x.refs||splitRefs(x.ref||'');
    return `<article class="collection-card"><div class="card-meta">${escapeHTML(x.category||x.theme||'BIBLE STUDY')}</div><h3>${escapeHTML(title)}${en&&en!==title?` · ${escapeHTML(en)}`:''}</h3>${x.place?`<p>📍 ${escapeHTML(x.place)}</p>`:''}${x.theme?`<p>${escapeHTML(x.theme)}</p>`:''}<div class="ref-chips">${refs.map(refChip).join('')}</div></article>`;
  }
  function refChip(r){ const first=String(r).split(';')[0].trim(); return `<button class="ref-chip" data-ref="${escapeHTML(first)}">${escapeHTML(r)}</button>`; }
  function splitRefs(s){return String(s||'').split(';').map(x=>x.trim()).filter(Boolean);}

  function renderPlaces(grid,filter){
    let places=state.study.places.filter(x=>!filter||JSON.stringify(x).toLowerCase().includes(filter));
    grid.innerHTML=`<div class="atlas-wrap"><div class="card-meta">BIBLE ATLAS · V0.1 SCHEMATIC</div><div class="atlas"><div class="map-water"></div><div class="map-river"></div>${places.map(p=>`<button class="map-pin" style="left:${p.x}%;top:${p.y}%" title="${escapeHTML(p.note)}"><div class="dot"></div><div class="label">${escapeHTML(p.zh)} · ${escapeHTML(p.name)}</div></button>`).join('')}</div><div class="place-list">${places.map(p=>`<article class="place-card"><h4>${escapeHTML(p.zh)} · ${escapeHTML(p.name)}</h4><div class="card-meta">${escapeHTML(p.type)}</div><p>${escapeHTML(p.note)}</p><div class="ref-chips">${p.refs.map(refChip).join('')}</div><a target="_blank" rel="noopener" href="https://www.bibleplaces.com/?s=${encodeURIComponent(p.name)}">BiblePlaces photo/geography reference ↗</a></article>`).join('')}</div><p class="muted" style="font-size:10px">地图仅为位置关系示意，不把有争议地点画成确定坐标。正式 Atlas 阶段将采用可审计的历史地理资料。</p></div>`;
    $$('.ref-chip',grid).forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
  }

  function renderTimeline(){
    const items=state.study.timeline.filter(x=>state.timelineEra==='ALL'||x.era===state.timelineEra); $('#timelineList').innerHTML=items.map(x=>`<article class="timeline-item"><div><div class="timeline-era">${escapeHTML(x.era)}</div><div class="timeline-date">${escapeHTML(x.date)}</div></div><div><h3>${escapeHTML(x.titleZh)} · ${escapeHTML(x.titleEn)}</h3></div><button class="timeline-ref" data-ref="${escapeHTML(String(x.ref).split(';')[0])}">${escapeHTML(x.ref)}</button></article>`).join('');
    $$('.timeline-ref').forEach(b=>b.addEventListener('click',()=>navigateReference(b.dataset.ref)));
  }

  function renderSources(){
    $('#sourceCards').innerHTML=state.study.sourceRegistry.map(s=>`<article class="source-card"><span class="source-pill ${s.type==='SCRIPTURE'?'scripture':s.type.includes('LANGUAGE')?'language':s.type.includes('CROSS')?'crossref':'historical'}">${escapeHTML(s.type)}</span><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.use)}</p><div class="card-meta">${escapeHTML(s.policy)}</div></article>`).join('');
  }

  function renderPersonal(){
    renderPersonalList('#bookmarkList',personal.bookmarks,'bookmark'); renderPersonalList('#noteList',personal.notes,'note'); renderPersonalList('#highlightList',personal.highlights,'highlight');
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
