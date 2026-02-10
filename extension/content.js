// content.js - Aggressive Extraction Update
(() => {
  console.log("JournalRadar Content Script active.");

  // 1. CSS für Highlight
  if (!document.getElementById('mr-styles')) {
    const style = document.createElement('style');
    style.id = 'mr-styles';
    style.textContent = `
      .mr-highlight-anim {
        background-color: rgba(250, 204, 21, 0.6) !important;
        color: #000 !important;
        border-radius: 2px;
        box-shadow: 0 0 10px rgba(250, 204, 21, 0.8);
        transition: all 0.5s ease;
      }
    `;
    document.head.appendChild(style);
  }

  // 2. Intelligente Extraktion
  function getPageContent() {
    // A. TITEL FINDEN (H1 ist meist besser als document.title)
    let title = document.title;
    const h1 = document.querySelector("h1");
    if(h1 && h1.innerText.length > 10) {
        title = h1.innerText; // Nimm die echte Überschrift
    }

    // B. TEXT FINDEN
    let root = document.querySelector("main") || document.querySelector("article") || document.body;
    // Spezifische Fixes für Paywalls/Layouts
    if(document.querySelector(".article-body")) root = document.querySelector(".article-body");
    
    // Text bereinigen (keine Menüs, keine Werbung)
    let text = "";
    const paragraphs = root.querySelectorAll("p, h2, h3, li");
    paragraphs.forEach(p => {
        if(p.innerText.length > 30) text += p.innerText + "\n\n";
    });
    
    // Fallback falls P-Tags fehlen
    if(text.length < 200) text = document.body.innerText;

    // C. BILD FINDEN (Prioritäten-Liste)
    let imageUrl = "";
    
    // 1. OpenGraph Image (Meta Tag für Social Media - meist das Beste)
    const ogImage = document.querySelector('meta[property="og:image"]');
    if(ogImage) imageUrl = ogImage.content;

    // 2. Falls kein OG, suche das erste große Bild im Artikel
    if(!imageUrl || imageUrl.length < 10) {
        const images = root.querySelectorAll('img');
        for(let img of images) {
            // Muss sichtbar und groß genug sein
            if(img.width > 300 && img.height > 200 && !img.src.includes("logo") && !img.src.includes("icon")) {
                imageUrl = img.src;
                break; // Das erste große Bild nehmen
            }
        }
    }

    // JSON LD Check (Strukturierte Daten für Google)
    if(!imageUrl) {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(s => {
                const data = JSON.parse(s.innerText);
                if(data.image && data.image.url) imageUrl = data.image.url;
                if(Array.isArray(data.image)) imageUrl = data.image[0];
            });
        } catch(e) {}
    }

    return { 
      title: title.trim(), 
      url: window.location.href, 
      text: text,
      imageUrl: imageUrl
    };
  }

  // 3. Highlight Funktion
  function highlightText(snippet) {
    if(!snippet || snippet.length < 5) return;
    document.querySelectorAll('.mr-highlight-anim').forEach(el => el.outerHTML = el.innerHTML);
    window.scrollTo(0,0);
    
    // Versuch 1: Exakt
    if(window.find(snippet, false, false, true)) {
        applyHighlight();
    } else {
        // Versuch 2: Nur die ersten 50 Zeichen (falls Zitat ungenau)
        const shortSnippet = snippet.substring(0, 50);
        if(window.find(shortSnippet, false, false, true)) applyHighlight();
    }
  }

  function applyHighlight() {
      const sel = window.getSelection();
      if(sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.className = 'mr-highlight-anim';
          try {
              range.surroundContents(span);
              span.scrollIntoView({behavior: "smooth", block: "center"});
          } catch(e) {}
      }
      sel.removeAllRanges();
  }

  // 4. Artikel- & Paywall-Erkennung (1:1 aus Flutter _evaluateArticleState)
  function probeArticleState() {
    const PAYWALL_KEYWORDS = /(jetzt abonnieren|abo erforderlich|nur f\u00fcr abonnenten|weiterlesen mit abo|registrieren und weiterlesen|mit konto weiterlesen|kostenpflichtig|plus-artikel|exklusiv f\u00fcr|subscribe to read|read the full story|become a member|zugang zu allen|abo testen|miniabo|mitgliedschaft|nur mit abo|vollstaendig lesen|faz\+|weiterlesen mit geo\+|geo\+ lesen|geo\s*plus|bildplus|bild\+|bild\s*plus|rndplus|rnd\+|rnd\s*plus)/i;
    const PAYWALL_TEXT_KEYWORDS = /(abo erforderlich|nur f\u00fcr abonnenten|weiterlesen mit abo|registrieren und weiterlesen|mit konto weiterlesen|zugang zu allen|subscription required|paywall|weiterlesen mit geo\+|geo\+ lesen|geo\s*plus|bildplus|bild\+|bild\s*plus|rndplus|rnd\+|rnd\s*plus)/i;
    const PAYWALL_SELECTORS = [
      '#piano-offer-container','ws-paywall','ws-zephr','#faz-paywall',
      '[id*="faz-paywall"]','[data-area*="paywall"]','[data-target-id*="paywall"]',
      '[data-sara-component*="paywall"]','[data-external-selector*="paywall"]',
      '[data-selector*="paywall"]','[data-testid*="paywall"]','[data-zephr]',
      '[data-has-spplus-hidden]','[data-has-spplus-visible]',
      '[data-has-spmetered-hidden]','[data-has-spmetered-visible]',
      '[class*="paid-barrier"]','[id*="paid-barrier"]',
      '[id*="paywall"]','[class*="paywall"]',
      '[id*="blocked"]','[class*="blocked"]',
      '[id*="offer"]','[class*="offer"]',
      '[id*="subscribe"]','[class*="subscribe"]',
      '[id*="subscriber"]','[class*="subscriber"]',
      '[id*="meter"]','[class*="meter"]',
      '[id*="regwall"]','[class*="regwall"]',
      '[id*="piano"]','[class*="piano"]',
      '[id*="tinypass"]','[class*="tinypass"]',
      '[id*="bildplus"]','[class*="bildplus"]',
      '[id*="bild-plus"]','[class*="bild-plus"]','[data-bild-plus]',
      '.plus-article','#plus-article',
      '[id*="rndplus"]','[class*="rndplus"]',
      '[id*="rnd-plus"]','[class*="rnd-plus"]','[data-rnd-plus]',
      '.paywalledContent','#paywalledContent',
    ];
    const STRUCTURAL_SELECTORS = ['[aria-hidden="true"]','nav','footer','aside','form','script','style','noscript','template'];
    const SHARE_SELECTORS = ['[data-area*="share"]','[data-target-id*="share"]','[aria-label*="teilen"]','[aria-label*="share"]','[id*="share"]','[class*="share"]','[id*="social"]','[class*="social"]'];
    const NOISE_KEYWORDS = /(related|recommend|teaser|promo|advert|ads|cookie|consent|breadcrumb|share|social|newsletter|login|register|subscribe|abo|paywall|meter|regwall|piano|tinypass|overlay|modal|dialog)/i;
    const CONSENT_KEYWORDS = /(cookie|consent|datenschutz|privacy|tracking|gdpr|cmp|einwilligung|zustimmen|ablehnen|pur-abo|pur abo|purabonnent|privacy-policy|cookie-policy)/i;

    function hasHiddenClass(el) {
      const cls = (el.className || '').toString().toLowerCase();
      if (!cls) return false;
      if (/(^|\s)hidden(\s|$)/.test(cls)) return true;
      if (cls.includes('sr-only')) return true;
      return false;
    }
    function isVisible(el) {
      if (!el) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      if (el.closest('#piano-offer-container')) return false;
      if (el.hasAttribute('inert') || el.closest('[inert]')) return false;
      if (hasHiddenClass(el)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      return true;
    }
    function looksLikeMenuDialog(el) {
      try {
        if (!el) return false;
        const attr = ((el.id||'')+' '+(el.className||'')+' '+(el.getAttribute('data-testid')||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
        if (/(menu|nav|sidemenu|side-menu|burger|drawer|search|cookie|consent)/.test(attr)) return true;
        if (el.querySelectorAll('nav').length > 0 && el.querySelectorAll('a').length >= 6) return true;
        return false;
      } catch(_) { return false; }
    }
    function markIgnore(root, selector) {
      try { root.querySelectorAll(selector).forEach(el => el.setAttribute('data-jr-ignore','true')); } catch(_) {}
    }
    function markKeywordNoise(root) {
      try {
        root.querySelectorAll('section,div,aside,nav,footer,header').forEach(el => {
          const attr = ((el.id||'')+' '+(el.className||'')+' '+(el.getAttribute('data-area')||'')+' '+(el.getAttribute('data-target-id')||'')+' '+(el.getAttribute('data-external-selector')||'')).toLowerCase();
          if (NOISE_KEYWORDS.test(attr)) el.setAttribute('data-jr-ignore','true');
        });
      } catch(_) {}
    }
    function extractLdWordCount(txt) {
      try {
        const parsed = JSON.parse(txt);
        const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
        let best = 0;
        while (stack.length) {
          const node = stack.pop();
          if (!node || typeof node !== 'object') continue;
          const wc = typeof node.wordCount === 'number' ? node.wordCount : parseInt(node.wordCount, 10);
          if (Number.isFinite(wc) && wc > best) best = wc;
          for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(v => stack.push(v));
            else if (typeof value === 'object' && value) stack.push(value);
          }
        }
        return best;
      } catch(_) { return 0; }
    }

    // --- Signale sammeln ---
    const ogType = (document.querySelector('meta[property="og:type"]')?.content || '').toLowerCase();
    const articleCount = document.querySelectorAll('article').length;
    const h1Count = document.querySelectorAll('h1').length;
    let hasLdArticle = false, hasLdPaywall = false, hasLdFreeAccess = false, scriptPaywall = false, ldWordCount = 0;
    let paywallDialog = false, consentBannerVisible = false;
    let paywallShownKnown = false, paywallShownValue = null;

    try {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of ldScripts) {
        const txt = s.textContent || '';
        if (/"@type"\s*:\s*"(NewsArticle|Article|Reportage)"/i.test(txt)) hasLdArticle = true;
        if (/"isAccessibleForFree"\s*:\s*(true|"true")/i.test(txt)) hasLdFreeAccess = true;
        if (/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(txt) || /isAccessibleForFree["']?\s*:\s*false/i.test(txt)) hasLdPaywall = true;
        const wc = extractLdWordCount(txt);
        if (wc > ldWordCount) ldWordCount = wc;
      }
      for (const s of document.querySelectorAll('script')) {
        const txt = s.textContent || '';
        if (!txt) continue;
        if (/"subscriptionType"\s*:\s*"paid"/i.test(txt)) scriptPaywall = true;
        if (/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(txt)) scriptPaywall = true;
        if (/"paywall"\s*:\s*true/i.test(txt)) scriptPaywall = true;
        if (/"metered"\s*:\s*true/i.test(txt)) scriptPaywall = true;
        if (/"requiresSubscription"\s*:\s*true/i.test(txt)) scriptPaywall = true;
        if (/"loginRequired"\s*:\s*true/i.test(txt)) scriptPaywall = true;
        if (/"product_content_status"\s*:\s*"paid"/i.test(txt)) scriptPaywall = true;
        if (/"product_content_mode"\s*:\s*"(paid|partial)"/i.test(txt)) scriptPaywall = true;
        if (/"product_content_category"\s*:\s*"geo_plus"/i.test(txt)) scriptPaywall = true;
      }
    } catch(_) {}

    try {
      const wc = window.weltConfig;
      if (wc && typeof wc.isPaywallShown === 'boolean') { paywallShownKnown = true; paywallShownValue = wc.isPaywallShown; }
      const ac = window.adConfig;
      if (!paywallShownKnown && ac && typeof ac.isPaywallShown === 'boolean') { paywallShownKnown = true; paywallShownValue = ac.isPaywallShown; }
    } catch(_) {}

    try {
      const rndTag = document.querySelector('meta[name="cXenseParse:rnd-payment-tag"]');
      if (rndTag && rndTag.getAttribute('content') === 'paid') scriptPaywall = true;
      const rndNl = document.querySelector('meta[name="cXenseParse:rnd-paid-newsletter"]');
      if (rndNl && rndNl.getAttribute('content') === 'true') scriptPaywall = true;
    } catch(_) {}

    // Paywall dialogs
    try {
      const dialogs = document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]');
      for (const d of dialogs) {
        if (!isVisible(d)) continue;
        if (d.hasAttribute('inert') || d.closest('[inert]')) continue;
        if (looksLikeMenuDialog(d)) continue;
        const t = (d.innerText || '').toLowerCase();
        if (PAYWALL_KEYWORDS.test(t) || PAYWALL_TEXT_KEYWORDS.test(t)) { paywallDialog = true; break; }
      }
    } catch(_) {}

    // Paywall selectors
    let visiblePaywallNodes = 0, paywallSelectorHitText = false, paywallSelectorStrong = false, paywallSelectorTextLen = 0;
    try {
      const paywallNodes = document.querySelectorAll(PAYWALL_SELECTORS.join(','));
      for (const n of paywallNodes) {
        if (!isVisible(n)) continue;
        if (n.closest('header,nav')) continue;
        const attr = ((n.id||'')+' '+(n.className||'')+' '+(n.getAttribute('data-area')||'')+' '+(n.getAttribute('data-target-id')||'')+' '+(n.getAttribute('data-external-selector')||'')+' '+(n.getAttribute('aria-label')||'')).toLowerCase();
        const t = (n.textContent || '').trim();
        const textLower = t.toLowerCase();
        if (CONSENT_KEYWORDS.test(attr) || CONSENT_KEYWORDS.test(textLower)) { consentBannerVisible = true; continue; }
        const hasPaywallText = PAYWALL_KEYWORDS.test(textLower) || PAYWALL_TEXT_KEYWORDS.test(textLower);
        const attrStrong = /(paywall|regwall|tinypass|spplus|spmetered|paid-barrier|zephr|geo-plus|geo_plus)/.test(attr);
        if (!hasPaywallText && !attrStrong && t.length < 20) continue;
        if (hasPaywallText) paywallSelectorHitText = true;
        if (attrStrong || hasPaywallText) paywallSelectorStrong = true;
        visiblePaywallNodes++;
        paywallSelectorTextLen += t.length;
      }
    } catch(_) {}

    // Visible text count (cleaned)
    const bodyScopedArticleBody = Array.from(document.querySelectorAll('[itemprop="articleBody"]')).find(el => document.body && document.body.contains(el));
    const root =
      document.querySelector('[data-internal-id="article-content"]') ||
      document.querySelector('.c-article-page__text') ||
      document.querySelector('.c-rich-text-renderer--article') ||
      document.querySelector('.article-body') || document.querySelector('.article__body') ||
      document.querySelector('.article-content') || document.querySelector('.article__content') ||
      document.querySelector('.content-article') || document.querySelector('.content__article') ||
      document.querySelector('.post-content') || document.querySelector('.entry-content') ||
      bodyScopedArticleBody ||
      document.querySelector('main') || document.querySelector('article') || document.body;
    let visibleTextLen = 0, visibleWordCount = 0;
    try {
      [...STRUCTURAL_SELECTORS, 'header'].forEach(sel => markIgnore(root, sel));
      SHARE_SELECTORS.forEach(sel => markIgnore(root, sel));
      PAYWALL_SELECTORS.forEach(sel => markIgnore(root, sel));
      markKeywordNoise(root);
      for (const n of root.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, figcaption')) {
        if (!isVisible(n)) continue;
        if (n.closest('[data-jr-ignore="true"]')) continue;
        const t = (n.innerText || '').trim();
        if (t.length < 20) continue;
        visibleTextLen += t.length;
        visibleWordCount += t.split(/\s+/).filter(Boolean).length;
      }
    } catch(_) {}
    // Cleanup
    try { root.querySelectorAll('[data-jr-ignore]').forEach(el => el.removeAttribute('data-jr-ignore')); } catch(_) {}

    const bodyText = document.body ? document.body.innerText : '';
    const bodyTextLower = (bodyText || '').toLowerCase();
    const paywallText = PAYWALL_TEXT_KEYWORDS.test(bodyTextLower);
    if (CONSENT_KEYWORDS.test(bodyTextLower)) consentBannerVisible = true;

    // Truncation
    const truncatedByLd = ldWordCount > 0 && visibleWordCount > 0 && visibleWordCount < Math.max(120, Math.round(ldWordCount * 0.6));
    const truncatedBySize = visibleWordCount > 0 && visibleWordCount < 320 && visibleTextLen < 2200;
    const appearsTruncated = truncatedByLd || truncatedBySize;

    // Article signal check
    const metaOk = ogType.includes('article') || ogType.includes('news');
    const urlLower = location.href.toLowerCase();
    const isLiveTicker = urlLower.includes('live') || urlLower.includes('ticker') || urlLower.includes('liveblog');
    const structureOk = hasLdArticle || (h1Count === 1 && articleCount > 0 && articleCount <= 5) || (isLiveTicker && articleCount > 0);
    const signalOk = metaOk || structureOk;

    // Title
    const titleH1 = document.querySelector('h1');
    const title = (titleH1 && titleH1.innerText.length > 10) ? titleH1.innerText.trim() : document.title;

    // --- Entscheidungslogik (1:1 aus Flutter) ---
    const metadataPaywall = hasLdPaywall || scriptPaywall;
    const strongPaywallSignal = paywallDialog || paywallSelectorHitText || paywallSelectorStrong;
    const hasAnyPaywallSignal = metadataPaywall || strongPaywallSignal || paywallText || paywallSelectorStrong || visiblePaywallNodes > 0;
    const visibleTextSufficient = visibleWordCount >= 320 || visibleTextLen >= 2200;
    let ldWordThreshold = Math.round(ldWordCount * 0.6);
    if (ldWordThreshold < 120) ldWordThreshold = 120;
    const visibleWordsCloseToLd = ldWordCount > 0 && visibleWordCount >= ldWordThreshold;
    const truncated = !visibleWordsCloseToLd && (appearsTruncated || (hasAnyPaywallSignal && !visibleTextSufficient));

    const consentOnly = consentBannerVisible && !metadataPaywall && !strongPaywallSignal && !paywallText && !paywallSelectorStrong && visiblePaywallNodes === 0;

    let paywallDetected = false;
    let paywallReason = 'unknown';

    if (consentOnly) { paywallDetected = false; paywallReason = 'consent-banner-only'; }
    else if (hasLdFreeAccess && !paywallDialog) { paywallDetected = false; paywallReason = 'metadata-free-access'; }
    else if (paywallShownKnown && !paywallShownValue && !paywallDialog) { paywallDetected = false; paywallReason = 'paywallShown=false'; }
    else if (paywallShownKnown && paywallShownValue && !visibleTextSufficient && !visibleWordsCloseToLd) { paywallDetected = true; paywallReason = 'paywallShown=true+short'; }
    else if (paywallShownKnown && paywallShownValue) { paywallDetected = false; paywallReason = 'paywallShown=true+sufficient'; }
    else if (paywallDialog) { paywallDetected = true; paywallReason = 'paywall-dialog'; }
    else if (metadataPaywall) { paywallDetected = true; paywallReason = truncated ? 'metadata-paywall-truncated' : 'metadata-paywall-soft'; }
    else if (visibleWordsCloseToLd) { paywallDetected = false; paywallReason = 'words-close-to-ld'; }
    else if (strongPaywallSignal && truncated) { paywallDetected = true; paywallReason = 'paywall-ui-truncated'; }
    else if (paywallText && truncated) { paywallDetected = true; paywallReason = 'paywall-text-truncated'; }
    else if (hasAnyPaywallSignal && !truncated) { paywallDetected = false; paywallReason = 'signals-but-sufficient'; }
    else if (visibleTextSufficient) { paywallDetected = false; paywallReason = 'text-sufficient'; }
    else if (hasAnyPaywallSignal) { paywallDetected = true; paywallReason = 'signals+short'; }
    else { paywallDetected = false; paywallReason = 'no-signals'; }

    return {
      signalOk,
      paywallDetected,
      paywallReason,
      title,
      visibleWordCount,
      visibleTextLen,
      ldWordCount,
      consentBannerVisible,
      metadataPaywall,
      hasLdFreeAccess,
    };
  }

  // 5. Listener
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "get_article_content") sendResponse(getPageContent());
    if (req.action === "probe_article_state") sendResponse(probeArticleState());
    if (req.action === "highlight_quote") { highlightText(req.quote); sendResponse("ok"); }
    return true;
  });
})();