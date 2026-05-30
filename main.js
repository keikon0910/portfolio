/* ============================================================
   Kei — Portfolio / interactions
   1) Hawkes-process jump simulation on the hero canvas
   2) scroll reveals  3) animated branching bars
   4) mobile menu  5) footer year
   ============================================================ */

   (() => {
    "use strict";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
    /* ---------- footer year ---------- */
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  
    /* ---------- mobile menu ---------- */
    const nav = document.querySelector(".nav");
    const btn = document.getElementById("menuBtn");
    const links = document.querySelector(".nav__links");
    if (btn && links) {
      const toggle = (open) => {
        links.classList.toggle("open", open);
        nav.classList.toggle("menu-open", open);
        btn.setAttribute("aria-expanded", String(open));
      };
      btn.addEventListener("click", () => toggle(!links.classList.contains("open")));
      links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => toggle(false)));
    }
  
    /* ---------- slide modal (inline image carousel) ---------- */
    const modal = document.getElementById("slideModal");
    if (modal) {
      const stage = document.getElementById("slideStage");
      const titleEl = document.getElementById("slideTitle");
      const openEl = document.getElementById("slideOpen");
      const countEl = document.getElementById("slideCount");
      const prevBtn = document.getElementById("slidePrev");
      const nextBtn = document.getElementById("slideNext");
      const closeBtn = document.getElementById("slideClose");
      let lastFocus = null, imgs = [], idx = 0;
  
      const render = () => {
        if (!imgs.length) {
          stage.innerHTML = '<p class="mono" style="color:var(--muted);font-size:.8rem">スライドを読み込めませんでした。「新しいタブで開く」からご覧ください。</p>';
          countEl.textContent = ""; prevBtn.style.display = nextBtn.style.display = "none";
          return;
        }
        prevBtn.style.display = nextBtn.style.display = imgs.length > 1 ? "flex" : "none";
        stage.innerHTML = "";
        const im = document.createElement("img");
        im.src = imgs[idx];
        im.alt = `スライド ${idx + 1}`;
        stage.appendChild(im);
        countEl.textContent = `${idx + 1} / ${imgs.length}`;
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === imgs.length - 1;
      };
      const go = (d) => { idx = Math.min(Math.max(idx + d, 0), imgs.length - 1); render(); };
  
      const openModal = (href, title) => {
        lastFocus = document.activeElement;
        const key = href.split("/").pop().replace(/\.pdf$/i, "");
        imgs = (window.SLIDES && window.SLIDES[key]) || [];
        idx = 0;
        openEl.href = href;
        titleEl.textContent = title || "スライド";
        render();
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        closeBtn.focus();
      };
      const closeModal = () => {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        stage.innerHTML = "";
        if (lastFocus) lastFocus.focus();
      };
  
      document.querySelectorAll('a.card__link[href$=".pdf"]').forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openModal(a.getAttribute("href"), a.getAttribute("data-title"));
        });
      });
  
      prevBtn.addEventListener("click", () => go(-1));
      nextBtn.addEventListener("click", () => go(1));
      modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
      closeBtn.addEventListener("click", closeModal);
      document.addEventListener("keydown", (e) => {
        if (!modal.classList.contains("open")) return;
        if (e.key === "Escape") closeModal();
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
      });
    }
  
    /* ---------- scroll reveals ---------- */
    // hero intro (plays on load)
    requestAnimationFrame(() => {
      document.querySelectorAll(".hero .reveal").forEach((el) => el.classList.add("is-in"));
    });
  
    const animTargets = [
      ".section__head", ".about__lead", ".about__body", ".about__facts",
      ".paper", ".card", ".skills__group", ".tl",
      ".contact__title", ".contact__lead", ".contact__links",
    ];
    const groups = { ".card": 0, ".skills__group": 0, ".tl": 0 };
    document.querySelectorAll(animTargets.join(",")).forEach((el) => {
      el.classList.add("reveal");
      // gentle stagger within repeating groups
      for (const sel in groups) {
        if (el.matches(sel)) { el.style.setProperty("--d", groups[sel]++ % 5); }
      }
    });
  
    if ("IntersectionObserver" in window && !reduceMotion) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          if (e.target.classList.contains("paper")) {
            const b = e.target.querySelector(".branching");
            if (b) b.classList.add("in");
          }
          obs.unobserve(e.target);
        });
      }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
      document.querySelectorAll(".reveal").forEach((el) => {
        if (!el.closest(".hero")) io.observe(el);
      });
    } else {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
      const b = document.querySelector(".branching");
      if (b) b.classList.add("in");
    }
  
    /* ============================================================
       HAWKES PROCESS — self-exciting jump simulation
       intensity λ(t) = μ + Σ α·exp(−β (t − tᵢ))
       each jump raises the chance of the next → visible clusters
       ============================================================ */
    const canvas = document.getElementById("hawkes");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const SIGNAL = "246, 181, 63"; // amber rgb
  
    let W = 0, H = 0, dpr = 1, baseY = 0;
    const events = []; // {x, h, born}
  
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseY = H * 0.62;
    }
    resize();
    window.addEventListener("resize", resize);
  
    // model params (tuned for visible clustering, calm pace)
    const MU = 0.012;       // baseline spawn prob / frame
    const ALPHA = 0.085;    // excitation added per jump
    const BETA = 0.93;      // per-frame decay of excitation
    let excitation = 0;
    const SPEED = 0.55;     // px per frame the timeline drifts left
  
    function spawn() {
      const big = Math.random() < 0.22;
      const h = (big ? 0.55 + Math.random() * 0.42 : 0.16 + Math.random() * 0.32);
      events.push({ x: W + 6, h, born: performance.now() });
      excitation += ALPHA;
    }
  
    function staticDraw() {
      // reduced-motion: lay down a fixed clustered pattern, no animation
      resize();
      ctx.clearRect(0, 0, W, H);
      let e2 = 0;
      for (let x = 0; x < W; x += 3) {
        const p = MU + e2;
        e2 *= BETA;
        if (Math.random() < p) {
          const big = Math.random() < 0.22;
          const h = big ? 0.6 : 0.25;
          e2 += ALPHA;
          drawTick(x, h, 0.5);
        }
      }
      drawAxis();
    }
  
    function drawAxis() {
      ctx.strokeStyle = "rgba(236,233,225,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseY + 0.5);
      ctx.lineTo(W, baseY + 0.5);
      ctx.stroke();
    }
  
    function drawTick(x, h, alpha) {
      const top = baseY - h * (H * 0.42);
      // stem
      ctx.strokeStyle = `rgba(${SIGNAL}, ${0.32 * alpha})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, top);
      ctx.stroke();
      // head
      ctx.fillStyle = `rgba(${SIGNAL}, ${0.95 * alpha})`;
      ctx.shadowColor = `rgba(${SIGNAL}, ${0.8 * alpha})`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, top, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  
    function frame() {
      ctx.clearRect(0, 0, W, H);
      drawAxis();
  
      // evolve intensity & maybe spawn
      excitation *= BETA;
      const lambda = MU + excitation;
      if (Math.random() < lambda) spawn();
  
      const now = performance.now();
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        ev.x -= SPEED;
        if (ev.x < -8) { events.splice(i, 1); continue; }
        // fade in on birth, fade slightly toward the left edge
        const age = now - ev.born;
        const fadeIn = Math.min(age / 220, 1);
        const edge = ev.x < W * 0.16 ? Math.max(ev.x / (W * 0.16), 0) : 1;
        drawTick(ev.x, ev.h, fadeIn * edge);
      }
      raf = requestAnimationFrame(frame);
    }
  
    let raf;
    if (reduceMotion) {
      staticDraw();
    } else {
      // seed a little history so it's alive immediately
      for (let i = 0; i < 60; i++) {
        excitation *= BETA;
        if (Math.random() < MU + excitation) {
          const big = Math.random() < 0.22;
          events.push({ x: (i / 60) * W, h: big ? 0.6 : 0.28, born: performance.now() - 400 });
          excitation += ALPHA;
        }
      }
      raf = requestAnimationFrame(frame);
      // pause when tab hidden (saves battery)
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { cancelAnimationFrame(raf); }
        else { raf = requestAnimationFrame(frame); }
      });
    }
  })();