/* Mobili-Tee landing — vanilla JS */
(function () {
  "use strict";

  // ============================================================
  // Form handler config
  // Two ways to wire up email capture, in priority order:
  //   1. Cloudflare Worker — set FORM_ENDPOINT to your worker URL.
  //   2. Formspree — set FORMSPREE_ID to your form's ID (e.g. "xpwrlbjk").
  // If both are blank the form will demo-succeed without sending data.
  // ============================================================
  var FORM_ENDPOINT = "https://mobili-tee-form.chriswrazen.workers.dev";
  var FORMSPREE_ID = ""; // e.g. "xpwrlbjk"

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
    if (state) {
      msg.setAttribute("data-state", state);
    } else {
      msg.removeAttribute("data-state");
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var input = form.querySelector(".email-form__input");
    var button = form.querySelector(".email-form__submit");
    var label = form.querySelector(".email-form__label");
    if (!input || !button) return;

    var email = (input.value || "").trim();
    if (!EMAIL_RE.test(email)) {
      setMessage(form, "Please enter a valid email address.", "error");
      input.focus();
      return;
    }

    var originalLabel = label ? label.textContent : "";
    button.disabled = true;
    if (label) label.textContent = "Sending\u2026";
    setMessage(form, "");

    var endpoint = getEndpoint();
    var source = form.getAttribute("data-form") || "landing";

    try {
      if (endpoint) {
        var res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
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
          var detail = data && data.error ? data.error : ("Status " + res.status);
          throw new Error(detail);
        }
      } else {
        // No endpoint configured yet — let the user know it's a preview.
        await new Promise(function (r) { setTimeout(r, 600); });
      }

      form.reset();
      setMessage(form, "Thanks \u2014 we\u2019ll be in touch.", "success");
    } catch (err) {
      setMessage(
        form,
        "Something went wrong. Please try again or email hello@mobili-tee.com.",
        "error"
      );
      console.error("Form submission failed:", err);
    } finally {
      button.disabled = false;
      if (label) label.textContent = originalLabel || "Stay Informed";
    }
  }

  document.querySelectorAll(".email-form").forEach(function (form) {
    form.addEventListener("submit", submitForm);
  });

  // ============================================================
  // Lightweight reveal-on-scroll
  // ============================================================
  if ("IntersectionObserver" in window) {
    var targets = document.querySelectorAll(".section__heading, .about__copy, .experience-card, .why-card");
    targets.forEach(function (el) { el.classList.add("reveal"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    targets.forEach(function (el) { io.observe(el); });
  }
})();
