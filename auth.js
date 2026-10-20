(() => {
  'use strict';

  const cfg = window.MYBIBLE_CONFIG?.backend?.supabase || {};
  const apiKey = cfg.publishableKey || cfg.anonKey;
  const state = { client:null, user:null, profile:null, preferences:null };

  function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function redirectUrl(){ return location.origin + location.pathname; }
  function message(text,type='info'){ const el=document.querySelector('#authMessage'); if(!el)return; el.hidden=false; el.textContent=text; el.className='auth-message '+type; }
  function clearMessage(){ const el=document.querySelector('#authMessage'); if(el){el.hidden=true;el.textContent='';} }

  function ensureModal(){
    if(document.querySelector('#authModal')) return;
    const modal=document.createElement('div');
    modal.id='authModal';
    modal.className='auth-modal hidden';
    modal.innerHTML=
      '<div class="auth-backdrop" data-auth-close></div>'+
      '<section class="auth-shell" role="dialog" aria-modal="true" aria-labelledby="authTitle">'+
      '<button class="auth-close" type="button" data-auth-close>×</button>'+
      '<div class="auth-art"><div class="auth-lamp">✦</div><div class="auth-script">אוֹר · λόγος</div><h2>MyBible</h2>'+
      '<p>“Your word is a lamp to my feet and a light to my path.”</p><small>Psalm 119:105</small></div>'+
      '<div class="auth-panel"><div class="auth-kicker">LAMP & WORD</div><h2 id="authTitle"></h2>'+
      '<p id="authSubtitle"></p><div id="authMessage" class="auth-message" hidden></div>'+
      '<form id="authForm"></form><div id="authLinks" class="auth-links"></div></div></section>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-auth-close]').forEach(x=>x.onclick=()=>modal.classList.add('hidden'));
  }

  function open(mode='login'){ ensureModal(); document.querySelector('#authModal').classList.remove('hidden'); render(mode); }

  function render(mode){
    clearMessage();
    const title=document.querySelector('#authTitle');
    const sub=document.querySelector('#authSubtitle');
    const form=document.querySelector('#authForm');
    const links=document.querySelector('#authLinks');
    if(!form) return;

    if(mode==='signup'){
      title.textContent='注册 · Create Account';
      sub.textContent='建立个人 MyBible 帐户，启用安全的云端研读空间。';
      form.innerHTML='<label>Name 姓名<input name="name" autocomplete="name" required></label>'+
        '<label>Email<input type="email" name="email" autocomplete="email" required></label>'+
        '<label>Password 密码<input type="password" name="password" autocomplete="new-password" minlength="6" required></label>'+
        '<label>Confirm Password 确认密码<input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>'+
        '<button class="auth-primary" type="submit">创建帐户 · Sign Up</button>';
      links.innerHTML='<button type="button" data-mode="login">已有帐户？登录 · Sign In</button>';
      form.onsubmit=signup;
    } else if(mode==='forgot'){
      title.textContent='重设密码 · Reset Password';
      sub.textContent='输入注册邮箱，我们会发送密码重设链接。';
      form.innerHTML='<label>Email<input type="email" name="email" autocomplete="email" required></label>'+
        '<button class="auth-primary" type="submit">发送重设链接 · Send Link</button>';
      links.innerHTML='<button type="button" data-mode="login">返回登录 · Back to Sign In</button>';
      form.onsubmit=forgot;
    } else if(mode==='reset'){
      title.textContent='设置新密码 · New Password';
      sub.textContent='为你的 MyBible 帐户设置新的密码。';
      form.innerHTML='<label>New Password 新密码<input type="password" name="password" autocomplete="new-password" minlength="6" required></label>'+
        '<button class="auth-primary" type="submit">更新密码 · Update Password</button>';
      links.innerHTML='';
      form.onsubmit=resetPassword;
    } else if(mode==='profile'){
      const name=state.profile?.display_name || state.user?.user_metadata?.display_name || 'Reader';
      title.textContent='我的帐户 · My Account';
      sub.textContent=state.user?.email || '';
      form.innerHTML='<label>Display Name 显示名称<input name="name" value="'+esc(name)+'" required></label>'+
        '<button class="auth-primary" type="submit">保存 · Save</button>'+
        '<button class="auth-secondary" type="button" id="authLogout">退出登录 · Sign Out</button>';
      links.innerHTML='<div class="auth-sync-status">☁ Cloud sync active · 云端同步已启用</div>';
      links.innerHTML+='<button type="button" id="authGuestImport">Import guest study data · 导入本机资料</button>';
      form.onsubmit=saveProfile;
      form.querySelector('#authLogout').onclick=logout;
    } else {
      title.textContent='登录 · Sign In';
      sub.textContent='登录后同步书签、笔记、亮色标记与阅读进度。';
      form.innerHTML='<label>Email<input type="email" name="email" autocomplete="email" required></label>'+
        '<label>Password 密码<input type="password" name="password" autocomplete="current-password" minlength="6" required></label>'+
        '<button class="auth-primary" type="submit">登录 · Sign In</button>';
      links.innerHTML='<button type="button" data-mode="forgot">忘记密码？ · Forgot Password</button>'+
        '<button type="button" data-mode="signup">建立帐户 · Create Account</button>';
      form.onsubmit=login;
    }
    links.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>render(b.dataset.mode));
  }

  async function login(e){
    e.preventDefault(); clearMessage();
    const f=new FormData(e.currentTarget);
    const {error}=await state.client.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});
    if(error) return message(error.message,'error');
    message('登录成功。正在启用云端同步…','success');
    setTimeout(()=>location.reload(),500);
  }

  async function signup(e){
    e.preventDefault(); clearMessage();
    const f=new FormData(e.currentTarget);
    const password=String(f.get('password')), confirm=String(f.get('confirm'));
    if(password!==confirm) return message('两次输入的密码不一致。','error');
    const name=String(f.get('name')).trim();
    const {data,error}=await state.client.auth.signUp({
      email:String(f.get('email')).trim(), password,
      options:{emailRedirectTo:redirectUrl(),data:{display_name:name,name}}
    });
    if(error) return message(error.message,'error');
    message(data.session?'注册成功。正在登录…':'注册成功。请检查邮箱并点击验证链接，然后返回 MyBible 登录。','success');
    if(data.session) setTimeout(()=>location.reload(),600);
  }

  async function forgot(e){
    e.preventDefault(); clearMessage();
    const f=new FormData(e.currentTarget);
    const {error}=await state.client.auth.resetPasswordForEmail(String(f.get('email')).trim(),{redirectTo:redirectUrl()});
    if(error) return message(error.message,'error');
    message('密码重设邮件已发送。请检查邮箱。','success');
  }

  async function resetPassword(e){
    e.preventDefault(); clearMessage();
    const f=new FormData(e.currentTarget);
    const {error}=await state.client.auth.updateUser({password:String(f.get('password'))});
    if(error) return message(error.message,'error');
    message('密码已更新。','success');
    setTimeout(()=>render('profile'),600);
  }

  async function logout(){ await state.client.auth.signOut(); location.reload(); }

  async function saveProfile(e){
    e.preventDefault(); clearMessage();
    const f=new FormData(e.currentTarget);
    const display_name=String(f.get('name')).trim() || 'Reader';
    const {error}=await state.client.from('profiles').upsert({id:state.user.id,display_name,email:state.user.email,updated_at:new Date().toISOString()});
    if(error) return message(error.message,'error');
    await state.client.auth.updateUser({data:{display_name}});
    state.profile={...(state.profile||{}),display_name};
    updateAccountButton();
    message('已保存。','success');
  }

  async function loadContext(){
    if(!state.user) return;
    const [p,u]=await Promise.all([
      state.client.from('profiles').select('display_name,email').eq('id',state.user.id).maybeSingle(),
      state.client.from('user_preferences').select('*').eq('user_id',state.user.id).maybeSingle()
    ]);
    if(!p.error) state.profile=p.data||null;
    if(!u.error) state.preferences=u.data||null;
    if(state.preferences?.theme) localStorage.setItem('csb.theme',state.preferences.theme);
    if(state.preferences?.font_scale) localStorage.setItem('csb.fontScale',String(state.preferences.font_scale));
    if(state.preferences?.ui_scale) localStorage.setItem('csb.uiScale',String(state.preferences.ui_scale));
    if(state.preferences?.audio_rate) localStorage.setItem('csb.originalAudioRate',String(state.preferences.audio_rate));
  }

  function ensureMobileEntry(){
    const hero=document.querySelector('#mybiblePage .my-hero > div:first-child');
    if(!hero) return null;
    let btn=document.querySelector('#mybibleLoginBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='mybibleLoginBtn';
      btn.type='button';
      btn.className='auth-entry-btn';
      btn.addEventListener('click',()=>open(state.user?'profile':'login'));
      hero.appendChild(btn);
    }
    return btn;
  }

  function updateAccountButton(){
    let b=document.querySelector('#accountBtn');
    if(!b){
      const host=document.querySelector('.top-actions'); if(!host)return;
      b=document.createElement('button'); b.id='accountBtn'; b.className='icon-btn account-btn'; b.type='button';
      host.appendChild(b); b.onclick=()=>open(state.user?'profile':'login');
    }
    const mobile=ensureMobileEntry();
    if(state.user){
      const n=state.profile?.display_name || state.user.user_metadata?.display_name || 'Reader';
      b.textContent=(n.trim()[0]||'R').toUpperCase(); b.classList.add('signed-in'); b.title=n+' · Cloud Sync';
      if(mobile){ mobile.textContent='我的帐户 · My Account'; mobile.classList.add('signed-in'); }
    }else{
      b.textContent='♙'; b.classList.remove('signed-in'); b.title='Sign In · 登录';
      if(mobile){ mobile.textContent='登录 / 注册 · Sign In / Sign Up'; mobile.classList.remove('signed-in'); }
    }
  }

  async function savePreferences(partial={}){
    if(!state.user) return;
    const row={user_id:state.user.id, ...{last_book:state.preferences?.last_book||null,last_chapter:state.preferences?.last_chapter||null,last_mode:state.preferences?.last_mode||null},theme:partial.theme||localStorage.getItem('csb.theme')||'light',
      font_scale:Number(partial.font_scale||localStorage.getItem('csb.fontScale')||1),ui_scale:Number(partial.ui_scale||localStorage.getItem('csb.uiScale')||1),audio_rate:Number(partial.audio_rate||localStorage.getItem('csb.originalAudioRate')||1),updated_at:new Date().toISOString()};
    if(partial.last_book!==undefined) row.last_book=partial.last_book;
    if(partial.last_chapter!==undefined) row.last_chapter=partial.last_chapter;
    if(partial.last_mode!==undefined) row.last_mode=partial.last_mode;
    const {error}=await state.client.from('user_preferences').upsert(row,{onConflict:'user_id'});
    if(error){console.warn('[MyBible] cloud preferences save failed:',error.message);return;}
    state.preferences={...(state.preferences||{}),...row};
  }

  async function saveReadingPosition(pos={}){
    if(!state.user || !pos.book_osis || !pos.chapter) return;
    await savePreferences({last_book:pos.book_osis,last_chapter:Number(pos.chapter),last_mode:pos.mode||null});
    await state.client.from('reading_progress').upsert({
      user_id:state.user.id,book_osis:pos.book_osis,chapter:Number(pos.chapter),last_verse:Number(pos.last_verse||1),
      completed:!!pos.completed,last_read_at:new Date().toISOString()
    },{onConflict:'user_id,book_osis,chapter'});
  }

  async function getDashboardData(){
    if(!state.user || !state.client) return {authenticated:false,readingCount:0,lastReading:null};
    const {data,error}=await state.client
      .from('reading_progress')
      .select('book_osis,chapter,last_verse,completed,last_read_at')
      .eq('user_id',state.user.id)
      .order('last_read_at',{ascending:false});
    if(error){
      console.warn('[MyBible] dashboard reading-progress query failed:',error.message);
      return {authenticated:true,readingCount:0,lastReading:null};
    }
    return {
      authenticated:true,
      readingCount:(data||[]).length,
      lastReading:(data||[])[0]||null
    };
  }

  async function getPrayerEntries(){
    if(!state.user || !state.client) return [];
    const {data,error}=await state.client
      .from('prayer_entries')
      .select('id,title,body,linked_verse_ref,status,created_at,updated_at')
      .eq('user_id',state.user.id)
      .order('updated_at',{ascending:false});
    if(error) throw error;
    return data||[];
  }

  async function savePrayerEntry(entry={}){
    if(!state.user || !state.client) throw new Error('Sign in required.');
    const payload={
      user_id:state.user.id,
      title:String(entry.title||'').trim(),
      body:String(entry.body||'').trim(),
      linked_verse_ref:String(entry.linked_verse_ref||'').trim()||null,
      status:['praying','waiting','answered','archived'].includes(entry.status)?entry.status:'praying',
      updated_at:new Date().toISOString()
    };
    if(entry.id){
      const {data,error}=await state.client.from('prayer_entries').update(payload).eq('id',entry.id).eq('user_id',state.user.id).select().single();
      if(error) throw error;
      return data;
    }
    const {data,error}=await state.client.from('prayer_entries').insert(payload).select().single();
    if(error) throw error;
    return data;
  }

  async function deletePrayerEntry(id){
    if(!state.user || !state.client) throw new Error('Sign in required.');
    const {error}=await state.client.from('prayer_entries').delete().eq('id',id).eq('user_id',state.user.id);
    if(error) throw error;
  }

  async function getSavedStudies(){
    if(!state.user || !state.client) return [];
    const {data,error}=await state.client
      .from('saved_studies')
      .select('id,title,description,content,created_at,updated_at')
      .eq('user_id',state.user.id)
      .order('updated_at',{ascending:false});
    if(error) throw error;
    return data||[];
  }

  async function saveStudy(entry={}){
    if(!state.user || !state.client) throw new Error('Sign in required.');
    const payload={
      user_id:state.user.id,
      title:String(entry.title||'').trim()||'Untitled Study',
      description:String(entry.description||'').trim(),
      content:entry.content && typeof entry.content==='object'?entry.content:{},
      updated_at:new Date().toISOString()
    };
    if(entry.id){
      const {data,error}=await state.client.from('saved_studies').update(payload).eq('id',entry.id).eq('user_id',state.user.id).select().single();
      if(error) throw error;
      return data;
    }
    const {data,error}=await state.client.from('saved_studies').insert(payload).select().single();
    if(error) throw error;
    return data;
  }

  async function deleteStudy(id){
    if(!state.user || !state.client) throw new Error('Sign in required.');
    const {error}=await state.client.from('saved_studies').delete().eq('id',id).eq('user_id',state.user.id);
    if(error) throw error;
  }

  async function init(){
    if(!cfg.url || !apiKey || !window.supabase?.createClient) return;
    state.client=window.supabase.createClient(cfg.url,apiKey,{db:{schema:cfg.schema||'public'},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await state.client.auth.getSession();
    state.user=data?.session?.user||null;
    await loadContext();
    ensureModal(); updateAccountButton();
    state.client.auth.onAuthStateChange(async(event,session)=>{
      state.user=session?.user||null;
      if(event==='PASSWORD_RECOVERY'){ open('reset'); return; }
      if(state.user) await loadContext();
      updateAccountButton();
    });
  }

  window.MyBibleAuth={
    get client(){return state.client;},
    get user(){return state.user;},
    get profile(){return state.profile;},
    get preferences(){return state.preferences;},
    open,savePreferences,saveReadingPosition,getDashboardData,
    getPrayerEntries,savePrayerEntry,deletePrayerEntry,
    getSavedStudies,saveStudy,deleteStudy
  };
  window.MyBibleAuthReady=init().catch(err=>console.warn('[MyBible] auth init failed:',err));
})();