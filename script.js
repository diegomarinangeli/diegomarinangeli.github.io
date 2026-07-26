(function () {
  const splash = document.getElementById("intro-splash");
  if (!splash) return;

  // Only play on a real reload or a fresh arrival at the site — not when
  // the back-fab sends us here from a project subpage. That click sets
  // this flag right before navigating (see the back-fab handler below).
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
          ctx.strokeStyle = `rgba(226, 112, 58, ${0.4 * (1 - dist / LINK_DIST)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "rgba(226, 112, 58, 0.65)";
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

(function () {
  const cardsEl = document.querySelector(".work .cards");
  if (!cardsEl) return;

  const originalCards = Array.from(cardsEl.children);
  if (!originalCards.length) return;

  const dotsEl = document.querySelector(".work .cards-dots");
  const dotEls = originalCards.map((card, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot";
    const title = card.querySelector("h3")?.textContent?.trim();
    dot.setAttribute("aria-label", title ? `Go to ${title}` : `Go to project ${i + 1}`);
    dot.addEventListener("click", () => {
      paused = true;
      clearTimeout(resumeTimer);
      const target = cardsEl.children[i];
      const targetLeft = target.offsetLeft - (cardsEl.clientWidth - target.offsetWidth) / 2;
      cardsEl.scrollTo({ left: targetLeft, behavior: "smooth" });
      pauseThenResume();
    });
    if (dotsEl) dotsEl.appendChild(dot);
    return dot;
  });

  const SPEED = 60; // px per second
  let paused = false;
  let resumeTimer = null;
  let maxScroll = 0;
  let direction = 1; // 1 = forward, -1 = backward (bounces at each end)

  function measure() {
    maxScroll = Math.max(0, cardsEl.scrollWidth - cardsEl.clientWidth);
  }

  measure();
  window.addEventListener("resize", measure);

  function updateDots() {
    if (!dotEls.length) return;
    const center = cardsEl.scrollLeft + cardsEl.clientWidth / 2;
    let active = 0;
    let bestDist = Infinity;
    for (let i = 0; i < originalCards.length; i++) {
      const el = cardsEl.children[i];
      const cardCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        active = i;
      }
    }
    dotEls.forEach((dot, i) => {
      const dist = Math.abs(i - active);
      if (dist === 0) {
        dot.style.width = "22px";
        dot.style.opacity = "1";
      } else if (dist === 1) {
        dot.style.width = "6px";
        dot.style.opacity = "0.7";
      } else if (dist === 2) {
        dot.style.width = "5px";
        dot.style.opacity = "0.45";
      } else {
        dot.style.width = "4px";
        dot.style.opacity = "0.25";
      }
    });
  }

  function pauseThenResume() {
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      paused = false;
    }, 1600);
  }

  cardsEl.addEventListener("pointerdown", () => {
    paused = true;
    clearTimeout(resumeTimer);
  });
  cardsEl.addEventListener("pointerup", pauseThenResume);
  cardsEl.addEventListener("wheel", pauseThenResume, { passive: true });
  cardsEl.addEventListener(
    "touchstart",
    () => {
      paused = true;
      clearTimeout(resumeTimer);
    },
    { passive: true }
  );
  cardsEl.addEventListener("touchend", pauseThenResume);
  cardsEl.addEventListener("scroll", updateDots, { passive: true });

  let lastTime = null;
  function step(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (!paused && maxScroll > 0) {
      let next = cardsEl.scrollLeft + SPEED * dt * direction;
      if (next >= maxScroll) {
        next = maxScroll;
        direction = -1;
      } else if (next <= 0) {
        next = 0;
        direction = 1;
      }
      cardsEl.scrollLeft = next;
      updateDots();
    }
    requestAnimationFrame(step);
  }
  updateDots();
  requestAnimationFrame(step);
})();

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
    { text: "Diego Marinangeli!", color: "var(--accent)" },
    { text: "an IT teacher!", color: "#5eb1ff" },
    { text: "a Computer Science student!", color: "#a78bfa" },
    { text: "based in Marche, Italy!", color: "#4ade80" },
    { text: "a curious problem solver!", color: "#f472b6" },
  ];

  let i = 0;

  const TYPE_MS = 55;
  const DELETE_MS = 30;
  const HOLD_MS = 1700;
  const GAP_MS = 300;

  let charIndex = 0;
  el.textContent = "";
  el.style.color = phrases[i].color;

  function type() {
    charIndex++;
    el.textContent = phrases[i].text.slice(0, charIndex);
    if (charIndex < phrases[i].text.length) {
      setTimeout(type, TYPE_MS);
    } else {
      setTimeout(erase, HOLD_MS);
    }
  }

  function erase() {
    charIndex--;
    el.textContent = phrases[i].text.slice(0, charIndex);
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
    "👋 Hi there!",
    "😄 That's me!",
    "🚀 Building cool stuff",
    "☕ Powered by coffee",
    "🎓 CS student & teacher",
    "💻 Always coding",
    "🍕 Ask me about pizza",
  ];

  let last = avatar.dataset.tooltip;

  avatar.addEventListener("click", () => {
    let next = last;
    while (next === last) {
      next = messages[Math.floor(Math.random() * messages.length)];
    }
    avatar.dataset.tooltip = next;
    last = next;
    const bubble = document.getElementById("tooltip-bubble");
    if (bubble && bubble.classList.contains("is-visible")) {
      bubble.textContent = next;
    }
  });
})();

(function () {
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
})();

(function () {
  const backFab = document.getElementById("back-fab");
  if (!backFab) return;

  // Sits as a small badge inside the brand pill's frame until the user
  // starts scrolling, then slides out past its edge and grows. The
  // frame stays at its wide size permanently once expanded.
  window.addEventListener(
    "scroll",
    () => {
      backFab.classList.add("is-visible");
    },
    { once: true, passive: true }
  );

  backFab.addEventListener("click", (e) => {
    e.preventDefault();
    sessionStorage.setItem("skipIntroSplash", "1");
    backFab.classList.remove("is-visible");
    backFab.classList.add("is-leaving");
    setTimeout(() => {
      window.location.href = backFab.href;
    }, 250);
  });
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
