/*
 * راوي — static/js/voice.js
 * window.Rawi.Voice: push-to-talk recording, audio upload and dictation.
 * Contract: docs/SPEC.md §7.3. Vanilla JS, no dependencies, never throws.
 * Masking secrets is the caller's job (Rawi.mask) before text is shown or sent.
 */
(function () {
  'use strict';

  var Rawi = window.Rawi = window.Rawi || {};

  /* ------------------------------------------------------------------ */
  /* capabilities                                                        */
  /* ------------------------------------------------------------------ */

  var SR = null;
  try { SR = window.SpeechRecognition || window.webkitSpeechRecognition || null; } catch (_) { SR = null; }

  var HAS_RECORDER = false;
  try {
    HAS_RECORDER = typeof window.MediaRecorder === 'function' &&
      !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  } catch (_) { HAS_RECORDER = false; }

  var HAS_SYNTH = false;
  try { HAS_SYNTH = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; } catch (_) { HAS_SYNTH = false; }

  /** Preferred recorder MIME type: webm (Chrome/Firefox/Edge), mp4 (Safari), else browser default (''). */
  var MIME = (function () {
    if (!HAS_RECORDER) return '';
    try {
      if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
      var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    } catch (_) {}
    return '';
  })();

  /* ------------------------------------------------------------------ */
  /* copy (Jordanian)                                                    */
  /* ------------------------------------------------------------------ */

  var T = {
    hold: 'ضلّ ضاغط وانت بتحكي',
    denied: 'اسمح للمايكروفون من إعدادات المتصفح — أو اكتب الجواب',
    deniedAsk: 'اسمح للمايكروفون من إعدادات المتصفح — أو اكتب سؤالك',
    allowFirst: 'اسمح للمايكروفون، وبعدها ضلّ ضاغط وانت بتحكي',
    nothing: 'ما وصلني صوت — ضلّ ضاغط وانت بتحكي، أو اكتب الجواب',
    noMic: 'ما لقيت مايكروفون شغّال — اكتب الجواب',
    unsupported: 'المتصفح ما بيدعم التسجيل — اكتب الجواب، أو جرّب Chrome',
    noSpeech: 'ما سمعت إشي — اضغط واحكي كمان مرة',
    network: 'تحويل الصوت لنص بدّه إنترنت — اكتب سؤالك'
  };

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function now() { return Date.now(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /** Report a bug in a caller's callback without breaking our own state machine. */
  function report(err) {
    try {
      if (typeof window.reportError === 'function') window.reportError(err);
      else setTimeout(function () { throw err; });
    } catch (_) {}
  }

  /** Call an optional callback safely. */
  function call(fn) {
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { report(e); }
    return undefined;
  }

  /** Rawi.toast if rawi.js is loaded; silent otherwise. */
  function toast(msg, kind) {
    try {
      var R = window.Rawi;
      if (R && typeof R.toast === 'function') R.toast(msg, {kind: kind || 'info'});
    } catch (_) {}
  }

  /** Silence anything that would talk over the microphone: speech synthesis, Rawi's player, page media. */
  function hushOutput() {
    try { if (HAS_SYNTH) window.speechSynthesis.cancel(); } catch (_) {}
    try {
      var R = window.Rawi;
      if (R && R.audio && typeof R.audio.stop === 'function') R.audio.stop();
    } catch (_) {}
    try {
      var media = document.querySelectorAll('audio, video');
      for (var i = 0; i < media.length; i++) if (!media[i].paused) media[i].pause();
    } catch (_) {}
  }

  /** True when keyboard focus is somewhere the user types (Space must stay a space there). */
  function isTypingTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.isContentEditable) return true;
      return !!el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    } catch (_) { return false; }
  }

  /** True when the element is in the document and rendered (not display:none / hidden / inert). */
  function isShown(el) {
    try {
      if (!el || !el.isConnected) return false;
      if (el.closest('[hidden], [inert]')) return false;
      return el.getClientRects().length > 0;
    } catch (_) { return false; }
  }

  /** True when a modal / dialog that does not contain `el` is open or focused. */
  function blockedByDialog(el) {
    try {
      var a = document.activeElement;
      var d = a && a.closest ? a.closest('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]') : null;
      if (d && !d.contains(el)) return true;
      var m = null;
      try { m = document.querySelector('dialog:modal'); } catch (_) { m = null; }
      if (m && !m.contains(el)) return true;
    } catch (_) {}
    return false;
  }

  function isPermissionError(err) {
    var n = err && err.name;
    return n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError';
  }

  function baseType(type) { return String(type || '').split(';')[0].trim().toLowerCase(); }

  function extFor(type) {
    var t = baseType(type);
    if (/mp4|m4a|aac|mpeg/.test(t)) return 'mp4';
    if (/ogg/.test(t)) return 'ogg';
    if (/wav/.test(t)) return 'wav';
    return 'webm';
  }

  /* ------------------------------------------------------------------ */
  /* shared microphone stream + single owner lock                        */
  /* ------------------------------------------------------------------ */

  var mic = {stream: null, pending: null, owner: null, ptts: 0, granted: false};

  // know whether the mic permission is already granted (so a quick first tap is not mistaken for a prompt)
  try {
    if (HAS_RECORDER && navigator.permissions && typeof navigator.permissions.query === 'function') {
      navigator.permissions.query({name: 'microphone'}).then(function (st) {
        mic.granted = st.state === 'granted';
        try { st.onchange = function () { mic.granted = st.state === 'granted'; }; } catch (_) {}
      }, function () {});
    }
  } catch (_) {}

  function streamLive(s) {
    try {
      var tr = s && s.getAudioTracks ? s.getAudioTracks() : [];
      for (var i = 0; i < tr.length; i++) if (tr[i].readyState === 'live') return true;
    } catch (_) {}
    return false;
  }

  /**
   * Get (or reuse) the microphone stream. One getUserMedia call is shared by concurrent callers,
   * and the resulting stream is reused across recordings so the permission prompt shows once.
   * @returns {Promise<MediaStream>} rejects with the getUserMedia error
   */
  function getStream() {
    if (streamLive(mic.stream)) return Promise.resolve(mic.stream);
    if (mic.pending) return mic.pending;
    var p;
    try {
      p = navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}
      });
    } catch (e) {
      p = Promise.reject(e);
    }
    mic.pending = p.then(function (s) {
      mic.pending = null;
      mic.stream = s;
      mic.granted = true;
      return s;
    }, function (e) {
      mic.pending = null;
      throw e;
    });
    return mic.pending;
  }

  /** Stop the shared microphone stream (turns off the browser's mic indicator). */
  function releaseStream() {
    var s = mic.stream;
    mic.stream = null;
    try { if (s) s.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /* recognition text assembly                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Build {final, interim} for ONE recognition run from all its results.
   * Rebuilding from index 0 (instead of resultIndex) is robust to Android Chrome,
   * which re-sends cumulative finals; a final that extends the text so far replaces it.
   */
  function readResults(results) {
    var fin = '', interim = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var t = r && r[0] ? clean(r[0].transcript) : '';
      if (!t) continue;
      if (r.isFinal) {
        if (fin && t.indexOf(fin) === 0) fin = t;
        else fin = clean(fin + ' ' + t);
      } else {
        interim = clean(interim + ' ' + t);
      }
    }
    return {final: fin, interim: interim};
  }

  var FATAL_REC = {'not-allowed': 1, 'service-not-allowed': 1, 'audio-capture': 1, 'network': 1, 'bad-grammar': 1};

  /* ------------------------------------------------------------------ */
  /* createPTT                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Turn a button into a push-to-talk control: hold (pointer or Space) to record, release to get
   * the transcript and the recorded audio. Keyboard/screen-reader activation (a click with no pointer,
   * e.g. Enter) toggles recording on and off.
   *
   * @param {Object} opts
   * @param {HTMLElement} opts.button               the push-to-talk button (required)
   * @param {function(): boolean} [opts.enabled]    return false to ignore presses (e.g. while Rawi is thinking)
   * @param {boolean} [opts.keyboard=true]          hold Space to talk (ignored while typing in a field)
   * @param {string} [opts.lang='ar-JO']            speech recognition language
   * @param {number} [opts.minMs=350]               shorter presses with no text count as a tap (no result)
   * @param {number} [opts.maxMs=600000]            safety cap: recording stops by itself after this long
   * @param {function()} [opts.onStart]             recording started (UI is now "listening")
   * @param {function(string)} [opts.onLive]        live transcript so far (final + interim), unmasked
   * @param {function(number)} [opts.onTick]        elapsed milliseconds, ~4 times a second while recording
   * @param {function()} [opts.onStop]              recording ended (released); the result follows shortly
   * @param {function({text: string, blob: ?Blob, url: ?string, durationMs: number})} [opts.onResult]
   *        called once per recording that captured text or audio. `text` may be '' when only audio was
   *        captured (no recognition, no internet); `url` is a blob: URL for playback, or null.
   * @returns {{start: function(): Promise<void>, stop: function(): Promise<void>, destroy: function(): void,
   *            isRecording: function(): boolean}}
   */
  function createPTT(opts) {
    opts = opts || {};
    var button = opts.button || null;
    var lang = opts.lang || 'ar-JO';
    var keyboard = opts.keyboard !== false;
    var minMs = typeof opts.minMs === 'number' ? opts.minMs : 350;
    var maxMs = typeof opts.maxMs === 'number' && opts.maxMs > 0 ? opts.maxMs : 600000;

    var cur = null;          // the current recording session (null when idle)
    var keyHeld = false;     // Space keydown was claimed by us → claim the keyup too
    var lastPointerAt = 0;   // last pointer press/release on the button (to tell keyboard clicks apart)
    var destroyed = false;
    var listeners = [];

    var api = {
      start: function () { return start('api'); },
      stop: function () { return stop(); },
      destroy: destroy,
      isRecording: function () { return !!(cur && !cur.stopping); }
    };
    if (!button || typeof button.addEventListener !== 'function') {
      destroyed = true;
      return api;
    }
    mic.ptts++;

    function target() {
      try { return button.closest('.ptt-wrap') || button; } catch (_) { return button; }
    }

    function setUI(state) {
      var t = target();
      try {
        t.classList.toggle('is-recording', state === 'rec');
        t.classList.toggle('is-processing', state === 'busy');
        button.setAttribute('aria-pressed', state === 'rec' ? 'true' : 'false');
      } catch (_) {}
    }

    function on(el, type, fn, o) {
      try { el.addEventListener(type, fn, o); listeners.push([el, type, fn, o]); } catch (_) {}
    }

    function allowed() {
      if (destroyed || button.disabled) return false;
      if (typeof opts.enabled === 'function') {
        try { return opts.enabled() !== false; } catch (e) { report(e); return false; }
      }
      return true;
    }

    function liveText(s) { return clean(s.committed + ' ' + s.final + ' ' + s.interim); }

    /* ---- recognition ---- */
    function startRecognition(s) {
      if (!SR || s.recDead || !s.holding) return;
      var r;
      try {
        r = new SR();
        r.lang = s.lang;
        r.continuous = true;
        r.interimResults = true;
        try { r.maxAlternatives = 1; } catch (_) {}
      } catch (_) { s.recDead = true; return; }
      s.rec = r;
      s.final = '';
      s.interim = '';
      r.onresult = function (e) {
        if (s.rec !== r) return;
        var o = readResults(e.results || []);
        s.final = o.final;
        s.interim = o.interim;
        if (s.holding) call(opts.onLive, liveText(s));
      };
      r.onerror = function (e) {
        var err = e && e.error;
        if (err === 'language-not-supported' && s.lang !== 'ar') { s.lang = 'ar'; return; }
        if (err === 'not-allowed' || err === 'service-not-allowed') s.recDenied = true;
        if (FATAL_REC[err] || err === 'language-not-supported') s.recDead = true;
        if (s.recDenied && !s.hasRecorder && s.holding && cur === s) abort(s, T.denied);
      };
      r.onend = function () {
        if (s.rec !== r) return;
        // whatever was still interim when this run ended is all we will get for it
        s.committed = clean(s.committed + ' ' + s.final + ' ' + s.interim);
        s.final = '';
        s.interim = '';
        s.rec = null;
        if (s.holding && !s.recDead && cur === s && s.restarts < 40) {
          s.restarts++;
          setTimeout(function () { if (s.holding && cur === s && !s.rec) startRecognition(s); }, s.restarts > 3 ? 250 : 0);
          return;
        }
        if (s.recEnded) s.recEnded();
      };
      try { r.start(); } catch (_) { s.rec = null; s.recDead = true; }
    }

    /* ---- recorder ---- */
    function startRecorder(s) {
      if (!HAS_RECORDER) return;
      s.hasRecorder = true;
      s.awaitingMic = !streamLive(mic.stream);
      getStream().then(function (stream) {
        s.awaitingMic = false;
        // released (or destroyed / superseded) before the permission resolved → never start a recorder
        if (!s.holding || cur !== s || destroyed) return;
        var mr;
        try { mr = new MediaRecorder(stream, MIME ? {mimeType: MIME} : undefined); }
        catch (_) {
          try { mr = new MediaRecorder(stream); } catch (__) { mr = null; }
        }
        if (!mr) { s.hasRecorder = false; return; }
        var chunks = s.chunks;
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        s.mr = mr;
        try { mr.start(250); } catch (_) {
          try { mr.start(); } catch (__) { s.mr = null; s.hasRecorder = false; }
        }
      }, function (err) {
        s.awaitingMic = false;
        s.hasRecorder = false;
        if (cur !== s || destroyed) return;
        s.micError = err || {};
        if (isPermissionError(err)) { if (!s.stopping) abort(s, T.denied); return; }
        // no mic / mic busy: recognition alone may still work; if not, say so now
        if (!SR || s.recDead) { if (!s.stopping) abort(s, T.noMic); }
      });
    }

    function blobFrom(s) {
      if (!s.chunks.length) return null;
      var type = (s.mr && s.mr.mimeType) || MIME || 'audio/webm';
      try { return new Blob(s.chunks, {type: type}); } catch (_) { return null; }
    }

    function finishRecorder(s) {
      return new Promise(function (resolve) {
        var mr = s.mr;
        if (!mr || mr.state === 'inactive') { resolve(blobFrom(s)); return; }
        mr.onstop = function () { resolve(blobFrom(s)); };
        mr.onerror = function () { resolve(blobFrom(s)); };
        try { mr.stop(); } catch (_) { resolve(blobFrom(s)); }
      });
    }

    function killRecorder(s) {
      var mr = s.mr;
      s.mr = null;
      if (!mr) return;
      mr.ondataavailable = null;
      mr.onstop = null;
      try { if (mr.state !== 'inactive') mr.stop(); } catch (_) {}
    }

    function killRecognition(s) {
      var r = s.rec;
      s.rec = null;
      if (!r) return;
      r.onresult = r.onerror = r.onend = null;
      try { r.abort(); } catch (_) { try { r.stop(); } catch (__) {} }
    }

    function clearTimers(s) {
      clearInterval(s.tick);
      clearTimeout(s.cap);
    }

    /* ---- abort: end without a result (permission denied, no mic, destroy) ---- */
    function abort(s, msg, silent) {
      if (cur !== s) return;
      s.holding = false;
      s.stopping = true;
      clearTimers(s);
      killRecognition(s);
      killRecorder(s);
      cur = null;
      if (mic.owner === api) mic.owner = null;
      if (!destroyed) setUI('idle');
      if (msg) toast(msg, 'info');
      if (!silent) call(opts.onStop);
    }

    /* ---- start ---- */
    function start(source, pointerId) {
      if (destroyed || cur) return Promise.resolve();
      if (mic.owner && mic.owner !== api) return Promise.resolve();
      if (!allowed()) return Promise.resolve();
      if (!SR && !HAS_RECORDER) { toast(T.unsupported, 'info'); return Promise.resolve(); }

      var s = {
        source: source, pointerId: pointerId, t0: now(), holding: true, stopping: false,
        lang: lang, rec: null, recDead: false, recDenied: false, restarts: 0, recEnded: null,
        committed: '', final: '', interim: '',
        mr: null, chunks: [], hasRecorder: false, awaitingMic: false, micError: null,
        tick: 0, cap: 0
      };
      cur = s;
      mic.owner = api;

      hushOutput();
      setUI('rec');
      call(opts.onStart);
      call(opts.onTick, 0);
      s.tick = setInterval(function () { if (cur === s && s.holding) call(opts.onTick, now() - s.t0); }, 250);
      s.cap = setTimeout(function () { if (cur === s && s.holding) stop(); }, maxMs);

      startRecognition(s);
      if (cur === s) startRecorder(s);
      return Promise.resolve();
    }

    /* ---- stop ---- */
    function stop() {
      var s = cur;
      if (!s || s.stopping) return Promise.resolve();   // double-stop guard
      s.stopping = true;
      s.holding = false;
      var durationMs = now() - s.t0;
      var wasAwaitingMic = s.awaitingMic && !mic.granted;   // released while the permission prompt is up
      clearTimers(s);
      setUI('busy');
      call(opts.onStop);

      var blobP = finishRecorder(s);
      var textP;
      if (s.rec) {
        textP = new Promise(function (resolve) { s.recEnded = resolve; });
        try { s.rec.stop(); } catch (_) { s.recEnded(); }
      } else {
        textP = Promise.resolve();
      }

      // up to 600ms for the final recognition results, then up to 1.5s more for the audio blob
      return Promise.race([textP, sleep(600)]).then(function () {
        return Promise.race([blobP, sleep(1500).then(function () { return blobFrom(s); })]);
      }).then(function (blob) {
        var text = clean(s.committed + ' ' + s.final + ' ' + s.interim);
        killRecognition(s);
        killRecorder(s);
        if (cur === s) cur = null;
        if (mic.owner === api) mic.owner = null;
        if (destroyed) return;
        setUI('idle');

        var hasAudio = !!(blob && blob.size > 0);
        if (!text && (durationMs < minMs || !hasAudio)) {
          if (wasAwaitingMic && !s.micError) toast(T.allowFirst, 'info');
          else if (durationMs < minMs) toast(T.hold, 'info');
          else if (s.recDenied && !hasAudio) toast(T.denied, 'info');
          else toast(T.nothing, 'info');
          return;
        }
        var url = null;
        if (hasAudio) { try { url = URL.createObjectURL(blob); } catch (_) { url = null; } }
        call(opts.onResult, {text: text, blob: hasAudio ? blob : null, url: url, durationMs: durationMs});
      }).catch(function (e) {
        // never reject: reset state and surface our own bug quietly
        if (cur === s) cur = null;
        if (mic.owner === api) mic.owner = null;
        if (!destroyed) setUI('idle');
        report(e);
      });
    }

    /* ---- events ---- */
    function onPointerDown(e) {
      lastPointerAt = now();
      if (e.button !== undefined && e.button !== 0) return;
      if (e.isPrimary === false) return;
      try { e.preventDefault(); } catch (_) {}
      if (cur) return;
      try { button.setPointerCapture(e.pointerId); } catch (_) {}
      start('pointer', e.pointerId);
    }
    function onPointerEnd(e) {
      lastPointerAt = now();
      if (!cur || cur.source !== 'pointer') return;
      if (e && e.pointerId !== undefined && cur.pointerId !== undefined && e.pointerId !== cur.pointerId) return;
      stop();
    }
    function onContextMenu(e) { try { e.preventDefault(); } catch (_) {} }
    function onClick(e) {
      // keyboard (Enter) / assistive-tech activation toggles. A click that follows a pointer press
      // (touch long-press clicks also carry detail 0) is the tail of a hold and is ignored.
      if (e.detail !== 0 || e.pointerType) return;
      if (now() - lastPointerAt < 1000) return;
      if (cur) { if (!cur.stopping) stop(); return; }
      start('toggle');
    }
    function isSpace(e) { return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'; }
    function onKeyDown(e) {
      if (!keyboard || destroyed || !isSpace(e)) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (!isShown(button) || blockedByDialog(button)) return;
      if (mic.owner && mic.owner !== api) return;
      e.preventDefault();          // no page scroll, no button activation
      keyHeld = true;
      if (e.repeat || cur) return;
      start('key');
    }
    function onKeyUp(e) {
      if (!isSpace(e) || !keyHeld) return;
      keyHeld = false;
      e.preventDefault();
      if (cur && cur.source !== 'pointer') stop();
    }
    function onBlur() { keyHeld = false; if (cur) stop(); }
    function onVisibility() { if (document.visibilityState === 'hidden' && cur) stop(); }

    // touch/long-press hardening even if the page CSS forgot it
    try {
      var cs = window.getComputedStyle(button);
      if (cs.touchAction !== 'none') button.style.touchAction = 'none';
      button.style.webkitUserSelect = 'none';
      button.style.userSelect = 'none';
      button.style.webkitTouchCallout = 'none';
    } catch (_) {}
    try { if (!button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', 'false'); } catch (_) {}

    on(button, 'pointerdown', onPointerDown);
    on(button, 'pointerup', onPointerEnd);
    on(button, 'pointercancel', onPointerEnd);
    on(button, 'lostpointercapture', onPointerEnd);
    on(button, 'contextmenu', onContextMenu);
    on(button, 'click', onClick);
    if (keyboard) {
      on(document, 'keydown', onKeyDown);
      on(document, 'keyup', onKeyUp);
    }
    on(window, 'blur', onBlur);
    on(document, 'visibilitychange', onVisibility);

    /** Remove every listener, end any recording silently and release the mic if no PTT is left. */
    function destroy() {
      if (destroyed) return;
      if (cur) abort(cur, null, true);
      destroyed = true;
      listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (_) {} });
      listeners = [];
      try {
        var t = target();
        t.classList.remove('is-recording', 'is-processing');
        button.setAttribute('aria-pressed', 'false');
      } catch (_) {}
      if (mic.owner === api) mic.owner = null;
      mic.ptts = Math.max(0, mic.ptts - 1);
      if (!mic.ptts) releaseStream();
    }

    return api;
  }

  /* ------------------------------------------------------------------ */
  /* uploadAudio                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Upload a recording to POST /api/audio (multipart field `audio`, filename omar.webm / omar.mp4…).
   * Uses Rawi.api.upload when rawi.js is loaded, plain fetch (20s timeout) otherwise.
   * @param {Blob} blob   the recorded audio (≤ 10 MB)
   * @param {{name?: string}} [opts]  base filename (default 'omar')
   * @returns {Promise<?{audio_id: string, url: string}>} the server JSON (url defaults to /media/<id>),
   *          or null on any failure. Never rejects.
   */
  function uploadAudio(blob, opts) {
    return new Promise(function (resolve) {
      try {
        if (!blob || typeof blob.size !== 'number' || !blob.size || blob.size > 10 * 1024 * 1024) { resolve(null); return; }
        var type = baseType(blob.type) || 'audio/webm';
        var name = String((opts && opts.name) || 'omar').replace(/[^a-z0-9_-]/gi, '') || 'omar';
        var body = blob.type === type ? blob : new Blob([blob], {type: type});
        var fd = new FormData();
        fd.append('audio', body, name + '.' + extFor(type));

        var R = window.Rawi;
        var p;
        if (R && R.api && typeof R.api.upload === 'function') {
          p = Promise.resolve().then(function () { return R.api.upload('/api/audio', fd); });
        } else {
          var ctl = typeof AbortController === 'function' ? new AbortController() : null;
          var timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (_) {} }, 20000);
          p = fetch('/api/audio', {method: 'POST', body: fd, signal: ctl ? ctl.signal : undefined, credentials: 'same-origin'})
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { clearTimeout(timer); return j; },
                  function () { clearTimeout(timer); return null; });
        }
        p.then(function (j) {
          if (!j || typeof j !== 'object' || !j.audio_id) { resolve(null); return; }
          var out = {};
          for (var k in j) if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = j[k];
          out.audio_id = String(j.audio_id);
          out.url = j.url ? String(j.url) : '/media/' + encodeURIComponent(out.audio_id);
          resolve(out);
        }, function () { resolve(null); });
      } catch (_) {
        resolve(null);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* dictate                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * One-shot dictation for search / ask boxes: click the mic, speak one sentence, the input fills
   * live (an `input` event is dispatched on every update) and onFinal(text) runs when recognition ends.
   * Hides the button when speech recognition is unsupported (and un-hides it when supported).
   * Escape while listening cancels and restores what was in the input.
   *
   * @param {Object} opts
   * @param {HTMLElement} opts.button                 mic button (toggles listening on click)
   * @param {HTMLInputElement|HTMLTextAreaElement} opts.input  field to fill
   * @param {string} [opts.lang='ar-JO']              recognition language
   * @param {function(string)} [opts.onFinal]        called with the final (unmasked) text, if any
   * @returns {{start: function(): void, stop: function(): void, destroy: function(): void, isListening: function(): boolean}}
   */
  function dictate(opts) {
    opts = opts || {};
    var button = opts.button || null;
    var input = opts.input || null;
    var lang = opts.lang || 'ar-JO';
    var rec = null, listening = false, cancelled = false, text = '', before = '', destroyed = false;
    var cap = 0;
    var listeners = [];

    var ctl = {
      start: start,
      stop: stop,
      destroy: destroy,
      isListening: function () { return listening; }
    };

    if (!button) { destroyed = true; return ctl; }
    if (!SR) {
      try { button.hidden = true; } catch (_) {}
      destroyed = true;
      return ctl;
    }
    try {
      button.hidden = false;
      if (!button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', 'false');
    } catch (_) {}

    function on(el, type, fn) {
      try { el.addEventListener(type, fn); listeners.push([el, type, fn]); } catch (_) {}
    }

    function setUI(onState) {
      try {
        button.classList.toggle('is-listening', onState);
        button.setAttribute('aria-pressed', onState ? 'true' : 'false');
      } catch (_) {}
    }

    function fill(v) {
      if (!input) return;
      try {
        input.value = v;
        input.dispatchEvent(new Event('input', {bubbles: true}));
      } catch (_) {}
    }

    function run(l) {
      var r;
      try {
        r = new SR();
        r.lang = l;
        r.continuous = false;
        r.interimResults = true;
        try { r.maxAlternatives = 1; } catch (_) {}
      } catch (_) { finish(); return; }
      var retry = false;
      rec = r;
      r.onresult = function (e) {
        if (rec !== r) return;
        var o = readResults(e.results || []);
        text = clean(o.final + ' ' + o.interim);
        if (text) fill(text);
      };
      r.onerror = function (e) {
        if (rec !== r) return;
        var err = e && e.error;
        if (err === 'language-not-supported' && l !== 'ar') { retry = true; return; }
        if (err === 'not-allowed' || err === 'service-not-allowed') toast(T.deniedAsk, 'info');
        else if (err === 'no-speech') toast(T.noSpeech, 'info');
        else if (err === 'network') toast(T.network, 'info');
      };
      r.onend = function () {
        if (rec !== r) return;
        rec = null;
        if (retry && listening && !cancelled) { run('ar'); return; }
        finish();
      };
      try { r.start(); } catch (_) { rec = null; finish(); }
    }

    /** Recognition is over (ended, failed or cancelled): reset UI, free the mic, report the text. */
    function finish() {
      clearTimeout(cap);
      var was = listening;
      listening = false;
      if (mic.owner === ctl) mic.owner = null;
      if (!destroyed) setUI(false);
      if (!was) return;
      if (cancelled) { fill(before); return; }
      var t = clean(text);
      if (t) call(opts.onFinal, t);
    }

    /** Start listening (no-op if already listening, disabled, or another mic user is active). */
    function start() {
      if (destroyed || listening) return;
      if (mic.owner && mic.owner !== ctl) return;
      if (button.disabled) return;
      hushOutput();
      listening = true;
      cancelled = false;
      text = '';
      before = input ? String(input.value || '') : '';
      mic.owner = ctl;
      setUI(true);
      cap = setTimeout(stop, 30000);
      run(lang);
    }

    /** Stop listening gracefully; onFinal fires (on recognition end) with whatever was heard. */
    function stop() {
      if (!listening) return;
      var r = rec;
      if (!r) { finish(); return; }
      try { r.stop(); } catch (_) { rec = null; finish(); }
    }

    /** Abort without onFinal and put back what the input held before. */
    function cancel() {
      if (!listening) return;
      cancelled = true;
      var r = rec;
      rec = null;
      if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch (_) {} }
      finish();
    }

    on(button, 'click', function (e) {
      try { e.preventDefault(); } catch (_) {}
      if (listening) stop(); else start();
    });
    function onKey(e) { if (listening && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); cancel(); } }
    on(button, 'keydown', onKey);
    if (input) on(input, 'keydown', onKey);

    /** Cancel any dictation and remove listeners. */
    function destroy() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2]); } catch (_) {} });
      listeners = [];
      try { button.classList.remove('is-listening'); button.setAttribute('aria-pressed', 'false'); } catch (_) {}
      if (mic.owner === ctl) mic.owner = null;
    }

    return ctl;
  }

  /* ------------------------------------------------------------------ */
  /* export                                                              */
  /* ------------------------------------------------------------------ */

  try {
    window.addEventListener('pagehide', function () { releaseStream(); });
  } catch (_) {}

  Rawi.Voice = {
    /** What this browser can do: {recognition, recorder, synthesis} (booleans). */
    supported: {recognition: !!SR, recorder: HAS_RECORDER, synthesis: HAS_SYNTH},
    /** MIME type MediaRecorder will be asked for ('' = browser default). */
    mimeType: MIME,
    createPTT: createPTT,
    uploadAudio: uploadAudio,
    dictate: dictate,
    /**
     * Turn the shared microphone stream off (the browser's mic indicator goes away).
     * The next recording asks for it again (no prompt once permission was granted).
     */
    release: releaseStream
  };
})();
