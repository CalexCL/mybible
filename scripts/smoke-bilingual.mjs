import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1080,height:820}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/versions/en/kjv/books/John.json',route=>route.fulfill({
 status:200,contentType:'application/json',
 body:JSON.stringify({version:'kjv',chapters:[{chapter:1,verses:[
 {number:1,text:'In the beginning was the Word, and the Word was with God, and the Word was God.'},
 {number:2,text:'The same was in the beginning with God.'}
 ]}]})
}));
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#bookSelect').waitFor({state:'visible',timeout:25000});
 await page.selectOption('#bookSelect','42');
 await page.locator('.mode-btn[data-mode="en"]').click();
 await page.locator('#verseList').getByText('In the beginning was the Word', {exact:false}).waitFor({timeout:25000});
 assert.equal(await page.locator('.mode-btn[data-mode="en"]').isDisabled(),false);
 assert.equal(await page.locator('.mode-btn[data-mode="parallel"]').isDisabled(),false);
 assert.equal(await page.getByRole('button',{name:/NKJV/}).isDisabled(),true);
 await page.locator('.mode-btn[data-mode="parallel"]').click();
 await page.locator('#verseList .en-cell').first().getByText('In the beginning was the Word',{exact:false}).waitFor();
 assert.ok(await page.locator('#verseList .zh-cell').count()>0);
 assert.ok(await page.locator('#verseList .verse-row').count()>0,'A verified Bible chapter renders verses');
 // Verify the service worker precaches the Reader's structural data before offline use.
 await page.waitForFunction(()=>navigator.serviceWorker?.controller||false,{timeout:20000});
 const offlineAssets=await page.evaluate(async()=>{
   const c=await caches.open('mybible-shell-v133');
   return Promise.all(['./index.html','./data/books.json','./data/study.json','./data/cuvs_local.json'].map(async p=>({path:p,cached:!!(await c.match(p))})));
 });
 assert.ok(offlineAssets.every(item=>item.cached),'Core Reader files must be cached for offline access: '+JSON.stringify(offlineAssets));
 await page.context().setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#bookSelect').waitFor({state:'visible',timeout:25000});
 assert.equal(await page.locator('#bookSelect option').count(),66,'Offline Bible book navigation remains available');
 await page.context().setOffline(false);
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS English KJV and Chinese-KJV parallel modes, NKJV license-locked');
}finally{await browser.close();}
