(function () {
  // Tiny IT/EN translation engine. Translatable elements carry a data-it
  // (plain text) or data-it-html (markup preserved, e.g. bullet points with
  // <strong>) attribute; the English original is cached from the live DOM
  // the first time a page switches language, so it never needs to be
  // duplicated in a data-en attribute. Visible tooltips (data-tooltip) get
  // a parallel data-tooltip-it attribute. Choice persists across pages via
  // localStorage.
  const STORAGE_KEY = "siteLang";

  function getSiteLang() {
    return localStorage.getItem(STORAGE_KEY) === "it" ? "it" : "en";
  }
  window.getSiteLang = getSiteLang;

  function applyLang(lang) {
    document.querySelectorAll("[data-it]").forEach((el) => {
      if (el.dataset.enCache === undefined) el.dataset.enCache = el.textContent;
      el.textContent = lang === "it" ? el.dataset.it : el.dataset.enCache;
    });
    document.querySelectorAll("[data-it-html]").forEach((el) => {
      if (el.dataset.enHtmlCache === undefined) el.dataset.enHtmlCache = el.innerHTML;
      el.innerHTML = lang === "it" ? el.dataset.itHtml : el.dataset.enHtmlCache;
    });
    document.querySelectorAll("[data-tooltip-it]").forEach((el) => {
      if (el.dataset.tooltipEnCache === undefined) el.dataset.tooltipEnCache = el.dataset.tooltip;
      el.dataset.tooltip = lang === "it" ? el.dataset.tooltipIt : el.dataset.tooltipEnCache;
    });
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.lang === lang);
    });
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLang(lang);
  }
  window.setSiteLang = setLang;

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  applyLang(getSiteLang());
})();

/* Light/dark theme switcher. The actual [data-theme] attribute is applied
   as early as possible by a tiny inline script in <head> (before this file
   even loads) so a saved "light" preference never flashes dark first —
   this IIFE just wires up the sun/moon buttons and keeps their .is-active
   state in sync. Dark is the default/fallback if nothing is stored. */
(function () {
  const STORAGE_KEY = "siteTheme";

  function getSiteTheme() {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  }
  window.getSiteTheme = getSiteTheme;

  function applyTheme(theme) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");

    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.themeChoice === theme);
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#0d0d0d");
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }
  window.setSiteTheme = setTheme;

  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeChoice));
  });

  applyTheme(getSiteTheme());
})();

/* Liquid-glass pill that glides between a group's items as you hover/focus
   them, resting on whichever is active otherwise — same idea as an iOS
   segmented control's sliding highlight, decoupled from actually picking
   a theme/lang/section (that's still the click handlers elsewhere). Used
   for the theme toggle, language toggle, the Home/Works/News links that
   expand out of the Dynamic Island's nav trigger, and the social (GitHub/
   Email) and ask-an-AI (Claude/ChatGPT) rows — the latter two have no
   "active" item, so the pill just fades out when nothing's hovered. */
(function () {
  function setupHoverPill(container) {
    if (!container) return;
    const items = Array.from(container.querySelectorAll("a, button"));
    if (!items.length) return;

    const pill = document.createElement("div");
    pill.className = "toggle-pill";
    pill.setAttribute("aria-hidden", "true");
    container.prepend(pill);

    function place(item) {
      const cRect = container.getBoundingClientRect();
      const iRect = item.getBoundingClientRect();
      pill.style.width = iRect.width + "px";
      pill.style.height = iRect.height + "px";
      pill.style.transform = `translate(${iRect.left - cRect.left}px, ${iRect.top - cRect.top}px)`;
      pill.style.opacity = "1";
    }

    // Groups with a real "current selection" (theme, lang, section) rest the
    // pill on whichever item carries .is-active; groups that are just a
    // row of independent links (social, ask-an-AI) have no such thing, so
    // the pill simply disappears until something is actually hovered.
    function rest() {
      const active = container.querySelector(".is-active");
      if (active) place(active);
      else pill.style.opacity = "0";
    }

    rest();

    items.forEach((item) => {
      item.addEventListener("mouseenter", () => place(item));
      item.addEventListener("focus", () => place(item));
    });
    container.addEventListener("mouseleave", rest);
    container.addEventListener("focusout", (e) => {
      if (!container.contains(e.relatedTarget)) rest();
    });

    // The active button moves after a theme/lang switch, and the pill needs
    // to follow once the pointer isn't actively overriding it with a hover.
    new MutationObserver(() => {
      if (!container.matches(":hover")) rest();
    }).observe(container, { attributes: true, attributeFilter: ["class"], subtree: true });

    window.addEventListener("resize", () => {
      if (!container.matches(":hover")) rest();
    });

    // A web font swapping in shortly after load can nudge button widths by
    // a px or two — resync once fonts are actually settled so that isn't
    // baked into the very first hover's measurement.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!container.matches(":hover")) rest();
      });
    }
  }

  setupHoverPill(document.querySelector(".theme-toggle"));
  setupHoverPill(document.querySelector(".lang-toggle"));
  setupHoverPill(document.querySelector(".section-links"));
  setupHoverPill(document.querySelector(".social-list"));
  setupHoverPill(document.querySelector(".ask-ai-list"));
  setupHoverPill(document.querySelector(".news-mode-toggle"));
  setupHoverPill(document.querySelector(".news-view-toggle"));
})();

(function () {
  const splash = document.getElementById("intro-splash");
  if (!splash) return;

  // Only play on a real reload or a fresh arrival at the site — not when
  // a project subpage sends us back here. Those pages set this flag right
  // before navigating (see the "back to home" handler below).
  if (sessionStorage.getItem("skipIntroSplash") === "1") {
    sessionStorage.removeItem("skipIntroSplash");
    splash.remove();
    return;
  }

  const splashImg = splash.querySelector("img");
  const targetImg = document.querySelector(".avatar-wrap .avatar");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => splash.classList.add("is-shown"));
  });

  // Fade/scale in, hold, spin two full turns, then slide/shrink into the
  // avatar's real spot on the page before the whole overlay fades away.
  setTimeout(() => {
    splash.classList.add("is-spinning");
    setTimeout(() => {
      if (targetImg && splashImg) {
        const from = splashImg.getBoundingClientRect();
        const to = targetImg.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = to.width / from.width;
        splashImg.style.transition = "transform 0.7s cubic-bezier(0.65, 0, 0.35, 1)";
        splashImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      }
      setTimeout(() => {
        splash.classList.add("is-leaving");
        setTimeout(() => splash.remove(), 550);
      }, 700);
    }, 1000);
  }, 1000);
})();

