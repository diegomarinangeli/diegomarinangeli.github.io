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
   for the theme toggle, language toggle, and the Home/Works/News links
   that expand out of the Dynamic Island's nav trigger. */
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

    function rest() {
      place(container.querySelector(".is-active") || items[0]);
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

  function step() {
    ctx.clearRect(0, 0, w, h);

    // Orange reads fine floating over the dark theme's near-black background,
    // but the same tint looks out of place on a white surface, so light theme
    // gets a neutral gray instead (checked live, since the visitor can toggle
    // theme at any time without a page reload).
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const rgb = isLight ? "140, 140, 148" : "226, 112, 58";

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
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

/* Auto-scrolling horizontal carousel: slowly drifts back and forth,
   pausing whenever the visitor scrolls/drags/wheels it themselves. Used by
   the Works cards row. */
function setupAutoScrollCarousel(el) {
  if (!el) return;

  const SPEED = 60; // px per second
  let paused = false;
  let resumeTimer = null;
  let maxScroll = 0;
  let direction = 1; // 1 = forward, -1 = backward (bounces at each end)

  function measure() {
    maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
  }

  measure();
  window.addEventListener("resize", measure);
  new MutationObserver(measure).observe(el, { childList: true });

  function pauseThenResume() {
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      paused = false;
    }, 1600);
  }

  el.addEventListener("pointerdown", () => {
    paused = true;
    clearTimeout(resumeTimer);
  });
  el.addEventListener("pointerup", pauseThenResume);
  // A plain vertical mouse wheel doesn't scroll a horizontal-only strip in
  // most browsers by itself — translate deltaY into scrollLeft so hovering
  // the row and scrolling normally moves it sideways. Leaves genuine
  // horizontal input (trackpad swipes, shift+wheel) alone.
  el.addEventListener(
    "wheel",
    (e) => {
      pauseThenResume();
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );
  el.addEventListener(
    "touchstart",
    () => {
      paused = true;
      clearTimeout(resumeTimer);
    },
    { passive: true }
  );
  el.addEventListener("touchend", pauseThenResume);

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

setupAutoScrollCarousel(document.querySelector(".work .cards"));

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

/* News section (homepage only): renders news.json — refreshed daily by
   scripts/fetch-news.mjs via .github/workflows/news-sync.yml — as a list
   of cards, with a client-side "interests" filter and per-story feedback.
   Everything here is local to this browser (localStorage): there's no
   backend, so picks/votes personalize what this visitor sees, they don't
   get collected anywhere. */
(function () {
  const list = document.getElementById("news-list");
  if (!list) return;

  // Only this many stories are ever loaded into the stack at once — it's a
  // deck you cycle through with Prev/Next (or the dots), not an infinite feed.
  const CARD_COUNT = 5;

  const CATEGORIES = [
    { id: "ai", en: "AI & Machine Learning", it: "IA & Machine Learning" },
    { id: "security", en: "Cybersecurity", it: "Sicurezza informatica" },
    { id: "webdev", en: "Web Development", it: "Sviluppo Web" },
    { id: "languages", en: "Languages & Frameworks", it: "Linguaggi & Framework" },
    { id: "hardware", en: "Hardware & Systems", it: "Hardware & Sistemi" },
    { id: "startup", en: "Startups & Business", it: "Startup & Business" },
    { id: "science", en: "Science & Research", it: "Scienza & Ricerca" },
    { id: "other", en: "Other Tech News", it: "Altre notizie tech" },
  ];
  const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

  const INTERESTS_KEY = "newsInterests"; // array of category ids; [] means "all"
  const FEEDBACK_KEY = "newsFeedback"; // { [storyId]: "up" | "down" }

  const THUMB_UP_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h6.29a2 2 0 0 1 1.94 2.5l-2.11 8A2 2 0 0 1 18.16 22H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1.24a2 2 0 0 0 1.79-1.11L13 2a2.5 2.5 0 0 1 2 2.5V5.88Z"/></svg>';
  const THUMB_DOWN_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V2"/><path d="M9 18.12 10 14H3.71a2 2 0 0 1-1.94-2.5l2.11-8A2 2 0 0 1 5.83 2H17a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1.24a2 2 0 0 0-1.79 1.11L9 22a2.5 2.5 0 0 1-2-2.5v-1.38Z"/></svg>';

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

  function getFeedback() {
    const v = readJSON(FEEDBACK_KEY, {});
    return v && typeof v === "object" ? v : {};
  }

  function setFeedback(map) {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(map));
  }

  function timeAgo(unixSeconds) {
    const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
    const mins = Math.round(diff / 60);
    if (mins < 60) return { en: `${mins}m ago`, it: `${mins}m fa` };
    const hours = Math.round(mins / 60);
    if (hours < 24) return { en: `${hours}h ago`, it: `${hours}h fa` };
    const days = Math.round(hours / 24);
    return { en: `${days}d ago`, it: `${days}g fa` };
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

  function feedbackButton(voteType, isActive, storyId) {
    const l = lang();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "news-feedback-btn" + (isActive ? " is-active" : "");
    btn.dataset.vote = voteType;
    btn.setAttribute("aria-pressed", String(isActive));
    const label =
      voteType === "up"
        ? l === "it"
          ? "Interessante"
          : "Interesting"
        : l === "it"
          ? "Non mi interessa"
          : "Not interested";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = voteType === "up" ? THUMB_UP_SVG : THUMB_DOWN_SVG;
    btn.addEventListener("click", () => {
      const current = getFeedback();
      const turningOn = current[storyId] !== voteType;
      if (turningOn) current[storyId] = voteType;
      else delete current[storyId];
      setFeedback(current);

      // Downvoting hides the card for good (see render()) — collapse it
      // out nicely first instead of just having it vanish on next render.
      if (voteType === "down" && turningOn) {
        const card = btn.closest(".news-item");
        if (card) {
          card.classList.add("is-collapsing");
          card.addEventListener("transitionend", () => render(), { once: true });
          return;
        }
      }
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

  function buildItemEl(story, feedback) {
    const l = lang();
    const cat = CATEGORY_MAP.get(story.category) || CATEGORY_MAP.get("other");
    const vote = feedback[story.id];

    const article = document.createElement("article");
    article.className = "news-item";
    article.dataset.id = String(story.id);
    article.appendChild(textSpan(cat[l], "news-item-category"));

    const h3 = document.createElement("h3");
    h3.className = "news-item-title";
    const titleLink = document.createElement("a");
    titleLink.href = story.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    titleLink.textContent = story.title;
    h3.appendChild(titleLink);
    article.appendChild(h3);

    const meta = document.createElement("div");
    meta.className = "news-item-meta";
    const commentsLink = document.createElement("a");
    commentsLink.href = story.discussionUrl;
    commentsLink.target = "_blank";
    commentsLink.rel = "noopener";
    commentsLink.textContent = `${story.comments} ${l === "it" ? "commenti" : "comments"}`;
    meta.append(
      faviconImg(story),
      textSpan(story.source),
      dotSpan(),
      textSpan(`▲ ${story.points}`),
      dotSpan(),
      commentsLink,
      dotSpan(),
      textSpan(timeAgo(story.time)[l])
    );
    article.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "news-item-actions";
    actions.append(feedbackButton("up", vote === "up", story.id), feedbackButton("down", vote === "down", story.id));
    article.appendChild(actions);

    return article;
  }

  let allStories = [];
  let currentIndex = 0;

  // The front card sits in the flow-less stack via position:absolute, so the
  // container has no natural height of its own — borrow the front card's
  // rendered height each time the stack changes (story swap, language swap,
  // font-size breakpoint) instead of guessing a fixed pixel value.
  function syncStackHeight() {
    const front = list.querySelector('[data-slot="0"]');
    list.style.height = front ? front.scrollHeight + "px" : "";
  }

  function updateDots(count) {
    const dotsEl = document.getElementById("news-stack-dots");
    const navEl = document.getElementById("news-stack-nav");
    if (!dotsEl || !navEl) return;
    navEl.hidden = count <= 1;
    if (count <= 1) return;
    dotsEl.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "news-stack-dot" + (i === currentIndex ? " is-active" : "");
      dot.setAttribute("aria-label", String(i + 1));
      dot.addEventListener("click", () => {
        currentIndex = i;
        applySlots();
      });
      dotsEl.appendChild(dot);
    }
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
    updateDots(n);
  }

  function goTo(delta) {
    const n = list.querySelectorAll(".news-item:not(.is-skeleton)").length;
    if (n <= 1) return;
    currentIndex = (currentIndex + delta + n) % n;
    applySlots();
  }

  function render() {
    const interests = getInterests();
    const feedback = getFeedback();
    const categoryFiltered = interests.length ? allStories.filter((s) => interests.includes(s.category)) : allStories;
    const visible = categoryFiltered.filter((s) => feedback[s.id] !== "down");
    const hiddenCount = categoryFiltered.length - visible.length;
    const emptyEl = document.getElementById("news-empty");
    const hiddenToggle = document.getElementById("news-hidden-toggle");
    const navEl = document.getElementById("news-stack-nav");

    if (hiddenToggle) {
      hiddenToggle.hidden = hiddenCount === 0;
      if (hiddenCount > 0) {
        const l = lang();
        hiddenToggle.textContent =
          l === "it"
            ? `${hiddenCount} notizi${hiddenCount === 1 ? "a nascosta" : "e nascoste"} · Mostra`
            : `${hiddenCount} ${hiddenCount === 1 ? "story" : "stories"} hidden · Show`;
      }
    }

    // Cap how many stories ever enter the stack — the rest stay reachable
    // only by first hiding/downvoting one of these, same as before.
    const queue = visible.slice(0, CARD_COUNT);

    list.innerHTML = "";
    currentIndex = 0;

    if (!queue.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (navEl) navEl.hidden = true;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const frag = document.createDocumentFragment();
    queue.forEach((story) => frag.appendChild(buildItemEl(story, feedback)));
    list.appendChild(frag);
    applySlots();
  }

  fetch("news.json")
    .then((res) => {
      if (!res.ok) throw new Error(`bad status ${res.status}`);
      return res.json();
    })
    .then((data) => {
      allStories = Array.isArray(data.items) ? data.items : [];
      render();
    })
    .catch(() => {
      const msg = lang() === "it" ? "Non riesco a caricare le notizie al momento." : "Couldn't load the news right now.";
      list.innerHTML = `<p class="news-error"></p>`;
      list.querySelector(".news-error").textContent = msg;
    });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTimeout(render, 0));
  });

  const stackNextBtn = document.getElementById("news-stack-next");
  const stackPrevBtn = document.getElementById("news-stack-prev");
  if (stackNextBtn) stackNextBtn.addEventListener("click", () => goTo(1));
  if (stackPrevBtn) stackPrevBtn.addEventListener("click", () => goTo(-1));

  // Mouse wheel flips through the deck instead of scrolling the page while
  // the pointer is over it — one card per "notch", debounced so a single
  // trackpad gesture (which fires many tiny deltas) doesn't skip several.
  let wheelLocked = false;
  list.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      if (wheelLocked) return;
      wheelLocked = true;
      goTo(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLocked = false;
      }, 550);
    },
    { passive: false }
  );

  const hiddenToggleBtn = document.getElementById("news-hidden-toggle");
  if (hiddenToggleBtn) {
    hiddenToggleBtn.addEventListener("click", () => {
      const current = getFeedback();
      Object.keys(current).forEach((id) => {
        if (current[id] === "down") delete current[id];
      });
      setFeedback(current);
      render();
    });
  }

  // Interests popup.
  const modal = document.getElementById("news-interests-modal");
  const openBtn = document.getElementById("news-interests-btn");
  const closeBtn = document.getElementById("news-interests-close");
  const saveBtn = document.getElementById("news-interests-save");
  const resetBtn = document.getElementById("news-interests-reset");
  const categoryList = document.getElementById("news-category-list");
  if (!modal || !openBtn || !categoryList) return;

  function buildCategoryOptions() {
    const selected = new Set(getInterests());
    const l = lang();
    categoryList.innerHTML = "";
    CATEGORIES.forEach((c) => {
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
    openBtn.focus();
  }

  openBtn.addEventListener("click", openModal);
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
      setInterests(checked.length === CATEGORIES.length ? [] : checked);
      render();
      closeModal();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      setInterests([]);
      setFeedback({});
      buildCategoryOptions();
      render();
    });
  }
})();
