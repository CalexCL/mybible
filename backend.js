(() => {
  'use strict';

  const cfg = window.MYBIBLE_CONFIG?.backend || { provider: 'local' };
  const KEYS = {
    notes: 'csb.notes',
    bookmarks: 'csb.bookmarks',
    highlights: 'csb.highlights'
  };

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  class LocalStudyBackend {
    constructor() { this.name = 'local'; }
    async init() { return { provider: this.name, authenticated: false }; }
    async loadStudyData() {
      return {
        notes: safeParse(localStorage.getItem(KEYS.notes), {}),
        bookmarks: safeParse(localStorage.getItem(KEYS.bookmarks), {}),
        highlights: safeParse(localStorage.getItem(KEYS.highlights), {})
      };
    }
    async saveStudyData(data) {
      localStorage.setItem(KEYS.notes, JSON.stringify(data.notes || {}));
      localStorage.setItem(KEYS.bookmarks, JSON.stringify(data.bookmarks || {}));
      localStorage.setItem(KEYS.highlights, JSON.stringify(data.highlights || {}));
    }
    async status() {
      return { provider: this.name, authenticated: false, sync: 'device-only' };
    }
  }

  class SupabaseStudyBackend {
    constructor(options) {
      this.name = 'supabase';
      this.options = options || {};
      this.client = null;
      this.user = null;
    }

    async init() {
      this.client = window.MyBibleAuth?.client || null;
      this.user = window.MyBibleAuth?.user || null;
      if (!this.client || !this.user) throw new Error('No authenticated Supabase session.');
      return { provider: this.name, authenticated: true, userId: this.user.id };
    }

    async loadStudyData() {
      if (!this.client || !this.user) throw new Error('Supabase backend is not initialized.');
      const uid = this.user.id;
      const [notes, bookmarks, highlights] = await Promise.all([
        this.client.from('bible_notes').select('verse_ref,note_text,updated_at').eq('user_id', uid),
        this.client.from('bible_bookmarks').select('verse_ref,created_at').eq('user_id', uid),
        this.client.from('bible_highlights').select('verse_ref,color,created_at').eq('user_id', uid)
      ]);
      for (const result of [notes, bookmarks, highlights]) if (result.error) throw result.error;
      this.snapshot={bible_notes:new Set((notes.data||[]).map(r=>r.verse_ref)),bible_bookmarks:new Set((bookmarks.data||[]).map(r=>r.verse_ref)),bible_highlights:new Set((highlights.data||[]).map(r=>r.verse_ref))};
      const cloud = {
        notes: Object.fromEntries((notes.data || []).map(r => [r.verse_ref, { text: r.note_text, updated: Date.parse(r.updated_at) || Date.now() }])),
        bookmarks: Object.fromEntries((bookmarks.data || []).map(r => [r.verse_ref, { created: Date.parse(r.created_at) || Date.now() }])),
        highlights: Object.fromEntries((highlights.data || []).map(r => [r.verse_ref, { color: r.color || 'gold', created: Date.parse(r.created_at) || Date.now() }]))
      };

      const migrationKey = 'mybible.cloudMigrated.' + uid;
      const local = {
        notes: safeParse(localStorage.getItem(KEYS.notes), {}),
        bookmarks: safeParse(localStorage.getItem(KEYS.bookmarks), {}),
        highlights: safeParse(localStorage.getItem(KEYS.highlights), {})
      };
      const cloudHasData = Object.values(cloud).some(group => Object.keys(group || {}).length);
      const localHasData = Object.values(local).some(group => Object.keys(group || {}).length);

      if (!localStorage.getItem(migrationKey) && !cloudHasData && localHasData) {
        await this.saveStudyData(local);
        localStorage.setItem(migrationKey, '1');
        return local;
      }

      localStorage.setItem(migrationKey, '1');
      return cloud;
    }

    async saveStudyData(data) {
      if (!this.client || !this.user) throw new Error('Supabase backend is not initialized.');
      const uid = this.user.id;
      const noteRows = Object.entries(data.notes || {}).map(([verse_ref, v]) => ({ user_id: uid, verse_ref, note_text: v.text || '' }));
      const bookmarkRows = Object.entries(data.bookmarks || {}).map(([verse_ref]) => ({ user_id: uid, verse_ref }));
      const highlightRows = Object.entries(data.highlights || {}).map(([verse_ref, v]) => ({ user_id: uid, verse_ref, color: v.color || 'gold' }));

      // Incremental synchronization: do not clear complete tables before writes.
      // Preserve cloud data on other devices and only remove refs previously loaded here.
      const tables = [
        ['bible_notes', noteRows],
        ['bible_bookmarks', bookmarkRows],
        ['bible_highlights', highlightRows]
      ];
      if (!this.snapshot) this.snapshot = {};
      for (const [table, rows] of tables) {
        const previous = this.snapshot[table] || new Set();
        const current = new Set(rows.map(row => row.verse_ref));
        if (rows.length) {
          const { error } = await this.client.from(table).upsert(rows,{onConflict:'user_id,verse_ref'});
          if (error) throw error;
        }
        for (const verseRef of previous) {
          if (!current.has(verseRef)) {
            const {error}=await this.client.from(table).delete().eq('user_id',uid).eq('verse_ref',verseRef);
            if(error)throw error;
          }
        }
        this.snapshot[table] = current;
      }
    }

    async status() {
      return { provider: this.name, authenticated: !!this.user, userId: this.user?.id || null, sync: 'cloud' };
    }
  }

  async function createBackend() {
    try {
      if (window.MyBibleAuth?.user) {
        const b = new SupabaseStudyBackend(cfg.supabase || {});
        await b.init();
        return b;
      }
    } catch (error) {
      console.warn('[MyBible] Supabase unavailable; falling back to local storage:', error.message);
    }
    const local = new LocalStudyBackend();
    await local.init();
    return local;
  }

  window.MyBibleBackend = {
    createBackend,
    LocalStudyBackend,
    SupabaseStudyBackend
  };
})();
