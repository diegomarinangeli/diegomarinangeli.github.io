(function () {
  const cardsEl = document.querySelector(".work .cards");
  if (!cardsEl) return;

  const originalCards = Array.from(cardsEl.children);
  if (!originalCards.length) return;

  // Duplicate the set once so the loop back to the start is seamless.
  originalCards.forEach((card) => cardsEl.appendChild(card.cloneNode(true)));

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
  let setWidth = 0;

  function measure() {
    setWidth = 0;
    const gap = parseFloat(getComputedStyle(cardsEl).columnGap || "0");
    for (let i = 0; i < originalCards.length; i++) {
      setWidth += cardsEl.children[i].getBoundingClientRect().width + gap;
    }
  }

  measure();
  window.addEventListener("resize", measure);

  function updateDots() {
    if (!dotEls.length || setWidth <= 0) return;
    const effective = ((cardsEl.scrollLeft % setWidth) + setWidth) % setWidth;
    const center = effective + cardsEl.clientWidth / 2;
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
    if (!paused && setWidth > 0) {
      cardsEl.scrollLeft += SPEED * dt;
      if (cardsEl.scrollLeft >= setWidth) {
        cardsEl.scrollLeft -= setWidth;
      }
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
