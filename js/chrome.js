// Page furniture that belongs to no one section: the theme dial, the
// floating nav's glass-to-solid switch, and the section-heading reveal.

// ---------- Theme toggle ----------
// Defaults to the OS preference (handled purely in CSS); an explicit choice
// here is saved and takes over from then on. The inline script in
// index.html's <head> applies a saved choice before first paint so there's
// no flash of the wrong theme.
export function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function currentTheme() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return prefersDark.matches ? "dark" : "light";
  }

  function updateButton() {
    const isDark = currentTheme() === "dark";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function applyTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — theme still applies for this page view */
    }
    updateButton();
  }

  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // Keep the dial in sync if the OS theme changes while no explicit choice
  // has been made on this page.
  if (prefersDark.addEventListener) {
    prefersDark.addEventListener("change", updateButton);
  } else {
    prefersDark.addListener(updateButton);
  }
  updateButton();
}

// ---------- Nav state ----------
// The bar is glass over the sky and an opaque surface below it. The switch
// is keyed to .hero__sentinel — a zero-height marker at the top edge of the
// hero's logo strip — not to the hero itself: watching the whole section
// held the bar in glass until the section's *base* cleared the top of the
// screen, which is well after the drifting logos have started passing
// behind it. The line is measured off the bar rather than hard-coded, so it
// keeps up when the bar changes height (its CTA is dropped on a phone).
export function initNav() {
  const nav = document.getElementById("nav");
  const sentinel = document.querySelector(".hero__sentinel");
  const hero = document.querySelector(".hero");
  if (!nav || !hero) return;

  const target = sentinel ?? hero;
  const setSolid = (on) => nav.classList.toggle("nav--solid", on);
  // A few pixels of lead, so the bar has finished the change before the
  // strip reaches it rather than during.
  const line = () => nav.getBoundingClientRect().bottom + 8;

  if (!("IntersectionObserver" in window)) {
    const update = () => setSolid(target.getBoundingClientRect().top <= line());
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return;
  }

  let observer = null;
  function watch() {
    observer?.disconnect();
    observer = new IntersectionObserver(
      ([entry]) => setSolid(!entry.isIntersecting),
      { rootMargin: `-${Math.ceil(line())}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(target);
  }

  watch();
  // rootMargin is fixed at construction, so the observer is rebuilt when the
  // bar's own height changes. Rebuilding never resizes the bar, so this
  // can't feed itself.
  if ("ResizeObserver" in window) new ResizeObserver(watch).observe(nav);
}

// ---------- Section reveal ----------
// One reveal, on section headings only — cards and list items stay still so
// the page doesn't shimmer on every scroll.
export function initReveal() {
  const targets = document.querySelectorAll(".section__head");
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
  );

  for (const target of targets) {
    target.classList.add("reveal");
    observer.observe(target);
  }
}

// Close the disclosure after navigation, outside clicks, Escape, or a switch
// to the desktop layout. Focus returns to the trigger only on Escape.
export function initMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  if (!menu) return;
  menu.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    menu.open = false;
    const target = document.querySelector(link.getAttribute("href"));
    if (target) {
      const focus = target.querySelector("input:not(:disabled), h2") ?? target;
      if (!focus.matches("input")) focus.setAttribute("tabindex", "-1");
      focus.focus({ preventScroll: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
  window.matchMedia("(min-width: 941px)").addEventListener("change", (event) => {
    if (event.matches) menu.open = false;
  });
}
