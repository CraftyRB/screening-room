/* Screening Room — local-first personal shelf */
(() => {
  'use strict';

  const KEY = 'screening-room.v1';
  const PROFILE_KEY = 'screening-room.profile';
  const SHARED_SEEN_KEY = 'screening-room.sharedSeen';
  const SHARED_SEEN_TIME_KEY = 'screening-room.sharedSeenTime';
  const CLOUD_NODE = 'screening-room';

  /* Shared library: ratings stay per profile, seen episodes sync across profiles. */
  const CLOUD_CONFIG = {
    apiKey: 'AIzaSyBImHItn0ENQPEatfD1uFzEYpkBnx9cCY0',
    authDomain: 'shows4smiles.firebaseapp.com',
    databaseURL: 'https://shows4smiles-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'shows4smiles',
    storageBucket: 'shows4smiles.firebasestorage.app',
    messagingSenderId: '1063404061114',
    appId: '1:1063404061114:web:c6219b048f2cbf77089d83'
  };
  const PROFILES = [
    { id: 'david', name: 'David', initials: 'DA' },
    { id: 'shanice', name: 'Shanice', initials: 'SH' }
  ];
  const DEFAULT_PROFILE = PROFILES[0].id;
  const SEED_VERSION = 3;
  const STATUS_ORDER = ['watching', 'watchlist', 'finished'];
  const SECTION_TITLE = { watching: 'In rotation', watchlist: 'Watchlist', finished: 'Seen' };
  const TYPE_LABEL = { film: 'Film', series: 'Series' };
  const CATALOGS = window.SR_EPISODE_CATALOGS || {};
  /* Key art via TVmaze, cached locally so the shelf never depends on a hotlink. */
  const MENTALIST_ART = new URL('media/the-mentalist.jpg', document.baseURI).href;

  function catalogFor(show) {
    if (!show || !show.episodeCatalog) return [];
    const list = CATALOGS[show.episodeCatalog];
    return Array.isArray(list) ? list : [];
  }

  function epCode(ep) { return ep.s + '-' + ep.e; }

  function catalogSeasons(catalog) {
    const groups = [];
    catalog.forEach(ep => {
      let group = groups.find(g => g.n === ep.s);
      if (!group) {
        group = { n: ep.s, eps: [] };
        groups.push(group);
      }
      if (!group.eps.some(x => x.e === ep.e)) group.eps.push(ep);
    });
    groups.sort((a, b) => a.n - b.n);
    groups.forEach(group => group.eps.sort((a, b) => a.e - b.e));
    return groups;
  }

  function watchedCount(show) {
    return Object.keys(show.episodeEntries).filter(key => show.episodeEntries[key].watched).length;
  }

  function normalizeEpisodeEntries(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).slice(0, 300).forEach(key => {
      if (!/^\d+-\d+$/.test(key)) return;
      const ep = raw[key];
      if (!ep || typeof ep !== 'object') return;
      const rating = clamp(Math.round(Number(ep.rating) || 0), 0, 10);
      const review = String(ep.review || '').slice(0, 3000);
      const watched = typeof ep.watched === 'boolean' ? ep.watched : (rating > 0 || review.trim().length > 0);
      out[key] = {
        rating,
        review,
        watched,
        updatedAt: Number(ep.updatedAt) || null
      };
    });
    return out;
  }

  const dom = {
    navShelf: document.getElementById('navShelf'),
    navJournal: document.getElementById('navJournal'),
    navCountShelf: document.getElementById('navCountShelf'),
    navCountJournal: document.getElementById('navCountJournal'),
    addBtn: document.getElementById('addBtn'),
    avatarBtn: document.getElementById('avatarBtn'),
    profileMenu: document.getElementById('profileMenu'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    clearBtn: document.getElementById('clearBtn'),
    cloudNote: document.getElementById('cloudNote'),
    shelfPage: document.getElementById('shelfPage'),
    journalPage: document.getElementById('journalPage'),
    shelfSubline: document.getElementById('shelfSubline'),
    journalSubline: document.getElementById('journalSubline'),
    samplerNotice: document.getElementById('samplerNotice'),
    samplerCopy: document.getElementById('samplerCopy'),
    clearSampler: document.getElementById('clearSampler'),
    dismissNotice: document.getElementById('dismissNotice'),
    ledger: document.getElementById('ledger'),
    ledgerTitles: document.getElementById('ledgerTitles'),
    ledgerWatching: document.getElementById('ledgerWatching'),
    ledgerAvg: document.getElementById('ledgerAvg'),
    ledgerNotes: document.getElementById('ledgerNotes'),
    shelfToolbar: document.getElementById('shelfToolbar'),
    shelfSearch: document.getElementById('shelfSearch'),
    statusChips: document.getElementById('statusChips'),
    countAll: document.getElementById('countAll'),
    countWatching: document.getElementById('countWatching'),
    countWatchlist: document.getElementById('countWatchlist'),
    countFinished: document.getElementById('countFinished'),
    genreSelect: document.getElementById('genreSelect'),
    sortSelect: document.getElementById('sortSelect'),
    shelfSections: document.getElementById('shelfSections'),
    shelfEmpty: document.getElementById('shelfEmpty'),
    journalToolbar: document.getElementById('journalToolbar'),
    journalSearch: document.getElementById('journalSearch'),
    journalChips: document.getElementById('journalChips'),
    jCountAll: document.getElementById('jCountAll'),
    jCountReview: document.getElementById('jCountReview'),
    jCountNote: document.getElementById('jCountNote'),
    journalFeed: document.getElementById('journalFeed'),
    drawer: document.getElementById('drawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerClose: document.getElementById('drawerClose'),
    drawerContent: document.getElementById('drawerContent'),
    modal: document.getElementById('titleModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalClose: document.getElementById('modalClose'),
    modalCancel: document.getElementById('modalCancel'),
    modalKicker: document.getElementById('modalKicker'),
    modalTitle: document.getElementById('modalTitle'),
    titleForm: document.getElementById('titleForm'),
    fTitle: document.getElementById('fTitle'),
    fYear: document.getElementById('fYear'),
    fCreator: document.getElementById('fCreator'),
    fGenres: document.getElementById('fGenres'),
    fEpisodes: document.getElementById('fEpisodes'),
    fPoster: document.getElementById('fPoster'),
    episodesField: document.getElementById('episodesField'),
    typeSeg: document.getElementById('typeSeg'),
    statusSeg: document.getElementById('statusSeg'),
    titleError: document.getElementById('titleError'),
    posterError: document.getElementById('posterError'),
    formSubmit: document.getElementById('formSubmit'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toastMsg'),
    toastAction: document.getElementById('toastAction')
  };

  const ui = {
    page: 'shelf',
    status: 'all',
    genre: 'all',
    sort: 'added',
    query: '',
    jType: 'all',
    jQuery: '',
    drawerId: null,
    episodeCode: null,
    epSeason: 1,
    epScroll: 0,
    confirmRemove: false,
    editingId: null,
    lastFocus: null,
    modalFocus: null
  };

  let state;
  let activeProfile = DEFAULT_PROFILE;
  let saveTimer = null;
  let shelfRefreshTimer = null;
  let toastTimer = null;
  let toastCallback = null;
  let storageWarned = false;

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const fmtDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtStamp = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  /* ---------- helpers ---------- */

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 's-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHTML(value); }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function initialOf(title) {
    const chars = Array.from(String(title || '').trim());
    return chars.length ? chars[0].toUpperCase() : '·';
  }

  function plateClass(show) {
    let hash = 0;
    for (const ch of String(show.title || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return 'plate-' + (hash % 6 + 1);
  }

  function validPoster(raw) {
    if (!raw) return '';
    try {
      const url = new URL(String(raw).trim());
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch (err) {
      return '';
    }
  }

  function parseGenres(raw) {
    const merged = Array.isArray(raw) ? raw.join(',') : String(raw || '');
    const out = [];
    const seen = new Set();
    merged.split(/[,;、]+/).forEach(part => {
      const name = part.trim().slice(0, 32);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (out.length < 6) out.push(name);
    });
    return out;
  }

  function fmt(ts, formatter) {
    const date = new Date(Number(ts) || Date.now());
    return formatter.format(date);
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  function getShow(id) {
    return state.shows.find(s => s.id === id) || null;
  }

  function dataKey(profileId) { return KEY + ':' + profileId; }

  function profileMeta(profileId) {
    return PROFILES.find(p => p.id === profileId) || PROFILES[0];
  }

  function readProfile() {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      return PROFILES.some(p => p.id === saved) ? saved : DEFAULT_PROFILE;
    } catch (err) {
      return DEFAULT_PROFILE;
    }
  }

  function migrateLegacyProfile() {
    try {
      if (localStorage.getItem(dataKey(DEFAULT_PROFILE))) return;
      const legacy = localStorage.getItem(KEY);
      if (!legacy) return;
      localStorage.setItem(dataKey(DEFAULT_PROFILE), legacy);
      localStorage.removeItem(KEY);
    } catch (err) {
      console.warn('Screening Room: could not migrate saved library.', err);
    }
  }

  function readSharedSeen() {
    try {
      const raw = localStorage.getItem(SHARED_SEEN_KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      return {};
    }
  }

  function readSeenTime() {
    try {
      return Number(localStorage.getItem(SHARED_SEEN_TIME_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function writeSharedSeen(shared, at) {
    try {
      localStorage.setItem(SHARED_SEEN_KEY, JSON.stringify(shared));
      localStorage.setItem(SHARED_SEEN_TIME_KEY, String(Number(at) >= 0 ? Number(at) : Date.now()));
    } catch (err) {
      console.warn('Screening Room: could not save shared seen state.', err);
    }
  }

  function collectSeenFromStore(profileId, catalogId) {
    const out = {};
    try {
      const raw = localStorage.getItem(dataKey(profileId));
      if (!raw) return out;
      const data = JSON.parse(raw);
      const shows = Array.isArray(data) ? data : (data && Array.isArray(data.shows) ? data.shows : []);
      shows.forEach(show => {
        if (!show || show.episodeCatalog !== catalogId || !show.episodeEntries) return;
        Object.keys(show.episodeEntries).forEach(key => {
          if (show.episodeEntries[key] && show.episodeEntries[key].watched) out[key] = true;
        });
      });
    } catch (err) {
      return out;
    }
    return out;
  }

  function setSharedSeen(show, key, watched) {
    if (!show || !show.episodeCatalog) return;
    const shared = readSharedSeen();
    const bucket = shared[show.episodeCatalog] || (shared[show.episodeCatalog] = {});
    if (watched) bucket[key] = true;
    else delete bucket[key];
    writeSharedSeen(shared);
  }

  function syncSharedSeen() {
    const shared = readSharedSeen();
    let sharedDirty = false;
    let changed = false;

    state.shows.forEach(show => {
      const catalogId = show.episodeCatalog;
      if (!catalogId) return;
      let bucket = shared[catalogId];
      if (!bucket || typeof bucket !== 'object') {
        bucket = {};
        PROFILES.forEach(profile => {
          const seen = collectSeenFromStore(profile.id, catalogId);
          Object.keys(seen).forEach(key => { bucket[key] = true; });
        });
        shared[catalogId] = bucket;
        sharedDirty = true;
      }
      catalogFor(show).forEach(ep => {
        const key = epCode(ep);
        const entry = show.episodeEntries[key];
        const seen = Boolean(bucket[key]);
        if (entry) {
          if (entry.watched !== seen) {
            entry.watched = seen;
            changed = true;
          }
        } else if (seen) {
          show.episodeEntries[key] = { rating: 0, review: '', watched: true, updatedAt: Date.now() };
          changed = true;
        }
      });
    });

    if (sharedDirty) writeSharedSeen(shared, readSeenTime());
    return changed;
  }

  /* ---------- cloud sync (Firebase Realtime Database REST) ---------- */

  let cloudReady = false;
  let cloudPulling = false;
  let cloudPushing = false;
  let cloudPushTimer = null;
  let lastCloudPull = 0;

  const CLOUD_URL = CLOUD_CONFIG.databaseURL.replace(/\/+$/, '') + '/' + CLOUD_NODE;

  function cloudUrl(path) {
    return CLOUD_URL + (path ? '/' + path : '') + '.json';
  }

  function setCloudState(text) {
    if (dom.cloudNote) dom.cloudNote.textContent = text;
  }

  function initCloud() {
    if (typeof fetch !== 'function') {
      setCloudState('Cloud unavailable — saving on this device.');
      return;
    }
    setCloudState('Cloud connected — checking the shared library…');
  }

  async function cloudRequest(path, options) {
    const res = await fetch(cloudUrl(path), Object.assign({ cache: 'no-store' }, options || {}));
    if (!res.ok) throw new Error('Cloud request failed (' + res.status + ')');
    return res.json();
  }

  function toList(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => value[key]);
  }

  function cloudProfileState(remote) {
    if (!remote || typeof remote !== 'object') return null;
    const settings = remote.settings && typeof remote.settings === 'object' ? remote.settings : {};
    return {
      shows: toList(remote.shows).map(normalizeShow).filter(Boolean),
      settings: {
        samplerDismissed: Boolean(settings.samplerDismissed),
        seedVersion: Number(settings.seedVersion) || 1,
        progressSeed: Number(settings.progressSeed) || 0,
        updatedAt: Number(remote.updatedAt) || 0
      }
    };
  }

  function scheduleCloudPush() {
    if (!cloudReady) return;
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(cloudPush, 1100);
  }

  function cloudPush() {
    if (!cloudReady || cloudPushing) return;
    clearTimeout(cloudPushTimer);
    cloudPushTimer = null;
    if (!Number(state.settings.updatedAt)) {
      state.settings.updatedAt = Date.now();
      try {
        localStorage.setItem(dataKey(activeProfile), JSON.stringify({ version: 1, shows: state.shows, settings: state.settings }));
      } catch (err) { /* local save already handles this */ }
    }
    const profile = {
      updatedAt: Number(state.settings.updatedAt) || Date.now(),
      shows: state.shows,
      settings: state.settings
    };
    const seenState = { map: readSharedSeen(), at: readSeenTime() };
    const put = (path, body) => cloudRequest(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    cloudPushing = true;
    Promise.all([
      put('profiles/' + activeProfile, profile),
      put('seenState', seenState)
    ]).then(
      () => setCloudState('Cloud synced · seen is shared between profiles'),
      err => {
        console.warn('Screening Room: cloud write failed.', err);
        setCloudState('Cloud unavailable — saving on this device.');
      }
    ).finally(() => { cloudPushing = false; });
  }

  async function cloudPull(force) {
    if (cloudPulling) return;
    if (!force && Date.now() - lastCloudPull < 5000) return;
    if (ui.drawerId || dom.modal.classList.contains('is-open')) return;
    cloudPulling = true;
    lastCloudPull = Date.now();
    try {
      const data = await cloudRequest('');
      if (!data) {
        cloudReady = true;
        setCloudState('Cloud connected — saving this library.');
        cloudPush();
        return;
      }

      let changed = false;
      const seenState = data.seenState && typeof data.seenState === 'object' ? data.seenState : {};
      const remoteSeen = seenState.map && typeof seenState.map === 'object' ? seenState.map : {};
      const remoteSeenAt = Number(seenState.at) || 0;
      const localSeenAt = readSeenTime();
      const hasRemoteSeen = remoteSeenAt > 0 || Object.keys(remoteSeen).length > 0;
      if (hasRemoteSeen && (remoteSeenAt > localSeenAt || localSeenAt === 0)) {
        writeSharedSeen(remoteSeen, remoteSeenAt);
        if (syncSharedSeen()) changed = true;
      }

      const remote = data.profiles && data.profiles[activeProfile];
      const remoteAt = remote ? Number(remote.updatedAt) || 0 : 0;
      const localAt = Number(state.settings.updatedAt) || 0;
      if (remote && (remoteAt > localAt || localAt === 0)) {
        const incoming = cloudProfileState(remote);
        if (incoming) {
          state = incoming;
          migrateSeeds();
          state.shows.forEach(adoptSeedArt);
          applyProgressSeed();
          syncSharedSeen();
          save({ stamp: false, cloud: false });
          changed = true;
        }
      }

      cloudReady = true;

      if (changed) {
        if (ui.drawerId && !getShow(ui.drawerId)) hideDrawer();
        save({ stamp: false, cloud: false });
        renderDataViews();
      }

      if (localSeenAt > remoteSeenAt || localAt > remoteAt || !remote) {
        cloudPush();
      } else {
        setCloudState('Cloud synced · seen is shared between profiles');
      }
    } catch (err) {
      console.warn('Screening Room: cloud read failed.', err);
      setCloudState('Cloud unavailable — saving on this device.');
    } finally {
      cloudPulling = false;
    }
  }

  function focusLibraryLanding() {
    requestAnimationFrame(() => {
      const card = document.querySelector('#shelfSections [data-open]');
      if (ui.page === 'shelf' && card) card.focus();
      else dom.addBtn.focus();
    });
  }

  /* ---------- data ---------- */

  function normalizeShow(raw, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const type = raw.type === 'series' ? 'series' : 'film';
    const yearNum = Number(raw.year);
    const year = Number.isFinite(yearNum) && yearNum >= 1880 && yearNum <= 2100 ? Math.round(yearNum) : null;
    const status = STATUS_ORDER.includes(raw.status) ? raw.status : 'watchlist';
    const episodeCatalog = typeof raw.episodeCatalog === 'string' && Array.isArray(CATALOGS[raw.episodeCatalog])
      ? raw.episodeCatalog
      : '';
    let seasons = type === 'series' && Array.isArray(raw.seasons)
      ? raw.seasons
        .map(v => Math.round(Number(v)))
        .filter(v => Number.isFinite(v) && v > 0)
        .map(v => clamp(v, 1, 200))
      : [];
    if (!seasons.length && episodeCatalog) {
      seasons = catalogSeasons(CATALOGS[episodeCatalog]).map(group => group.eps.length);
    }
    const seasonTotal = seasons.length ? seasons.reduce((a, b) => a + b, 0) : 0;
    const total = type === 'series'
      ? (seasonTotal ? clamp(seasonTotal, 1, 2000) : clamp(Math.round(Number(raw.total) || Number(raw.current) || 1), 1, 2000))
      : 0;
    const current = type === 'series' ? clamp(Math.round(Number(raw.current) || 0), 0, total) : 0;
    const ratingNum = Math.round(Number(raw.rating) || 0);
    const rating = clamp(Number.isFinite(ratingNum) ? ratingNum : 0, 0, 10);
    const notes = Array.isArray(raw.notes) ? raw.notes
      .filter(n => n && String(n.text || '').trim())
      .map(n => ({
        id: String(n.id || uid()),
        text: String(n.text).slice(0, 2000),
        createdAt: Number(n.createdAt) || Date.now()
      })) : [];

    const title = String(raw.title || '').trim().slice(0, 120);
    if (!title) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title,
      type,
      year,
      creator: String(raw.creator || '').trim().slice(0, 120),
      genres: parseGenres(raw.genres),
      status,
      current,
      total,
      seasons,
      episodeCatalog,
      episodeEntries: normalizeEpisodeEntries(raw.episodeEntries),
      rating,
      review: String(raw.review || '').slice(0, 6000),
      reviewUpdatedAt: Number(raw.reviewUpdatedAt) || null,
      notes,
      poster: validPoster(raw.poster),
      addedAt: Number(raw.addedAt) || (Date.now() + index * 1000),
      seed: Boolean(raw.seed)
    };
  }

  function newShow(fields) {
    return normalizeShow({
      ...fields,
      id: uid(),
      addedAt: Date.now(),
      seed: false,
      rating: 0,
      review: '',
      reviewUpdatedAt: null,
      notes: []
    });
  }

  function seedShows() {
    const catalog = CATALOGS['the-mentalist'] || [];
    const seasons = catalogSeasons(catalog).map(group => group.eps.length);
    const seeds = [
      {
        title: 'The Mentalist',
        type: 'series',
        year: 2008,
        creator: 'Bruno Heller',
        genres: ['Crime', 'Drama', 'Mystery'],
        status: 'watching',
        current: 0,
        total: seasons.reduce((a, b) => a + b, 0) || 151,
        seasons,
        episodeCatalog: 'the-mentalist',
        poster: MENTALIST_ART
      }
    ];
    return seeds.map(item => normalizeShow({
      ...item,
      id: uid(),
      addedAt: Date.now(),
      seed: true,
      rating: 0,
      review: '',
      notes: []
    }));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(dataKey(activeProfile));
      if (!raw) return null;
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : (data && Array.isArray(data.shows) ? data.shows : null);
      if (!arr) return null;
      const shows = arr.map(normalizeShow).filter(Boolean);
      const settings = {
        samplerDismissed: Boolean(data && data.settings && data.settings.samplerDismissed),
        seedVersion: Number(data && data.settings && data.settings.seedVersion) || 1,
        progressSeed: Number(data && data.settings && data.settings.progressSeed) || 0,
        updatedAt: Number(data && data.settings && data.settings.updatedAt) || 0
      };
      return { shows, settings };
    } catch (err) {
      console.warn('Screening Room: could not read saved library.', err);
      return null;
    }
  }

  function save(options) {
    const opts = options || {};
    if (opts.stamp !== false) state.settings.updatedAt = Date.now();
    try {
      localStorage.setItem(dataKey(activeProfile), JSON.stringify({ version: 1, shows: state.shows, settings: state.settings }));
    } catch (err) {
      console.warn('Screening Room: could not save library.', err);
      if (!storageWarned) {
        storageWarned = true;
        toast('Could not save to this browser.');
      }
    }
    if (opts.cloud !== false) scheduleCloudPush();
  }

  function markTouched(show) {
    if (!show) return;
    show.seed = false;
  }

  /* ---------- cards & entries ---------- */

  function cardHTML(show) {
    const rating = show.rating > 0;
    const hasCatalog = show.type === 'series' && Boolean(show.episodeCatalog);
    const watched = hasCatalog ? watchedCount(show) : 0;
    const kicker = [TYPE_LABEL[show.type], show.year ? String(show.year) : null];
    if (show.type === 'series' && show.status === 'watching') {
      if (hasCatalog) {
        if (watched > 0) kicker.push(watched + ' watched');
      } else {
        kicker.push('Ep ' + show.current + ' of ' + show.total);
      }
    }
    const poster = show.poster ? '<img class="card-img" src="' + escapeAttr(show.poster) + '" alt="" loading="lazy" decoding="async">' : '';
    const progressValue = hasCatalog ? watched : show.current;
    const showBar = show.type === 'series' && show.status === 'watching' && show.total && (hasCatalog ? watched > 0 : true);
    const progress = showBar
      ? '<span class="card-bar"><span class="card-bar-fill" style="width:' + Math.round(progressValue / show.total * 100) + '%"></span></span>'
      : '';
    const ariaScore = rating ? 'Rated ' + show.rating + ' out of 10.' : 'Not rated yet.';

    return '<button class="card" type="button" data-open="' + escapeAttr(show.id) + '">' +
      '<span class="card-art ' + plateClass(show) + '">' +
        '<span class="card-initial" aria-hidden="true">' + escapeHTML(initialOf(show.title)) + '</span>' +
        poster +
      '</span>' +
      '<span class="card-scrim" aria-hidden="true"></span>' +
      '<span class="card-score ' + (rating ? 'is-rated' : 'is-unrated') + '" aria-hidden="true">' + (rating ? show.rating : '—') + '</span>' +
      '<span class="card-copy">' +
        '<span class="card-kicker">' + escapeHTML(kicker.filter(Boolean).join(' · ')) + '</span>' +
        '<span class="card-title">' + escapeHTML(show.title) + '</span>' +
        '<span class="sr-only">' + escapeHTML(ariaScore) + '</span>' +
      '</span>' +
      progress +
    '</button>';
  }

  function entryHTML(entry) {
    const show = entry.show;
    const episode = Boolean(entry.episode);
    const heading = entry.title || show.title;
    const score = Number.isFinite(entry.score) ? entry.score : show.rating;
    const poster = show.poster ? '<img class="thumb-img" src="' + escapeAttr(show.poster) + '" alt="" loading="lazy" decoding="async">' : '';
    const meta = [];
    meta.push('<span class="entry-kind ' + (entry.kind === 'review' ? 'is-review' : '') + '">' + (entry.kind === 'review' ? 'Review' : 'Note') + '</span>');
    meta.push('<span>' + escapeHTML(fmt(entry.date, fmtDate)) + '</span>');
    if (score > 0) meta.push('<span class="dot" aria-hidden="true">·</span><span>Score ' + score + '/10</span>');
    const credit = entry.sub || (TYPE_LABEL[show.type] + (show.year ? ' · ' + show.year : ''));
    const action = episode ? 'open episode' : 'open title';

    return '<article class="entry">' +
      '<div class="entry-art ' + plateClass(show) + '" aria-hidden="true">' +
        '<span class="entry-initial">' + escapeHTML(initialOf(show.title)) + '</span>' + poster +
      '</div>' +
      '<div class="entry-main">' +
        '<div class="entry-meta">' + meta.join('') + '</div>' +
        '<h3 class="entry-title">' + escapeHTML(heading) + '</h3>' +
        '<p class="entry-text">' + escapeHTML(entry.text) + '</p>' +
        '<div class="entry-foot">' +
          '<span class="entry-credit">' + escapeHTML(credit) + '</span>' +
          '<button class="link-btn" type="button" data-open="' + escapeAttr(show.id) + '"' +
            (episode ? ' data-episode-code="' + escapeAttr(entry.episode) + '"' : '') +
            ' aria-label="Open ' + escapeAttr(heading) + ' — ' + action + '">' +
            (episode ? 'Open episode' : 'Open title') +
            ' <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5"></path></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function emptyQueryHTML(message, detail, clearAction) {
    return '<div class="empty empty--slim">' +
      '<h2>' + escapeHTML(message) + '</h2>' +
      '<p>' + escapeHTML(detail) + '</p>' +
      '<div class="empty-actions"><button class="btn btn--ghost btn--sm" type="button" data-action="' + clearAction + '">Clear filters</button></div>' +
    '</div>';
  }

  /* ---------- render: data views ---------- */

  function entriesAll() {
    const out = [];
    state.shows.forEach(show => {
      const review = String(show.review || '').trim();
      if (review) {
        out.push({ kind: 'review', show, text: review, date: show.reviewUpdatedAt || show.addedAt });
      }
      show.notes.forEach(note => {
        const text = String(note.text || '').trim();
        if (text) out.push({ kind: 'note', show, text, date: note.createdAt });
      });

      catalogFor(show).forEach(ep => {
        const entry = show.episodeEntries[epCode(ep)];
        const text = entry ? String(entry.review || '').trim() : '';
        if (!text) return;
        out.push({
          kind: 'review',
          show,
          text,
          date: entry.updatedAt || show.addedAt,
          title: ep.t,
          sub: show.title + ' · S' + ep.s + ' E' + ep.e,
          score: entry.rating,
          episode: epCode(ep)
        });
      });
    });
    return out.sort((a, b) => b.date - a.date);
  }

  function renderNavCounts() {
    const journalCount = entriesAll().length;
    dom.navCountShelf.textContent = String(state.shows.length);
    dom.navCountJournal.textContent = String(journalCount);
  }

  function shelfSummary() {
    const shows = state.shows;
    if (!shows.length) return 'An empty shelf, for now. Add a title and it will live here.';
    const counts = {
      watching: shows.filter(s => s.status === 'watching').length,
      watchlist: shows.filter(s => s.status === 'watchlist').length,
      finished: shows.filter(s => s.status === 'finished').length
    };
    const bits = [];
    if (counts.watching) bits.push(counts.watching + ' in rotation');
    if (counts.watchlist) bits.push(counts.watchlist + ' on the watchlist');
    if (counts.finished) bits.push(counts.finished + ' seen');
    const rated = shows.filter(s => s.rating > 0);
    const avg = rated.length ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : '';
    let line = shows.length + ' ' + plural(shows.length, 'title', 'titles') + (bits.length ? ' — ' + bits.join(', ') + '.' : '.');
    line += rated.length ? ' ' + rated.length + ' scored, averaging ' + avg + '/10.' : ' No scores yet.';
    return line;
  }

  function journalSummary() {
    const entries = entriesAll();
    if (!entries.length) return 'No entries yet. Reviews and notes you write will collect here, newest first.';
    const titleCount = new Set(entries.map(e => e.show.id)).size;
    const reviews = entries.filter(e => e.kind === 'review').length;
    const notes = entries.filter(e => e.kind === 'note').length;
    return entries.length + ' ' + plural(entries.length, 'entry', 'entries') + ' from ' + titleCount + ' ' +
      plural(titleCount, 'title', 'titles') + ' — ' + reviews + ' ' + plural(reviews, 'review', 'reviews') +
      ', ' + notes + ' ' + plural(notes, 'note', 'notes') + '. Newest first.';
  }

  function updateMastheads() {
    dom.shelfSubline.textContent = shelfSummary();
    dom.journalSubline.textContent = journalSummary();
  }

  function updateLedger() {
    const shows = state.shows;
    dom.ledgerTitles.textContent = pad2(shows.length);
    dom.ledgerWatching.textContent = pad2(shows.filter(s => s.status === 'watching').length);
    const rated = shows.filter(s => s.rating > 0);
    dom.ledgerAvg.textContent = rated.length ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : '—';
    dom.ledgerNotes.textContent = pad2(shows.reduce((sum, s) => sum + s.notes.length, 0));
  }

  function renderFilterCounts() {
    const counts = {
      all: state.shows.length,
      watching: state.shows.filter(s => s.status === 'watching').length,
      watchlist: state.shows.filter(s => s.status === 'watchlist').length,
      finished: state.shows.filter(s => s.status === 'finished').length
    };
    dom.countAll.textContent = counts.all;
    dom.countWatching.textContent = counts.watching;
    dom.countWatchlist.textContent = counts.watchlist;
    dom.countFinished.textContent = counts.finished;
    dom.statusChips.querySelectorAll('[data-status]').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.status === ui.status));
    });
  }

  function renderGenreOptions() {
    const genres = Array.from(new Set(state.shows.flatMap(s => s.genres))).sort((a, b) => collator.compare(a, b));
    if (ui.genre !== 'all' && !genres.includes(ui.genre)) ui.genre = 'all';
    dom.genreSelect.innerHTML = '<option value="all">All genres</option>' +
      genres.map(g => '<option value="' + escapeAttr(g) + '">' + escapeHTML(g) + '</option>').join('');
    dom.genreSelect.value = ui.genre;
  }

  function renderNotice() {
    const seeds = state.shows.filter(s => s.seed).length;
    const visible = seeds > 0 && !state.settings.samplerDismissed;
    dom.samplerNotice.hidden = !visible;
    if (!visible) return;
    dom.samplerCopy.textContent = seeds + ' starter ' + plural(seeds, 'title', 'titles') +
      (seeds === 1 ? ' sits' : ' sit') + ' here so the shelf is not empty. ' +
      (seeds === 1 ? 'Its score, review and notes are blank' : 'Their scores, reviews and notes are blank') +
      ' — those are yours to add. Keep ' + (seeds === 1 ? 'it' : 'them') + ', or clear the starter.';
  }

  function filteredShows() {
    const q = ui.query.trim().toLowerCase();
    const list = state.shows.filter(show => {
      if (ui.status !== 'all' && show.status !== ui.status) return false;
      if (ui.genre !== 'all' && !show.genres.includes(ui.genre)) return false;
      if (q) {
        const haystack = [
          show.title,
          show.creator,
          show.year || '',
          show.genres.join(' '),
          show.review,
          show.notes.map(n => n.text).join(' ')
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (ui.sort === 'title') return collator.compare(a.title, b.title);
      if (ui.sort === 'score') return (b.rating || -1) - (a.rating || -1) || collator.compare(a.title, b.title);
      if (ui.sort === 'year') return (b.year || 0) - (a.year || 0) || collator.compare(a.title, b.title);
      return b.addedAt - a.addedAt;
    });
  }

  function renderShelfSections() {
    if (!state.shows.length) {
      dom.shelfSections.innerHTML = '';
      return;
    }
    const visible = filteredShows();
    if (!visible.length) {
      dom.shelfSections.innerHTML = emptyQueryHTML(
        'No titles here.',
        'Nothing matches this search and filter. Try a broader look, or clear the filters.',
        'clear-filters'
      );
      return;
    }

    dom.shelfSections.innerHTML = STATUS_ORDER.map(status => {
      const group = visible.filter(s => s.status === status);
      if (!group.length) return '';
      return '<section class="shelf-section" aria-labelledby="row-' + status + '">' +
        '<div class="row-head">' +
          '<h2 id="row-' + status + '">' + SECTION_TITLE[status] + '</h2>' +
          '<span class="row-count">' + pad2(group.length) + '</span>' +
          '<span class="row-rule" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="grid">' + group.map(cardHTML).join('') + '</div>' +
      '</section>';
    }).join('');
  }

  function renderShelf() {
    updateMastheads();
    updateLedger();
    renderNavCounts();
    renderNotice();

    const hasShows = state.shows.length > 0;
    dom.ledger.hidden = !hasShows;
    dom.shelfToolbar.hidden = !hasShows;
    dom.shelfEmpty.hidden = hasShows;

    if (!hasShows) {
      dom.shelfSections.innerHTML = '';
      return;
    }

    renderFilterCounts();
    renderGenreOptions();
    renderShelfSections();
  }

  function renderJournal() {
    updateMastheads();
    renderNavCounts();
    const entries = entriesAll();
    const reviews = entries.filter(e => e.kind === 'review').length;
    const notes = entries.length - reviews;
    dom.jCountAll.textContent = entries.length;
    dom.jCountReview.textContent = reviews;
    dom.jCountNote.textContent = notes;
    dom.journalChips.querySelectorAll('[data-jtype]').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.jtype === ui.jType));
    });

    dom.journalToolbar.hidden = entries.length === 0;

    if (!entries.length) {
      dom.journalFeed.innerHTML = '<div class="empty">' +
        '<span class="empty-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M8 10h24M8 20h18M8 30h11"></path></svg></span>' +
        '<h2>Nothing written yet.</h2>' +
        '<p>Open a title on the shelf, score it, and leave a review or a note. Every entry you write lands here with its date.</p>' +
        '<div class="empty-actions"><button class="btn btn--primary" type="button" data-action="goto-shelf">Go to the shelf</button></div>' +
        '</div>';
      return;
    }

    const q = ui.jQuery.trim().toLowerCase();
    const filtered = entries.filter(entry => {
      if (ui.jType !== 'all' && entry.kind !== ui.jType) return false;
      if (!q) return true;
      return (entry.show.title + ' ' + (entry.title || '') + ' ' + (entry.sub || '') + ' ' +
        entry.text + ' ' + entry.show.creator).toLowerCase().includes(q);
    });

    if (!filtered.length) {
      dom.journalFeed.innerHTML = emptyQueryHTML(
        'Nothing matches.',
        'No reviews or notes match this search and filter.',
        'clear-journal-filters'
      );
      return;
    }

    const groups = [];
    let current = null;
    filtered.forEach(entry => {
      const date = new Date(entry.date);
      const key = date.getFullYear() + '-' + date.getMonth();
      if (!current || current.key !== key) {
        current = { key, label: fmtMonth.format(date), items: [] };
        groups.push(current);
      }
      current.items.push(entry);
    });

    dom.journalFeed.innerHTML = groups.map(group =>
      '<section class="month-group" aria-label="' + escapeAttr(group.label) + '">' +
        '<div class="month-head">' +
          '<h2>' + escapeHTML(group.label) + '</h2>' +
          '<span class="month-count">' + pad2(group.items.length) + '</span>' +
          '<span class="month-rule" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="entries">' + group.items.map(entryHTML).join('') + '</div>' +
      '</section>'
    ).join('');
  }

  function renderDataViews() {
    renderNavCounts();
    updateMastheads();
    renderShelf();
    renderJournal();
  }

  /* ---------- drawer ---------- */

  function syncBodyLock() {
    const locked = Boolean(ui.drawerId) || dom.modal.classList.contains('is-open');
    document.body.classList.toggle('is-locked', locked);
  }

  function drawerStatusButtons(show) {
    return ['watching', 'watchlist', 'finished'].map(status => {
      const label = status === 'watching' ? 'Watching' : status === 'watchlist' ? 'Watchlist' : 'Seen';
      return '<button type="button" data-set-status="' + status + '" aria-pressed="' + String(show.status === status) + '">' + label + '</button>';
    }).join('');
  }

  function ensureEpisodeEntry(show, key, create) {
    let entry = show.episodeEntries[key];
    if (!entry && create) {
      entry = { rating: 0, review: '', watched: false, updatedAt: null };
      show.episodeEntries[key] = entry;
    }
    return entry;
  }

  function episodeListHTML(show, groups) {
    const active = groups.find(g => g.n === ui.epSeason) || groups[0];
    const watchedHere = active.eps.filter(ep => {
      const entry = show.episodeEntries[epCode(ep)];
      return Boolean(entry && entry.watched);
    }).length;

    const rows = active.eps.map(ep => {
      const key = epCode(ep);
      const entry = show.episodeEntries[key];
      const rated = Boolean(entry && entry.rating > 0);
      const watched = Boolean(entry && entry.watched);
      const stateLabel = rated ? entry.rating : (watched ? 'Seen' : '—');
      const a11y = 'Season ' + ep.s + ', episode ' + ep.e + ', ' + ep.t + '. ' +
        (rated ? 'Rated ' + entry.rating + ' out of 10. ' : '') +
        (watched ? 'Watched.' : 'Not watched yet.');
      const thumb = ep.img
        ? '<img class="ep-img" src="' + escapeAttr(ep.img) + '" alt="" loading="lazy" decoding="async">'
        : '<span class="ep-thumb-fallback" aria-hidden="true">' + escapeHTML(String(ep.e)) + '</span>';
      return '<li>' +
        '<button class="ep-row" type="button" data-episode="' + key + '">' +
          '<span class="ep-thumb">' + thumb + '</span>' +
          '<span class="ep-copy">' +
            '<span class="ep-code">S' + ep.s + ' E' + ep.e + '</span>' +
            '<span class="ep-title">' + escapeHTML(ep.t) + '</span>' +
          '</span>' +
          '<span class="ep-state ' + (rated ? 'is-rated' : watched ? 'is-watched' : '') + '" aria-hidden="true">' +
            stateLabel + '</span>' +
          '<span class="sr-only">' + escapeHTML(a11y) + '</span>' +
        '</button></li>';
    }).join('');

    return '<div class="ep-season-meta">' +
        '<span>Season ' + active.n + ' · ' + active.eps.length + ' episodes</span>' +
        '<span>' + watchedHere + ' watched</span>' +
      '</div>' +
      '<ul class="ep-list">' + rows + '</ul>';
  }

  function episodePanelHTML(show) {
    const catalog = catalogFor(show);
    if (!catalog.length) return '';
    const groups = catalogSeasons(catalog);
    if (!groups.some(g => g.n === ui.epSeason)) ui.epSeason = groups[0].n;
    const ratedCount = Object.keys(show.episodeEntries).filter(key => show.episodeEntries[key].rating > 0).length;
    const allEps = groups.reduce((list, group) => list.concat(group.eps), []);
    const nextEp = allEps.find(ep => {
      const entry = show.episodeEntries[epCode(ep)];
      return !(entry && entry.watched);
    });
    const next = nextEp
      ? '<button class="ep-next" type="button" data-episode="' + epCode(nextEp) + '">' +
          '<span class="ep-next-label">Up next</span>' +
          '<span class="ep-next-copy">' +
            '<span class="ep-next-code">S' + nextEp.s + ' E' + nextEp.e + '</span>' +
            '<span class="ep-next-title">' + escapeHTML(nextEp.t) + '</span>' +
          '</span>' +
          '<span class="ep-next-arrow" aria-hidden="true">→</span>' +
          '<span class="sr-only">Season ' + nextEp.s + ', episode ' + nextEp.e + ', ' + nextEp.t + '. Not watched yet.</span>' +
        '</button>'
      : '<p class="ep-next-done">All ' + allEps.length + ' episodes are marked seen.</p>';

    return '<section class="panel" id="episodePanel" aria-labelledby="episodesHeading">' +
        '<div class="panel-head"><h3 id="episodesHeading">Episodes</h3>' +
          '<span class="panel-count">' + (ratedCount ? ratedCount + ' rated' : catalog.length + ' total') + '</span>' +
        '</div>' +
        next +
        '<div class="season-tabs" role="group" aria-label="Choose season">' +
          groups.map(g => '<button class="season-tab" type="button" data-season="' + g.n + '" aria-pressed="' +
            String(g.n === ui.epSeason) + '">S' + g.n + '</button>').join('') +
        '</div>' +
        '<div id="epListWrap">' + episodeListHTML(show, groups) + '</div>' +
      '</section>';
  }

  function renderDrawer(show) {
    if (!show) return;
    const rating = show.rating > 0;
    const poster = show.poster ? '<img class="drawer-img" src="' + escapeAttr(show.poster) + '" alt="" decoding="async">' : '';
    const kicker = [
      TYPE_LABEL[show.type],
      show.year ? String(show.year) : null,
      show.seasons.length ? show.seasons.length + ' ' + plural(show.seasons.length, 'season', 'seasons') : null,
      show.type === 'series' ? show.total + ' episodes' : null
    ].filter(Boolean).join(' · ');
    const credits = [show.creator, show.genres.join(', ')].filter(Boolean).join(' · ');
    const catalog = catalogFor(show);
    const episodes = catalog.length ? episodePanelHTML(show) : '';
    const progress = show.type === 'series' && !catalog.length
      ? '<section class="panel" id="progressPanel" aria-labelledby="progressHeading"' + (show.status === 'watching' ? '' : ' hidden') + '>' +
          '<div class="panel-head"><h3 id="progressHeading">Progress</h3><span class="panel-count" id="progressPct">' +
            Math.round(show.current / show.total * 100) + '%</span></div>' +
          '<div class="progress-meta"><span id="progressLabel">Episode ' + show.current + ' of ' + show.total + '</span></div>' +
          '<div class="progress-controls">' +
            '<button class="step-btn" type="button" data-step="-1" aria-label="Previous episode"' + (show.current <= 0 ? ' disabled' : '') + '>' +
              '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12"></path></svg></button>' +
            '<div class="progress-track"><span class="progress-fill" id="progressFill" style="width:' + Math.round(show.current / show.total * 100) + '%"></span></div>' +
            '<button class="step-btn" type="button" data-step="1" aria-label="Next episode"' + (show.current >= show.total ? ' disabled' : '') + '>' +
              '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"></path></svg></button>' +
          '</div>' +
        '</section>'
      : '';

    dom.drawerContent.innerHTML =
      '<div class="drawer-media ' + plateClass(show) + '">' +
        '<span class="drawer-initial" aria-hidden="true">' + escapeHTML(initialOf(show.title)) + '</span>' + poster +
      '</div>' +
      '<p class="drawer-kicker">' + escapeHTML(kicker) + '</p>' +
      '<h2 class="drawer-title" id="drawerTitle">' + escapeHTML(show.title) + '</h2>' +
      (credits ? '<p class="drawer-credits">' + escapeHTML(credits) + '</p>' : '') +

      '<div class="status-block">' +
        '<span class="status-label" id="drawerStatusLabel">Where it sits</span>' +
        '<div class="seg seg--full" role="group" aria-labelledby="drawerStatusLabel">' + drawerStatusButtons(show) + '</div>' +
      '</div>' +

      episodes +

      '<section class="panel" aria-labelledby="scoreHeading">' +
        '<div class="panel-head"><h3 id="scoreHeading">Series score</h3>' +
          '<button class="link-btn" type="button" data-score-clear' + (rating ? '' : ' hidden') + '>Clear</button>' +
        '</div>' +
        '<div class="score-row"><span class="score-readout ' + (rating ? '' : 'is-empty') + '" id="scoreReadout">' +
          (rating ? show.rating + '<span class="denom">/10</span>' : '—') + '</span></div>' +
        '<label class="sr-only" for="scoreRange">Your score for the series out of ten</label>' +
        '<input class="score-range" id="scoreRange" type="range" min="0" max="10" step="1" value="' + show.rating + '" style="--fill:' + (show.rating * 10) + '%">' +
        '<div class="score-endpoints"><span>1 · not for me</span><span>10 · all-timer</span></div>' +
      '</section>' +

      '<section class="panel" aria-labelledby="reviewHeading">' +
        '<div class="panel-head"><h3 id="reviewHeading">Series review</h3><span class="save-state" id="saveState">' +
          (show.review.trim() ? 'Saved' : 'Autosaves') + '</span></div>' +
        '<label class="sr-only" for="reviewInput">Your review of the series</label>' +
        '<textarea class="review-field" id="reviewInput" placeholder="What stayed with you?"></textarea>' +
      '</section>' +

      progress +

      '<section class="panel" aria-labelledby="notesHeading">' +
        '<div class="panel-head"><h3 id="notesHeading">Notes</h3><span class="panel-count" id="notesCount"></span></div>' +
        '<ul class="notes" id="notesList"></ul>' +
        '<div class="note-composer">' +
          '<label class="sr-only" for="noteInput">Add a note</label>' +
          '<textarea class="note-input" id="noteInput" placeholder="A quote, a timestamp, something to remember…"></textarea>' +
          '<div class="note-actions"><span class="note-hint">Dated automatically</span>' +
            '<button class="btn btn--ghost btn--sm" type="button" id="addNoteBtn" disabled>Add note</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="drawer-footer">' +
        '<span class="added-date">Added ' + escapeHTML(fmt(show.addedAt, fmtDate)) + '</span>' +
        '<div class="drawer-actions">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-drawer-edit>Edit details</button>' +
          '<button class="btn btn--quiet btn--sm" type="button" data-drawer-remove>Remove</button>' +
        '</div>' +
      '</div>';

    const reviewInput = dom.drawerContent.querySelector('#reviewInput');
    if (reviewInput) reviewInput.value = show.review;
    renderNotes(show);
  }

  function renderNotes(show) {
    const notes = show.notes.slice().sort((a, b) => a.createdAt - b.createdAt);
    const list = dom.drawerContent.querySelector('#notesList');
    if (!list) return;
    const count = dom.drawerContent.querySelector('#notesCount');
    if (count) count.textContent = notes.length + ' ' + plural(notes.length, 'note', 'notes');

    if (!notes.length) {
      list.innerHTML = '<li class="note-empty">No notes yet. Keep timestamps, quotes, episode numbers — whatever helps.</li>';
      return;
    }

    list.innerHTML = notes.map(note =>
      '<li class="note">' +
        '<p class="note-text">' + escapeHTML(note.text) + '</p>' +
        '<span class="note-meta">' + escapeHTML(fmt(note.createdAt, fmtStamp)) + '</span>' +
        '<button class="icon-btn icon-btn--sm icon-btn--danger note-delete" type="button" data-note-delete="' + escapeAttr(note.id) + '" aria-label="Delete note from ' + escapeAttr(fmt(note.createdAt, fmtDate)) + '">' +
          '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"></path></svg>' +
        '</button>' +
      '</li>'
    ).join('');
  }

  function renderEpisode(show, key) {
    const catalog = catalogFor(show);
    const ep = catalog.find(item => epCode(item) === key);
    if (!ep) {
      renderDrawer(show);
      return;
    }
    const entry = ensureEpisodeEntry(show, key, true);
    const score = entry.rating > 0;
    const cover = ep.img
      ? '<img class="drawer-img" src="' + escapeAttr(ep.img) + '" alt="" decoding="async">'
      : '';
    const air = ep.air ? fmt(Date.parse(ep.air + 'T12:00:00'), fmtDate) : '';
    const meta = 'Season ' + ep.s + ' · Episode ' + ep.e + (air ? ' · ' + air : '');
    const summary = ep.sum ? '<p class="ep-summary">' + escapeHTML(ep.sum) + '</p>' : '';

    dom.drawerContent.innerHTML =
      '<button class="back-link" type="button" data-ep-back>' +
        '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H5M9 5l-5 5 5 5"></path></svg>' +
        'Back to ' + escapeHTML(show.title) +
      '</button>' +
      '<div class="drawer-media ' + plateClass(show) + '">' +
        '<span class="drawer-initial" aria-hidden="true">' + escapeHTML(initialOf(show.title)) + '</span>' + cover +
      '</div>' +
      '<p class="drawer-kicker">' + escapeHTML(meta) + '</p>' +
      '<h2 class="drawer-title" id="episodeTitle">' + escapeHTML(ep.t) + '</h2>' +
      '<p class="drawer-credits">' + escapeHTML(show.title) + '</p>' +
      summary +

      '<section class="panel" aria-labelledby="epWatchedHeading">' +
        '<div class="panel-head"><h3 id="epWatchedHeading">Seen</h3></div>' +
        '<button class="ep-seen" type="button" data-ep-watched aria-pressed="' + String(entry.watched) + '">' +
          (entry.watched ? 'Seen' : 'Mark as seen') +
        '</button>' +
      '</section>' +

      '<section class="panel" aria-labelledby="epScoreHeading">' +
        '<div class="panel-head"><h3 id="epScoreHeading">Your score</h3>' +
          '<button class="link-btn" type="button" data-ep-score-clear' + (score ? '' : ' hidden') + '>Clear</button>' +
        '</div>' +
        '<div class="score-row"><span class="score-readout ' + (score ? '' : 'is-empty') + '" id="epScoreReadout">' +
          (score ? entry.rating + '<span class="denom">/10</span>' : '—') + '</span></div>' +
        '<label class="sr-only" for="epScoreRange">Your score for this episode out of ten</label>' +
        '<input class="score-range" id="epScoreRange" type="range" min="0" max="10" step="1" value="' + entry.rating + '" style="--fill:' + (entry.rating * 10) + '%">' +
        '<div class="score-endpoints"><span>1 · not for me</span><span>10 · all-timer</span></div>' +
      '</section>' +

      '<section class="panel" aria-labelledby="epReviewHeading">' +
        '<div class="panel-head"><h3 id="epReviewHeading">Your review</h3><span class="save-state" id="epSaveState">' +
          (entry.review.trim() ? 'Saved' : 'Autosaves') + '</span></div>' +
        '<label class="sr-only" for="epReviewInput">Your review for this episode</label>' +
        '<textarea class="review-field" id="epReviewInput" placeholder="What did this episode do?"></textarea>' +
      '</section>' +

      '<div class="drawer-footer">' +
        '<span class="added-date">Season ' + ep.s + ' · Episode ' + ep.e + '</span>' +
        '<div class="drawer-actions">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-ep-back>Series details</button>' +
        '</div>' +
      '</div>';

    const review = dom.drawerContent.querySelector('#epReviewInput');
    if (review) review.value = entry.review;
    dom.drawer.setAttribute('aria-labelledby', 'episodeTitle');
  }

  function paintEpisodeScore(show) {
    const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
    const range = dom.drawerContent.querySelector('#epScoreRange');
    const readout = dom.drawerContent.querySelector('#epScoreReadout');
    const clear = dom.drawerContent.querySelector('[data-ep-score-clear]');
    if (!range || !readout) return;
    range.value = String(entry.rating);
    range.style.setProperty('--fill', (entry.rating * 10) + '%');
    if (entry.rating > 0) {
      readout.classList.remove('is-empty');
      readout.innerHTML = entry.rating + '<span class="denom">/10</span>';
    } else {
      readout.classList.add('is-empty');
      readout.textContent = '—';
    }
    if (clear) clear.hidden = entry.rating === 0;
    paintEpisodeWatched(show);
  }

  function paintEpisodeWatched(show) {
    const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
    const btn = dom.drawerContent.querySelector('[data-ep-watched]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(entry.watched));
    btn.textContent = entry.watched ? 'Seen' : 'Mark as seen';
  }

  function paintScore(show) {
    const range = dom.drawerContent.querySelector('#scoreRange');
    const readout = dom.drawerContent.querySelector('#scoreReadout');
    const clear = dom.drawerContent.querySelector('[data-score-clear]');
    if (!range || !readout) return;
    const value = show.rating;
    range.value = String(value);
    range.style.setProperty('--fill', (value * 10) + '%');
    if (value > 0) {
      readout.classList.remove('is-empty');
      readout.innerHTML = value + '<span class="denom">/10</span>';
    } else {
      readout.classList.add('is-empty');
      readout.textContent = '—';
    }
    if (clear) clear.hidden = value === 0;
  }

  function paintStatus(show) {
    dom.drawerContent.querySelectorAll('[data-set-status]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.setStatus === show.status));
    });
  }

  function paintProgress(show) {
    const panel = dom.drawerContent.querySelector('#progressPanel');
    if (panel) panel.hidden = show.status !== 'watching';
    const label = dom.drawerContent.querySelector('#progressLabel');
    const pct = dom.drawerContent.querySelector('#progressPct');
    const fill = dom.drawerContent.querySelector('#progressFill');
    if (label) label.textContent = 'Episode ' + show.current + ' of ' + show.total;
    if (pct) pct.textContent = Math.round(show.current / show.total * 100) + '%';
    if (fill) fill.style.width = Math.round(show.current / show.total * 100) + '%';
    const minus = dom.drawerContent.querySelector('[data-step="-1"]');
    const plus = dom.drawerContent.querySelector('[data-step="1"]');
    if (minus) minus.disabled = show.current <= 0;
    if (plus) plus.disabled = show.current >= show.total;
  }

  function setSaveState(text, saving) {
    const el = dom.drawerContent.querySelector('#saveState') || dom.drawerContent.querySelector('#epSaveState');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-saving', Boolean(saving));
  }

  function openDrawer(id, episodeCode) {
    const show = getShow(id);
    if (!show) return;
    if (!dom.profileMenu.hidden) closeMenu();
    ui.drawerId = id;
    ui.episodeCode = episodeCode || null;
    ui.epSeason = 1;
    ui.epScroll = 0;
    ui.confirmRemove = false;
    ui.lastFocus = document.activeElement;
    if (episodeCode) renderEpisode(show, episodeCode);
    else renderDrawer(show);
    dom.drawer.classList.add('is-open');
    dom.drawerBackdrop.classList.add('is-open');
    dom.drawer.setAttribute('aria-hidden', 'false');
    dom.drawer.setAttribute('aria-labelledby', episodeCode ? 'episodeTitle' : 'drawerTitle');
    syncBodyLock();
    setTimeout(() => dom.drawerClose.focus(), 40);
  }

  function hideDrawer() {
    if (!ui.drawerId) return;
    ui.drawerId = null;
    ui.episodeCode = null;
    ui.confirmRemove = false;
    dom.drawer.classList.remove('is-open');
    dom.drawerBackdrop.classList.remove('is-open');
    dom.drawer.setAttribute('aria-hidden', 'true');
    dom.drawer.removeAttribute('aria-labelledby');
    syncBodyLock();
  }

  function closeDrawer() {
    if (!ui.drawerId) return;
    const id = ui.drawerId;
    flushSave();
    clearTimeout(shelfRefreshTimer);
    shelfRefreshTimer = null;
    const openerId = id;
    hideDrawer();
    renderDataViews();
    const target = ui.lastFocus && ui.lastFocus.isConnected
      ? ui.lastFocus
      : Array.from(document.querySelectorAll('[data-open]')).find(el => el.dataset.open === openerId);
    requestAnimationFrame(() => {
      if (target && target.isConnected) target.focus();
      else dom.addBtn.focus();
    });
  }

  function refreshDrawerIfOpen(id) {
    if (ui.drawerId === id) {
      const show = getShow(id);
      if (show) renderDrawer(show);
    }
  }

  /* ---------- save scheduling ---------- */

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save();
      setSaveState('Saved', false);
    }, 420);
  }

  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    save();
    setSaveState('Saved', false);
  }

  function scheduleShelfRefresh() {
    clearTimeout(shelfRefreshTimer);
    shelfRefreshTimer = setTimeout(() => {
      shelfRefreshTimer = null;
      renderShelf();
      renderJournal();
    }, 240);
  }

  /* ---------- modal ---------- */

  function setSegment(container, attr, value) {
    container.querySelectorAll('[' + attr + ']').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute(attr) === value));
    });
  }

  function formType() {
    const active = dom.typeSeg.querySelector('[aria-pressed="true"]');
    return active ? active.dataset.type : 'film';
  }

  function formStatus() {
    const active = dom.statusSeg.querySelector('[aria-pressed="true"]');
    return active ? active.dataset.statusValue : 'watchlist';
  }

  function syncEpisodesField() {
    const series = formType() === 'series';
    dom.episodesField.hidden = !series;
    if (series && !dom.fEpisodes.value) dom.fEpisodes.value = '8';
  }

  function clearFormErrors() {
    dom.titleError.hidden = true;
    dom.posterError.hidden = true;
    dom.fTitle.removeAttribute('aria-invalid');
    dom.fPoster.removeAttribute('aria-invalid');
  }

  function openEditor(id) {
    const show = id ? getShow(id) : null;
    ui.editingId = show ? show.id : null;
    ui.modalFocus = document.activeElement;
    clearFormErrors();

    dom.modalKicker.textContent = show ? 'Editing entry' : 'Shelf entry';
    dom.modalTitle.textContent = show ? 'Edit the details' : 'Add a title';
    dom.formSubmit.textContent = show ? 'Save details' : 'Add to shelf';

    dom.fTitle.value = show ? show.title : '';
    dom.fYear.value = show && show.year ? String(show.year) : '';
    dom.fCreator.value = show ? show.creator : '';
    dom.fGenres.value = show ? show.genres.join(', ') : '';
    dom.fPoster.value = show ? show.poster : '';
    dom.fEpisodes.value = show && show.type === 'series' ? String(show.total) : '8';
    setSegment(dom.typeSeg, 'data-type', show ? show.type : 'film');
    setSegment(dom.statusSeg, 'data-status-value', show ? show.status : 'watchlist');
    syncEpisodesField();

    dom.modal.classList.add('is-open');
    dom.modalBackdrop.classList.add('is-open');
    dom.modal.setAttribute('aria-hidden', 'false');
    syncBodyLock();
    setTimeout(() => dom.fTitle.focus(), 60);
  }

  function closeModal(restoreFocus = true) {
    if (!dom.modal.classList.contains('is-open')) return;
    dom.modal.classList.remove('is-open');
    dom.modalBackdrop.classList.remove('is-open');
    dom.modal.setAttribute('aria-hidden', 'true');
    const target = ui.modalFocus;
    ui.modalFocus = null;
    if (!ui.drawerId) ui.editingId = null;
    syncBodyLock();
    if (restoreFocus) {
      requestAnimationFrame(() => {
        if (target && target.isConnected) target.focus();
        else if (ui.drawerId) dom.drawerClose.focus();
        else dom.addBtn.focus();
      });
    }
  }

  function submitForm(event) {
    event.preventDefault();
    clearFormErrors();
    const title = dom.fTitle.value.trim();
    if (!title) {
      dom.titleError.hidden = false;
      dom.fTitle.setAttribute('aria-invalid', 'true');
      dom.fTitle.focus();
      return;
    }

    const posterRaw = dom.fPoster.value.trim();
    let poster = '';
    if (posterRaw) {
      poster = validPoster(posterRaw);
      if (!poster) {
        dom.posterError.hidden = false;
        dom.fPoster.setAttribute('aria-invalid', 'true');
        dom.fPoster.focus();
        return;
      }
    }

    const type = formType();
    const status = formStatus();
    const yearNum = Number(dom.fYear.value);
    const year = Number.isFinite(yearNum) && yearNum >= 1880 && yearNum <= 2100 ? Math.round(yearNum) : null;
    const genres = parseGenres(dom.fGenres.value);
    const creator = dom.fCreator.value.trim().slice(0, 120);
    const totalRaw = Math.round(Number(dom.fEpisodes.value));
    const total = type === 'series' ? clamp(Number.isFinite(totalRaw) ? totalRaw : 8, 1, 2000) : 0;

    if (ui.editingId) {
      const show = getShow(ui.editingId);
      if (!show) return;
      show.title = title;
      show.type = type;
      show.status = status;
      show.year = year;
      show.creator = creator;
      show.genres = genres;
      show.poster = poster;
      if (type === 'series') {
        show.total = total;
        show.current = clamp(show.current, 0, total);
        const catalogTotal = show.episodeCatalog ? catalogFor(show).length : 0;
        if (catalogTotal && total !== catalogTotal) {
          show.episodeCatalog = '';
          show.seasons = [];
          show.episodeEntries = {};
        } else {
          const seasonSum = (show.seasons || []).reduce((a, b) => a + b, 0);
          if (seasonSum !== total) show.seasons = [];
        }
      } else {
        show.total = 0;
        show.current = 0;
        show.seasons = [];
        show.episodeCatalog = '';
        show.episodeEntries = {};
      }
      markTouched(show);
      save();
      ui.editingId = null;
      closeModal(false);
      refreshDrawerIfOpen(show.id);
      renderDataViews();
      if (ui.drawerId) dom.drawerClose.focus();
      else dom.addBtn.focus();
      toast('Details saved.');
      return;
    }

    const show = newShow({
      title,
      type,
      year,
      creator,
      genres,
      poster,
      status,
      current: 0,
      total
    });
    if (!show) return;
    show.seed = false;
    state.shows.unshift(show);
    save();

    ui.status = 'all';
    ui.genre = 'all';
    ui.query = '';
    dom.shelfSearch.value = '';
    dom.posterError.hidden = true;

    closeModal(false);
    renderDataViews();
    const newCard = Array.from(document.querySelectorAll('[data-open]')).find(el => el.dataset.open === show.id);
    requestAnimationFrame(() => {
      if (newCard && newCard.isConnected) newCard.focus();
      else dom.addBtn.focus();
    });
    toast('Added to your shelf. Open it to score it.');
  }

  /* ---------- mutations ---------- */

  function removeShow(show) {
    const index = state.shows.indexOf(show);
    if (index < 0) return;
    state.shows.splice(index, 1);
    save();
    hideDrawer();
    renderDataViews();
    dom.addBtn.focus();
    toast('Removed from your shelf.', 'Undo', () => {
      state.shows.splice(index, 0, show);
      save();
      renderDataViews();
      focusLibraryLanding();
    }, 6500);
  }

  function addNote(show) {
    const input = dom.drawerContent.querySelector('#noteInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    show.notes.push({ id: uid(), text: text.slice(0, 2000), createdAt: Date.now() });
    markTouched(show);
    input.value = '';
    save();
    renderNotes(show);
    updateAddNoteState();
    renderShelf();
    renderJournal();
    updateMastheads();
    setSaveState('Saved', false);
    toast('Note added.');
    input.focus();
  }

  function deleteNote(show, noteId) {
    const index = show.notes.findIndex(n => n.id === noteId);
    if (index < 0) return;
    const note = show.notes[index];
    show.notes.splice(index, 1);
    markTouched(show);
    save();
    renderNotes(show);
    renderShelf();
    renderJournal();
    updateMastheads();
    toast('Note deleted.', 'Undo', () => {
      show.notes.splice(index, 0, note);
      save();
      refreshDrawerIfOpen(show.id);
      renderDataViews();
    }, 6000);
  }

  function updateAddNoteState() {
    const input = dom.drawerContent.querySelector('#noteInput');
    const button = dom.drawerContent.querySelector('#addNoteBtn');
    if (input && button) button.disabled = !input.value.trim();
  }

  function clearSampler() {
    const seeds = state.shows.filter(s => s.seed);
    if (!seeds.length) return;
    const previous = state.shows.slice();
    if (ui.drawerId && seeds.some(s => s.id === ui.drawerId)) hideDrawer();
    state.shows = state.shows.filter(s => !s.seed);
    state.settings.samplerDismissed = true;
    save();
    renderDataViews();
    focusLibraryLanding();
    toast('Starter removed.', 'Undo', () => {
      state.shows = previous;
      state.settings.samplerDismissed = false;
      save();
      renderDataViews();
      focusLibraryLanding();
    }, 6500);
  }

  function loadSampler() {
    const existingTitles = new Set(state.shows.map(s => s.title.trim().toLowerCase()));
    const seeds = seedShows().filter(s => !existingTitles.has(s.title.trim().toLowerCase()));
    if (!seeds.length) {
      toast('Starter is already on the shelf.');
      return;
    }
    state.shows = seeds.concat(state.shows);
    state.settings.samplerDismissed = false;
    save();
    renderDataViews();
    focusLibraryLanding();
    toast('Starter shelf loaded.');
  }

  /* ---------- journal open helper ---------- */

  /* ---------- toast ---------- */

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    toastCallback = null;
    dom.toast.classList.remove('is-visible');
  }

  function toast(message, actionLabel, action, duration = 4500) {
    clearTimeout(toastTimer);
    toastCallback = action || null;
    dom.toastMsg.textContent = message;
    if (actionLabel) {
      dom.toastAction.hidden = false;
      dom.toastAction.textContent = actionLabel;
    } else {
      dom.toastAction.hidden = true;
    }
    dom.toast.classList.add('is-visible');
    toastTimer = setTimeout(hideToast, duration);
  }

  /* ---------- menu / export / import ---------- */

  function paintProfile() {
    const meta = profileMeta(activeProfile);
    const initials = dom.avatarBtn.querySelector('span');
    if (initials) initials.textContent = meta.initials;
    else dom.avatarBtn.textContent = meta.initials;
    dom.avatarBtn.setAttribute('aria-label', meta.initials + ' — ' + meta.name + ', open library menu');
    PROFILES.forEach(profile => {
      const btn = dom.profileMenu.querySelector('[data-profile="' + profile.id + '"]');
      if (btn) btn.setAttribute('aria-checked', String(profile.id === activeProfile));
    });
  }

  function resetFilters() {
    ui.status = 'all';
    ui.genre = 'all';
    ui.sort = 'added';
    ui.query = '';
    ui.jType = 'all';
    ui.jQuery = '';
    ui.epSeason = 1;
    dom.shelfSearch.value = '';
    dom.journalSearch.value = '';
    dom.genreSelect.value = 'all';
    dom.sortSelect.value = ui.sort;
  }

  function setProfile(id) {
    const meta = PROFILES.find(p => p.id === id);
    if (!meta) { closeMenu(); return; }
    closeMenu();
    if (id === activeProfile) return;

    flushSave();
    if (ui.drawerId) hideDrawer();
    closeModal(false);
    activeProfile = id;
    try {
      localStorage.setItem(PROFILE_KEY, id);
    } catch (err) {
      console.warn('Screening Room: could not remember the active profile.', err);
    }

    const loaded = loadState();
    if (loaded) {
      state = loaded;
      migrateSeeds();
    } else {
      state = {
        shows: seedShows(),
        settings: { samplerDismissed: false, seedVersion: SEED_VERSION, updatedAt: 0 }
      };
    }
    state.shows.forEach(adoptSeedArt);
    applyProgressSeed();
    syncSharedSeen();
    save({ stamp: false, cloud: false });

    resetFilters();
    paintProfile();
    renderDataViews();
    toast('Viewing ' + meta.name + "'s shelf.");
    cloudPull(true);
  }

  function closeMenu() {
    if (dom.profileMenu.hidden) return;
    dom.profileMenu.hidden = true;
    dom.avatarBtn.setAttribute('aria-expanded', 'false');
    resetClearButton();
  }

  let clearArmed = false;
  let clearTimer = null;

  function resetClearButton() {
    clearArmed = false;
    clearTimeout(clearTimer);
    clearTimer = null;
    dom.clearBtn.textContent = 'Clear library';
    dom.clearBtn.classList.remove('is-danger');
  }

  function toggleMenu() {
    const opening = dom.profileMenu.hidden;
    dom.profileMenu.hidden = !opening;
    dom.avatarBtn.setAttribute('aria-expanded', String(opening));
    if (!opening) resetClearButton();
  }

  function exportLibrary() {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      shows: state.shows
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'screening-room-' + activeProfile + '-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    closeMenu();
    toast('Library exported.');
  }

  function importLibrary(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.shows) ? parsed.shows : null);
        if (!arr) throw new Error('No shows array');
        const existing = new Set(state.shows.map(s => s.id));
        const incoming = [];
        arr.forEach(raw => {
          const show = normalizeShow(raw);
          if (!show) return;
          if (existing.has(show.id)) show.id = uid();
          existing.add(show.id);
          show.seed = false;
          incoming.push(show);
        });
        if (!incoming.length) {
          toast('No titles found in that file.');
          return;
        }
        state.shows = incoming.concat(state.shows);
        save();
        renderDataViews();
        focusLibraryLanding();
        toast('Imported ' + incoming.length + ' ' + plural(incoming.length, 'title', 'titles') + '.');
      } catch (err) {
        console.warn('Screening Room: import failed.', err);
        toast('That file was not a Screening Room JSON export.');
      }
    };
    reader.onerror = () => toast('Could not read that file.');
    reader.readAsText(file);
  }

  function clearLibrary() {
    const previousShows = state.shows.slice();
    const previousDismissed = state.settings.samplerDismissed;
    if (ui.drawerId) hideDrawer();
    closeModal(false);
    state.shows = [];
    state.settings.samplerDismissed = true;
    save();
    closeMenu();
    resetClearButton();
    ui.status = 'all';
    ui.genre = 'all';
    ui.query = '';
    ui.jType = 'all';
    ui.jQuery = '';
    dom.shelfSearch.value = '';
    dom.journalSearch.value = '';
    setPage('shelf');
    renderDataViews();
    focusLibraryLanding();
    toast('Library cleared.', 'Undo', () => {
      state.shows = previousShows;
      state.settings.samplerDismissed = previousDismissed;
      save();
      renderDataViews();
      focusLibraryLanding();
    }, 7000);
  }

  /* ---------- page switching ---------- */

  function setPage(page) {
    if (page !== 'shelf' && page !== 'journal') return;
    ui.page = page;
    dom.shelfPage.hidden = page !== 'shelf';
    dom.journalPage.hidden = page !== 'journal';
    if (page === 'shelf') {
      dom.navShelf.setAttribute('aria-current', 'page');
      dom.navJournal.removeAttribute('aria-current');
      renderShelf();
    } else {
      dom.navJournal.setAttribute('aria-current', 'page');
      dom.navShelf.removeAttribute('aria-current');
      renderJournal();
    }
    window.scrollTo(0, 0);
  }

  /* ---------- focus trap ---------- */

  function trapFocus(container, event) {
    const nodes = Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(node => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || !container.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last || !container.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- reset filters ---------- */

  function resetShelfFilters() {
    ui.status = 'all';
    ui.genre = 'all';
    ui.query = '';
    dom.shelfSearch.value = '';
    dom.genreSelect.value = 'all';
    renderFilterCounts();
    renderShelfSections();
  }

  function resetJournalFilters() {
    ui.jType = 'all';
    ui.jQuery = '';
    dom.journalSearch.value = '';
    renderJournal();
  }

  /* ---------- events ---------- */

  function bindEvents() {
    dom.addBtn.addEventListener('click', () => openEditor());
    dom.navShelf.addEventListener('click', () => setPage('shelf'));
    dom.navJournal.addEventListener('click', () => setPage('journal'));

    document.querySelectorAll('[data-page-target]').forEach(btn => {
      if (btn === dom.navShelf || btn === dom.navJournal) return;
      btn.addEventListener('click', () => setPage(btn.dataset.pageTarget));
    });

    dom.avatarBtn.addEventListener('click', event => {
      event.stopPropagation();
      toggleMenu();
    });

    dom.profileMenu.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', () => setProfile(btn.dataset.profile));
    });

    document.addEventListener('click', event => {
      if (!dom.profileMenu.hidden && !dom.profileMenu.contains(event.target) && !dom.avatarBtn.contains(event.target)) {
        closeMenu();
      }
    });

    dom.exportBtn.addEventListener('click', exportLibrary);
    dom.importBtn.addEventListener('click', () => {
      closeMenu();
      dom.importFile.click();
    });
    dom.importFile.addEventListener('change', () => {
      const file = dom.importFile.files && dom.importFile.files[0];
      if (file) importLibrary(file);
      dom.importFile.value = '';
    });

    dom.clearBtn.addEventListener('click', () => {
      if (!clearArmed) {
        clearArmed = true;
        dom.clearBtn.textContent = 'Confirm clear library';
        dom.clearBtn.classList.add('is-danger');
        clearTimer = setTimeout(resetClearButton, 4000);
        return;
      }
      clearLibrary();
    });

    dom.clearSampler.addEventListener('click', clearSampler);
    dom.dismissNotice.addEventListener('click', () => {
      state.settings.samplerDismissed = true;
      save();
      renderNotice();
    });

    dom.statusChips.addEventListener('click', event => {
      const chip = event.target.closest('[data-status]');
      if (!chip) return;
      ui.status = chip.dataset.status;
      renderFilterCounts();
      renderShelfSections();
    });

    dom.genreSelect.addEventListener('change', () => {
      ui.genre = dom.genreSelect.value;
      renderShelfSections();
    });

    dom.sortSelect.addEventListener('change', () => {
      ui.sort = dom.sortSelect.value;
      renderShelfSections();
    });

    dom.shelfSearch.addEventListener('input', () => {
      ui.query = dom.shelfSearch.value;
      renderShelfSections();
    });

    dom.journalSearch.addEventListener('input', () => {
      ui.jQuery = dom.journalSearch.value;
      renderJournal();
    });

    dom.journalChips.addEventListener('click', event => {
      const chip = event.target.closest('[data-jtype]');
      if (!chip) return;
      ui.jType = chip.dataset.jtype;
      renderJournal();
    });

    dom.drawerBackdrop.addEventListener('click', closeDrawer);
    dom.drawerClose.addEventListener('click', closeDrawer);

    dom.drawerContent.addEventListener('click', event => {
      const show = getShow(ui.drawerId);
      if (!show) return;

      const statusBtn = event.target.closest('[data-set-status]');
      if (statusBtn) {
        const next = statusBtn.dataset.setStatus;
        if (STATUS_ORDER.includes(next)) {
          show.status = next;
          markTouched(show);
          paintStatus(show);
          paintProgress(show);
          save();
          renderShelf();
          setSaveState('Saved', false);
        }
        return;
      }

      if (event.target.closest('[data-score-clear]')) {
        show.rating = 0;
        markTouched(show);
        paintScore(show);
        save();
        setSaveState('Saved', false);
        scheduleShelfRefresh();
        return;
      }

      const seasonBtn = event.target.closest('[data-season]');
      if (seasonBtn) {
        ui.epSeason = Number(seasonBtn.dataset.season);
        dom.drawerContent.querySelectorAll('[data-season]').forEach(btn => {
          btn.setAttribute('aria-pressed', String(Number(btn.dataset.season) === ui.epSeason));
        });
        const wrap = dom.drawerContent.querySelector('#epListWrap');
        if (wrap) wrap.innerHTML = episodeListHTML(show, catalogSeasons(catalogFor(show)));
        return;
      }

      const epRow = event.target.closest('[data-episode]');
      if (epRow) {
        ui.epScroll = dom.drawerContent.scrollTop;
        ui.episodeCode = epRow.dataset.episode;
        renderEpisode(show, ui.episodeCode);
        dom.drawerContent.scrollTop = 0;
        dom.drawerClose.focus();
        return;
      }

      if (event.target.closest('[data-ep-back]')) {
        ui.episodeCode = null;
        renderDrawer(show);
        dom.drawer.setAttribute('aria-labelledby', 'drawerTitle');
        requestAnimationFrame(() => { dom.drawerContent.scrollTop = ui.epScroll; });
        return;
      }

      const watchedBtn = event.target.closest('[data-ep-watched]');
      if (watchedBtn) {
        const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
        entry.watched = !entry.watched;
        entry.updatedAt = Date.now();
        setSharedSeen(show, ui.episodeCode, entry.watched);
        markTouched(show);
        paintEpisodeWatched(show);
        save();
        setSaveState('Saved', false);
        renderShelf();
        renderJournal();
        return;
      }

      if (event.target.closest('[data-ep-score-clear]')) {
        const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
        entry.rating = 0;
        entry.updatedAt = Date.now();
        markTouched(show);
        paintEpisodeScore(show);
        save();
        setSaveState('Saved', false);
        scheduleShelfRefresh();
        return;
      }

      const step = event.target.closest('[data-step]');
      if (step) {
        if (show.type !== 'series') return;
        const delta = Number(step.dataset.step);
        const next = clamp(show.current + delta, 0, show.total);
        if (next === show.current) return;
        show.current = next;
        markTouched(show);
        paintProgress(show);
        save();
        setSaveState('Saved', false);
        renderShelf();
        return;
      }

      const deleteBtn = event.target.closest('[data-note-delete]');
      if (deleteBtn) {
        deleteNote(show, deleteBtn.dataset.noteDelete);
        return;
      }

      if (event.target.closest('#addNoteBtn')) {
        addNote(show);
        return;
      }

      if (event.target.closest('[data-drawer-edit]')) {
        openEditor(show.id);
        return;
      }

      const removeBtn = event.target.closest('[data-drawer-remove]');
      if (removeBtn) {
        if (!ui.confirmRemove) {
          ui.confirmRemove = true;
          removeBtn.textContent = 'Confirm remove';
          removeBtn.classList.add('btn--danger');
          return;
        }
        removeShow(show);
        return;
      }
    });

    dom.drawerContent.addEventListener('input', event => {
      const show = getShow(ui.drawerId);
      if (!show) return;

      if (event.target.id === 'scoreRange') {
        show.rating = clamp(Math.round(Number(event.target.value) || 0), 0, 10);
        markTouched(show);
        paintScore(show);
        setSaveState('Saving…', true);
        scheduleSave();
        scheduleShelfRefresh();
        return;
      }

      if (event.target.id === 'reviewInput') {
        show.review = event.target.value.slice(0, 6000);
        show.reviewUpdatedAt = Date.now();
        markTouched(show);
        setSaveState('Saving…', true);
        scheduleSave();
        return;
      }

      if (event.target.id === 'epScoreRange') {
        const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
        entry.rating = clamp(Math.round(Number(event.target.value) || 0), 0, 10);
        if (entry.rating > 0) entry.watched = true;
        entry.updatedAt = Date.now();
        setSharedSeen(show, ui.episodeCode, entry.watched);
        markTouched(show);
        paintEpisodeScore(show);
        setSaveState('Saving…', true);
        scheduleSave();
        scheduleShelfRefresh();
        return;
      }

      if (event.target.id === 'epReviewInput') {
        const entry = ensureEpisodeEntry(show, ui.episodeCode, true);
        entry.review = event.target.value.slice(0, 3000);
        entry.updatedAt = Date.now();
        markTouched(show);
        setSaveState('Saving…', true);
        scheduleSave();
        return;
      }

      if (event.target.id === 'noteInput') {
        updateAddNoteState();
      }
    });

    dom.drawerContent.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      }
    });

    dom.modalClose.addEventListener('click', () => closeModal());
    dom.modalCancel.addEventListener('click', () => closeModal());
    dom.modalBackdrop.addEventListener('click', () => closeModal());

    dom.typeSeg.addEventListener('click', event => {
      const btn = event.target.closest('[data-type]');
      if (!btn) return;
      setSegment(dom.typeSeg, 'data-type', btn.dataset.type);
      syncEpisodesField();
    });

    dom.statusSeg.addEventListener('click', event => {
      const btn = event.target.closest('[data-status-value]');
      if (!btn) return;
      setSegment(dom.statusSeg, 'data-status-value', btn.dataset.statusValue);
    });

    dom.titleForm.addEventListener('submit', submitForm);

    dom.fTitle.addEventListener('input', () => {
      if (!dom.titleError.hidden) {
        dom.titleError.hidden = true;
        dom.fTitle.removeAttribute('aria-invalid');
      }
    });

    dom.fPoster.addEventListener('input', () => {
      if (!dom.posterError.hidden) {
        dom.posterError.hidden = true;
        dom.fPoster.removeAttribute('aria-invalid');
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (dom.modal.classList.contains('is-open')) {
          closeModal();
          return;
        }
        if (!dom.profileMenu.hidden) {
          closeMenu();
          return;
        }
        if (ui.drawerId) closeDrawer();
        return;
      }
      if (event.key === 'Tab') {
        if (dom.modal.classList.contains('is-open')) {
          trapFocus(dom.modal, event);
        } else if (ui.drawerId) {
          trapFocus(dom.drawer, event);
        }
      }
    });

    document.addEventListener('click', event => {
      const opener = event.target.closest('[data-open]');
      if (opener) {
        const id = opener.dataset.open;
        if (id) openDrawer(id, opener.dataset.episodeCode || null);
        return;
      }
      const actionEl = event.target.closest('[data-action]');
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === 'add') openEditor();
        if (action === 'load-sampler') loadSampler();
        if (action === 'clear-filters') resetShelfFilters();
        if (action === 'clear-journal-filters') resetJournalFilters();
        if (action === 'goto-shelf') setPage('shelf');
      }
    });

    dom.toastAction.addEventListener('click', () => {
      const callback = toastCallback;
      hideToast();
      if (callback) callback();
    });

    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });

    document.addEventListener('error', event => {
      const img = event.target;
      if (img && img.tagName === 'IMG' && (img.classList.contains('card-img') || img.classList.contains('drawer-img') || img.classList.contains('thumb-img') || img.classList.contains('ep-img'))) {
        img.remove();
      }
    }, true);
  }

  /* ---------- boot ---------- */

  function adoptCatalog(show) {
    if (!show || show.type !== 'series' || show.episodeCatalog) return;
    if (show.title.trim().toLowerCase() !== 'the mentalist') return;
    const catalog = CATALOGS['the-mentalist'];
    if (!Array.isArray(catalog) || !catalog.length) return;
    show.episodeCatalog = 'the-mentalist';
    show.seasons = catalogSeasons(catalog).map(group => group.eps.length);
    show.total = show.seasons.reduce((a, b) => a + b, 0);
  }

  function adoptSeedArt(show) {
    if (!show || show.title.trim().toLowerCase() !== 'the mentalist') return false;
    if (show.poster === MENTALIST_ART) return false;
    if (show.poster && !show.poster.includes('static.tvmaze.com')) return false;
    show.poster = MENTALIST_ART;
    return true;
  }

  function migrateSeeds() {
    if (state.settings.seedVersion >= SEED_VERSION) return;
    const kept = state.shows.filter(show => !show.seed);
    kept.forEach(adoptCatalog);
    const hasSeedTitle = kept.some(show => show.title.trim().toLowerCase() === 'the mentalist');
    state.shows = hasSeedTitle ? kept : seedShows().concat(kept);
    state.settings.seedVersion = SEED_VERSION;
    state.settings.samplerDismissed = false;
    save();
  }

  const PROGRESS_SEED_VERSION = 1;
  const PROGRESS_SEED = { catalog: 'the-mentalist', season: 3, episode: 13 };

  function applyProgressSeed() {
    if (state.settings.progressSeed >= PROGRESS_SEED_VERSION) return false;
    state.shows.forEach(show => {
      if (show.episodeCatalog !== PROGRESS_SEED.catalog) return;
      catalogFor(show).forEach(ep => {
        if (ep.s > PROGRESS_SEED.season) return;
        if (ep.s === PROGRESS_SEED.season && ep.e > PROGRESS_SEED.episode) return;
        const key = epCode(ep);
        const existing = show.episodeEntries[key];
        if (existing) {
          existing.watched = true;
          return;
        }
        show.episodeEntries[key] = { rating: 0, review: '', watched: true, updatedAt: Date.now() };
      });
    });
    state.settings.progressSeed = PROGRESS_SEED_VERSION;
    return true;
  }

  function boot() {
    activeProfile = readProfile();
    migrateLegacyProfile();
    const loaded = loadState();
    let fresh = false;
    if (loaded) {
      state = loaded;
      migrateSeeds();
      let artAdded = false;
      state.shows.forEach(show => { if (adoptSeedArt(show)) artAdded = true; });
      if (artAdded) save({ stamp: false, cloud: false });
    } else {
      state = {
        shows: seedShows(),
        settings: { samplerDismissed: false, seedVersion: SEED_VERSION, updatedAt: 0 }
      };
      fresh = true;
    }
    const seeded = applyProgressSeed();
    const seenSynced = syncSharedSeen();
    if (seeded || seenSynced || fresh) save({ stamp: false, cloud: false });

    dom.sortSelect.value = ui.sort;
    bindEvents();
    paintProfile();
    setPage('shelf');
    renderDataViews();

    initCloud();
    cloudPull(true);
    window.addEventListener('focus', () => cloudPull());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') cloudPull();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
