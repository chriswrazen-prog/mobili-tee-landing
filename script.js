/* Mobili-Tee landing - vanilla JS */
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
    var className = "email-form__success";
    if (form.classList.contains("careers-form")) className = "careers-form__success";
    else if (form.classList.contains("briefing-form")) className = "briefing-form__success";
    else if (form.classList.contains("member-form")) className = "member-form__success";
    var existing = form.querySelector("." + className);
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
      // Bot - silently succeed without sending.
      showSuccess(form, "Thanks - you’re on the list. We’ll keep you posted, and you can book anytime at mobili-tee.com.");
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
      showSuccess(form, "Thanks - you’re on the list. We’ll keep you posted, and you can book anytime at mobili-tee.com.");
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
  // Member form (expanded hero signup) - name + email + phone + club + context
  // ============================================================
  async function submitMemberForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type='submit']");
    var honeypot = form.querySelector('input[name="company"]');

    if (honeypot && honeypot.value) {
      showSuccess(form, "Thanks - you’re on the list. We’ll keep you posted, and you can book anytime at mobili-tee.com.");
      return;
    }

    var data = {
      name: (form.elements["name"].value || "").trim(),
      email: (form.elements["email"].value || "").trim(),
      phone: (form.elements["phone"].value || "").trim(),
      club: (form.elements["club"].value || "").trim(),
      what_brought_you: (form.elements["what_brought_you"].value || "").trim(),
      source: form.getAttribute("data-form") || "hero",
      page: window.location.href,
      referrer: document.referrer || ""
    };

    if (!data.name) {
      setMessage(form, "Please enter your name.", "error");
      form.elements["name"].focus();
      return;
    }
    if (!EMAIL_RE.test(data.email)) {
      setMessage(form, "Please enter a valid email address.", "error");
      form.elements["email"].focus();
      return;
    }
    if (!data.club) {
      setMessage(form, "Please select your country club.", "error");
      form.elements["club"].focus();
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
      showSuccess(form, "Thanks - you’re on the list. We’ll keep you posted, and you can book anytime at mobili-tee.com.");
    } catch (err) {
      setMessage(form, "Something went wrong. Please try again or email hello@mobili-tee.com.", "error");
      console.error("Member form submission failed:", err);
    } finally {
      button.disabled = false;
      form.removeAttribute("data-loading");
    }
  }

  document.querySelectorAll(".member-form").forEach(function (form) {
    form.addEventListener("submit", submitMemberForm);
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
      showSuccess(form, "Thanks - we’ll be in touch shortly.");
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
  // Careers form (Mobility Specialist application)
  // ============================================================
  async function submitCareersForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type='submit']");
    var honeypot = form.querySelector('input[name="company"]');

    if (honeypot && honeypot.value) {
      showSuccess(form, "Thanks - we’ll be in touch shortly.");
      return;
    }

    var data = {
      type: "application",
      name: (form.elements["name"].value || "").trim(),
      email: (form.elements["email"].value || "").trim(),
      phone: (form.elements["phone"].value || "").trim(),
      current_role: (form.elements["current_role"].value || "").trim(),
      years_experience: (form.elements["years_experience"].value || "").trim(),
      certifications: (form.elements["certifications"].value || "").trim(),
      why_interested: (form.elements["why_interested"].value || "").trim(),
      linkedin_url: (form.elements["linkedin_url"].value || "").trim(),
      source: "careers",
      page: window.location.href
    };

    if (!data.name) {
      setMessage(form, "Please enter your name.", "error");
      form.elements["name"].focus();
      return;
    }
    if (!EMAIL_RE.test(data.email)) {
      setMessage(form, "Please enter a valid email address.", "error");
      form.elements["email"].focus();
      return;
    }
    if (!data.phone) {
      setMessage(form, "Please enter a phone number.", "error");
      form.elements["phone"].focus();
      return;
    }
    if (!data.current_role) {
      setMessage(form, "Please tell us your current or most recent role.", "error");
      form.elements["current_role"].focus();
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
      showSuccess(form, "Thank you - your application is in. We’ll be in touch shortly.");
    } catch (err) {
      setMessage(form, "Something went wrong. Please try again or email hello@mobili-tee.com.", "error");
      console.error("Careers submission failed:", err);
    } finally {
      button.disabled = false;
      form.removeAttribute("data-loading");
    }
  }

  document.querySelectorAll(".careers-form").forEach(function (form) {
    form.addEventListener("submit", submitCareersForm);
  });

  // ============================================================
  // Sticky nav - toggle background after 80px scroll
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
  // Mobile menu - open/close, focus trap, esc-to-close
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

  // ============================================================
  // Announcement bar (dismissible, remembered in localStorage)
  // ============================================================
  (function () {
    var bar = document.getElementById("announce");
    if (!bar) return;
    var KEY = "mt_announce_dismissed_v1";
    var root = document.documentElement;

    function setBannerH() {
      root.style.setProperty("--banner-h", bar.offsetHeight + "px");
    }
    function clearBanner() {
      root.style.setProperty("--banner-h", "0px");
    }

    var dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch (_) {}

    if (dismissed) {
      bar.hidden = true;
      clearBanner();
      return;
    }

    setBannerH();
    window.addEventListener("resize", setBannerH, { passive: true });

    var close = bar.querySelector("[data-announce-close]");
    if (close) {
      close.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem(KEY, "1"); } catch (_) {}
        bar.hidden = true;
        clearBanner();
      });
    }
  })();

  // ============================================================
  // Reviews - EDIT THIS ARRAY.
  // Only entries with approved: true are shown. Entries with
  // source: "google" render first in the Google reviews grid; source: "member"
  // entries render below under "In members' words".
  // ============================================================
  var REVIEWS = [
    {
      quote:
        "Assisted stretching has been an essential part of my stay healthy and limber routine. As a sixty plus year old woman who plays pickleball 3-4 times per week, stretching has addressed the areas needing the most attention for recovery. Highly recommend!",
      name: "Santa Kraft",
      role: "Google review",
      source: "google",
      approved: true
    },
    {
      quote:
        "I had my first session with Tom last Saturday and was so impressed that I signed up for a weekly membership.",
      name: "Kevin Lahn",
      role: "Google review",
      source: "google",
      approved: true
    },
    {
      quote:
        "The practitioners really know what they're doing. Every session is tailored to what my body needs that day, and I always leave feeling looser and moving better than when I walked in.",
      name: "Thomas Padula",
      role: "Google review",
      source: "google",
      approved: true
    },
    {
      quote:
        "If you like feeling better and energetic you should test drive Mobili-Tee. Tom, Jennifer and Amelia make you feel welcomed and comfortable.",
      name: "Cari Wolfe",
      role: "Google review",
      source: "google",
      approved: true
    },
    {
      quote:
        "Great experience every time. Highly suggest getting on a weekly routine and you'll see results in pain relief and range of motion.",
      name: "Ryan McMahon",
      role: "Google review",
      source: "google",
      approved: true
    },
    {
      quote:
        "After years of long days, busy schedules, and not giving enough attention to recovery, my body was definitely feeling it. I was constantly tight and had lost a lot of mobility without even realizing it. The team at Mobili-Tee has helped me feel looser, move more comfortably, and get back to feeling like myself. Every session has been worth it. Whether you're active or just dealing with the wear and tear of everyday life, I can't recommend Mobili-Tee enough.",
      name: "Brett Stoutland",
      role: "Member, Radley Run",
      source: "member",
      approved: true
    },
    {
      quote:
        "I just turned 40, and between family and work, life is hectic - I haven't had the time to take care of my body the way I used to. Mobili-Tee has been amazing for tackling the effects of this lifestyle: hours sitting in a chair and little time spent on myself. I'd highly recommend it to anyone in the same situation, or anyone for that matter.",
      name: "Dave Hissey",
      role: "Member, Radley Run",
      source: "member",
      approved: true
    },
    // Ryan McMahon also left this longer testimonial. His Google review above
    // runs instead so the same name does not appear twice on the page. Flip
    // this to approved: true (and drop his Google entry) to swap them.
    {
      quote:
        "I've been working with Jen at Mobili-Tee for two years now, and the results speak for themselves. Consistent stretching sessions have eliminated my lower back tightness, resolved chronic tightness in my Achilles, and relieved the foot pain I used to wake up with every morning. Jen is knowledgeable, attentive, and genuinely invested in helping her clients move and feel better. I can't recommend her enough.",
      name: "Ryan McMahon",
      role: "Member, Radley Run",
      source: "member",
      approved: false
    }
  ];

  (function () {
    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function cardsFor(source) {
      return REVIEWS.filter(function (r) {
        return r && r.approved && r.source === source;
      });
    }

    function paint(gridSel, list, wrapperSel) {
      var grid = document.querySelector(gridSel);
      var wrapper = document.querySelector(wrapperSel);
      if (!grid || !wrapper || !list.length) return;
      grid.innerHTML = list
        .map(function (t) {
          return (
            '<figure class="testimonial">' +
            '<blockquote class="testimonial__quote">' + esc(t.quote) + "</blockquote>" +
            '<figcaption class="testimonial__attr">' + esc(t.name) + " · " + esc(t.role) + "</figcaption>" +
            "</figure>"
          );
        })
        .join("");
      wrapper.hidden = false;
    }

    paint('[data-review-grid="google"]', cardsFor("google"), "[data-reviews]");
    paint('[data-review-grid="member"]', cardsFor("member"), "[data-reviews-members]");
  })();
})();