(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "particles-bg";
  canvas.setAttribute("aria-hidden", "true");
  // Set critical positioning inline (highest specificity, immune to any
  // stylesheet cascade/cache issue) so the canvas always covers the viewport.
  canvas.style.cssText =
    "position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:0; pointer-events:none;";
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  const COUNT = 60;
  const LINK_DIST = 100;
  const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
  // Redraw capped at 30fps instead of a raw 60 — halves how often the O(n²)
  // link-distance check and canvas repaint run. vx/vy are calibrated as
  // "px per 60fps tick", so movement below is scaled by actual elapsed time
  // (moveScale) to compensate — particles still drift at the same real-world
  // speed, just get redrawn/recomputed less often, which is invisible for
  // motion this slow but meaningfully lighter on a large desktop viewport.
  const FRAME_INTERVAL = 1000 / 30;
  const REF_FRAME_MS = 1000 / 60;
  let lastFrameTime = 0;
  let w, h, particles;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeParticles() {
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 1.4,
      r: Math.random() * 2 + 1.2,
    }));
  }

  resize();
  makeParticles();
  window.addEventListener("resize", resize);

  function step(now) {
    if (now - lastFrameTime < FRAME_INTERVAL) {
      if (!document.hidden) requestAnimationFrame(step);
      return;
    }
    // Capped at 10 ref-frames' worth — without this, a tab that was
    // backgrounded (or the screen locked) for a while resumes with a huge
    // real dt, which flings every particle far off-canvas in one jump; at
    // this animation's px-per-frame speeds they'd then take ages to drift
    // back into view, reading as the whole background having disappeared.
    const dt = lastFrameTime ? Math.min(now - lastFrameTime, REF_FRAME_MS * 10) : REF_FRAME_MS;
    lastFrameTime = now;
    const moveScale = dt / REF_FRAME_MS;

    ctx.clearRect(0, 0, w, h);

    // Orange reads fine floating over the dark theme's near-black background,
    // but the same tint looks out of place on a white surface, so light theme
    // gets a neutral gray instead (checked live, since the visitor can toggle
    // theme at any time without a page reload).
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const rgb = isLight ? "140, 140, 148" : "226, 112, 58";

    for (const p of particles) {
      p.x += p.vx * moveScale;
      p.y += p.vy * moveScale;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < LINK_DIST_SQ) {
          // sqrt only computed for pairs actually close enough to draw —
          // the squared-distance check above filters out most pairs cheaply.
          const dist = Math.sqrt(distSq);
          ctx.strokeStyle = `rgba(${rgb}, ${0.4 * (1 - dist / LINK_DIST)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = `rgba(${rgb}, 0.65)`;
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!document.hidden) requestAnimationFrame(step);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestAnimationFrame(step);
  });

  requestAnimationFrame(step);
})();

/* Horizontal scroll affordance for a card row: sticky prev/next arrow
   buttons pinned to each edge (hidden once there's nothing further in that
   direction), plus translating a plain vertical mouse wheel into sideways
   movement — most browsers won't do that on their own for a
   horizontal-only strip. This is a visible hint that the row scrolls, and a
   click shortcut for what dragging/swiping/wheeling already does. With
   `autoDrift: true` (Works cards row only — the News list view stays put)
   it also slowly bounces back and forth on its own, pausing whenever the
   visitor scrolls/drags/wheels/clicks an arrow. */
function setupScrollArrows(el, { autoDrift = false } = {}) {
  if (!el) return;

  const PREV_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const NEXT_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  let paused = false;
  let resumeTimer = null;
  function pauseThenResume() {
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      paused = false;
    }, 1600);
  }

  function makeArrow(dir, svg, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `row-scroll-arrow row-scroll-arrow--${dir}`;
    btn.innerHTML = svg;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", () => {
      pauseThenResume();
      const amount = el.clientWidth * 0.8;
      el.scrollBy({ left: dir === "prev" ? -amount : amount, behavior: "smooth" });
    });
    return btn;
  }

  const prevBtn = makeArrow("prev", PREV_SVG, "Scroll left");
  const nextBtn = makeArrow("next", NEXT_SVG, "Scroll right");
  el.prepend(prevBtn);
  el.append(nextBtn);

  let maxScroll = 0;
  function updateVisibility() {
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft >= maxScroll - 1;
    prevBtn.classList.toggle("is-hidden", maxScroll <= 0 || atStart);
    nextBtn.classList.toggle("is-hidden", maxScroll <= 0 || atEnd);
  }
  function measure() {
    maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    updateVisibility();
  }

  measure();
  window.addEventListener("resize", measure);
  // subtree:true — for the News list, the actual story cards render into a
  // wrapper nested one level inside `el` (see the News section IIFE), not
  // as el's own direct children.
  new MutationObserver(measure).observe(el, { childList: true, subtree: true });
  el.addEventListener("scroll", updateVisibility, { passive: true });

  // A plain vertical mouse wheel doesn't scroll a horizontal-only strip in
  // most browsers by itself — translate deltaY into scrollLeft so hovering
  // the row and scrolling normally moves it sideways. Leaves genuine
  // horizontal input (trackpad swipes, shift+wheel) alone. Inverted on
  // purpose — scrolling up moves forward, scrolling down moves back.
  el.addEventListener(
    "wheel",
    (e) => {
      pauseThenResume();
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft -= e.deltaY;
      }
    },
    { passive: false }
  );

  if (!autoDrift) return;

  el.addEventListener("pointerdown", () => {
    paused = true;
    clearTimeout(resumeTimer);
  });
  el.addEventListener("pointerup", pauseThenResume);
  el.addEventListener(
    "touchstart",
    () => {
      paused = true;
      clearTimeout(resumeTimer);
    },
    { passive: true }
  );
  el.addEventListener("touchend", pauseThenResume);

  const SPEED = 60; // px per second
  let direction = 1; // 1 = forward, -1 = backward (bounces at each end)
  let lastTime = null;
  function step(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (!paused && maxScroll > 0) {
      let next = el.scrollLeft + SPEED * dt * direction;
      if (next >= maxScroll) {
        next = maxScroll;
        direction = -1;
      } else if (next <= 0) {
        next = 0;
        direction = 1;
      }
      el.scrollLeft = next;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

setupScrollArrows(document.querySelector(".work .cards"), { autoDrift: true });

(function () {
  const navItems = Array.from(document.querySelectorAll(".section-link"));
  if (!navItems.length) return;

  const sections = navItems
    .map((item) => ({ item, el: document.getElementById(item.dataset.target) }))
    .filter((s) => s.el);
  if (!sections.length) return;

  function setActive(id) {
    navItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.target === id);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );

  sections.forEach(({ el }) => observer.observe(el));
  setActive(sections[0].el.id);
})();

(function () {
  const el = document.getElementById("rotating-text");
  if (!el) return;

  const phrases = [
    { en: "IT Teacher!", it: "insegnante IT!", color: "var(--accent)" },
    { en: "Computer Science Student!", it: "studente di Informatica!", color: "var(--accent)" },
    { en: "From Marche, Italy!", it: "dalle Marche, Italia!", color: "var(--accent)" },
  ];

  let i = 0;

  const TYPE_MS = 85;
  const DELETE_MS = 50;
  const HOLD_MS = 1900;
  const GAP_MS = 350;

  function currentText() {
    return phrases[i][window.getSiteLang ? window.getSiteLang() : "en"];
  }

  let charIndex = 0;
  el.textContent = "";
  el.style.color = phrases[i].color;

  function type() {
    charIndex++;
    el.textContent = currentText().slice(0, charIndex);
    if (charIndex < currentText().length) {
      setTimeout(type, TYPE_MS);
    } else {
      setTimeout(erase, HOLD_MS);
    }
  }

  function erase() {
    charIndex--;
    el.textContent = currentText().slice(0, charIndex);
    if (charIndex > 0) {
      setTimeout(erase, DELETE_MS);
    } else {
      i = (i + 1) % phrases.length;
      el.style.color = phrases[i].color;
      setTimeout(type, GAP_MS);
    }
  }

  setTimeout(type, 400);
})();

(function () {
  const avatar = document.querySelector(".avatar-wrap");
  if (!avatar) return;

  const messages = [
    { en: "👋 Hi there!", it: "👋 Ciao!" },
    { en: "😄 That's me!", it: "😄 Sono io!" },
    { en: "🚀 Building cool stuff", it: "🚀 Costruisco cose fantastiche" },
    { en: "☕ Powered by coffee", it: "☕ A propulsione di caffè" },
    { en: "🎓 CS student & teacher", it: "🎓 Studente e insegnante di Informatica" },
    { en: "💻 Always coding", it: "💻 Sempre a programmare" },
    { en: "🍕 Ask me about pizza", it: "🍕 Chiedimi della pizza" },
  ];

  let lastIndex = 0;

  avatar.addEventListener("click", () => {
    if (avatar.dataset.justDragged) {
      delete avatar.dataset.justDragged;
      return;
    }
    let next = lastIndex;
    while (next === lastIndex) {
      next = Math.floor(Math.random() * messages.length);
    }
    lastIndex = next;
    const lang = window.getSiteLang ? window.getSiteLang() : "en";
    avatar.dataset.tooltip = messages[next][lang];
    avatar.dataset.tooltipEnCache = messages[next].en;
    avatar.dataset.tooltipIt = messages[next].it;
    const bubble = document.getElementById("tooltip-bubble");
    if (bubble && bubble.classList.contains("is-visible")) {
      bubble.textContent = messages[next][lang];
    }
  });
})();

(function () {
  // Tooltips are a hover affordance with no touch equivalent — on a touch
  // device the show/hide pair is mouseenter/mouseleave or focus/blur, and a
  // tap fires focus but nothing ever fires blur, so the bubble (e.g. "Next
  // story" on the news stack's arrow) gets stuck on screen after the tap.
  // Skip wiring it up at all rather than leave that dangling.
  if (!window.matchMedia("(hover: hover)").matches) return;

  const targets = document.querySelectorAll("[data-tooltip]");
  if (!targets.length) return;

  const bubble = document.createElement("div");
  bubble.id = "tooltip-bubble";
  document.body.appendChild(bubble);

  let current = null;

  function position(el) {
    const r = el.getBoundingClientRect();
    const margin = 8;
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
    let top = r.top - bh - 10;
    if (top < margin) top = r.bottom + 10;
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
  }

  function show(el) {
    current = el;
    bubble.textContent = el.dataset.tooltip;
    bubble.classList.toggle("is-punchy", el.classList.contains("avatar-wrap"));
    bubble.classList.add("is-visible");
    position(el);
  }

  function hide(el) {
    if (current !== el) return;
    current = null;
    bubble.classList.remove("is-visible");
  }

  targets.forEach((el) => {
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("mouseleave", () => hide(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("blur", () => hide(el));
  });

  window.addEventListener(
    "resize",
    () => {
      if (current) position(current);
    },
    { passive: true }
  );
})();

(function () {
  const toggle = document.querySelector(".nav-toggle");
  const sidebar = document.querySelector(".sidebar");
  if (!toggle || !sidebar) return;

  let scrollYAtOpen = 0;

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) scrollYAtOpen = window.scrollY;
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!sidebar.classList.contains("is-open"));
  });

  window.addEventListener(
    "scroll",
    () => {
      if (sidebar.classList.contains("is-open") && Math.abs(window.scrollY - scrollYAtOpen) > 4) {
        setOpen(false);
      }
    },
    { passive: true }
  );

  // Mobile dropdown panel: tapping anywhere outside it, or tapping one of
  // its own links/buttons, closes it (desktop's hover-driven island never
  // sets .is-open, so this is a no-op there).
  document.addEventListener("click", (e) => {
    if (!sidebar.classList.contains("is-open")) return;
    if (e.target.closest(".sidebar-panel a, .sidebar-panel button")) {
      setOpen(false);
    } else if (!e.target.closest(".sidebar")) {
      setOpen(false);
    }
  });
})();

(function () {
  // Project pages have no #intro-splash of their own — this only matters
  // when a link here is about to send the user back to the homepage, so
  // that reload doesn't replay the splash animation again.
  if (document.getElementById("intro-splash")) return;

  document.querySelectorAll('a[href^="../index.html"]').forEach((link) => {
    link.addEventListener("click", () => {
      sessionStorage.setItem("skipIntroSplash", "1");
    });
  });
})();

(function () {
  // In-island brand avatar: hidden while the homepage's own hero avatar is
  // on screen. Once it scrolls out of view, a flying copy of the avatar
  // (#avatar-flyer) travels from the hero's exact on-screen spot to the
  // island — same FLIP transform trick as the intro splash above — then
  // hands off to the real in-island avatar, which stays put. On every
  // other page (no hero avatar) the in-island avatar is just shown
  // immediately, no flight. Desktop-only flourish — on mobile the island
  // is just a small hamburger button, with no avatar slot to fly into
  // (see the "sidebar-brand { display: none }" mobile rule).
  if (window.matchMedia("(max-width: 860px)").matches) return;

  const sidebar = document.querySelector(".sidebar");
  const islandAvatar = document.querySelector(".sidebar-brand-avatar");
  const heroAvatar = document.querySelector(".avatar-wrap .avatar");
  if (!sidebar || !islandAvatar) return;

  if (!heroAvatar) {
    sidebar.classList.add("show-brand-avatar");
    return;
  }

  const flyer = document.createElement("img");
  flyer.id = "avatar-flyer";
  flyer.src = heroAvatar.src;
  flyer.alt = "";
  flyer.setAttribute("aria-hidden", "true");
  document.body.appendChild(flyer);

  let docked = false;

  // Read where the island avatar will sit once expanded, without letting
  // its own show/hide transition actually play or paint mid-measurement.
  function measureIslandRect() {
    const prevTransition = islandAvatar.style.transition;
    islandAvatar.style.transition = "none";
    sidebar.classList.add("show-brand-avatar");
    const rect = islandAvatar.getBoundingClientRect();
    sidebar.classList.remove("show-brand-avatar");
    void islandAvatar.offsetWidth;
    islandAvatar.style.transition = prevTransition;
    return rect;
  }

  function flyToIsland() {
    docked = true;
    const from = heroAvatar.getBoundingClientRect();
    const to = measureIslandRect();

    flyer.style.transition = "none";
    flyer.style.width = from.width + "px";
    flyer.style.height = from.height + "px";
    flyer.style.left = from.left + "px";
    flyer.style.top = from.top + "px";
    flyer.style.transform = "translate(0, 0) scale(1)";
    flyer.style.opacity = "1";
    void flyer.offsetWidth;

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    flyer.style.transition = "transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)";
    flyer.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    setTimeout(() => {
      sidebar.classList.add("show-brand-avatar");
      flyer.style.transition = "opacity 0.2s ease";
      flyer.style.opacity = "0";
    }, 600);
  }

  function retract() {
    docked = false;
    sidebar.classList.remove("show-brand-avatar");
  }

  function update() {
    const r = heroAvatar.getBoundingClientRect();
    const heroVisible = r.bottom > 0 && r.top < window.innerHeight;
    if (!heroVisible && !docked) flyToIsland();
    else if (heroVisible && docked) retract();
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
})();

(function () {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const dot = document.createElement("div");
  dot.id = "cursor-dot";
  document.body.append(dot);

  window.addEventListener(
    "mousemove",
    (e) => {
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    },
    { passive: true }
  );

  const hoverTargets = "a, button, .card, .dot, input, select, textarea, [role='button']";
  document.addEventListener(
    "mouseover",
    (e) => {
      if (e.target.closest(hoverTargets)) dot.classList.add("is-hover");
    },
    { passive: true }
  );
  document.addEventListener(
    "mouseout",
    (e) => {
      if (e.target.closest(hoverTargets)) dot.classList.remove("is-hover");
    },
    { passive: true }
  );
})();

/* Easter egg: grab the avatar and flick it — spins with momentum like a
   fidget spinner, just something to fiddle with. A plain click still
   cycles the hover tooltip message (see above); the tooltip click handler
   checks avatarWrap.dataset.justDragged so it skips the click that
   follows an actual drag. Dragging is direct, 1:1 with the pointer, so it
   stays on under reduced motion — only the momentum spin after release
   (motion the user isn't actively driving) is skipped for that setting. */
(function () {
  const avatarWrap = document.querySelector(".avatar-wrap");
  if (!avatarWrap) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let rotation = 0;
  let velocity = 0; // deg/ms
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastAngle = 0;
  let lastTime = 0;
  let rafId = null;

  function center() {
    const r = avatarWrap.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function angleAt(x, y) {
    const c = center();
    return (Math.atan2(y - c.y, x - c.x) * 180) / Math.PI;
  }

  function shortestDelta(from, to) {
    return (((to - from + 180) % 360) + 360) % 360 - 180;
  }

  function apply() {
    avatarWrap.style.transform = `rotate(${rotation}deg)`;
  }

  function momentumStep(now) {
    const dt = now - lastTime || 16;
    lastTime = now;
    velocity *= Math.pow(0.94, dt / 16);
    if (Math.abs(velocity) < 0.02) {
      velocity = 0;
      rafId = null;
      return;
    }
    rotation += velocity * dt;
    apply();
    rafId = requestAnimationFrame(momentumStep);
  }

  avatarWrap.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    lastAngle = angleAt(e.clientX, e.clientY);
    lastTime = performance.now();
    velocity = 0;
    avatarWrap.setPointerCapture(e.pointerId);
    avatarWrap.classList.add("is-spinning");
  });

  avatarWrap.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > 4) {
      moved = true;
    }
    if (!moved) return;
    const angle = angleAt(e.clientX, e.clientY);
    const delta = shortestDelta(lastAngle, angle);
    const now = performance.now();
    const dt = now - lastTime || 16;
    rotation += delta;
    velocity = delta / dt;
    lastAngle = angle;
    lastTime = now;
    apply();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    avatarWrap.classList.remove("is-spinning");
    if (avatarWrap.hasPointerCapture && avatarWrap.hasPointerCapture(e.pointerId)) {
      avatarWrap.releasePointerCapture(e.pointerId);
    }
    if (moved) {
      avatarWrap.dataset.justDragged = "1";
      if (!reduceMotion) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(momentumStep);
      }
    }
  }

  avatarWrap.addEventListener("pointerup", endDrag);
  avatarWrap.addEventListener("pointercancel", endDrag);
})();

/* News section (homepage only), gated behind a password every single visit
   (see below — deliberately not persisted). Renders two independent feeds
   refreshed once a day by scripts/fetch-news.mjs (news.json, tech/Hacker
   News) and scripts/fetch-school-news.mjs (school-news.json, uspmc.sinp.net)
   via .github/workflows/news-sync.yml. A Tech/Scuola pill picks which feed
   is shown; tech additionally has a client-side "interests" sub-filter, and
   every story can be marked read/unread. Interests + read status are local
   to this browser (localStorage) — there's no backend, so nothing is
   collected anywhere. */
(function () {
  const list = document.getElementById("news-list");
  if (!list) return;

  // Story cards render into here rather than straight into `list` — this is
  // what render() wipes/rebuilds on every re-render, so the prev/next
  // scroll-arrow buttons (appended directly to `list`, see
  // setupScrollArrows) survive across renders instead of getting wiped
  // along with the old cards. display:contents keeps it invisible to
  // layout, so `.news-item`s still behave as direct flex children of
  // `list` exactly as before.
  const itemsWrap = document.createElement("div");
  itemsWrap.className = "news-items";
  // The three .is-skeleton placeholders are hardcoded directly in
  // #news-list in index.html (shown while the JSON feeds are still
  // loading) — move them into the wrapper too, so the first real render()
  // clears them the same way it clears everything else it's swapping out.
  // Left as direct children of `list`, they'd never get removed at all.
  while (list.firstChild) itemsWrap.appendChild(list.firstChild);
  list.appendChild(itemsWrap);

  // The whole section is gated behind a password for everyone but Diego —
  // a static site has no real auth, so this is presentation-only (the
  // underlying JSON files are still directly fetchable), but it keeps the
  // section out of casual visitors' way, which is the actual goal here.
  // Deliberately not persisted anywhere (no localStorage, no cookie) — the
  // password is asked again on every single visit/reload, on purpose.
  const NEWS_PASSWORD = "mk01";

  const DEV_SKIP_LOCK = false;

  const lockedEl = document.getElementById("news-locked");
  const bodyEl = document.getElementById("news-body");
  const unlockForm = document.getElementById("news-unlock-form");
  const unlockInput = document.getElementById("news-unlock-input");
  const unlockError = document.getElementById("news-unlock-error");

  function showUnlockError() {
    if (unlockError) unlockError.hidden = false;
    if (unlockInput) {
      unlockInput.value = "";
      unlockInput.classList.add("is-shaking");
      unlockInput.addEventListener("animationend", () => unlockInput.classList.remove("is-shaking"), { once: true });
      unlockInput.focus();
    }
  }

  function reveal() {
    if (lockedEl) lockedEl.hidden = true;
    if (bodyEl) bodyEl.hidden = false;
    initNews();
  }

  if (DEV_SKIP_LOCK) {
    reveal();
  } else if (unlockForm) {
    unlockForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if ((unlockInput ? unlockInput.value : "") === NEWS_PASSWORD) {
        reveal();
      } else {
        showUnlockError();
      }
    });
  }

  // Everything below only ever runs once the password has been accepted
  // for *this* page load — reload the page and it's locked again.
  function initNews() {
  // In tech mode, only this many stories are ever loaded into the stack at
  // once — it's a deck you cycle through with Prev/Next (or the dots), not
  // an infinite feed. Scuola mode has no such cap: it's a small enough,
  // date-bounded set (see scripts/fetch-school-news.mjs) that showing
  // everything and letting Prev/Next page through all of it is the point.
  const CARD_COUNT = 5;

  // Tech categories — used both for the card tag and for the "Interests"
  // filter modal. Scuola is a separate top-level mode (see the Tech/Scuola
  // toggle below), not one more interest to mix in with these, so it's kept
  // out of TECH_CATEGORIES and only exists in ALL_CATEGORIES for the card
  // tag lookup.
  const TECH_CATEGORIES = [
    { id: "ai", en: "AI & Machine Learning", it: "IA & Machine Learning" },
    { id: "security", en: "Cybersecurity", it: "Sicurezza informatica" },
    { id: "webdev", en: "Web Development", it: "Sviluppo Web" },
    { id: "languages", en: "Languages & Frameworks", it: "Linguaggi & Framework" },
    { id: "hardware", en: "Hardware & Systems", it: "Hardware & Sistemi" },
    { id: "startup", en: "Startups & Business", it: "Startup & Business" },
    { id: "science", en: "Science & Research", it: "Scienza & Ricerca" },
    { id: "other", en: "Other Tech News", it: "Altre notizie tech" },
  ];
  const ALL_CATEGORIES = [...TECH_CATEGORIES, { id: "scuola", en: "School", it: "Scuola" }];
  const CATEGORY_MAP = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

  const MODE_KEY = "newsMode"; // "tech" | "scuola"
  const VIEW_KEY = "newsViewMode"; // "stack" | "list"
  const INTERESTS_KEY = "newsInterests"; // array of tech category ids; [] means "all"
  const READ_STATUS_KEY = "newsReadStatus"; // { [storyId]: "read" | "unread" }

  const NEWS_SUB_TEXT = {
    tech: {
      en: "The latest from the world of tech, updated daily from Hacker News.",
      it: "Le principali notizie del mondo tech, aggiornate ogni giorno da Hacker News.",
    },
    scuola: {
      en: "The latest school & education news, from the last month.",
      it: "Le ultime notizie dal mondo della scuola, dell'ultimo mese.",
    },
  };

  function getMode() {
    return localStorage.getItem(MODE_KEY) === "scuola" ? "scuola" : "tech";
  }

  function setMode(mode) {
    localStorage.setItem(MODE_KEY, mode);
    const btn = document.querySelector(`.news-mode-btn[data-news-mode="${mode}"]`);
    if (btn) btn.classList.remove("has-new");
    applyMode(mode);
    reflectLastUpdated();
  }

  function getView() {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "stack";
  }

  function setView(view) {
    localStorage.setItem(VIEW_KEY, view);
    reflectViewUI(view);
    render();
  }

  function reflectViewUI(view) {
    document.querySelectorAll(".news-view-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.newsView === view);
    });
    list.classList.toggle("is-list", view === "list");
  }

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const CROSS_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  function lang() {
    return window.getSiteLang ? window.getSiteLang() : "en";
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function getInterests() {
    const v = readJSON(INTERESTS_KEY, []);
    return Array.isArray(v) ? v : [];
  }

  function setInterests(ids) {
    localStorage.setItem(INTERESTS_KEY, JSON.stringify(ids));
  }

  function getReadStatus() {
    const v = readJSON(READ_STATUS_KEY, {});
    return v && typeof v === "object" ? v : {};
  }

  function setReadStatus(map) {
    localStorage.setItem(READ_STATUS_KEY, JSON.stringify(map));
  }

  // Split so the button/subtitle state can be set immediately at load (while
  // the skeleton cards are still showing, before either feed has arrived)
  // without also triggering render() — which would wipe the skeletons and
  // show the "no stories yet" empty state prematurely.
  function reflectModeUI(mode) {
    document.querySelectorAll(".news-mode-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.newsMode === mode);
    });
    const subEl = document.getElementById("news-sub");
    if (subEl) subEl.textContent = NEWS_SUB_TEXT[mode][lang()];
  }

  function applyMode(mode) {
    reflectModeUI(mode);
    render();
  }

  // An exact date reads better here than a relative "4d ago" — especially
  // for Scuola, where "4 days ago" is meaningless without knowing today's
  // date, but "23/07/2026" isn't.
  function formatDate(unixSeconds, l) {
    return new Intl.DateTimeFormat(l === "it" ? "it-IT" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(unixSeconds * 1000));
  }

  function textSpan(text, className) {
    const el = document.createElement("span");
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  function dotSpan() {
    const el = textSpan("·", "news-item-dot");
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  // Read/unread status — a plain marker (colors the card green/red), not a
  // hide-it-forever vote like the old thumbs up/down.
  function readStatusButton(status, isActive, storyId) {
    const l = lang();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `news-read-btn news-read-btn-${status}` + (isActive ? " is-active" : "");
    btn.dataset.read = status;
    btn.setAttribute("aria-pressed", String(isActive));
    const label =
      status === "read"
        ? l === "it"
          ? "Segna come letto"
          : "Mark as read"
        : l === "it"
          ? "Segna come non letto"
          : "Mark as unread";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = status === "read" ? CHECK_SVG : CROSS_SVG;
    btn.addEventListener("click", () => {
      const current = getReadStatus();
      if (current[storyId] === status) delete current[storyId];
      else current[storyId] = status;
      setReadStatus(current);
      render();
    });
    return btn;
  }

  // Hacker News items don't carry any image of their own — this is a public,
  // keyless favicon lookup (same "no API key" bar as the rest of the site),
  // derived entirely from story.source, which is already in news.json.
  function faviconImg(story) {
    const img = document.createElement("img");
    img.className = "news-item-favicon";
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(story.source)}&sz=64`;
    img.alt = "";
    img.width = 18;
    img.height = 18;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.style.visibility = "hidden";
    });
    return img;
  }

  function buildItemEl(story, readStatus) {
    const l = lang();
    const status = readStatus[story.id];
    const isSchool = story.category === "scuola";

    const article = document.createElement("article");
    article.className = "news-item";
    if (status === "read") article.classList.add("is-read");
    if (status === "unread") article.classList.add("is-unread-marked");
    article.dataset.id = String(story.id);

    // Scuola cards have nothing worth a category tag or a source name (it's
    // always the same one site) — just the date, top-left, in place of both.
    if (isSchool) {
      article.appendChild(textSpan(formatDate(story.time, l), "news-item-category"));
    } else {
      const cat = CATEGORY_MAP.get(story.category) || CATEGORY_MAP.get("other");
      article.appendChild(textSpan(cat[l], "news-item-category"));
    }

    const h3 = document.createElement("h3");
    h3.className = "news-item-title";
    const titleLink = document.createElement("a");
    titleLink.href = story.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    titleLink.textContent = story.title;
    h3.appendChild(titleLink);
    article.appendChild(h3);

    if (!isSchool) {
      const meta = document.createElement("div");
      meta.className = "news-item-meta";
      meta.append(faviconImg(story), textSpan(story.source));
      // Points/comments are a Hacker News-specific concept — sources like the
      // school feed (no discussion thread of their own) simply omit those
      // fields, so skip rendering them rather than showing "▲ undefined".
      if (typeof story.points === "number" && typeof story.comments === "number" && story.discussionUrl) {
        const commentsLink = document.createElement("a");
        commentsLink.href = story.discussionUrl;
        commentsLink.target = "_blank";
        commentsLink.rel = "noopener";
        commentsLink.textContent = `${story.comments} ${l === "it" ? "commenti" : "comments"}`;
        meta.append(dotSpan(), textSpan(`▲ ${story.points}`), dotSpan(), commentsLink);
      }
      meta.append(dotSpan(), textSpan(formatDate(story.time, l)));
      article.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "news-item-actions";
    actions.append(readStatusButton("read", status === "read", story.id), readStatusButton("unread", status === "unread", story.id));
    article.appendChild(actions);

    return article;
  }

  let techStories = [];
  let schoolStories = [];
  let techGeneratedAt = null;
  let schoolGeneratedAt = null;
  let currentIndex = 0;

  // List view pages through the same dataset in groups — without this,
  // whichever page happens to have the longest title sets that page's row
  // height, so flipping pages made the cards visibly grow/shrink. Measuring
  // every card in both full (unpaginated) feeds once and reusing the
  // tallest result across *both* Tech and Scuola keeps every page — and
  // both modes — the same height, so switching Tech/Scuola doesn't resize
  // the box. Shared (not per-mode) on purpose; invalidated whenever either
  // feed's data changes.
  let sharedCardHeight = null;

  function measureMaxCardHeight(items, readStatus) {
    if (!items.length) return 0;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute; visibility:hidden; left:-9999px; top:0; width:310px;";
    document.body.appendChild(probe);
    let max = 0;
    items.forEach((story) => {
      const el = buildItemEl(story, readStatus);
      probe.appendChild(el);
      max = Math.max(max, el.scrollHeight);
      probe.removeChild(el);
    });
    document.body.removeChild(probe);
    return max;
  }

  function getCardHeight(readStatus) {
    if (sharedCardHeight === null) {
      const techMax = measureMaxCardHeight(techStories, readStatus);
      const schoolMax = measureMaxCardHeight(schoolStories, readStatus);
      sharedCardHeight = Math.max(techMax, schoolMax) || null;
    }
    return sharedCardHeight;
  }

  // The front card sits in the flow-less stack via position:absolute, so the
  // container has no natural height of its own — borrow the front card's
  // rendered height each time the stack changes (story swap, language swap,
  // font-size breakpoint) instead of guessing a fixed pixel value.
  function syncStackHeight() {
    const front = list.querySelector('[data-slot="0"]');
    list.style.height = front ? front.scrollHeight + "px" : "";
  }

  // Assigns each card its depth in the deck (0 = front, 1-2 = peeking behind,
  // "rest" = waiting out of sight) relative to currentIndex, so Prev/Next only
  // ever has to move that index — the CSS transition on data-slot does the
  // rest of the "flip to the next card" animation.
  function applySlots() {
    const cards = Array.from(list.querySelectorAll(".news-item:not(.is-skeleton)"));
    const n = cards.length;
    cards.forEach((card, i) => {
      const slot = n ? (i - currentIndex + n) % n : 0;
      card.dataset.slot = slot <= 2 ? String(slot) : "rest";
    });
    syncStackHeight();
  }

  function goTo(delta) {
    const n = list.querySelectorAll(".news-item:not(.is-skeleton)").length;
    if (n <= 1) return;
    currentIndex = (currentIndex + delta + n) % n;
    applySlots();
  }

  function render() {
    const mode = getMode();
    const readStatus = getReadStatus();
    let categoryFiltered = mode === "scuola" ? schoolStories : techStories;
    if (mode === "tech") {
      const interests = getInterests();
      if (interests.length) categoryFiltered = categoryFiltered.filter((s) => interests.includes(s.category));
    }
    // Newest first, in both modes — tech stories arrive ranked by HN score,
    // not by recency, so this needs its own sort rather than trusting feed order.
    categoryFiltered = categoryFiltered.slice().sort((a, b) => b.time - a.time);
    const emptyEl = document.getElementById("news-empty");

    // The stack caps tech at CARD_COUNT — Scuola is a small, date-bounded
    // set, and list view exists specifically to see many at once, so both
    // skip the cap entirely. Read/unread is just a color marker now, not a
    // hide-it vote, so it never removes anything from this list.
    const view = getView();
    const queue = view === "list" || mode === "scuola" ? categoryFiltered : categoryFiltered.slice(0, CARD_COUNT);

    itemsWrap.innerHTML = "";

    if (!queue.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const cardHeight = getCardHeight(readStatus);
    list.style.setProperty("--news-card-height", cardHeight ? `${cardHeight}px` : "");

    if (view === "list") {
      // Every story in one horizontally-scrolling row, like the Works cards.
      const frag = document.createDocumentFragment();
      queue.forEach((story) => frag.appendChild(buildItemEl(story, readStatus)));
      itemsWrap.appendChild(frag);
      list.style.height = "";
      return;
    }

    currentIndex = 0;
    const frag = document.createDocumentFragment();
    queue.forEach((story) => frag.appendChild(buildItemEl(story, readStatus)));
    itemsWrap.appendChild(frag);
    applySlots();
  }

  reflectModeUI(getMode());

  // New-items notification: remembers which story ids this browser has
  // already fetched (per feed) so a later fetch — either the next visit, or
  // a periodic poll while the tab stays open — can tell what's actually new
  // and surface it, rather than silently swapping the deck's contents.
  const SEEN_TECH_KEY = "newsSeenTechIds";
  const SEEN_SCHOOL_KEY = "newsSeenSchoolIds";
  // Both feeds only actually change once a day server-side (see
  // .github/workflows/news-sync.yml), so there's no point polling every few
  // minutes — this just needs to catch "yesterday's run landed" during a
  // long-lived tab.
  const POLL_INTERVAL_MS = 60 * 60 * 1000;

  function diffAndRemember(items, key) {
    const stored = readJSON(key, null);
    const isFirstVisit = stored === null;
    const seen = new Set(isFirstVisit ? [] : stored);
    const newCount = isFirstVisit ? 0 : items.filter((i) => !seen.has(String(i.id))).length;
    localStorage.setItem(key, JSON.stringify(items.map((i) => String(i.id))));
    return newCount;
  }

  // Small dot on the Tech/Scuola button instead of a separate banner —
  // additive only (never clears the *other* button's still-unread badge),
  // clearing happens only when that specific button gets clicked (setMode).
  function reflectNewBadges(newTechCount, newSchoolCount) {
    const techBtn = document.querySelector('.news-mode-btn[data-news-mode="tech"]');
    const schoolBtn = document.querySelector('.news-mode-btn[data-news-mode="scuola"]');
    if (newTechCount > 0 && techBtn) techBtn.classList.add("has-new");
    if (newSchoolCount > 0 && schoolBtn) schoolBtn.classList.add("has-new");
  }

  // New-story announcement on the Dynamic Island itself, right at the
  // avatar where the eye already goes, instead of a toast elsewhere on the
  // page: briefly expands the island to name what arrived (.island-notify-
  // label, see style.css), then collapses back down to a small pulsing
  // dot on the avatar (.island-badge) that persists until the visitor
  // actually scrolls the News section into view (see the observer below).
  const islandTrigger = document.querySelector(".nav-trigger");
  const islandLabel = document.getElementById("island-notify-label");
  const islandBadge = document.getElementById("island-badge");
  let islandNotifyTimer = null;

  function showIslandNotification(newTechCount, newSchoolCount) {
    if (newTechCount <= 0 && newSchoolCount <= 0) return;
    if (!islandTrigger || !islandLabel || !islandBadge) return;

    const l = lang();
    let text;
    if (newTechCount > 0 && newSchoolCount > 0) {
      text =
        l === "it"
          ? `${newTechCount} nuove notizie Tech, ${newSchoolCount} dalla Scuola`
          : `${newTechCount} new Tech ${newTechCount === 1 ? "story" : "stories"}, ${newSchoolCount} from School`;
    } else if (newTechCount > 0) {
      text =
        l === "it"
          ? `${newTechCount} nuov${newTechCount === 1 ? "a notizia" : "e notizie"} Tech`
          : `${newTechCount} new Tech ${newTechCount === 1 ? "story" : "stories"}`;
    } else {
      text =
        l === "it"
          ? `${newSchoolCount} nuov${newSchoolCount === 1 ? "a notizia" : "e notizie"} dalla Scuola`
          : `${newSchoolCount} new School ${newSchoolCount === 1 ? "story" : "stories"}`;
    }

    islandLabel.textContent = text;
    islandTrigger.classList.add("is-notifying");

    clearTimeout(islandNotifyTimer);
    islandNotifyTimer = setTimeout(() => {
      islandTrigger.classList.remove("is-notifying");
      islandBadge.classList.add("is-shown");
    }, 2400);
  }

  // Clears the badge once the visitor actually scrolls to the News
  // section — simpler and more reliable than making the tiny decorative
  // dot itself a click target (see index.html: it's aria-hidden, not a
  // button).
  if (islandBadge) {
    const newsSection = document.getElementById("news");
    if (newsSection && "IntersectionObserver" in window) {
      const newsVisibilityObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) islandBadge.classList.remove("is-shown");
        },
        { threshold: 0.2 }
      );
      newsVisibilityObserver.observe(newsSection);
    }
  }

  // Two independently-refreshed, keyless sources: news.json (tech, from
  // Hacker News) and school-news.json (the "Scuola" category, scraped from
  // uspmc.sinp.net — see scripts/fetch-school-news.mjs). Kept as separate
  // lists (not merged) — the Tech/Scuola toggle picks which one is shown.
  function loadFeed(path) {
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`bad status ${res.status}`);
        return res.json();
      })
      .then((data) => ({
        items: Array.isArray(data.items) ? data.items : [],
        generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
      }))
      .catch(() => ({ items: [], generatedAt: null }));
  }

  function fetchBothFeeds() {
    return Promise.all([loadFeed("news.json"), loadFeed("school-news.json")]);
  }

  // Reflects the *currently shown* feed's own generatedAt (see
  // scripts/fetch-news.mjs / fetch-school-news.mjs) next to the "News"
  // heading — switches value when Tech/Scuola is toggled, since they're
  // refreshed independently and don't share one timestamp.
  function reflectLastUpdated() {
    const el = document.getElementById("news-updated");
    if (!el) return;
    const generatedAt = getMode() === "scuola" ? schoolGeneratedAt : techGeneratedAt;
    if (!generatedAt) {
      el.hidden = true;
      return;
    }
    const l = lang();
    const formatted = new Intl.DateTimeFormat(l === "it" ? "it-IT" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(generatedAt));
    el.textContent = l === "it" ? `Aggiornato l'ultima volta il ${formatted}` : `Last updated on ${formatted}`;
    el.hidden = false;
  }

  fetchBothFeeds().then(([tech, school]) => {
    const newTechCount = diffAndRemember(tech.items, SEEN_TECH_KEY);
    const newSchoolCount = diffAndRemember(school.items, SEEN_SCHOOL_KEY);
    techStories = tech.items;
    schoolStories = school.items;
    techGeneratedAt = tech.generatedAt;
    schoolGeneratedAt = school.generatedAt;
    sharedCardHeight = null;
    if (!techStories.length && !schoolStories.length) {
      const msg = lang() === "it" ? "Non riesco a caricare le notizie al momento." : "Couldn't load the news right now.";
      itemsWrap.innerHTML = `<p class="news-error"></p>`;
      itemsWrap.querySelector(".news-error").textContent = msg;
      return;
    }
    applyMode(getMode());
    reflectLastUpdated();
    // Reflects what's new since the *last visit*; the poll below covers
    // anything published while this tab stays open.
    reflectNewBadges(newTechCount, newSchoolCount);
    showIslandNotification(newTechCount, newSchoolCount);
    maybeAutoPromptInterests();
  });

  // Nothing pushes to a static site, so this is the closest thing to "tell
  // me when something new arrives" while the tab is left open — a quiet
  // poll that just updates the badge dot and quietly refreshes the
  // underlying data (not the visible deck, so it doesn't get yanked out
  // from under whatever the visitor is currently reading).
  setInterval(() => {
    fetchBothFeeds().then(([tech, school]) => {
      const newTechCount = diffAndRemember(tech.items, SEEN_TECH_KEY);
      const newSchoolCount = diffAndRemember(school.items, SEEN_SCHOOL_KEY);
      techStories = tech.items;
      schoolStories = school.items;
      techGeneratedAt = tech.generatedAt;
      schoolGeneratedAt = school.generatedAt;
      sharedCardHeight = null;
      reflectLastUpdated();
      if (newTechCount > 0 || newSchoolCount > 0) {
        reflectNewBadges(newTechCount, newSchoolCount);
        showIslandNotification(newTechCount, newSchoolCount);
      }
    });
  }, POLL_INTERVAL_MS);

  reflectViewUI(getView());

  document.querySelectorAll(".news-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.newsMode));
  });

  document.querySelectorAll(".news-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.newsView));
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      setTimeout(() => {
        reflectModeUI(getMode());
        render();
      }, 0)
    );
  });

  // No more Prev/Next arrow buttons — navigation is swipe/wheel-only now,
  // the page pill (click, hover-glide, or wheel — see below) is what's
  // left of the nav bar.

  // Mouse wheel (vertical only) *and* trackpad swipes (two-finger, which
  // browsers report as wheel events with a deltaX component) flip through
  // the stack one card per gesture instead of scrolling while the pointer
  // is over it, debounced so a single swipe/notch (which fires many tiny
  // deltas) doesn't skip several. Whichever axis moved more decides the
  // direction. List view instead scrolls natively/horizontally, exactly
  // like the Works cards row (see setupScrollArrows below) — this handler
  // steps aside for it rather than hijacking the wheel into page-flips.
  let wheelLocked = false;
  function handleWheelNav(e) {
    if (getView() === "list") return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 4) return;
    e.preventDefault();
    if (wheelLocked) return;
    wheelLocked = true;
    goTo(delta > 0 ? 1 : -1);
    setTimeout(() => {
      wheelLocked = false;
    }, 550);
  }
  list.addEventListener("wheel", handleWheelNav, { passive: false });

  // List view: same drag/wheel-scrollable row + prev/next arrows as the
  // Works cards row, reused on this same persistent element (story cards
  // render into itemsWrap, not list, precisely so this survives re-renders
  // — see setupScrollArrows). Arrows stay hidden in stack view since the
  // deck never actually overflows horizontally there.
  setupScrollArrows(list);

  // Interests popup. No permanent "Interests" button anymore — instead this
  // opens itself automatically, once per calendar day, so the picker doesn't
  // sit there as a static, always-visible control (see maybeAutoPromptInterests,
  // called once tech stories have loaded).
  const modal = document.getElementById("news-interests-modal");
  const closeBtn = document.getElementById("news-interests-close");
  const saveBtn = document.getElementById("news-interests-save");
  const resetBtn = document.getElementById("news-interests-reset");
  const categoryList = document.getElementById("news-category-list");
  if (!modal || !categoryList) return;

  const INTERESTS_PROMPT_KEY = "newsInterestsPromptedOn"; // yyyy-mm-dd of the last auto-prompt

  function maybeAutoPromptInterests() {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(INTERESTS_PROMPT_KEY) === today) return;
    localStorage.setItem(INTERESTS_PROMPT_KEY, today);
    if (!techStories.length) return; // nothing to filter yet
    setTimeout(openModal, 1500);
  }

  function buildCategoryOptions() {
    const selected = new Set(getInterests());
    const l = lang();
    categoryList.innerHTML = "";
    TECH_CATEGORIES.forEach((c) => {
      const label = document.createElement("label");
      label.className = "news-category-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = c.id;
      input.checked = selected.size === 0 || selected.has(c.id);
      label.appendChild(input);
      label.appendChild(textSpan(c[l]));
      categoryList.appendChild(label);
    });
  }

  function openModal() {
    buildCategoryOptions();
    modal.classList.add("is-visible");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove("is-visible");
  }

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-visible")) closeModal();
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const checked = Array.from(categoryList.querySelectorAll("input:checked")).map((i) => i.value);
      setInterests(checked.length === TECH_CATEGORIES.length ? [] : checked);
      render();
      closeModal();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      setInterests([]);
      buildCategoryOptions();
      render();
    });
  }
  } // end initNews
})();
