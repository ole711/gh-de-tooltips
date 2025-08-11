(function() {
  const CANDIDATE_SELECTOR = 'a,button,summary,label,li[role="tab"]';

  function normalize(s){ return (s || "").replace(/\s+/g, " ").trim(); }
  function lower(s){ return (s || "").toLowerCase(); }

  function stripSuffixes(s){
    if (!s) return s;
    let t = s;
    t = t.replace(/\s*[·•]\s*\d[\d,.\u00A0]*[kKmMbB]?\s*$/g, "");
    t = t.replace(/\s*\((?:\d[\d,.\u00A0]*[kKmMbB]?)\)\s*$/g, "");
    t = t.replace(/\s+\d[\d,.\u00A0]*[kKmMbB]?\s*$/g, "");
    t = t.replace(/\s*:\s*$/g, "");
    return normalize(t);
  }

  let aliasMap = new Map();
  fetch(chrome.runtime.getURL("mapping.json"))
    .then(r => r.json())
    .then(json => { for (const k of Object.keys(json)) aliasMap.set(lower(k), json[k]); init(); })
    .catch(e => { console.warn("[GHD] mapping.json konnte nicht geladen werden:", e); init(); });

  function getOwnText(el){
    let txt = "";
    for (const node of el.childNodes){
      if (node.nodeType === Node.TEXT_NODE) txt += node.nodeValue;
    }
    return normalize(txt);
  }

  function getChildTexts(el){
    const arr = [];
    const kids = el.querySelectorAll(":scope > span, :scope > strong, :scope > div");
    kids.forEach(k => {
      const t = normalize(k.textContent);
      if (t) arr.push(t);
    });
    return arr;
  }

  function resolveAriaLabelledby(el){
    const ids = (el.getAttribute("aria-labelledby") || "").trim();
    if (!ids) return "";
    const out = [];
    ids.split(/\s+/).forEach(id => {
      const ref = document.getElementById(id);
      if (ref) {
        const t = normalize(ref.textContent);
        if (t) out.push(t);
      }
    });
    return out.join(" ").trim();
  }

  function getLabelCandidates(el){
    const candidates = [];
    const own = getOwnText(el);
    if (own) candidates.push(own);

    for (const t of getChildTexts(el)) candidates.push(t);

    const aria = el.getAttribute("aria-label") ? normalize(el.getAttribute("aria-label")) : "";
    if (aria) candidates.push(aria);

    const labelledby = resolveAriaLabelledby(el);
    if (labelledby) candidates.push(labelledby);

    const short = normalize(el.textContent);
    if (short && short.length <= 30) candidates.push(short);

    // dedupe
    return [...new Set(candidates)].filter(Boolean);
  }

  function tryAlias(s){
    const sNorm = normalize(s);
    const sLow = lower(sNorm);
    if (aliasMap.has(sLow)) return aliasMap.get(sLow);
    const stripped = stripSuffixes(sNorm);
    const strippedLow = lower(stripped);
    if (aliasMap.has(strippedLow)) return aliasMap.get(strippedLow);
    // NEW: if there is a colon, try the prefix before colon
    const idx = sNorm.indexOf(':');
    if (idx > 0) {
      const before = normalize(sNorm.slice(0, idx));
      const beforeLow = lower(before);
      if (aliasMap.has(beforeLow)) return aliasMap.get(beforeLow);
      const beforeStripped = stripSuffixes(before);
      const beforeStrippedLow = lower(beforeStripped);
      if (aliasMap.has(beforeStrippedLow)) return aliasMap.get(beforeStrippedLow);
    }
    return null;
  }

  function annotate(el){
    if (!el || el.dataset.ghd === "1") return;
    const rect = el.getBoundingClientRect();
    if (rect && (rect.width < 10 || rect.height < 10)) return;

    // Skip if GitHub already provides a native tooltip
    const existingTitle = el.getAttribute("title");
    if (existingTitle && existingTitle.trim().length > 0) return;

    const candidates = getLabelCandidates(el);
    let tip = null;
    for (const c of candidates){
      tip = tryAlias(c);
      if (tip) break;
    }
    if (!tip) return;

    el.setAttribute("title", tip);
    el.dataset.ghd = "1";
    el.classList.add("ghd-annotated");
  }

  function scan(root=document){
    const nodes = root.querySelectorAll(CANDIDATE_SELECTOR);
    for (const n of nodes) annotate(n);
  }

  function init(){
    scan();
    const obs = new MutationObserver(muts => {
      for (const m of muts){
        for (const node of m.addedNodes){
          if (node && node.nodeType === 1) scan(node);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("pjax:end", () => setTimeout(scan, 50));
    setInterval(() => scan(), 3000);
  }
})();