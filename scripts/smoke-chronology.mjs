import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const response = await page.goto('http://127.0.0.1:8765/chronology.html?person=Adam', { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.locator('.person').first().waitFor();
  assert.ok(await page.locator('.person').count() >= 24, 'Expected 24 plotted people');
  assert.match(await page.locator('#detail').innerText(), /Adam|亚当/);
  await page.locator('#personSearch').fill('Noah');
  assert.equal(await page.locator('#compareChoices input[data-compare]').count(), 1);
  await page.locator('#personSearch').fill('');
  await page.locator('#zoom').evaluate(el => { el.value = '1500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#showConnectors').uncheck();
  await page.locator('#showConnectors').check();
  await page.locator('#undatedSearch').fill('Moses');
  assert.equal(await page.locator('#undatedProfiles [data-undated-person]').count(), 1);
  await page.locator('#undatedProfiles [data-undated-person]').click();
  assert.match(await page.locator('#detail').innerText(), /Moses|摩西/);
  const eventLink=page.locator('#detail a[href*="view=timeline"][href*="ref="]').first();
  await eventLink.waitFor();
  const targetUrl=await eventLink.getAttribute('href');
  assert.match(targetUrl, /view=timeline.*era=Exodus.*ref=/);
  await eventLink.click();
  await page.locator('#timelinePage.active').waitFor({timeout:30000});
  assert.ok(await page.locator('#timelineList .timeline-item').count()>0,'Timeline should display period events');
  assert.ok(await page.locator('#timelineList .selected-timeline-event').count()===1,'Direct event should be highlighted after navigation');
  assert.match(page.url(),/view=timeline/);
  await page.goto('http://127.0.0.1:8765/chronology.html?person=Moses', { waitUntil: 'networkidle' });
  const placeLink=page.locator('#detail a[href*="view=explore"][href*="place="]').first();
  await placeLink.waitFor();
  await placeLink.click();
  await page.locator('#explorePage.active').waitFor({timeout:30000});
  await page.locator('#collectionGrid .place-card').first().waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(), 'Egypt');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'');
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>1,'Back must restore all geographic map markers');
  await page.goto('http://127.0.0.1:8765/?view=explore&collection=places&place=Egypt',{waitUntil:'networkidle'});
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionGrid .place-card').count(), 1, 'Atlas should focus on selected Scripture place');
  assert.equal(await page.locator('#collectionGrid .atlas-focused').count(),1,'Selected location should use compact Atlas');
  assert.equal(await page.locator('#collectionGrid .atlas-focused .atlas').count(),0,'Focused Atlas should hide schematic map');
  assert.equal(await page.locator('#collectionGrid .atlas-selected-summary').count(),1);
  // A Scripture citation from a selected Atlas place returns to that same place.
  const egyptRef=page.locator('#collectionGrid .place-card .ref-chip[data-ref]').filter({hasText:/Exodus|Genesis|Matthew|Acts|Exod/i}).first();
  await egyptRef.waitFor();
  await egyptRef.click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Egypt','Scripture Back restores selected Atlas location');
  assert.equal(await page.locator('#collectionGrid .place-card').count(),1,'Back keeps Egypt focused before restoring all pins');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'');
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>1,'Back from selected Atlas location restores full map');
  assert.equal(await page.locator('#atlasFindEgypt').count(),1,'Bilingual Egypt shortcut is available');
  const mobileMap=await page.locator('#realBibleAtlas').boundingBox();
  assert.ok(mobileMap&&mobileMap.height>=340,'Mobile Atlas maintains usable minimum height');
  const egyptShortcut=await page.locator('#atlasFindEgypt').boundingBox();
  assert.ok(egyptShortcut&&egyptShortcut.height>=40,'Egypt shortcut has a touch-friendly mobile target');
  assert.ok(egyptShortcut.width>=90,'Egypt locator label is wide enough to read on a mobile screen');
  const placeLabels=await page.locator('#realBibleAtlas .atlas-place-label').allTextContents();
  assert.ok(placeLabels.some(x=>x.includes('埃及')&&x.includes('Egypt')),'Permanent Egypt place label is bilingual');
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>10,'Interactive Bible place markers remain distinct from region labels');
  assert.ok(await page.locator('#realBibleAtlas .maplibregl-ctrl-group').count()===1,'Atlas zoom controls remain present after bilingual overlay');
  assert.ok(await page.locator('#realBibleAtlas canvas.maplibregl-canvas').count()===1,'OpenFreeMap vector canvas initialized');
  await page.waitForFunction(()=>document.querySelector('#realBibleAtlas')?.dataset.mapReady==='true',null,{timeout:20000});
  assert.notEqual(await page.locator('#realBibleAtlas').getAttribute('data-map-error'),'true','MapLibre must load without a rendering error');
  assert.ok(await page.evaluate(()=>!!window.maplibregl),'MapLibre renderer is available');
  const zoomIn=page.locator('#realBibleAtlas .maplibregl-ctrl-zoom-in');
  await zoomIn.click();
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>10,'Interactive markers remain after map zoom');
  await page.locator('#realBibleAtlas .maplibregl-ctrl-zoom-out').click();
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>10,'Interactive markers remain after zooming back out');
  assert.ok(await page.locator('#atlasFindEgypt').isVisible(),'Egypt locator stays visible after map zoom controls');
  assert.ok(await page.locator('#realBibleAtlas .atlas-region-label').count()>=5,'Atlas provides bilingual geographic labels');
  assert.ok((await page.locator('#realBibleAtlas .atlas-region-label').allTextContents()).some(t=>t.includes('埃及')&&t.includes('Egypt')),'Egypt named in Chinese and English');
  assert.ok((await page.locator('#realBibleAtlas .atlas-region-label').allTextContents()).some(t=>t.includes('叙利亚')&&t.includes('Syria')),'Syria named in Chinese and English');
  for(const [zh,en] of [['约旦','Jordan'],['伊拉克','Iraq'],['土耳其','Türkiye'],['希腊','Greece'],['意大利','Italy'],['黎巴嫩','Lebanon']]){
    assert.ok((await page.locator('#realBibleAtlas .atlas-region-label').allTextContents()).some(t=>t.includes(zh)&&t.includes(en)),zh+' / '+en+' bilingual region label');
  }
  assert.ok(await page.locator('#realBibleAtlas .atlas-place-label').count()>=5,'Major biblical places have visible bilingual markers');
  const atlasPlaces=await page.locator('#realBibleAtlas .atlas-place-label').allTextContents();
  for(const english of ['Egypt','Jerusalem','Bethlehem','Damascus','Rome']){
    assert.ok(atlasPlaces.some(label=>label.includes(english)&&label.includes(' · ')),english+' visible as bilingual place label');
  }
  await page.locator('#atlasFindEgypt').click();
  await page.locator('#realBibleAtlas .maplibregl-popup-content').getByText('埃及 · Egypt').waitFor();
  // The Egypt map shortcut should open the actual place, then Back returns to all markers.
  await page.locator('#realBibleAtlas .maplibregl-popup-content [data-atlas-place="Egypt"]').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Egypt','Egypt shortcut opens selected location');
  assert.equal(await page.locator('#collectionGrid .place-card').count(),1,'Egypt shortcut displays one place');
  await page.locator('#backNavigationBtn').click();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'','Back returns from Egypt shortcut to Atlas');
  assert.ok(await page.locator('#realBibleAtlas .atlas-geopoint').count()>1,'Atlas pins restored');
  assert.ok(await page.locator('#collectionGrid .atlas-journey-map').count()>=19,'Nineteen Scripture journeys available');
  assert.ok(await page.locator('#collectionGrid .atlas-journey-stop[data-journey-place="Bethlehem"]').count()>0,'Luke 2 Bethlehem stop available');
  assert.ok(await page.locator('#collectionGrid .atlas-journey-stop[data-journey-place="Beersheba"]').count()>0,'Jacob journey Beersheba stop available');
  assert.ok(await page.locator('.atlas-journey-stop[data-journey-place="Caesarea Philippi"]').count()>0,'Peter confession stop available');
  await page.locator('#journeySearch').fill('Elijah');
  assert.equal(await page.locator('.atlas-journey:visible').count(),2,'Elijah search finds both relevant studies');
  await page.locator('#journeySearch').fill('');
  await page.locator('#journeyEraFilter').selectOption('Patriarchs');
  assert.ok(await page.locator('.atlas-journey:visible').count()>=2,'Era filter works');
  await page.locator('#journeyEraFilter').selectOption('');
  await page.locator('#journeyTypeFilter').selectOption('event');
  assert.ok(await page.locator('.atlas-journey:visible').count()>=3,'Single-site event filter returns event studies');
  assert.equal(await page.locator('.atlas-journey[data-journey-type="journey"]:visible').count(),0,'Event filter excludes multi-place journeys');
  await page.locator('#journeyEraFilter').selectOption('');
  await page.locator('#journeyTypeFilter').selectOption('');
  await page.locator('#journeySort').selectOption('stops');
  assert.equal(await page.locator('.atlas-journey').first().getAttribute('data-journey-stops'),'3','Most stops sorts longest journey first');
  await page.locator('#journeySort').selectOption('az');
  const titles=await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>c.dataset.journeyTitle));
  assert.deepEqual(titles,[...titles].sort((a,b)=>a.localeCompare(b)),'Alphabetical journey order');
  await page.locator('#journeyReset').click();
  assert.ok(await page.locator('.atlas-journey:visible').count()>=19,'Reset restores journeys');
  await page.locator('#journeySort').selectOption('za');
  const reverseTitles=await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>c.dataset.journeyTitle));
  assert.deepEqual(reverseTitles,[...reverseTitles].sort((a,b)=>b.localeCompare(a)),'Reverse alphabetical journey ordering');
  await page.locator('#journeySort').selectOption('fewest');
  const fewestCounts=await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>Number(c.dataset.journeyStops)));
  assert.deepEqual(fewestCounts,[...fewestCounts].sort((a,b)=>a-b),'Fewest stops journey ordering');
  await page.locator('#journeyReset').click();

  // V112: exercise combined filters, empty results, sorting, counts and reset in one browser flow.
  const allJourneys=await page.locator('.atlas-journey').count();
  const biblicalOrder=await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>c.dataset.journeyOrder));
  await page.locator('#journeySort').selectOption('stops');
  const stopCounts=await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>Number(c.dataset.journeyStops)));
  assert.deepEqual(stopCounts,[...stopCounts].sort((a,b)=>b-a),'All journeys sort by descending stop count');
  await page.locator('#journeySearch').fill('Elijah');
  await page.locator('#journeyEraFilter').selectOption('Divided Kingdom');
  const matching=await page.locator('.atlas-journey:visible').count();
  assert.ok(matching>0,'Combined Elijah search and era filter should find journeys');
  assert.equal(Number(await page.locator('#journeyVisibleCount').innerText()),matching,'Visible journey count reflects combined filters');
  await page.locator('#journeyTypeFilter').selectOption('event');
  const combined=await page.locator('.atlas-journey:visible').count();
  assert.ok(combined<=matching,'Adding type filter must not increase matches');
  assert.equal(Number(await page.locator('#journeyVisibleCount').innerText()),combined,'Visible count reflects triple-filter matches');
  await page.locator('#journeySearch').fill('NO_MATCH_MYBIBLE_2030');
  assert.equal(await page.locator('.atlas-journey:visible').count(),0,'Impossible query has zero matches');
  assert.equal(await page.locator('#journeyVisibleCount').innerText(),'0','No-match count reads zero');
  assert.equal(await page.locator('#journeyEmpty').isVisible(),true,'Empty-state explanation visible');
  await page.locator('#journeyReset').click();
  assert.equal(await page.locator('#journeySearch').inputValue(),'','Reset clears journey search');
  assert.equal(await page.locator('#journeyEraFilter').inputValue(),'','Reset clears era');
  assert.equal(await page.locator('#journeyTypeFilter').inputValue(),'','Reset clears type');
  assert.equal(await page.locator('#journeySort').inputValue(),'scripture','Reset returns Biblical order');
  assert.equal(await page.locator('.atlas-journey:visible').count(),allJourneys,'Reset restores all journeys');
  assert.equal(await page.locator('#journeyEmpty').isVisible(),false,'Reset removes empty state');
  assert.deepEqual(await page.locator('.atlas-journey').evaluateAll(cards=>cards.map(c=>c.dataset.journeyOrder)),biblicalOrder,'Reset restores original Scripture order');

  await page.locator('#journeySearch').fill('Abraham');
  await page.locator('#journeySort').selectOption('az');
  const journeyBeforePlace=await page.locator('.atlas-journey:visible').count();
  assert.ok(journeyBeforePlace>0,'Filtered journey list should have matches before opening a place');
  const selectedPlaceButton=page.locator('.atlas-journey:visible .atlas-journey-stop').first();
  await selectedPlaceButton.click();
  assert.equal(await page.locator('#collectionGrid .place-card').count(),1,'Filtered journey stop opens a place');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#journeySearch').waitFor();
  assert.equal(await page.locator('#journeySearch').inputValue(),'Abraham','Back restores journey search');
  assert.equal(await page.locator('#journeySort').inputValue(),'az','Back restores journey sort');
  assert.equal(await page.locator('.atlas-journey:visible').count(),journeyBeforePlace,'Back restores matching journey results');
  await page.locator('#journeyReset').click();
  await page.locator('#collectionGrid .atlas-journey-stop[data-journey-place="Haran"]').first().click();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Haran');
  assert.equal(await page.locator('#collectionGrid .place-card').count(),1,'Journey stop must open exactly one Atlas place');
  await page.locator('#backNavigationBtn').click();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'');
  await page.locator('#collectionFilter').fill('Egypt');
  await page.locator('#collectionFilter').fill('');
  await page.locator('#realBibleAtlas .atlas-geopoint').first().click();
  await page.locator('.maplibregl-popup-content [data-atlas-place]').first().click();
  assert.ok((await page.locator('#collectionFilter').inputValue()).length>0);
  assert.equal(await page.locator('#collectionGrid .place-card').count(),1,'Clicking geographic marker should select one place');
  await page.locator('#collectionFilter').fill('Egypt');
  const backToPerson=page.locator('#collectionGrid .place-card a[href*="chronology.html?person=Moses"]');
  const locationEvidence=page.locator('#collectionGrid .place-card .atlas-person-link .ref-chip');
  assert.ok(await locationEvidence.count()>0,'Atlas person-place relationship must show Scripture evidence');
  await backToPerson.waitFor();
  await backToPerson.click();
  await page.locator('#detail').getByText('Moses',{exact:false}).waitFor();
  assert.match(page.url(),/chronology.html\?person=Moses/);

  await page.goto('http://127.0.0.1:8765/chronology.html?person=David', { waitUntil: 'networkidle' });
  assert.match(await page.locator('#detail').innerText(), /David|大卫/);
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
  // Cross-reference navigation: singular Psalm and abbreviated Scripture book names.
  await page.evaluate(()=>document.querySelector('#globalSearch')?.blur());
  await page.locator('#mobileReaderToggle').click();
  await page.locator('#bookSelect').selectOption('0');
  await page.locator('#chapterSelect').selectOption('1');
  await page.locator('#verseList .verse-row').first().waitFor();
  const swipeTarget=page.locator('#verseList');
  const dispatchSwipe=async(fromX,toX)=>{
    await swipeTarget.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:fromX,clientY:280}]});
    await swipeTarget.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:toX,clientY:287}]});
  };
  await dispatchSwipe(310,130);
  await page.waitForFunction(()=>document.querySelector('#chapterSelect')?.value==='2');
  await dispatchSwipe(110,295);
  await page.waitForFunction(()=>document.querySelector('#chapterSelect')?.value==='1');
  for(const mode of ['white','dark','gray','current']){
    await page.locator('#readerBackground').selectOption(mode);
    assert.equal(await page.locator('#readerPage').getAttribute('data-reader-background'),mode,'Bible background '+mode+' selected');
  }
  await page.locator('#readerBackground').selectOption('gray');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#readerBackground').inputValue(),'gray','Bible background persists after reload');
  for(const bg of ['white','gray','dark','current']){
    await page.locator('#readerBackground').selectOption(bg);
    const textColor=await page.locator('#verseList .verse-row.highlighted .verse-cell').first().evaluate(el=>getComputedStyle(el).color);
    assert.equal(textColor,'rgb(25, 35, 45)','Highlight text stays readable on '+bg+' background');
  }
  await page.locator('#readerBackground').selectOption('current');
  assert.equal(await page.locator('#mobileReaderToggle').getAttribute('aria-expanded'),'true','Mobile reader menu preference restored after reload');
  await page.locator('#mobileReaderToggle').click();
  assert.equal(await page.locator('#mobileReaderToggle').getAttribute('aria-expanded'),'false','Mobile reading toolbar collapses');
  await page.locator('#mobileReaderToggle').click();
  assert.equal(await page.locator('#mobileReaderToggle').getAttribute('aria-expanded'),'true','Mobile toolbar expands after reading controls');
  const verseFontBefore=await page.locator('.verse-cell').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  await page.locator('#bibleFontPlus').click();
  const verseFontAfter=await page.locator('.verse-cell').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(verseFontAfter>verseFontBefore,'Bible A+ enlarges Scripture text');
  await page.locator('#bibleFontMinus').click();
  const verseFontReset=await page.locator('.verse-cell').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(Math.abs(verseFontReset-verseFontBefore)<.2,'Bible A− restores font size after A+');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#verseList .verse-row').first().waitFor();
  const persistedFont=await page.locator('.verse-cell').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(Math.abs(persistedFont-verseFontReset)<.2,'Bible font preference persists after reload');
  const verseTouch=page.locator('#verseList .verse-row').first();
  await verseTouch.dispatchEvent('pointerdown',{pointerType:'touch',clientX:10,clientY:10});
  await page.waitForTimeout(1250);
  assert.ok(await verseTouch.evaluate(el=>el.classList.contains('verse-tools-visible')),'Touch hold reveals verse tools without opening drawer');
  assert.equal(await page.locator('#studyDrawer.open').count(),0,'Long press does not open study drawer');
  await verseTouch.dispatchEvent('pointerup',{pointerType:'touch'});
  await page.waitForTimeout(300);
  await verseTouch.click();
  assert.equal(await page.locator('#studyDrawer.open').count(),1,'Single click opens verse study drawer');
  await page.locator('#closeDrawer').click();
  assert.equal(await page.locator('#verseList .verse-tools-visible').count(),0,'Closing drawer clears long-press tools');
  await verseTouch.dispatchEvent('pointerdown',{pointerType:'touch',clientX:14,clientY:14});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#verseList .verse-tools-visible').count(),1,'Long-press reveals controls');
  await verseTouch.dispatchEvent('pointerup',{pointerType:'touch'});
  await page.locator('#bibleFontPlus').click();
  assert.equal(await page.locator('#verseList .verse-tools-visible').count(),0,'Outside controls dismiss revealed verse tools');
  await page.locator('#bibleFontMinus').click();
  await page.locator('#verseList .verse-row').first().click();
  assert.equal(await page.locator('#studyDrawer .highlight-swatch').count(),10,'Ten Scripture highlight colors available');
  await page.locator('#studyDrawer .highlight-swatch[data-highlight-color="blue"]').click();
  assert.ok(await page.locator('#verseList .verse-row').first().evaluate(el=>el.classList.contains('highlighted')),'Blue color highlights passage');
  assert.match(await page.locator('#verseList .verse-row').first().getAttribute('style'),/90caf9/,'Blue is stored on verse');
  await page.locator('#readerBackground').selectOption('dark');
  const contrast=await page.locator('#verseList .verse-row.highlighted .verse-cell').first().evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.verse-row')).backgroundColor}));
  assert.equal(contrast.color,'rgb(25, 35, 45)','Highlighted verses use dark lettering on dark Reader backgrounds');
  await page.locator('#readerBackground').selectOption('current');
  await page.locator('#closeDrawer').click();
  assert.equal(await page.locator('#verseList .verse-row.selected').count(),0,'Closing study drawer clears selected verse actions');
  await page.locator('#verseList .verse-row').first().click();
  await page.locator('.drawer-tab[data-tab="crossrefs"]').click();
  const psalmChip=page.locator('#studyDrawer .drawer-ref[data-ref="Psalm 33:6"]');
  await psalmChip.waitFor({timeout:15000});
  await psalmChip.click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='18' && document.querySelector('#chapterSelect')?.value==='33',{timeout:15000});
  assert.match(await page.locator('#studyDrawer').innerText(),/Genesis|创世记|诗篇|Psalm/);
  // Verify abbreviations and Chinese compact references through the actual search UI.
  await page.locator('#closeDrawer').click();
  for(const [reference,book,chapter,verse] of [
    ['Psalm 33:6','18','33','6'],
    ['Psa 33:6','18','33','6'],
    ['诗篇33:6','18','33','6'],
    ['Matt 5:3','39','5','3'],
    ['Jn 1:1','42','1','1'],
    ['Heb 11:3','57','11','3'],
    ['1John 1:1','61','1','1'],
    ['Ps 33:6','18','33','6'],
    ['Psalm 33:6-9','18','33','6'],
    ['诗篇 33：6','18','33','6'],
    ['Matt. 5:3','39','5','3'],
    ['Rev 21:1','65','21','1'],
    ['2Tim 3:16','54','3','16'],
    ['Exod 20:1','1','20','1']
  ]){
    await page.keyboard.press('Control+k');
    await page.locator('#searchModal:not(.hidden)').waitFor();
    await page.locator('#globalSearch').fill(reference);
    const jump=page.locator('#searchResults .search-result[data-jump]').first();
    await page.waitForFunction(expected=>document.querySelector('#searchResults .search-result[data-jump]')?.dataset.jump===expected,[book,chapter,verse].join('|'),{timeout:10000});
    assert.equal(await jump.getAttribute('data-jump'),[book,chapter,verse].join('|'),'Reference parsed: '+reference);
    await jump.click();
    await page.waitForFunction(([b,ch])=>document.querySelector('#bookSelect')?.value===b&&document.querySelector('#chapterSelect')?.value===ch,[book,chapter]);
  }
  // Back should restore the prior Scripture passage, not merely the Bible tab.
  await page.locator('#searchBtn').evaluate(el=>el.click());
  await page.locator('#globalSearch').fill('Genesis 1:1');
  await page.waitForFunction(()=>document.querySelector('#searchResults [data-jump]')?.dataset.jump==='0|1|1');
  await page.locator('#searchResults [data-jump]').first().click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='0');
  await page.locator('#searchBtn').evaluate(el=>el.click());
  await page.locator('#globalSearch').fill('Psalm 33:6');
  await page.waitForFunction(()=>document.querySelector('#searchResults [data-jump]')?.dataset.jump==='18|33|6');
  await page.locator('#searchResults [data-jump]').first().click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='18');
  await page.locator('#backNavigationBtn').click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='0' && document.querySelector('#chapterSelect')?.value==='1');
  // Multiple Scripture-reference hops must unwind one passage at a time.
  for(const [query,expected] of [['John 1:1','42|1|1'],['Heb 11:3','57|11|3']]){
    await page.keyboard.press('Control+k');
    await page.locator('#globalSearch').fill(query);
    await page.waitForFunction(value=>document.querySelector('#searchResults [data-jump]')?.dataset.jump===value,expected);
    await page.locator('#searchResults [data-jump]').first().click();
    await page.waitForFunction(value=>{
      const [bi,ch]=value.split('|');return document.querySelector('#bookSelect')?.value===bi&&document.querySelector('#chapterSelect')?.value===ch;
    },expected);
  }
  await page.locator('#backNavigationBtn').click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='42'&&document.querySelector('#chapterSelect')?.value==='1');
  await page.locator('#backNavigationBtn').click();
  await page.waitForFunction(()=>document.querySelector('#bookSelect')?.value==='0'&&document.querySelector('#chapterSelect')?.value==='1');
  await page.locator('.nav-btn[data-page="timeline"]').click();
  await page.locator('#timelinePage.active').waitFor();
  // A timeline Scripture link must return to Timeline, not directly to Reader.
  const timelinePassage=page.locator('#timelineList .timeline-ref[data-ref]').first();
  await timelinePassage.waitFor();
  await timelinePassage.click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#timelinePage.active').waitFor();
  // Preserve selected historical period across a Scripture visit and return.
  await page.locator('#timelineControls [data-era="Patriarchs"]').click();
  assert.equal(await page.locator('#timelineControls [data-era="Patriarchs"]').getAttribute('class').then(x=>x.includes('active')),true);
  const periodPassage=page.locator('#timelineList .timeline-ref[data-ref]').first();
  await periodPassage.click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#timelinePage.active').waitFor();
  assert.match(await page.locator('#timelineControls [data-era="Patriarchs"]').getAttribute('class'),/active/,'Timeline period survives Scripture navigation');
  await page.locator('#timelineControls [data-era="ALL"]').click();
  // The same holds for an Explore collection Scripture chip.
  await page.locator('.nav-btn[data-page="explore"]').click();
  await page.locator('#explorePage.active').waitFor();
  const explorePassage=page.locator('#collectionGrid .ref-chip[data-ref]').first();
  await explorePassage.waitFor();
  await explorePassage.click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  // Filtered Explore collection must survive a passage visit and Back.
  await page.locator('#exploreCategories [data-collection="people"]').click();
  await page.locator('#collectionFilter').fill('Moses');
  await page.locator('#collectionGrid .ref-chip[data-ref]').first().waitFor();
  const filteredCards=await page.locator('#collectionGrid .collection-card').count();
  assert.ok(filteredCards>0,'Moses explorer search finds study cards');
  await page.locator('#collectionGrid .ref-chip[data-ref="Hebrews 11:23-29"]').click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Moses','Back preserves Explore text filter');
  assert.match(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'Back preserves Explore category');
  assert.equal(await page.locator('#collectionGrid .collection-card').count(),filteredCards,'Back restores filtered Explore cards');
  // Revisit a different valid reference without losing the filtered People collection.
  await page.locator('#collectionGrid .ref-chip[data-ref="Hebrews 11:23-29"]').click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Moses','Repeated Bible visits preserve the same study filter');
  assert.match(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'Repeated Bible visits preserve People category');
  // A second People study must restore its own filter after following Scripture.
  await page.locator('#collectionFilter').fill('Aaron');
  await page.locator('#collectionGrid .ref-chip[data-ref="Exodus 4:14-16"]').first().waitFor();
  await page.locator('#collectionGrid .ref-chip[data-ref="Exodus 4:14-16"]').first().click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Aaron','Aaron study filter retained after Bible visit');
  assert.match(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'People category retained after Aaron study');
  // Switching People study queries without leaving Explore must not leak a prior filter.
  await page.locator('#collectionFilter').fill('Noah');
  await page.locator('#collectionGrid .ref-chip[data-ref="Hebrews 11:7"]').first().waitFor();
  await page.locator('#collectionGrid .ref-chip[data-ref="Hebrews 11:7"]').first().click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.equal(await page.locator('#collectionFilter').inputValue(),'Noah','Noah study filter restored');
  assert.match(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'Noah remains in People category');
  // Miracles and Parables Scripture links must restore the correct collection.
  for(const [category,filter,reference] of [
    ['jesusMiracles','Water into wine','John 2:1-11'],
    ['parables','Sower','Matthew 13:3-23']
  ]){
    await page.locator('#collectionFilter').fill('');
    await page.locator('#exploreCategories [data-collection="'+category+'"]').click();
    await page.locator('#collectionFilter').fill(filter);
    await page.locator('#collectionGrid .ref-chip[data-ref="'+reference+'"]').first().waitFor();
    await page.locator('#collectionGrid .ref-chip[data-ref="'+reference+'"]').first().click();
    await page.locator('#readerPage.active').waitFor();
    await page.locator('#backNavigationBtn').click();
    await page.locator('#explorePage.active').waitFor();
    assert.equal(await page.locator('#collectionFilter').inputValue(),filter,category+' filter restored');
    assert.match(await page.locator('#exploreCategories [data-collection="'+category+'"]').getAttribute('class'),/active/,category+' restored');
  }
  await page.locator('#collectionFilter').fill('');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.doesNotMatch(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'First Back restores previous Explore category');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.match(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'Third Back restores People study');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#explorePage.active').waitFor();
  assert.doesNotMatch(await page.locator('#exploreCategories [data-collection="people"]').getAttribute('class'),/active/,'Fourth Back restores earlier Explore collection');
  await page.locator('#backNavigationBtn').click();
  await page.locator('#timelinePage.active').waitFor();

  await page.locator('#backNavigationBtn').click();
  await page.locator('#readerPage.active').waitFor();
  await page.locator('.nav-btn[data-page="explore"]').click();
  await page.locator('#explorePage.active').waitFor();
  await page.locator('#backNavigationBtn').click();
  await page.locator('#readerPage.active').waitFor();
  await page.goto('http://127.0.0.1:8765/chronology.html?person=David', { waitUntil: 'networkidle' });
  await page.locator('#chronologyBackBtn').click();
  await page.locator('#readerPage.active').waitFor({timeout:30000}); // Origin was the reader, not Explore.
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS mobile Chromium chronology interactions, filters, deep links, connectors and runtime');
} finally {
  await browser.close();
}
