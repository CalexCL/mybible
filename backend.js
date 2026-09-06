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
      if (!this.options.enabled || !this.options.url || !this.options.anonKey) {
        throw new Error('Supabase is not configured.');
      }
      if (!window.supabase?.createClient) {
        throw new Error('Supabase JS client is not loaded. Add the official browser client before enabling the Supabase provider.');
      }
      this.client = window.supabase.createClient(this.options.url, this.options.anonKey, {
        db: { schema: this.options.schema || 'public' }
      });
      const { data } = await this.client.auth.getUser();
      this.user = data?.user || null;
      if (!this.user) throw new Error('Supabase is enabled but no authenticated user is available.');
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
      return {
        notes: Object.fromEntries((notes.data || []).map(r => [r.verse_ref, { text: r.note_text, updated: Date.parse(r.updated_at) || Date.now() }])),
        bookmarks: Object.fromEntries((bookmarks.data || []).map(r => [r.verse_ref, { created: Date.parse(r.created_at) || Date.now() }])),
        highlights: Object.fromEntries((highlights.data || []).map(r => [r.verse_ref, { color: r.color || 'gold', created: Date.parse(r.created_at) || Date.now() }]))
      };
    }

    async saveStudyData(data) {
      if (!this.client || !this.user) throw new Error('Supabase backend is not initialized.');
      const uid = this.user.id;
      const noteRows = Object.entries(data.notes || {}).map(([verse_ref, v]) => ({ user_id: uid, verse_ref, note_text: v.text || '' }));
      const bookmarkRows = Object.entries(data.bookmarks || {}).map(([verse_ref]) => ({ user_id: uid, verse_ref }));
      const highlightRows = Object.entries(data.highlights || {}).map(([verse_ref, v]) => ({ user_id: uid, verse_ref, color: v.color || 'gold' }));

      // This simple compatibility adapter replaces each user's current study layer.
      // Future versions can use finer-grained upsert/delete calls for large datasets.
      const tables = [
        ['bible_notes', noteRows],
        ['bible_bookmarks', bookmarkRows],
        ['bible_highlights', highlightRows]
      ];
      for (const [table, rows] of tables) {
        const del = await this.client.from(table).delete().eq('user_id', uid);
        if (del.error) throw del.error;
        if (rows.length) {
          const ins = await this.client.from(table).insert(rows);
          if (ins.error) throw ins.error;
        }
      }
    }

    async status() {
      return { provider: this.name, authenticated: !!this.user, userId: this.user?.id || null, sync: 'cloud' };
    }
  }

  async function createBackend() {
    if (cfg.provider === 'supabase' && cfg.supabase?.enabled) {
      try {
        const b = new SupabaseStudyBackend(cfg.supabase);
        await b.init();
        return b;
      } catch (error) {
        console.warn('[MyBible] Supabase unavailable; falling back to local storage:', error.message);
      }
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
