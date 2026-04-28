(function () {

  // ── Element references ────────────────────────────────────────────────────

  const canvas       = document.getElementById('spotlight');
  const ctx          = canvas.getContext('2d');
  const hero         = document.querySelector('.hero');
  const textLayer    = document.querySelector('.text-layer');
  const ambulance    = document.querySelector('.ambulance');
  const scrollSpacer = document.querySelector('.scroll-spacer');

  // ── Spotlight (mouse-driven) ───────────────────────────────────────────────

  let mouseX   = window.innerWidth  / 2;
  let mouseY   = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;

  let spotlightOpacity = 1;

  const LERP = 0.18;

  function getRadius() {
    return Math.min(window.innerWidth, window.innerHeight) * 0.22;
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function drawSpotlight() {
    currentX += (mouseX - currentX) * LERP;
    currentY += (mouseY - currentY) * LERP;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (spotlightOpacity > 0) {
      ctx.globalAlpha = spotlightOpacity;

      const radius = getRadius();
      const grad   = ctx.createRadialGradient(
        currentX, currentY, 0,
        currentX, currentY, radius
      );

      grad.addColorStop(0,    'rgba(242, 240, 232, 0.96)');
      grad.addColorStop(0.25, 'rgba(242, 240, 232, 0.75)');
      grad.addColorStop(0.55, 'rgba(242, 240, 232, 0.32)');
      grad.addColorStop(0.80, 'rgba(242, 240, 232, 0.07)');
      grad.addColorStop(1,    'rgba(242, 240, 232, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(drawSpotlight);
  }

  window.addEventListener('resize', resize);
  resize();

  // Skip spotlight on touch/mobile — canvas is hidden via CSS and there is no
  // cursor to follow, so avoid running a 60fps RAF loop for no visual result.
  var isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
             || window.innerWidth <= 768;

  if (!isTouch) {
    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });
    drawSpotlight();
  }

  // ── Scroll-driven hero zoom ───────────────────────────────────────────────

  const MAX_SCALE = 14;

  function easeInQuint(t) { return t * t * t * t * t; }

  function rangeProgress(val, inStart, inEnd) {
    return Math.min(Math.max((val - inStart) / (inEnd - inStart), 0), 1);
  }

  let ticking = false;

  function updateScroll() {
    const maxScroll = scrollSpacer.offsetHeight - window.innerHeight;
    const p = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);

    const fadeAlpha = 1 - rangeProgress(p, 0, 0.18);
    spotlightOpacity = fadeAlpha;
    textLayer.style.opacity = fadeAlpha.toFixed(3);

    const scale = 1 + easeInQuint(p) * (MAX_SCALE - 1);
    ambulance.style.transform = `scale(${scale.toFixed(4)})`;

    const heroAlpha = 1 - rangeProgress(p, 0.88, 1.0);
    hero.style.opacity = heroAlpha.toFixed(3);

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(updateScroll);
      ticking = true;
    }
  }, { passive: true });

  // ── Text zoom section ─────────────────────────────────────────────────────
  //
  // .text-zoom-driver (220vh) provides scroll room.
  // .text-zoom-stage  (position:fixed, z-index 5) is the visual layer.
  //
  // SCROLL WINDOW:
  //   zStart = spacer.offsetHeight - vh  = 300vh - vh  ≈ 200vh
  //   zEnd   = spacer.offsetHeight + driver.offsetHeight - vh
  //          = 300vh + 280vh - vh        ≈ 480vh
  //   range  = zEnd - zStart             ≈ 280vh
  //
  // At FINAL_P (0.90), white takes over at ≈ 452vh.
  // finalWhite releases at zEnd (≈ 480vh) — only ~28vh of blank white.
  // Stage background is set to #f2f2f2 in lock state so the stage's own
  // fade-out (480→580vh) is white-on-white and completely invisible.

  (function initTextZoom() {
    var driver  = document.querySelector('.text-zoom-driver');
    var stage   = document.querySelector('.text-zoom-stage');
    if (!driver || !stage) return;

    var group   = stage.querySelector('.text-zoom-group');
    var overlay = stage.querySelector('.text-zoom-overlay');

    var MAX_TEXT_SCALE = 200;
    var EMERGE_END     = 0.05;
    var FINAL_P        = 1.00;   // overlay reaches full yellow only at the very end of the zoom
    var OVERLAY_START  = 0.97;   // yellow starts only when text has nearly filled the screen
    var tzTicking      = false;

    function easeInCubic(t) { return t * t * t; }

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function updateTextZoom() {
      var sy      = window.scrollY;
      var spacerH = scrollSpacer.offsetHeight;
      var vh      = window.innerHeight;

      var zStart = spacerH - vh;
      var zEnd   = spacerH + driver.offsetHeight - vh;
      var zRange = zEnd - zStart;

      // Stage: fully on during zoom window, fades quickly after zEnd.
      // Before zStart the hero is still visible so stage stays at 0.
      var stageOp;
      if (sy < zStart) {
        stageOp = 0;
      } else if (sy <= zEnd) {
        stageOp = 1;
      } else {
        stageOp = clamp01(1 - (sy - zEnd) / (vh * 0.25));
      }
      stage.style.opacity = stageOp.toFixed(3);

      // Progress through the zoom window — clamped, no history, no lerp.
      var p = clamp01((sy - zStart) / zRange);

      // All output values are pure functions of p — no branching, no state.
      // Scrolling to any position always produces the exact same result.

      // Text: emerges quickly at the start, stays fully opaque through the zoom.
      var textOp = clamp01(p / EMERGE_END);

      // Scale: eased growth from 1 → MAX_TEXT_SCALE.
      var scale = 1 + easeInCubic(p) * (MAX_TEXT_SCALE - 1);

      // Yellow overlay: zero until OVERLAY_START, then linear to 1 at FINAL_P, clamps at 1.
      // At p = 1 (= zEnd), overlayOp is already 1, so the stage fade-out reveals the
      // yellow .text-zoom-driver background underneath — seamless, no flash.
      var overlayOp = clamp01((p - OVERLAY_START) / (FINAL_P - OVERLAY_START));

      group.style.opacity   = textOp.toFixed(3);
      group.style.transform = 'translate(-50%, -50%) scale(' + scale.toFixed(4) + ')';
      overlay.style.opacity = overlayOp.toFixed(3);

      tzTicking = false;
    }

    window.addEventListener('scroll', function () {
      if (!tzTicking) {
        requestAnimationFrame(updateTextZoom);
        tzTicking = true;
      }
    }, { passive: true });

    updateTextZoom();

  }());

  // ── Content sections ─────────────────────────────────────────────────────

  // Fade-up / fade-in on scroll into view
  (function initReveal() {
    var els = document.querySelectorAll('.fade-up, .fade-in');
    if (!els.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -10px 0px' });

    els.forEach(function (el) { io.observe(el); });
  }());

  // Progress bar — animates width once when track enters view
  (function initProgressBar() {
    var fill  = document.querySelector('.progress-fill');
    var track = document.querySelector('.progress-track');
    if (!fill || !track) return;

    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        fill.style.width = '58.4%';
        io.disconnect();
      }
    }, { threshold: 0.3 });

    io.observe(track);
  }());

  // Stat counters — count up from 0 when stats enter the viewport
  (function initCounters() {
    var items = document.querySelectorAll('.stat__val');
    if (!items.length) return;

    function formatNum(n) {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

    function animate(el) {
      var raw    = el.textContent.replace(/[^0-9]/g, '');
      var target = parseFloat(raw) || 0;
      var prefix = el.textContent.charAt(0) === '$' ? '$' : '';
      var suffix = el.textContent.slice(-1) === '+' ? '+' : '';
      var startTs = null;
      var DUR     = 1600;

      requestAnimationFrame(function step(ts) {
        if (!startTs) startTs = ts;
        var t = Math.min((ts - startTs) / DUR, 1);
        el.textContent = prefix + formatNum(target * easeOutQuart(t)) + suffix;
        if (t < 1) requestAnimationFrame(step);
      });
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    items.forEach(function (el) { io.observe(el); });
  }());

  // Parliament beehive — scroll-progress-driven frame selection.
  // Preloads all 76 frames; frame index is derived from how far the
  // section has scrolled through the viewport (not a time-based loop).
  // Progress 0 → frame_1, progress 1 → frame_76.
  // Scrolling back reverses the animation naturally.
  (function initParliament() {
    var canvas  = document.getElementById('parliament-canvas');
    if (!canvas) return;
    var section = document.querySelector('.s-parliament');
    if (!section) return;

    var ctx    = canvas.getContext('2d');
    var TOTAL  = 76;
    var frames = new Array(TOTAL);
    var loaded = 0;
    var drawn  = -1;   // last rendered frame index
    var rafId  = 0;

    var sectionTop = 0;
    var sectionH   = 0;

    // Measure section position in the document (call after layout is ready)
    function measure() {
      var rect   = section.getBoundingClientRect();
      sectionTop = rect.top + window.scrollY;
      sectionH   = section.offsetHeight;
    }

    // Map scroll position → 0..1
    // Starts when section top enters the viewport bottom.
    // Ends when section bottom exits at the viewport top.
    function getProgress() {
      var vh    = window.innerHeight;
      var sy    = window.scrollY;
      var start = sectionTop - vh;
      var end   = sectionTop + sectionH;
      return Math.min(Math.max((sy - start) / (end - start), 0), 1);
    }

    function renderFrame() {
      var p   = getProgress();
      var idx = Math.min(Math.floor(p * TOTAL), TOTAL - 1);
      if (idx === drawn) return;
      if (!frames[idx]) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frames[idx], 0, 0);
      drawn = idx;
    }

    function scheduleRender() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(renderFrame);
    }

    window.addEventListener('scroll', scheduleRender, { passive: true });
    window.addEventListener('resize', function () { measure(); scheduleRender(); });

    // Preload all frames — no animation starts until every frame is ready
    for (var i = 1; i <= TOTAL; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = function () {
          frames[idx - 1] = img;
          loaded++;
          if (loaded === 1) {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          if (loaded === TOTAL) {
            measure();
            renderFrame(); // draw correct frame for current scroll position
          }
        };
        img.onerror = function () {
          loaded++;
          if (loaded === TOTAL) { measure(); renderFrame(); }
        };
        img.src = './assets/parliament/frame_' + idx + '.webp';
      }(i));
    }
  }());

  // ── Site navigation ──────────────────────────────────────────────────────
  // Fades in after the typography zoom resolves.
  // Switches between white text (dark sections) and black text (yellow sections).
  (function initNav() {
    var nav      = document.querySelector('.site-nav');
    if (!nav) return;

    var driver   = document.querySelector('.text-zoom-driver');
    var colorDiv = document.querySelector('.color-transition');

    var navShown = false;
    var colorMid = Infinity;   // document-y where nav flips to white text

    function measure() {
      var sy = window.scrollY;
      if (colorDiv) {
        colorMid = colorDiv.getBoundingClientRect().top + sy
                   + colorDiv.offsetHeight * 0.40;
      }
    }

    function updateNav() {
      var sy   = window.scrollY;
      var vh   = window.innerHeight;
      var zEnd = scrollSpacer.offsetHeight + driver.offsetHeight - vh;

      if (!navShown && sy > zEnd) {
        navShown = true;
        nav.classList.add('site-nav--visible');
        document.body.classList.add('cursor-active');
      }

      if (!navShown) return;

      // Yellow zone → dark text; parliament/credit → white text
      nav.classList.toggle('site-nav--light', sy < colorMid);
    }

    window.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', function () { measure(); updateNav(); });

    measure();
    updateNav();
  }());

  // ── Runner cursor ─────────────────────────────────────────────────────────
  // Single <img id="runner-cursor"> fixed at z:0 (root stacking context).
  // clientX/clientY map directly — no coord conversion needed for fixed elements.
  // Opacity is scroll-gated: 0 until parliament scrolls away, then fades in;
  // fades back to 0 as s-credit's bottom approaches the viewport.
  (function initRunCursor() {
    var runner     = document.getElementById('runner-cursor');
    if (!runner) return;
    var parliament = document.querySelector('.s-parliament');
    var credit     = document.querySelector('.s-credit');

    var hasMoved = false;

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function getScrollMult() {
      var vh = window.innerHeight;

      // 0 while parliament is visible; ramps 0→1 as it scrolls away
      var parlFade = 1;
      if (parliament) {
        var pb = parliament.getBoundingClientRect().bottom;
        parlFade = clamp01((vh * 0.50 - pb) / (vh * 0.65));
      }

      // 1 while credit is in view; fades as credit bottom nears viewport top
      var creditFade = 1;
      if (credit) {
        var cb = credit.getBoundingClientRect().bottom;
        creditFade = clamp01((cb - vh * 0.10) / (vh * 0.50));
      }

      return parlFade * creditFade;
    }

    function updateOpacity() {
      runner.style.opacity = (hasMoved ? getScrollMult() : 0).toFixed(3);
    }

    window.addEventListener('pointermove', function (e) {
      hasMoved = true;
      runner.style.transform =
        'translate(' + e.clientX + 'px, ' + e.clientY + 'px) translate(-50%, -50%)';
      updateOpacity();
    });

    window.addEventListener('scroll', updateOpacity, { passive: true });
  }());

}());
