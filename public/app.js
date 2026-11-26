(() => {
  const state = {
    q: '',
    artist: '',
    tag: '',
    playlist: '',
    favoritesOnly: false,
    sort: 'artist',
    playlists: [],
    currentVideoId: null,
  };

  const el = {
    search: document.getElementById('search'),
    favToggle: document.getElementById('favToggle'),
    scanSection: document.getElementById('scanSection'),
    scanProgressFill: document.getElementById('scanProgressFill'),
    scanProgressLabel: document.getElementById('scanProgressLabel'),
    sortSelect: document.getElementById('sortSelect'),
    grid: document.getElementById('grid'),
    resultCount: document.getElementById('resultCount'),
    emptyState: document.getElementById('emptyState'),
    playlistList: document.getElementById('playlistList'),
    artistList: document.getElementById('artistList'),
    tagList: document.getElementById('tagList'),
    newPlaylistForm: document.getElementById('newPlaylistForm'),
    newPlaylistName: document.getElementById('newPlaylistName'),
    modal: document.getElementById('playerModal'),
    player: document.getElementById('player'),
    closeModal: document.getElementById('closeModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalArtist: document.getElementById('modalArtist'),
    modalFav: document.getElementById('modalFav'),
    modalWatched: document.getElementById('modalWatched'),
    modalTags: document.getElementById('modalTags'),
    addTagForm: document.getElementById('addTagForm'),
    addTagInput: document.getElementById('addTagInput'),
    playlistSelect: document.getElementById('playlistSelect'),
    addToPlaylistBtn: document.getElementById('addToPlaylistBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    scanWarning: document.getElementById('scanWarning'),
    playlistAddStatus: document.getElementById('playlistAddStatus'),
    removeFromPlaylistBtn: document.getElementById('removeFromPlaylistBtn'),
    aboutBtn: document.getElementById('aboutBtn'),
    aboutModal: document.getElementById('aboutModal'),
    closeAbout: document.getElementById('closeAbout'),
    aboutVersion: document.getElementById('aboutVersion'),
    aboutCopyright: document.getElementById('aboutCopyright'),
    aboutLink: document.getElementById('aboutLink'),
    playerStage: document.getElementById('playerStage'),
    nowOverlay: document.getElementById('nowOverlay'),
    overlayLabel: document.getElementById('overlayLabel'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayArtist: document.getElementById('overlayArtist'),
    skipNotice: document.getElementById('skipNotice'),
    backBtn: document.getElementById('backBtn'),
    nextBtn: document.getElementById('nextBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    queuePos: document.getElementById('queuePos'),
    upNext: document.getElementById('upNext'),
    playAllBtn: document.getElementById('playAllBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelp: document.getElementById('closeHelp'),
    lookSelect: document.getElementById('lookSelect'),
  };

  // The videos the grid is showing, in its order: what Play all, Shuffle and Next work through.
  let lastVideos = [];

  let debounceTimer = null;
  function debounce(fn, ms) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), ms);
    };
  }

  function formatDuration(sec) {
    if (!sec && sec !== 0) return '';
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  async function api(path, opts) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (res.status === 401) {
      location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `Request failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Shows a failed request instead of leaving the click silently doing nothing.
  function reportError(err) {
    if (err && err.message !== 'unauthorized') alert(`Something went wrong: ${err.message}`);
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.artist) params.set('artist', state.artist);
    if (state.tag) params.set('tag', state.tag);
    if (state.playlist) params.set('playlist', state.playlist);
    if (state.favoritesOnly) params.set('favorite', '1');
    params.set('sort', state.sort);
    return params.toString();
  }

  // Typing quickly fires several searches; only the newest one is drawn, so a slow earlier reply
  // can't overwrite it.
  let loadSeq = 0;
  async function loadVideos() {
    const seq = ++loadSeq;
    const videos = await api(`/videos?${buildQuery()}`);
    if (seq === loadSeq) renderGrid(videos);
  }

  function renderGrid(videos) {
    lastVideos = videos;
    el.playAllBtn.disabled = videos.length === 0;
    el.shuffleBtn.disabled = videos.length === 0;
    el.resultCount.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
    el.emptyState.classList.toggle('hidden', videos.length > 0);
    el.grid.innerHTML = videos.map(cardHtml).join('');
    el.grid.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => openPlayer(Number(card.dataset.id)));
    });
    el.grid.querySelectorAll('.add-playlist-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlaylistPopover(Number(btn.dataset.id), btn);
      });
    });
  }

  function cardHtml(v) {
    const thumb = v.thumbnail
      ? `<img src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy" />`
      : `<div class="noimg">🎵</div>`;
    const tags = v.tags.slice(0, 3).map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    return `
      <div class="card" data-id="${v.id}">
        <div class="card-thumb">
          ${thumb}
          ${v.favorite ? '<div class="fav-badge">★</div>' : ''}
          ${v.duration ? `<div class="duration-badge">${formatDuration(v.duration)}</div>` : ''}
          <button class="add-playlist-btn" data-id="${v.id}" title="Add to playlist" aria-label="Add to playlist">+</button>
          <div class="play-badge">▶</div>
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(v.title)}</div>
          <div class="card-artist">${escapeHtml(v.artist)}</div>
          ${tags ? `<div class="card-tags">${tags}</div>` : ''}
        </div>
      </div>`;
  }

  // Safe for text and for attribute values (quotes included), so an artist folder or tag with
  // a " in it can't break out of a data-* attribute.
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function loadSidebar() {
    const [artists, tags, playlists] = await Promise.all([api('/artists'), api('/tags'), api('/playlists')]);

    el.artistList.innerHTML = artists
      .map((a) => `<li data-artist="${escapeHtml(a.artist)}" class="${state.artist === a.artist ? 'active' : ''}">${escapeHtml(a.artist)} <span class="count">${a.count}</span></li>`)
      .join('');
    el.tagList.innerHTML = tags
      .map((t) => `<li data-tag="${escapeHtml(t.name)}" class="${state.tag === t.name ? 'active' : ''}">${escapeHtml(t.name)} <span class="count">${t.count}</span></li>`)
      .join('');

    state.playlists = playlists;
    el.playlistList.innerHTML =
      `<li data-playlist="" class="${state.playlist === '' ? 'active' : ''}">All Videos</li>` +
      playlists
        .map(
          (p) =>
            `<li data-playlist="${p.id}" class="${String(state.playlist) === String(p.id) ? 'active' : ''}">
              <span class="playlist-name">${escapeHtml(p.name)} <span class="count">${p.count}</span></span>
              <button class="playlist-delete" data-playlist-id="${p.id}" data-playlist-name="${escapeHtml(p.name)}" title="Delete playlist" aria-label="Delete playlist ${escapeHtml(p.name)}">✕</button>
            </li>`
        )
        .join('');

    el.playlistSelect.innerHTML = playlists.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

    el.artistList.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => {
        state.artist = state.artist === li.dataset.artist ? '' : li.dataset.artist;
        refresh();
      })
    );
    el.tagList.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => {
        state.tag = state.tag === li.dataset.tag ? '' : li.dataset.tag;
        refresh();
      })
    );
    el.playlistList.querySelectorAll('li[data-playlist]').forEach((li) =>
      li.addEventListener('click', () => {
        state.playlist = li.dataset.playlist;
        refresh();
      })
    );
    el.playlistList.querySelectorAll('.playlist-delete').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.playlistName;
        if (!confirm(`Delete playlist "${name}"? The videos themselves won't be affected.`)) return;
        const id = btn.dataset.playlistId;
        try {
          await api(`/playlists/${id}`, { method: 'DELETE' });
        } catch (err) {
          return reportError(err);
        }
        if (String(state.playlist) === String(id)) state.playlist = '';
        refresh();
      })
    );
  }

  function refresh() {
    loadVideos().catch(reportError);
    loadSidebar().catch(reportError);
  }

  // ---------- Quick "add to playlist" popover on card thumbnails ----------
  const playlistPopover = document.createElement('div');
  playlistPopover.id = 'playlistPopover';
  playlistPopover.className = 'playlist-popover hidden';
  document.body.appendChild(playlistPopover);

  function closePlaylistPopover() {
    playlistPopover.classList.add('hidden');
  }

  function openPlaylistPopover(videoId, anchorEl) {
    if (!playlistPopover.classList.contains('hidden') && playlistPopover.dataset.videoId === String(videoId)) {
      closePlaylistPopover();
      return;
    }
    playlistPopover.dataset.videoId = videoId;

    if (state.playlists.length === 0) {
      playlistPopover.innerHTML = `<div class="popover-empty">No playlists yet — create one in the sidebar.</div>`;
    } else {
      playlistPopover.innerHTML = state.playlists
        .map((p) => `<button data-playlist-id="${p.id}">${escapeHtml(p.name)}</button>`)
        .join('');
      playlistPopover.querySelectorAll('button').forEach((btn) =>
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.disabled = true;
          try {
            await api(`/playlists/${btn.dataset.playlistId}/videos`, {
              method: 'POST',
              body: JSON.stringify({ videoId }),
            });
          } catch (err) {
            btn.disabled = false;
            return reportError(err);
          }
          btn.textContent = 'Added ✓';
          refresh();
          setTimeout(closePlaylistPopover, 400);
        })
      );
    }

    const rect = anchorEl.getBoundingClientRect();
    playlistPopover.style.top = `${window.scrollY + rect.bottom + 6}px`;
    playlistPopover.style.left = `${window.scrollX + Math.min(rect.left, window.innerWidth - 200)}px`;
    playlistPopover.classList.remove('hidden');
  }

  document.addEventListener('click', (e) => {
    if (!playlistPopover.contains(e.target) && !e.target.classList.contains('add-playlist-btn')) {
      closePlaylistPopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlaylistPopover();
  });

  // ---------- Modal / player ----------
  // What the player works through. Clicking a video queues the whole page (so Next and Back
  // step through it) but stops when that video ends; Play all and Shuffle keep going.
  const queue = {
    items: [], // video objects from the grid
    pos: -1,
    autoAdvance: false,
    failures: 0, // unplayable videos skipped in a row, so a list of nothing playable stops
  };

  // A video counts as played (and watched) once it has run for 5 seconds. One listener for the
  // whole page, so closing a video early can't count it later while a different one plays.
  let autoMarkWatched = false;
  let countPlay = false;
  let upNextShownFor = null;
  el.player.addEventListener('timeupdate', () => {
    const id = state.currentVideoId;
    if (!id) return;
    const t = el.player.currentTime;
    if (t > 5) {
      if (countPlay) {
        countPlay = false;
        queue.failures = 0;
        api(`/videos/${id}/played`, { method: 'POST' }).catch(() => {});
      }
      if (autoMarkWatched) {
        autoMarkWatched = false;
        setWatched(id, true).catch(reportError);
      }
    }
    // In full screen, show what's next near the end of the video, as the Up next line is hidden.
    const next = nextItem();
    const left = el.player.duration - t;
    if (queue.autoAdvance && next && isFullscreen() && left < 10 && left > 0 && upNextShownFor !== id) {
      upNextShownFor = id;
      showOverlay('Up next', next, 6000);
    }
  });

  el.player.addEventListener('ended', () => {
    if (queue.autoAdvance) goNext(true);
  });

  // The file is missing or the browser can't read it. Skipped during Play all and Shuffle.
  el.player.addEventListener('error', () => {
    if (!state.currentVideoId || !el.player.getAttribute('src')) return;
    handleUnplayable('it couldn’t be opened');
  });

  // Some formats (MKV, AVI, HEVC) open but only the sound plays. No picture counts as unplayable.
  el.player.addEventListener('loadedmetadata', () => {
    if (state.currentVideoId && el.player.videoWidth === 0 && el.player.videoHeight === 0) {
      handleUnplayable('this browser can’t show its picture');
    }
  });

  let skipTimer = null;
  function handleUnplayable(why) {
    const v = queue.items[queue.pos];
    const name = v && v.title ? `${v.artist} – ${v.title}` : 'This video';
    clearTimeout(skipTimer);
    if (queue.autoAdvance && nextItem()) {
      queue.failures++;
      if (queue.failures >= queue.items.length) {
        showSkipNotice('None of these videos can be played in this browser.', 0);
        return;
      }
      showSkipNotice(`Skipped ${name}: ${why}.`);
      el.player.pause();
      skipTimer = setTimeout(() => goNext(true), 1500);
    } else {
      showSkipNotice(`Can’t play ${name}: ${why}. MP4 (H.264) and WebM play best.`, 0);
    }
  }

  let noticeTimer = null;
  function showSkipNotice(text, ms = 4000) {
    el.skipNotice.textContent = text;
    el.skipNotice.classList.remove('hidden');
    clearTimeout(noticeTimer);
    if (ms) noticeTimer = setTimeout(() => el.skipNotice.classList.add('hidden'), ms);
  }
  function hideSkipNotice() {
    clearTimeout(noticeTimer);
    el.skipNotice.classList.add('hidden');
  }

  let overlayTimer = null;
  function showOverlay(label, v, ms = 5000) {
    el.overlayLabel.textContent = label;
    el.overlayTitle.textContent = v.title;
    el.overlayArtist.textContent = v.artist;
    el.nowOverlay.classList.add('visible');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => el.nowOverlay.classList.remove('visible'), ms);
  }

  async function setWatched(id, watched) {
    await api(`/videos/${id}`, { method: 'PATCH', body: JSON.stringify({ watched }) });
    if (state.currentVideoId === id) setPressed(el.modalWatched, watched);
  }

  function setPressed(btn, on) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  function nextItem() {
    return queue.items[queue.pos + 1] || null;
  }

  // Fair shuffle: fewest plays first (everything gets a turn before anything repeats), random
  // within each play count, and the same artist not twice in a row where that can be helped.
  function fairShuffle(videos) {
    const groups = new Map();
    for (const v of videos) {
      const n = v.playCount || 0;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(v);
    }
    const out = [];
    for (const n of [...groups.keys()].sort((a, b) => a - b)) {
      const g = groups.get(n);
      for (let i = g.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [g[i], g[j]] = [g[j], g[i]];
      }
      for (let i = 0; i < g.length; i++) {
        const prev = i > 0 ? g[i - 1] : out[out.length - 1];
        if (prev && g[i].artist === prev.artist) {
          const k = g.findIndex((x, idx) => idx > i && x.artist !== prev.artist);
          if (k !== -1) [g[i], g[k]] = [g[k], g[i]];
        }
      }
      out.push(...g);
    }
    return out;
  }

  function startQueue(videos, startIndex, autoAdvance) {
    if (!videos.length) return;
    queue.items = videos.slice();
    queue.autoAdvance = autoAdvance;
    queue.failures = 0;
    playAt(startIndex);
  }

  let playSeq = 0;
  async function playAt(pos) {
    const item = queue.items[pos];
    if (!item) return;
    const seq = ++playSeq;
    let v;
    try {
      v = await api(`/videos/${item.id}`);
    } catch (err) {
      if (seq !== playSeq) return;
      if (err.status === 404 && queue.autoAdvance && queue.items[pos + 1]) {
        // Removed by a scan since the page was drawn: move on.
        queue.pos = pos;
        return goNext(true);
      }
      return reportError(err);
    }
    if (seq !== playSeq) return; // a quicker Next/Back press got there first
    queue.pos = pos;
    queue.items[pos] = v;
    clearTimeout(skipTimer);
    hideSkipNotice();
    state.currentVideoId = v.id;
    autoMarkWatched = !v.watched;
    countPlay = true;
    upNextShownFor = null;
    el.player.src = `/api/videos/${v.id}/stream`;
    el.player.play().catch(() => {
      // Autoplay can be blocked until the page has been clicked; the play button still works.
    });
    el.modalTitle.textContent = v.title;
    el.modalArtist.textContent = v.artist;
    setPressed(el.modalFav, v.favorite);
    setPressed(el.modalWatched, v.watched);
    renderModalTags(v.tags);
    el.playlistAddStatus.textContent = '';
    updateRemoveFromPlaylist(v.playlists || []);
    updateTransport();
    updateMediaSession(v);
    showOverlay(queue.autoAdvance && queue.items.length > 1 ? 'Now playing' : '', v);
    if (el.modal.classList.contains('hidden')) {
      el.modal.classList.remove('hidden');
      el.playerStage.focus();
    }
  }

  function updateTransport() {
    const n = queue.items.length;
    const next = nextItem();
    el.queuePos.textContent = n > 1 ? `${queue.pos + 1} of ${n}` : '';
    el.nextBtn.disabled = !next;
    if (next) {
      el.upNext.innerHTML = `Up next: <b>${escapeHtml(next.title)}</b> – ${escapeHtml(next.artist)}`;
    } else {
      el.upNext.textContent = queue.autoAdvance && n > 1 ? 'Last video in the list' : '';
    }
  }

  function goNext(auto) {
    if (nextItem()) return playAt(queue.pos + 1);
    if (auto) showSkipNotice('That was the last video in the list.', 0);
  }

  // Back starts the video again, or goes to the previous one if it's within 3 seconds of the start.
  function goBack() {
    if (el.player.currentTime > 3 || queue.pos <= 0) {
      el.player.currentTime = 0;
      el.player.play().catch(() => {});
      return;
    }
    playAt(queue.pos - 1);
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) Promise.resolve(exit.call(document)).catch(() => {});
  }

  function toggleFullscreen() {
    if (isFullscreen()) return exitFullscreen();
    const stage = el.playerStage;
    if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    // iPhone has no full screen for page elements, only for the video itself.
    else if (el.player.webkitEnterFullscreen) el.player.webkitEnterFullscreen();
  }

  function onFullscreenChange() {
    el.fullscreenBtn.textContent = isFullscreen() ? '⛶ Exit full screen' : '⛶ Full screen';
    if (!el.modal.classList.contains('hidden')) el.playerStage.focus();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // Media keys on keyboards and headphones, and the lock screen / notification controls.
  const media = 'mediaSession' in navigator ? navigator.mediaSession : null;
  function updateMediaSession(v) {
    if (!media || typeof MediaMetadata === 'undefined') return;
    const artwork = v.thumbnail ? [{ src: v.thumbnail, sizes: '480x270', type: 'image/jpeg' }] : [];
    media.metadata = new MediaMetadata({ title: v.title, artist: v.artist, album: 'Music Video Cataloguer', artwork });
  }
  if (media) {
    const handlers = {
      play: () => el.player.play().catch(() => {}),
      pause: () => el.player.pause(),
      previoustrack: () => state.currentVideoId && goBack(),
      nexttrack: () => state.currentVideoId && goNext(false),
      seekbackward: () => (el.player.currentTime = Math.max(0, el.player.currentTime - 10)),
      seekforward: () => (el.player.currentTime = el.player.currentTime + 10),
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        media.setActionHandler(action, fn);
      } catch {
        // this browser doesn't offer that action
      }
    }
  }

  function openPlayer(id) {
    const pos = lastVideos.findIndex((v) => v.id === id);
    if (pos === -1) startQueue([{ id }], 0, false);
    else startQueue(lastVideos, pos, false);
  }

  // When the grid is showing a playlist, the player offers to take the video out of it again.
  function updateRemoveFromPlaylist(videoPlaylists) {
    const current = state.playlists.find((p) => String(p.id) === String(state.playlist));
    const show = current && videoPlaylists.some((pid) => String(pid) === String(current.id));
    el.removeFromPlaylistBtn.classList.toggle('hidden', !show);
    if (show) el.removeFromPlaylistBtn.textContent = `Remove from "${current.name}"`;
  }

  function renderModalTags(tags) {
    el.modalTags.innerHTML = tags
      .map((t) => `<span>${escapeHtml(t)} <button data-tag="${escapeHtml(t)}" title="Remove tag" aria-label="Remove tag ${escapeHtml(t)}">✕</button></span>`)
      .join('');
    el.modalTags.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          const v = await api(`/videos/${state.currentVideoId}`);
          const newTags = v.tags.filter((t) => t !== btn.dataset.tag);
          const updated = await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ tags: newTags }) });
          renderModalTags(updated.tags);
          loadSidebar().catch(reportError);
        } catch (err) {
          reportError(err);
        }
      })
    );
  }

  function closePlayer() {
    if (isFullscreen()) exitFullscreen();
    playSeq++;
    el.modal.classList.add('hidden');
    el.player.pause();
    // removeAttribute + load() stops the download; setting src to '' makes the browser request
    // the page itself as a video.
    el.player.removeAttribute('src');
    el.player.load();
    state.currentVideoId = null;
    autoMarkWatched = false;
    countPlay = false;
    clearTimeout(skipTimer);
    clearTimeout(overlayTimer);
    el.nowOverlay.classList.remove('visible');
    hideSkipNotice();
    queue.items = [];
    queue.pos = -1;
    if (media) media.metadata = null;
    refresh();
  }

  el.closeModal.addEventListener('click', closePlayer);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closePlayer();
  });
  el.backBtn.addEventListener('click', goBack);
  el.nextBtn.addEventListener('click', () => goNext(false));
  el.fullscreenBtn.addEventListener('click', toggleFullscreen);
  el.playerStage.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  el.playAllBtn.addEventListener('click', () => startQueue(lastVideos, 0, true));
  el.shuffleBtn.addEventListener('click', () => startQueue(fairShuffle(lastVideos), 0, true));

  function isTyping(t) {
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // The browser uses Esc to leave full screen; only close things when not in full screen.
      if (isFullscreen()) return;
      if (!el.helpModal.classList.contains('hidden')) closeHelp();
      else if (!el.aboutModal.classList.contains('hidden')) closeAbout();
      else if (!el.modal.classList.contains('hidden')) closePlayer();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (e.key === '?') {
      if (el.aboutModal.classList.contains('hidden')) openHelp();
      return;
    }
    const playerOpen =
      !el.modal.classList.contains('hidden') && el.helpModal.classList.contains('hidden') && el.aboutModal.classList.contains('hidden');
    if (!playerOpen) return;
    // The video's own controls already handle Space and the arrows when they have focus.
    const onVideo = e.target === el.player;
    const onButton = e.target.tagName === 'BUTTON';
    switch (e.key.toLowerCase()) {
      case ' ':
      case 'k':
        if (onVideo || (onButton && e.key === ' ')) return;
        e.preventDefault();
        if (el.player.paused) el.player.play().catch(() => {});
        else el.player.pause();
        break;
      case 'n':
        goNext(false);
        break;
      case 'b':
        goBack();
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        el.player.muted = !el.player.muted;
        break;
      case 'arrowleft':
        if (onVideo) return;
        e.preventDefault();
        el.player.currentTime = Math.max(0, el.player.currentTime - 10);
        break;
      case 'arrowright':
        if (onVideo) return;
        e.preventDefault();
        el.player.currentTime = el.player.currentTime + 10;
        break;
      default:
    }
  });

  el.modalFav.addEventListener('click', async () => {
    const active = !el.modalFav.classList.contains('active');
    try {
      await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ favorite: active }) });
      setPressed(el.modalFav, active);
    } catch (err) {
      reportError(err);
    }
  });

  el.modalWatched.addEventListener('click', () => {
    const active = !el.modalWatched.classList.contains('active');
    // Ticking or unticking by hand overrides the automatic "watched after 5 seconds".
    autoMarkWatched = false;
    setWatched(state.currentVideoId, active).catch(reportError);
  });

  el.addTagForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = el.addTagInput.value.trim();
    if (!val) return;
    try {
      const v = await api(`/videos/${state.currentVideoId}`);
      const newTags = [...new Set([...v.tags, val])];
      const updated = await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ tags: newTags }) });
      renderModalTags(updated.tags);
      el.addTagInput.value = '';
      loadSidebar().catch(reportError);
    } catch (err) {
      reportError(err);
    }
  });

  el.addToPlaylistBtn.addEventListener('click', async () => {
    const playlistId = el.playlistSelect.value;
    if (!playlistId || !state.currentVideoId) return;
    try {
      await api(`/playlists/${playlistId}/videos`, { method: 'POST', body: JSON.stringify({ videoId: state.currentVideoId }) });
    } catch (err) {
      return reportError(err);
    }
    const name = el.playlistSelect.selectedOptions[0]?.textContent || 'playlist';
    el.playlistAddStatus.textContent = `Added to ${name} ✓`;
    loadSidebar().catch(reportError);
  });

  el.removeFromPlaylistBtn.addEventListener('click', async () => {
    if (!state.playlist || !state.currentVideoId) return;
    try {
      await api(`/playlists/${state.playlist}/videos/${state.currentVideoId}`, { method: 'DELETE' });
    } catch (err) {
      return reportError(err);
    }
    el.removeFromPlaylistBtn.classList.add('hidden');
    el.playlistAddStatus.textContent = 'Removed from this playlist ✓';
  });

  // ---------- About ----------
  let aboutLoaded = false;
  async function openAbout() {
    if (!aboutLoaded) {
      try {
        const about = await api('/about');
        el.aboutVersion.textContent = `v${about.version}`;
        el.aboutCopyright.textContent = about.copyright;
        el.aboutLink.href = about.homepage;
        el.aboutLink.textContent = about.homepage.replace(/^https?:\/\//, '');
        aboutLoaded = true;
      } catch (err) {
        return reportError(err);
      }
    }
    el.aboutModal.classList.remove('hidden');
    el.closeAbout.focus();
  }
  function closeAbout() {
    el.aboutModal.classList.add('hidden');
  }
  el.aboutBtn.addEventListener('click', openAbout);
  el.closeAbout.addEventListener('click', closeAbout);
  el.aboutModal.addEventListener('click', (e) => {
    if (e.target === el.aboutModal) closeAbout();
  });

  // ---------- Help ----------
  function openHelp() {
    el.helpModal.classList.remove('hidden');
    el.closeHelp.focus();
  }
  function closeHelp() {
    el.helpModal.classList.add('hidden');
    if (!el.modal.classList.contains('hidden')) el.playerStage.focus();
  }
  el.helpBtn.addEventListener('click', openHelp);
  el.closeHelp.addEventListener('click', closeHelp);
  el.helpModal.addEventListener('click', (e) => {
    if (e.target === el.helpModal) closeHelp();
  });

  // ---------- Look (light / dark) ----------
  el.lookSelect.value = document.documentElement.getAttribute('data-look') || 'dark';
  el.lookSelect.addEventListener('change', () => {
    const look = el.lookSelect.value;
    document.documentElement.setAttribute('data-look', look);
    try {
      localStorage.setItem('mvc.look', look);
    } catch {
      // storage blocked: the look still changes for this visit
    }
  });

  // ---------- Top controls ----------
  el.search.addEventListener(
    'input',
    debounce((e) => {
      state.q = e.target.value.trim();
      loadVideos().catch(reportError);
    }, 250)
  );

  el.favToggle.addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    setPressed(el.favToggle, state.favoritesOnly);
    loadVideos().catch(reportError);
  });

  el.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadVideos().catch(reportError);
  });

  let wasScanning = false;

  function updateScanUI(status) {
    el.scanWarning.textContent = status.warning ? `⚠ Last scan: ${status.warning}.` : '';
    el.scanWarning.classList.toggle('hidden', !status.warning || status.running);
    if (!status.running) {
      el.scanSection.classList.add('hidden');
      return;
    }
    el.scanSection.classList.remove('hidden');
    const total = status.total || 0;
    const scanned = status.scanned || 0;
    if (total > 0) {
      const pct = Math.min(100, Math.round((scanned / total) * 100));
      el.scanProgressFill.classList.remove('indeterminate');
      el.scanProgressFill.style.width = `${pct}%`;
      el.scanProgressLabel.textContent = `${scanned} / ${total} files — ${pct}%`;
    } else {
      el.scanProgressFill.classList.add('indeterminate');
      el.scanProgressFill.style.width = '';
      el.scanProgressLabel.textContent = 'Scanning…';
    }
  }

  async function pollScanStatusTick() {
    let status;
    try {
      status = await api('/scan/status');
    } catch {
      return;
    }
    updateScanUI(status);

    if (wasScanning && !status.running) refresh();
    wasScanning = status.running;
  }

  setInterval(pollScanStatusTick, 2000);
  pollScanStatusTick();

  el.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login';
  });

  el.newPlaylistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el.newPlaylistName.value.trim();
    if (!name) return;
    try {
      await api('/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      el.newPlaylistName.value = '';
      loadSidebar().catch(reportError);
    } catch (err) {
      if (err.status === 409) alert('A playlist with that name already exists.');
      else reportError(err);
    }
  });

  refresh();
})();
