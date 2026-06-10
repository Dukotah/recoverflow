/* RecoverFlow — client-side failed-payment revenue-leak calculator.
 *
 * HARD PRIVACY GUARANTEE: this file makes ZERO network calls with user data.
 * There is no fetch / XMLHttpRequest / WebSocket / sendBeacon / Image-ping
 * anywhere. Every number you type stays in this browser tab. The whole
 * calculation runs locally in JavaScript on the values you enter.
 *
 * All rendered output is built with textContent / safe DOM construction. The
 * only innerHTML used is clearing a container we own (no user data), so typed
 * input can never inject markup or run script.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Defaults — the published benchmarks. Every one is editable in the UI.
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    mode: "mrr",
    mrr: 50000,
    subs: 1000,
    arpu: 50,
    failRate: 9,            // % of recurring charges that fail monthly
    involuntaryShare: 100,  // % of failures treated as at-risk revenue
    currentRate: 38,        // % recovered today (Stripe Smart Retries ~38%)
    targetRate: 65          // % recovered with a dedicated dunning flow (60-80%)
  };

  /* ------------------------------------------------------------------ *
   * Number helpers — parse loosely (strip commas/$/%/spaces), format money.
   * ------------------------------------------------------------------ */
  function parseNum(raw) {
    if (raw == null) return NaN;
    var cleaned = String(raw).replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
    var n = parseFloat(cleaned);
    return isFinite(n) ? n : NaN;
  }

  function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  // Money: whole dollars, grouped. Large figures stay exact (no abbreviation)
  // so the headline reads as a real, quotable number.
  var moneyFmt = (function () {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      });
    } catch (e) {
      return null;
    }
  })();

  function money(n) {
    if (!isFinite(n)) n = 0;
    n = Math.round(n);
    if (moneyFmt) return moneyFmt.format(n);
    // Fallback grouping if Intl is unavailable.
    var sign = n < 0 ? "-" : "";
    var s = String(Math.abs(n));
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ",";
      out += s[i];
    }
    return sign + "$" + out;
  }

  function groupInt(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ",";
      out += s[i];
    }
    return (n < 0 ? "-" : "") + out;
  }

  function pct(n) {
    // Trim trailing .0 so "38%" reads clean, keep one decimal otherwise.
    var r = Math.round(n * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1)) + "%";
  }

  /* ------------------------------------------------------------------ *
   * The model. Given the inputs, compute the full revenue waterfall.
   *
   *   atRisk   = MRR * failRate * involuntaryShare        (monthly)
   *   keptNow  = atRisk * currentRate                     (recovered today)
   *   lostNow  = atRisk - keptNow                         (the leak)
   *   keptTgt  = atRisk * targetRate                      (recovered w/ dunning)
   *   winBack  = keptTgt - keptNow                        (the prize)
   *   lostTgt  = atRisk - keptTgt                         (still lost after)
   * Annual = monthly * 12 (steady-state; conservative — ignores the
   * compounding lifetime value of a customer that keeps paying).
   * ------------------------------------------------------------------ */
  function compute(inp) {
    var mrr = inp.mode === "subs" ? inp.subs * inp.arpu : inp.mrr;
    var failFrac = inp.failRate / 100;
    var invFrac = inp.involuntaryShare / 100;
    var curFrac = inp.currentRate / 100;
    var tgtFrac = inp.targetRate / 100;

    var atRisk = mrr * failFrac * invFrac;
    var keptNow = atRisk * curFrac;
    var lostNow = atRisk - keptNow;
    var keptTgt = atRisk * tgtFrac;
    var winBack = Math.max(0, keptTgt - keptNow);
    var lostTgt = atRisk - keptTgt;

    return {
      mrr: mrr,
      atRiskM: atRisk, atRiskY: atRisk * 12,
      keptNowM: keptNow, keptNowY: keptNow * 12,
      lostNowM: lostNow, lostNowY: lostNow * 12,
      keptTgtM: keptTgt, keptTgtY: keptTgt * 12,
      winBackM: winBack, winBackY: winBack * 12,
      lostTgtM: lostTgt, lostTgtY: lostTgt * 12
    };
  }

  /* ------------------------------------------------------------------ *
   * Safe DOM helper.
   * ------------------------------------------------------------------ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // safe: escaped by the DOM
    return node;
  }

  function frag() { return document.createDocumentFragment(); }

  /* ------------------------------------------------------------------ *
   * Render the results into #results. Rebuilt on every input change.
   * ------------------------------------------------------------------ */
  function render(r, inp, results, status, handlers) {
    results.textContent = ""; // clear (container we own; no user data)

    var wrap = el("div", "wrap");

    /* ---- Headline: annual revenue lost at the current recovery rate ---- */
    var hero = el("div", "result-hero");
    var hLabel = el("p", "rh-label");
    hLabel.appendChild(el("span", "dot"));
    hLabel.appendChild(el("span", null, "Lost to failed payments — at your current recovery rate"));
    hero.appendChild(hLabel);

    var fig = el("p", "rh-figure");
    fig.appendChild(document.createTextNode(money(r.lostNowY)));
    var per = el("span", "per", " / year");
    fig.appendChild(per);
    hero.appendChild(fig);

    var sub = el("p", "rh-sub");
    sub.appendChild(document.createTextNode("That's "));
    var mEl = el("span", "rh-monthly", money(r.lostNowM) + "/month");
    sub.appendChild(mEl);
    sub.appendChild(document.createTextNode(
      " in recurring revenue silently churning because " + pct(100 - inp.currentRate) +
      " of at-risk charges never get recovered. Recovering " + pct(inp.currentRate) +
      " today still leaves this on the table."
    ));
    hero.appendChild(sub);
    wrap.appendChild(hero);

    /* ---- Win-back band: extra recovered by lifting to target ---- */
    var win = el("div", "result-win");
    var wLabel = el("p", "rw-label");
    wLabel.appendChild(el("span", "dot"));
    wLabel.appendChild(el("span", null, "Recoverable by lifting to " + pct(inp.targetRate) + " with dunning"));
    win.appendChild(wLabel);

    var wFig = el("p", "rw-figure");
    wFig.appendChild(document.createTextNode("+" + money(r.winBackY)));
    wFig.appendChild(el("span", "per", " / year"));
    win.appendChild(wFig);

    var wSub = el("p", "rw-sub");
    if (r.winBackY > 0) {
      wSub.appendChild(document.createTextNode("Moving from "));
      wSub.appendChild(boldSpan(pct(inp.currentRate)));
      wSub.appendChild(document.createTextNode(" to "));
      wSub.appendChild(boldSpan(pct(inp.targetRate)));
      wSub.appendChild(document.createTextNode(
        " recovery wins back about " + money(r.winBackM) + "/month — revenue you're already earning but losing at the payment step."
      ));
    } else {
      wSub.appendChild(document.createTextNode(
        "Set your target recovery rate above your current rate to see how much a dedicated dunning flow would win back."
      ));
    }
    win.appendChild(wSub);
    wrap.appendChild(win);

    /* ---- Action row: copy summary / copy shareable line ---- */
    var actions = el("div", "result-actions");
    var copyBtn = makeCopyBtn("copy-summary", "Copy full breakdown");
    var shareBtn = makeCopyBtn("copy-share", "Copy shareable line");
    actions.appendChild(copyBtn);
    actions.appendChild(shareBtn);
    if (handlers && handlers.onCopySummary) {
      copyBtn.addEventListener("click", function () { handlers.onCopySummary(copyBtn); });
    }
    if (handlers && handlers.onCopyShare) {
      shareBtn.addEventListener("click", function () { handlers.onCopyShare(shareBtn); });
    }
    wrap.appendChild(actions);

    /* ---- Waterfall / labelled breakdown ---- */
    wrap.appendChild(buildBreakdown(r, inp));

    /* ---- Assumptions recap (every editable input, echoed back) ---- */
    wrap.appendChild(buildAssumptions(r, inp));

    results.appendChild(wrap);

    if (status) {
      status.textContent =
        "Estimate updated. " + money(r.lostNowY) + " per year lost to failed payments at " +
        pct(inp.currentRate) + " recovery. Lifting to " + pct(inp.targetRate) +
        " would recover about " + money(r.winBackY) + " more per year.";
    }
  }

  function boldSpan(text) { return el("strong", null, text); }

  function makeCopyBtn(id, label) {
    var b = el("button", "copy-button");
    b.type = "button";
    b.id = id;
    b.setAttribute("data-label", label);
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", "9"); rect.setAttribute("y", "9");
    rect.setAttribute("width", "13"); rect.setAttribute("height", "13");
    rect.setAttribute("rx", "2");
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
    svg.appendChild(rect); svg.appendChild(path);
    b.appendChild(svg);
    b.appendChild(el("span", null, label));
    return b;
  }

  /* The waterfall: a set of labelled bars sized relative to at-risk revenue. */
  function buildBreakdown(r, inp) {
    var box = el("div", "breakdown");
    box.appendChild(el("h3", null, "The breakdown, in plain numbers"));
    box.appendChild(el("p", "bd-sub", "Monthly figures. Bars are scaled to your at-risk revenue."));

    var max = r.atRiskM || 1;

    box.appendChild(barRow(
      "Revenue at risk each month",
      "MRR " + money(r.mrr) + " × " + pct(inp.failRate) + " failures" +
        (inp.involuntaryShare < 100 ? " × " + pct(inp.involuntaryShare) + " at-risk" : ""),
      r.atRiskM, max, "atrisk", false
    ));
    box.appendChild(barRow(
      "Recovered today",
      "at " + pct(inp.currentRate) + " recovery",
      r.keptNowM, max, "recovered", false
    ));
    box.appendChild(barRow(
      "Lost today (the leak)",
      "the " + pct(100 - inp.currentRate) + " you don't recover",
      r.lostNowM, max, "lost", false
    ));
    box.appendChild(barRow(
      "Won back with dunning",
      "lifting to " + pct(inp.targetRate) + " recovery",
      r.winBackM, max, "winback", false
    ));
    box.appendChild(barRow(
      "Still lost after dunning",
      "the " + pct(100 - inp.targetRate) + " even a great flow misses",
      r.lostTgtM, max, "lost", true
    ));

    // Legend
    var legend = el("div", "bd-legend");
    legend.appendChild(legendItem("atrisk", "At risk"));
    legend.appendChild(legendItem("recovered", "Recovered"));
    legend.appendChild(legendItem("lost", "Lost"));
    legend.appendChild(legendItem("winback", "Won back"));
    box.appendChild(legend);

    return box;
  }

  function barRow(name, note, amount, max, klass, muted) {
    var row = el("div", "bd-row" + (muted ? " is-muted" : ""));
    var head = el("div", "bd-head");
    var nameEl = el("span", "bd-name");
    nameEl.appendChild(document.createTextNode(name + " "));
    nameEl.appendChild(el("span", "bd-note", "— " + note));
    head.appendChild(nameEl);
    head.appendChild(el("span", "bd-amt", money(amount) + "/mo"));
    row.appendChild(head);

    var track = el("div", "bd-track");
    var fill = el("div", "bd-fill " + klass);
    var w = max > 0 ? clamp((amount / max) * 100, 0, 100) : 0;
    fill.style.width = w.toFixed(1) + "%";
    track.appendChild(fill);
    row.appendChild(track);
    return row;
  }

  function legendItem(klass, label) {
    var lg = el("span", "lg");
    lg.appendChild(el("span", "sw " + klass));
    lg.appendChild(el("span", null, label));
    return lg;
  }

  function buildAssumptions(r, inp) {
    var box = el("div", "assumptions");
    box.appendChild(el("h3", null, "Your assumptions"));
    box.appendChild(el("p", "as-sub", "Every figure below is editable above. These are the inputs behind the estimate."));

    var dl = el("dl");
    function pair(term, val) {
      dl.appendChild(el("dt", null, term));
      dl.appendChild(el("dd", null, val));
    }
    if (inp.mode === "subs") {
      pair("Subscribers", groupInt(inp.subs));
      pair("ARPU / month", money(inp.arpu));
    }
    pair("MRR", money(r.mrr));
    pair("Failure rate", pct(inp.failRate));
    pair("Current recovery", pct(inp.currentRate));
    pair("Target recovery", pct(inp.targetRate));
    box.appendChild(dl);

    box.appendChild(el(
      "p",
      "as-disclaimer",
      "Benchmarks: ~9% of subscription charges fail monthly; 20–40% of churn is involuntary; " +
      "Stripe Smart Retries recover ~38%; dedicated dunning recovers 60–80%. Annual = monthly × 12 " +
      "(steady-state, before the compounding lifetime value of retained customers). This is a planning " +
      "estimate, not financial advice."
    ));
    return box;
  }

  /* ------------------------------------------------------------------ *
   * Clipboard text builders. Both are masked-free plain numbers (no
   * sensitive data exists here) and are copied locally only.
   * ------------------------------------------------------------------ */
  function buildSummary(r, inp) {
    var L = [];
    L.push("RecoverFlow — failed-payment revenue estimate");
    L.push("Generated locally in the browser; nothing was uploaded.");
    L.push("");
    L.push("INPUTS");
    if (inp.mode === "subs") {
      L.push("  Subscribers:        " + groupInt(inp.subs));
      L.push("  ARPU / month:       " + money(inp.arpu));
    }
    L.push("  MRR:                " + money(r.mrr));
    L.push("  Failure rate:       " + pct(inp.failRate) + " of charges / month");
    L.push("  At-risk share:      " + pct(inp.involuntaryShare) + " of failures");
    L.push("  Current recovery:   " + pct(inp.currentRate));
    L.push("  Target recovery:    " + pct(inp.targetRate));
    L.push("");
    L.push("MONTHLY");
    L.push("  Revenue at risk:    " + money(r.atRiskM));
    L.push("  Recovered today:    " + money(r.keptNowM));
    L.push("  Lost today:         " + money(r.lostNowM));
    L.push("  Won back w/ dunning:" + " " + money(r.winBackM));
    L.push("");
    L.push("ANNUAL");
    L.push("  Lost to failed payments (now):  " + money(r.lostNowY));
    L.push("  Recoverable by lifting to " + pct(inp.targetRate) + ": " + money(r.winBackY));
    L.push("");
    L.push("Benchmarks: ~9% of subscription charges fail monthly; 20-40% of churn is");
    L.push("involuntary; Stripe Smart Retries recover ~38%; dedicated dunning 60-80%.");
    L.push("Annual = monthly x 12 (steady-state). A planning estimate, not financial advice.");
    return L.join("\n");
  }

  function buildShareLine(r) {
    return "RecoverFlow estimates we're losing about " + money(r.lostNowY) +
      "/yr to failed payments — and a dedicated dunning flow would win back roughly " +
      money(r.winBackY) + "/yr. Check yours: https://dukotah.github.io/recoverflow/";
  }

  /* ------------------------------------------------------------------ *
   * Read the current form state into a normalized, validated input object.
   * Invalid numbers fall back to 0 (money) so the calc never NaNs out.
   * ------------------------------------------------------------------ */
  function readInputs(refs, mode) {
    var failRate = clamp(orZero(parseNum(refs.failRate.value)), 0, 100);
    var inv = clamp(orZero(parseNum(refs.involuntaryShare.value)), 0, 100);
    var current = clamp(orZero(parseNum(refs.currentRate.value)), 0, 100);
    var target = clamp(orZero(parseNum(refs.targetRate.value)), 0, 100);
    return {
      mode: mode,
      mrr: Math.max(0, orZero(parseNum(refs.mrr.value))),
      subs: Math.max(0, orZero(parseNum(refs.subs.value))),
      arpu: Math.max(0, orZero(parseNum(refs.arpu.value))),
      failRate: failRate,
      involuntaryShare: inv,
      currentRate: current,
      targetRate: target
    };
  }

  function orZero(n) { return isFinite(n) ? n : 0; }

  /* ------------------------------------------------------------------ *
   * Wire-up.
   * ------------------------------------------------------------------ */
  function init() {
    var form = document.getElementById("calc-form");
    var results = document.getElementById("results");
    var status = document.getElementById("calc-status");
    if (!form || !results) return;

    var refs = {
      mrr: document.getElementById("mrr"),
      subs: document.getElementById("subs"),
      arpu: document.getElementById("arpu"),
      failRate: document.getElementById("fail-rate"),
      involuntaryShare: document.getElementById("involuntary-share"),
      currentRate: document.getElementById("current-rate"),
      targetRate: document.getElementById("target-rate")
    };
    var currentOut = document.getElementById("current-rate-out");
    var targetOut = document.getElementById("target-rate-out");
    var panelMrr = document.getElementById("panel-mrr");
    var panelSubs = document.getElementById("panel-subs");
    var modeMrrBtn = document.getElementById("mode-mrr");
    var modeSubsBtn = document.getElementById("mode-subs");
    var exampleBtn = document.getElementById("example-btn");
    var resetBtn = document.getElementById("reset-btn");

    var mode = DEFAULTS.mode;
    var last = null;

    function setSliderFill(input) {
      var min = parseFloat(input.min) || 0;
      var max = parseFloat(input.max) || 100;
      var val = parseFloat(input.value) || 0;
      var pctFill = max > min ? ((val - min) / (max - min)) * 100 : 0;
      input.style.setProperty("--fill", pctFill.toFixed(1) + "%");
    }

    function refresh() {
      var inp = readInputs(refs, mode);
      // Keep the target slider at or above the current rate so "win-back"
      // never goes negative; the floor is the current rate value.
      if (inp.targetRate < inp.currentRate) {
        inp.targetRate = inp.currentRate;
        refs.targetRate.value = String(Math.round(inp.currentRate));
      }
      currentOut.textContent = pct(inp.currentRate);
      targetOut.textContent = pct(inp.targetRate);
      setSliderFill(refs.currentRate);
      setSliderFill(refs.targetRate);

      last = { r: compute(inp), inp: inp };
      render(last.r, last.inp, results, status, handlers);
    }

    var handlers = {
      onCopySummary: function (btn) {
        if (!last) return;
        copyText(buildSummary(last.r, last.inp), btn);
      },
      onCopyShare: function (btn) {
        if (!last) return;
        copyText(buildShareLine(last.r), btn);
      }
    };

    // Radiogroup with roving tabindex: the checked radio is the only Tab stop,
    // and arrow/Home/End keys move selection between the two buttons.
    function setMode(next, moveFocus) {
      mode = next;
      var isMrr = mode === "mrr";
      panelMrr.hidden = !isMrr;
      panelSubs.hidden = isMrr;
      modeMrrBtn.classList.toggle("is-active", isMrr);
      modeSubsBtn.classList.toggle("is-active", !isMrr);
      modeMrrBtn.setAttribute("aria-checked", String(isMrr));
      modeSubsBtn.setAttribute("aria-checked", String(!isMrr));
      modeMrrBtn.tabIndex = isMrr ? 0 : -1;
      modeSubsBtn.tabIndex = isMrr ? -1 : 0;
      if (moveFocus) (isMrr ? modeMrrBtn : modeSubsBtn).focus();
      refresh();
    }

    modeMrrBtn.addEventListener("click", function () { setMode("mrr"); });
    modeSubsBtn.addEventListener("click", function () { setMode("subs"); });

    // Arrow keys move and activate selection (standard radiogroup pattern).
    function onModeKey(e) {
      var key = e.key;
      if (key === "ArrowRight" || key === "ArrowDown") {
        e.preventDefault();
        setMode("subs", true);
      } else if (key === "ArrowLeft" || key === "ArrowUp") {
        e.preventDefault();
        setMode("mrr", true);
      } else if (key === "Home") {
        e.preventDefault();
        setMode("mrr", true);
      } else if (key === "End") {
        e.preventDefault();
        setMode("subs", true);
      }
    }
    modeMrrBtn.addEventListener("keydown", onModeKey);
    modeSubsBtn.addEventListener("keydown", onModeKey);

    // Live recalculation on any input. Text fields normalize grouping on blur.
    ["mrr", "subs", "arpu", "failRate", "involuntaryShare"].forEach(function (k) {
      refs[k].addEventListener("input", refresh);
      refs[k].addEventListener("blur", function () {
        var n = parseNum(refs[k].value);
        if (isFinite(n)) {
          // Group thousands for the big money fields; leave rates as typed.
          if (k === "mrr" || k === "subs") {
            refs[k].value = groupInt(Math.max(0, n));
          }
        }
        refresh();
      });
    });
    refs.currentRate.addEventListener("input", refresh);
    refs.targetRate.addEventListener("input", refresh);

    if (exampleBtn) {
      exampleBtn.addEventListener("click", function () {
        setMode("subs");
        refs.subs.value = "2,500";
        refs.arpu.value = "39";
        refs.failRate.value = "9";
        refs.involuntaryShare.value = "100";
        refs.currentRate.value = "38";
        refs.targetRate.value = "72";
        refresh();
        results.scrollIntoView({ behavior: "smooth", block: "nearest" });
        // Land keyboard / AT users on the freshly computed estimate rather than
        // leaving focus on the now-scrolled-away button. #results is tabindex=-1.
        results.focus({ preventScroll: true });
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        refs.mrr.value = groupInt(DEFAULTS.mrr);
        refs.subs.value = groupInt(DEFAULTS.subs);
        refs.arpu.value = String(DEFAULTS.arpu);
        refs.failRate.value = String(DEFAULTS.failRate);
        refs.involuntaryShare.value = String(DEFAULTS.involuntaryShare);
        refs.currentRate.value = String(DEFAULTS.currentRate);
        refs.targetRate.value = String(DEFAULTS.targetRate);
        setMode(DEFAULTS.mode);
      });
    }

    // First paint.
    refresh();
  }

  /* Clipboard — local only, no network. Async API with execCommand fallback. */
  function copyText(text, btn) {
    var original = btn.getAttribute("data-label") || "Copy";
    function done(ok) {
      setBtnLabel(btn, ok ? "Copied ✓" : "Copy failed", ok);
      setTimeout(function () { setBtnLabel(btn, original, false); }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { fallbackCopy(text, done); }
      );
    } else {
      fallbackCopy(text, done);
    }
  }

  function setBtnLabel(btn, label, copied) {
    // Replace just the text span (keep the icon).
    var spans = btn.getElementsByTagName("span");
    if (spans.length) spans[spans.length - 1].textContent = label;
    else btn.textContent = label;
    btn.classList.toggle("copied", !!copied);
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(ta);
      done(!!ok);
    } catch (err) {
      done(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
