/* Mobili-Tee landing — vanilla JS */
(function () {
  "use strict";

  // ============================================================
  // Form handler config
  // ============================================================
  var FORM_ENDPOINT = "https://mobili-tee-form.chriswrazen.workers.dev";
  var FORMSPREE_ID = "";

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function getEndpoint() {
    if (FORM_ENDPOINT) return FORM_ENDPOINT;
    if (FORMSPREE_ID) return "https://formspree.io/f/" + FORMSPREE_ID;
    return null;
  }

  function setMessage(form, text, state) {
    var msg = form.querySelector("[data-message]");
    if (!msg) return;
    msg.textContent = text || "";
    if (state) msg.setAttribute("data-state", state);
    else msg.removeAttribute("data-state");
  }

  function showSuccess(form, text) {
    var existing = form.querySelector(".email-form__success, .briefing-form__success");
    var className = form.classList.contains("briefing-form")
      ? "briefing-form__success"
      : "email-form__success";
    if (!existing) {
      var p = document.createElement("p");
      p.className = className;
      p.textContent = text;
      form.appendChild(p);
    } else {
      existing.textContent = text;
    }
    form.setAttribute("data-success", "true");
  }

  // ============================================================
  // Email forms (hero + footer)
  // ============================================================
  async function submitEmailForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var input = form.querySelector(".email-form__input");
    var button = form.querySelector(".email-form__submit");
    var honeypot = form.querySelector('input[name="company"]');
    if (!input || !button) return;

    if (honeypot && honeypot.value) {
      // Bot — silently succeed without sending.
      showSuccess(form, "Thanks — we’ll be in touch when we open the member preview list.");
      return;
    }

    var email = (input.value || "").trim();
    if (!EMAIL_RE.test(email)) {
      setMessage(form, "Please enter a valid email address.", "error");
      input.focus();
      return;
    }

    button.disabled = true;
    form.setAttribute("data-loading", "true");
    setMessage(form, "");

    var endpoint = getEndpoint();
    var source = form.getAttribute("data-form") || "landing";

    try {
      if (endpoint) {
        var res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            email: email,
            source: source,
            page: window.location.href,
            referrer: document.referrer || ""
          })
        });
        if (!res.ok) {
          var data = null;
          try { data = await res.json(); } catch (_) {}
          throw new Error(data && data.error ? data.error : "Status " + res.status);
        }
      } else {
        await new Promise(function (r) { setTimeout(r, 600); });
      }
      showSuccess(form, "Thanks — we’ll be in touch when we open the member preview list.");
    } catch (err) {
      setMessage(
        form,
        "Something went wrong. Please try again or email hello@mobili-tee.com.",
        "error"
      );
      console.error("Form submission failed:", err);
    } finally {
      button.disabled = false;
      form.removeAttribute("data-loading");
    }
  }

  document.querySelectorAll(".email-form").forEach(function (form) {
    form.addEventListener("submit", submitEmailForm);
  });

  // ============================================================
  // Briefing form (For Clubs)
  // ============================================================
  async function submitBriefingForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type='submit']");
    var honeypot = form.querySelector('input[name="company"]');

    if (honeypot && honeypot.value) {
      showSuccess(form, "Thanks — we’ll be in touch shortly.");
      return;
    }

    var data = {
      type: "briefing",
      name: (form.elements["name"].value || "").trim(),
      club: (form.elements["club"].value || "").trim(),
      role: (form.elements["role"].value || "").trim(),
      email: (form.elements["email"].value || "").trim(),
      message: (form.elements["message"].value || "").trim(),
      page: window.location.href
    };

    if (!data.name || !data.club || !data.role || !EMAIL_RE.test(data.email)) {
      setMessage(form, "Please fill in name, club, role, and a valid email.", "error");
      return;
    }

    button.disabled = true;
    form.setAttribute("data-loading", "true");
    setMessage(form, "");

    var endpoint = getEndpoint();

    try {
      if (endpoint) {
        var res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data)
        });
        if (!res.ok) {
          var d = null;
          try { d = await res.json(); } catch (_) {}
          throw new Error(d && d.error ? d.error : "Status " + res.status);
        }
      } else {
        await new Promise(function (r) { setTimeout(r, 700); });
      }
      showSuccess(form, "Thank you. We’ll be in touch shortly to schedule your briefing.");
    } catch (err) {
      setMessage(form, "Something went wrong. Please try again or email hello@mobili-tee.com.", "error");
      console.error("Briefing submission failed:", err);
    } finally {
      button.disabled = false;
      form.removeAttribute("data-loading");
    }
  }

  document.querySelectorAll(".briefing-form").forEach(function (form) {
    form.addEventListener("submit", submitBriefingForm);
  });

  // ============================================================
  // Sticky nav — toggle background after 80px scroll
  // ============================================================
  var topnav = document.getElementById("topnav");
  if (topnav) {
    var lastScroll = -1;
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      if (y > 80 && lastScroll <= 80) topnav.setAttribute("data-scrolled", "true");
      else if (y <= 80 && lastScroll > 80) topnav.setAttribute("data-scrolled", "false");
      lastScroll = y;
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ============================================================
  // Mobile menu — open/close, focus trap, esc-to-close
  // ============================================================
  var mobileMenu = document.getElementById("mobile-menu");
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var menuClose = document.querySelector("[data-menu-close]");
  var lastFocused = null;

  function focusableEls(root) {
    return root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  function openMenu() {
    if (!mobileMenu) return;
    lastFocused = document.activeElement;
    mobileMenu.removeAttribute("inert");
    mobileMenu.setAttribute("data-open", "true");
    mobileMenu.setAttribute("aria-hidden", "false");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    var first = focusableEls(mobileMenu)[0];
    if (first) first.focus();
    document.addEventListener("keydown", trapFocus);
  }

  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.setAttribute("data-open", "false");
    mobileMenu.setAttribute("aria-hidden", "true");
    mobileMenu.setAttribute("inert", "");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", trapFocus);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function trapFocus(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key !== "Tab") return;
    var focusables = focusableEls(mobileMenu);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (menuToggle) menuToggle.addEventListener("click", openMenu);
  if (menuClose) menuClose.addEventListener("click", closeMenu);
  if (mobileMenu) {
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        // Close after navigation; smooth scroll handled below.
        setTimeout(closeMenu, 100);
      });
    });
  }

  // ============================================================
  // Smooth scroll for hash links (with sticky-nav offset compensation)
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // Update URL without jumping
      if (history.replaceState) history.replaceState(null, "", href);
    });
  });

  // ============================================================
  // Reveal-on-scroll
  // ============================================================
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var revealTargets = document.querySelectorAll(
      ".section__heading, .experience__copy, .experience-card, .why-card, .pillar, .step, .founder__portrait, .founder__copy, .briefing__inner, .faq__item"
    );
    revealTargets.forEach(function (el) { el.classList.add("reveal"); });
    // Stagger groups of cards within their parents
    function applyStagger(selector) {
      document.querySelectorAll(selector).forEach(function (parent) {
        var items = parent.children;
        for (var i = 0; i < items.length; i++) {
          if (items[i].classList.contains("reveal")) {
            items[i].setAttribute("data-stagger", String(Math.min(i, 4)));
          }
        }
      });
    }
    applyStagger(".why-grid");
    applyStagger(".pillars");
    applyStagger(".steps");
    applyStagger(".faq");

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealTargets.forEach(function (el) { io.observe(el); });
  }
})();
