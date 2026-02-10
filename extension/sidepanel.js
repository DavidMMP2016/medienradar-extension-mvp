// sidepanel.js - JournalRadar Client (SICHERE VERSION via Backend)

// ⚠️ ACHTUNG: Hier KEINEN PRIVATE Keys eintragen!
// Analyse & Daten laufen über das Backend; Supabase Anon-Key ist öffentlich.

// HINWEIS: Wir nutzen noch die alte Backend-URL, bis die Umbenennung bei Vercel final ist.
const BACKEND_URL = "https://medienradar-backend.vercel.app/api"; 
const SUPABASE_URL = "https://wqpgcezcusnqnbdmquff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcGdjZXpjdXNucW5iZG1xdWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MDIwNzMsImV4cCI6MjA4NDQ3ODA3M30.q8xdwcci0G_Fj4ifOl-WHlpusgnRCk-RPHPK4qhY7U0";

let currentArticleText = "";
let currentArticleTitle = "";
let currentArticleUrl = "";
let lastAnalyzedUrl = ""; 
let authState = null;

document.addEventListener("DOMContentLoaded", async () => {
  showView("viewScanner");
  bindAuthUI();
  await initAuth();

  // --- ONBOARDING CHECK ---
  await OnboardingController.init();

  // --- TAB NAVIGATION ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        showView(target);
        animateSections(target);
        if(target === 'viewDashboard') loadDashboard();
        if(target === 'viewMedia') loadMedienlage();
    });
  });

  // --- HISTORY TAB NAVIGATION (Eigene / Debatten-Radar) ---
  let historyTabIndex = 0; // 0 = Eigene, 1 = Debatten-Radar
  document.querySelectorAll('.history-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyTabIndex = btn.getAttribute('data-history-tab') === 'debate' ? 1 : 0;
      window._maSearchQuery = '';
      const si = document.getElementById('maSearchInput'); if (si) si.value = '';
      setMaSelectionMode(false);
      loadDashboard();
    });
  });
  // Make historyTabIndex accessible
  window._historyTabIndex = () => historyTabIndex;

  // --- MEINE ANALYSEN: Search + Selection ---
  const maSearchInput = document.getElementById('maSearchInput');
  const maSearchClear = document.getElementById('maSearchClear');
  if (maSearchInput) {
    maSearchInput.addEventListener('input', () => {
      window._maSearchQuery = maSearchInput.value;
      if (maSearchClear) maSearchClear.classList.toggle('hidden', !maSearchInput.value);
      renderMaHistory();
    });
  }
  if (maSearchClear) {
    maSearchClear.addEventListener('click', () => {
      if (maSearchInput) maSearchInput.value = '';
      window._maSearchQuery = '';
      maSearchClear.classList.add('hidden');
      renderMaHistory();
    });
  }
  const maSelectBtn = document.getElementById('maSelectBtn');
  if (maSelectBtn) maSelectBtn.addEventListener('click', () => setMaSelectionMode(true));
  const maSelDone = document.getElementById('maSelDone');
  if (maSelDone) maSelDone.addEventListener('click', () => setMaSelectionMode(false));
  const maSelectAll = document.getElementById('maSelectAll');
  if (maSelectAll) {
    maSelectAll.addEventListener('click', () => {
      const filtered = window._maFilteredHistory || [];
      if (window._maSelectedIds.size === filtered.length) {
        window._maSelectedIds.clear();
      } else {
        filtered.forEach(h => window._maSelectedIds.add(h.id));
      }
      renderMaHistory();
    });
  }
  const maDeleteSelected = document.getElementById('maDeleteSelected');
  if (maDeleteSelected) maDeleteSelected.addEventListener('click', () => deleteSelectedEntries());

  // --- ACCORDION LOGIK (About/other views) ---
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const arrow = header.querySelector('.arrow-icon');
      if(content) {
        content.classList.toggle('collapsed');
        if(arrow) {
            arrow.innerText = content.classList.contains('collapsed') ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
        }
      }
    });
  });

  // --- MEDIENWETTER EXPAND BUTTONS ---
  document.querySelectorAll('.mw-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const body = document.getElementById(targetId);
      const icon = btn.querySelector('.material-icons-outlined');
      if (body) {
        body.classList.toggle('hidden');
        if (icon) icon.textContent = body.classList.contains('hidden') ? 'chevron_right' : 'expand_more';
      }
    });
  });

  // --- INFO ICONS ---
  document.querySelectorAll('.info-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetId = icon.getAttribute('data-info');
          const infoBox = document.getElementById(targetId);
          if(infoBox) infoBox.classList.toggle('hidden');
      });
  });

  // (Scorecard row click handlers removed - reasons now always visible in Flutter-style layout)

  // --- BUTTON LISTENERS ---
  const btnClear = document.getElementById("btnClearHistory");
  if(btnClear) btnClear.addEventListener("click", clearHistory);
  
  const btnAnalyze = document.getElementById("btnAnalyze");
  if(btnAnalyze) btnAnalyze.addEventListener("click", startAnalysis);
  
  const refreshBtn = document.getElementById("refreshButton");
  if(refreshBtn) refreshBtn.addEventListener("click", startAnalysis);

  const btnReAnalyze = document.getElementById("btnReAnalyze");
  if(btnReAnalyze) btnReAnalyze.addEventListener("click", startAnalysis);

  // --- PAYWALL OVERRIDE BUTTON ---
  const paywallOverrideBtn = document.getElementById('paywallOverrideBtn');
  if (paywallOverrideBtn) {
    paywallOverrideBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      // Erneut prüfen
      _paywallOverrideUrl = null;
      await probeArticle();
      // Wenn immer noch Paywall → Override anbieten
      const btn = document.getElementById('btnAnalyze');
      if (btn && btn.disabled) {
        const confirmed = confirm('Zugriffsbeschränkung weiterhin erkannt.\n\nWenn der vollständige Text sichtbar ist, kannst du die Analyse freischalten.\n\nAnalyse freischalten?');
        if (confirmed) {
          _paywallOverrideUrl = tab.url;
          await probeArticle();
        }
      }
    });
  }

  // --- SCORECARD CLOSE BUTTON ---
  const btnCloseScorecard = document.getElementById("btnCloseScorecard");
  if (btnCloseScorecard) {
    btnCloseScorecard.addEventListener("click", () => {
      resetToStart();
    });
  }

  // --- SCHNELLZUGRIFF INIT ---
  QuickAccessController.init();

  // --- MODAL CLOSE HANDLERS ---
  document.querySelectorAll('.modal').forEach(modal => {
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    const hide = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.addEventListener('click', hide);
    if (backdrop) backdrop.addEventListener('click', hide);
  });

  // --- INFO BUTTON (Header) ---
  const btnInfo = document.getElementById('btnInfo');
  if (btnInfo) {
    btnInfo.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      showView('viewAbout');
    });
  }

  // --- HELP BUTTON ---
  const btnHelp = document.getElementById('btnHelp');
  const helpModal = document.getElementById('helpModal');
  if (btnHelp && helpModal) {
    btnHelp.addEventListener('click', () => helpModal.classList.remove('hidden'));
  }
  const helpRestartBtn = document.getElementById('helpRestartOnboarding');
  if (helpRestartBtn) {
    helpRestartBtn.addEventListener('click', async () => {
      if (helpModal) helpModal.classList.add('hidden');
      await chrome.storage.local.remove(['onboarding_completed', 'guided_tour_completed']);
      OnboardingController.currentPage = 0;
      OnboardingController.counterStarted = false;
      OnboardingController.featureAnimated = false;
      OnboardingController.selectedMedia.clear();
      OnboardingController.updateMediaCounter();
      // Reset page position
      const container = document.getElementById('onbPagesContainer');
      if (container) container.style.transform = 'translateX(0%)';
      OnboardingController.updateDots();
      // Reset feature cards
      document.querySelectorAll('.onb-feature-card').forEach(c => c.classList.remove('onb-visible'));
      // Reset media tiles
      document.querySelectorAll('.onb-media-tile').forEach(t => t.classList.remove('selected'));
      OnboardingController.showOverlay();
      OnboardingController.startRadarAnimation();
    });
  }

  // --- RANKING TAB TOGGLE ---
  const rankTabOverall = document.getElementById('rankingTabOverall');
  const rankTabTopic = document.getElementById('rankingTabTopic');
  const rankBodyOverall = document.getElementById('rankingOverall');
  const rankBodyTopic = document.getElementById('rankingTopic');
  if (rankTabOverall && rankTabTopic) {
    rankTabOverall.addEventListener('click', () => {
      rankTabOverall.classList.add('active');
      rankTabTopic.classList.remove('active');
      if (rankBodyOverall) rankBodyOverall.classList.remove('hidden');
      if (rankBodyTopic) rankBodyTopic.classList.add('hidden');
    });
    rankTabTopic.addEventListener('click', () => {
      rankTabTopic.classList.add('active');
      rankTabOverall.classList.remove('active');
      if (rankBodyTopic) rankBodyTopic.classList.remove('hidden');
      if (rankBodyOverall) rankBodyOverall.classList.add('hidden');
      // Load topic ranking if not yet loaded
      if (!window._topicRankingLoaded) {
        loadTopicRanking();
      }
    });
  }

  // --- WINDOW CHIPS (7d / 30d / Gesamt) for both tabs ---
  initWindowChips('rankingWindowChips', (days) => {
    window._rankingDays = days;
    loadOverallRanking(days);
  });
  initWindowChips('topicWindowChips', (days) => {
    window._topicDays = days;
    const topic = document.getElementById('topicSelect')?.value || '';
    if (topic) loadTopicRanking(topic, days);
  });

  // --- TOPIC QUICK CHIPS ---
  const RESSORTS = [
    { id: 'politik_de', label: 'Politik DE' },
    { id: 'politik_int', label: 'Politik Int.' },
    { id: 'economy', label: 'Wirtschaft' },
    { id: 'sport', label: 'Sport' },
    { id: 'culture_media', label: 'Kultur' },
    { id: 'tech_ai', label: 'Technologie' },
    { id: 'science_edu', label: 'Wissenschaft' },
    { id: 'health', label: 'Gesundheit' },
    { id: 'climate', label: 'Klima' },
    { id: 'finance_markets', label: 'Finanzen' },
    { id: 'security', label: 'Sicherheit' },
    { id: 'war_conflict', label: 'Krieg' },
  ];
  const quickChipsEl = document.getElementById('topicQuickChips');
  const topicSelect = document.getElementById('topicSelect');
  if (quickChipsEl) {
    RESSORTS.slice(0, 6).forEach(r => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = r.label;
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        if (topicSelect) topicSelect.value = r.id;
        loadTopicRanking(r.id, window._topicDays || 7);
      });
      quickChipsEl.appendChild(chip);
    });
  }
  if (topicSelect) {
    RESSORTS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.label;
      topicSelect.appendChild(opt);
    });
    topicSelect.addEventListener('change', () => {
      loadTopicRanking(topicSelect.value, window._topicDays || 7);
    });
  }

  // --- RANKING TOGGLE BUTTONS ---
  const rankToggle = document.getElementById('rankingToggleBtn');
  if (rankToggle) {
    rankToggle.addEventListener('click', () => {
      window._rankingShowAll = !window._rankingShowAll;
      rankToggle.textContent = window._rankingShowAll ? 'Weniger anzeigen' : 'Alle anzeigen';
      const list = document.getElementById('rankingOverallList');
      if (list && window._lastOverallRanking) {
        renderCommunityRanking(list, window._lastOverallRanking, window._rankingShowAll ? 999 : 5);
      }
    });
  }
  const topicToggle = document.getElementById('topicToggleBtn');
  if (topicToggle) {
    topicToggle.addEventListener('click', () => {
      window._topicShowAll = !window._topicShowAll;
      topicToggle.textContent = window._topicShowAll ? 'Weniger anzeigen' : 'Alle anzeigen';
      const list = document.getElementById('topicRankingList');
      if (list && window._lastTopicRanking) {
        renderCommunityRanking(list, window._lastTopicRanking, window._topicShowAll ? 999 : 5);
      }
    });
  }

  checkRefreshStatus();
  setTimeout(probeArticle, 500);
});

// --- VIEW NAVIGATION ---
function showView(viewId) {
  const views = ["viewScanner", "viewDashboard", "viewMedia", "viewAbout", "viewAllMedia"];
  const footers = ["footerScanner", "footerDashboard", "footerResult"];

  views.forEach(v => {
      const el = document.getElementById(v);
      if(el) el.classList.add("hidden");
  });
  
  footers.forEach(f => {
      const el = document.getElementById(f);
      if(el) el.classList.add("hidden");
  });

  const targetEl = document.getElementById(viewId);
  if(targetEl) targetEl.classList.remove("hidden");

  if(viewId === "viewScanner") {
      const resState = document.getElementById("stateResult");
      const loadingState = document.getElementById("stateLoading");
      const isResult = resState && !resState.classList.contains("hidden");
      const isLoading = loadingState && !loadingState.classList.contains("hidden");
      if(isResult) {
          const fResult = document.getElementById("footerResult");
          if(fResult) fResult.classList.remove("hidden");
          QuickAccessController.hide();
      } else if(isLoading) {
          QuickAccessController.hide();
      } else {
          const fScan = document.getElementById("footerScanner");
          if(fScan) fScan.classList.remove("hidden");
          QuickAccessController.show();
      }
  }
  
  if(viewId === "viewDashboard") {
      const fDash = document.getElementById("footerDashboard");
      if(fDash) fDash.classList.remove("hidden");
  }
}

// --- ANALYSE HAUPTFUNKTION ---
async function startAnalysis() {
  // Vor dem Start: Nochmal Paywall prüfen (wie Flutter _startAnalysisFlow)
  try {
    const [preTab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (preTab && preTab.url) {
      let probe;
      try {
        probe = await chrome.tabs.sendMessage(preTab.id, { action: "probe_article_state" });
      } catch(_) {}
      if (probe && probe.paywallDetected && _paywallOverrideUrl !== preTab.url) {
        setButtonState('paywall', probe.title, probe.paywallReason);
        return;
      }
    }
  } catch(_) {}

  QuickAccessController.hide();
  document.getElementById("stateStart").classList.add("hidden");
  document.getElementById("stateResult").classList.add("hidden");
  document.getElementById("stateLoading").classList.remove("hidden");

  document.getElementById("footerScanner").classList.add("hidden");
  document.getElementById("footerResult").classList.add("hidden");

  const refreshBtn = document.getElementById('refreshButton');
  if(refreshBtn) refreshBtn.classList.remove('notify');

  // Guided Tour hook: analysis started
  if (GuidedTourController.active) {
    GuidedTourController.onAnalysisStarted();
  }

  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if(!tab) throw new Error("Kein Tab gefunden.");

    let response;
    try {
        response = await chrome.tabs.sendMessage(tab.id, {action: "get_article_content"});
    } catch (err) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await new Promise(resolve => setTimeout(resolve, 500));
        response = await chrome.tabs.sendMessage(tab.id, {action: "get_article_content"});
    }

    if(!response || !response.text) throw new Error("Konnte Text nicht lesen.");

    if(response.text.startsWith("[PAYWALL_ERROR]")) {
        alert("Zugriffsbeschränkung erkannt – Analyse gesperrt.");
        resetToStart();
        return;
    }

    if(response.text.length < 50) throw new Error("Text zu kurz – zu wenig sichtbarer Inhalt.");
    
    currentArticleText = response.text;
    currentArticleTitle = response.title || "Unbekannter Artikel";
    currentArticleUrl = response.url;
    let currentImageUrl = response.imageUrl || ""; 

    const metaTitle = document.getElementById("metaTitle");
    if(metaTitle) {
        metaTitle.innerText = currentArticleTitle;
        metaTitle.style.cursor = "pointer";
        metaTitle.style.textDecoration = "underline";
        metaTitle.onclick = () => window.open(currentArticleUrl, '_blank');
    }

    try {
        const urlObj = new URL(tab.url);
        const metaUrl = document.getElementById("metaUrl");
        if(metaUrl) metaUrl.innerText = urlObj.hostname;
    } catch(e) {}

    document.getElementById("loadingStatus").innerText = "Sende an JournalRadar Server...";

    let base64Image = null;
    if(currentImageUrl && currentImageUrl.startsWith("http")) {
        try {
            base64Image = await urlToBase64(currentImageUrl);
        } catch(e) {
            console.warn("Konnte Bild nicht laden:", e);
            base64Image = null; 
        }
    }

    // >>> SICHERER BACKEND AUFRUF FÜR ANALYSE <<<
    const analysisData = await callBackendAnalysis(currentArticleText, currentImageUrl, base64Image);
    
    renderData(analysisData, currentImageUrl);
    await saveToHistory(analysisData, currentArticleUrl, currentArticleTitle, currentImageUrl);

    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateResult").classList.remove("hidden");
    
    document.getElementById("footerScanner").classList.add("hidden");
    document.getElementById("footerResult").classList.remove("hidden");

    lastAnalyzedUrl = currentArticleUrl;
    checkRefreshStatus();

    // Guided Tour hook: analysis complete
    if (GuidedTourController.active) {
      GuidedTourController.onAnalysisComplete();
    }

  } catch (e) {
    console.error(e);
    alert("Fehler: " + e.message);
    resetToStart();
  }
}

async function urlToBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function resetToStart() {
    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateResult").classList.add("hidden");
    document.getElementById("stateStart").classList.add("hidden");
    document.getElementById("footerResult").classList.add("hidden");
    document.getElementById("footerScanner").classList.remove("hidden");
    QuickAccessController.show();
    setTimeout(probeArticle, 300);
}

function showHistoryScorecard(entry) {
    // Set meta box
    const metaTitle = document.getElementById("metaTitle");
    const metaUrl = document.getElementById("metaUrl");
    if (metaTitle) {
        metaTitle.innerText = entry.title || "Unbekannter Artikel";
        metaTitle.style.cursor = entry.url ? "pointer" : "default";
        metaTitle.style.textDecoration = entry.url ? "underline" : "none";
        metaTitle.onclick = entry.url ? () => window.open(entry.url, '_blank') : null;
    }
    if (metaUrl) metaUrl.innerText = entry.domain || "—";

    // Render scorecard
    renderData(entry.analysis, entry.image_url);

    // Set currentArticleUrl for feedback
    currentArticleUrl = entry.url || "";

    // Switch to Scanner tab, show result
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const scannerTab = document.querySelector('.tab-btn[data-target="viewScanner"]');
    if (scannerTab) scannerTab.classList.add('active');
    showView("viewScanner");

    // Show result state, hide others
    document.getElementById("stateStart").classList.add("hidden");
    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateResult").classList.remove("hidden");

    // Footer: show result footer
    document.getElementById("footerScanner").classList.add("hidden");
    document.getElementById("footerResult").classList.remove("hidden");

    // Hide QuickAccess
    QuickAccessController.hide();
}

async function checkRefreshStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const refreshBtn = document.getElementById('refreshButton');
  if (!tab || !refreshBtn) return;
  if (lastAnalyzedUrl && tab.url !== lastAnalyzedUrl) {
    refreshBtn.classList.add('notify');
    refreshBtn.title = "Neue URL - Analysieren";
  } else {
    refreshBtn.classList.remove('notify');
    refreshBtn.title = "Analyse neu starten";
  }
}

// --- ARTICLE PROBE: Artikel-/Paywall-Erkennung (1:1 aus Flutter) ---
let _probeTimeout = null;
let _paywallOverrideUrl = null;

function looksLikeArticlePath(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.trim();
    if (!path || path === '/') return false;
    const lower = path.toLowerCase();
    if (['/index.html','/index.php','/index.htm','/home','/start'].includes(lower)) return false;
    const segments = path.split('/').filter(s => s.trim().length > 0);
    if (segments.length === 0) return false;
    if (segments.length === 1) {
      const seg = segments[0].toLowerCase();
      const commonSections = [
        'news','nachrichten','sport','politik','wirtschaft','kultur','panorama','wissen',
        'digital','auto','reise','gesundheit','karriere','leben','meinung','videos','podcasts',
        'thema','region','lokal','regional','unterhaltung','media','service','ratgeber','stil',
        'gesellschaft','wissenschaft','technik','bildung','family','food','fashion','beauty',
        'entertainment','opinion','business','technology','science','health','travel','lifestyle',
        'world','national','local','sports','culture','arts','books','music','movies','tv',
        'games','weather','finanzen','boerse','medien','netzwelt','mobilitat','immobilien',
      ];
      if (commonSections.includes(seg)) return false;
      if (seg.length < 40) return false;
      return true;
    }
    return true;
  } catch(_) { return false; }
}

async function probeArticle() {
  const btn = document.getElementById('btnAnalyze');
  if (!btn) return;

  const resultEl = document.getElementById('stateResult');
  if (resultEl && !resultEl.classList.contains('hidden')) return;
  const loadingEl = document.getElementById('stateLoading');
  if (loadingEl && !loadingEl.classList.contains('hidden')) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) { setButtonState('no-tab'); return; }

    const url = tab.url;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('edge://') || url === 'about:blank') {
      setButtonState('no-article');
      return;
    }

    // URL-Pfad-Prüfung
    const pathOk = looksLikeArticlePath(url);

    // "Prüfe..." anzeigen
    setButtonState('checking');

    // Content Script injizieren + proben
    let probe;
    try {
      probe = await chrome.tabs.sendMessage(tab.id, { action: "probe_article_state" });
    } catch (_) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await new Promise(r => setTimeout(r, 400));
        probe = await chrome.tabs.sendMessage(tab.id, { action: "probe_article_state" });
      } catch (_) {
        setButtonState('no-article');
        return;
      }
    }

    if (!probe) { setButtonState('no-article'); return; }

    const isArticle = pathOk && probe.signalOk;
    const isPaywalled = probe.paywallDetected;
    const isOverridden = _paywallOverrideUrl === url;

    if (!isArticle) {
      setButtonState('no-article');
    } else if (isPaywalled && !isOverridden) {
      setButtonState('paywall', probe.title, probe.paywallReason);
    } else if (probe.visibleWordCount < 50) {
      setButtonState('too-short', probe.title);
    } else {
      setButtonState('ready', probe.title);
    }
  } catch (_) {
    setButtonState('no-article');
  }
}

function setButtonState(state, title, reason) {
  const btn = document.getElementById('btnAnalyze');
  const statusEl = document.getElementById('analyzeStatus');
  const overrideBtn = document.getElementById('paywallOverrideBtn');
  if (!btn) return;

  // Paywall-Override-Button nur bei paywall sichtbar
  if (overrideBtn) overrideBtn.classList.toggle('hidden', state !== 'paywall');

  switch (state) {
    case 'ready':
      btn.disabled = false;
      btn.classList.remove('btn-locked');
      btn.innerHTML = '<span class="material-icons-outlined">radar</span> Analysieren';
      if (statusEl) {
        const short = title && title.length > 55 ? title.slice(0, 55) + '…' : (title || '');
        statusEl.innerHTML = `<span class="material-icons-outlined" style="font-size:14px; color:var(--green);">check_circle</span> Artikel erkannt` + (short ? `: <strong>${short}</strong>` : '');
        statusEl.className = 'analyze-status status-ready';
      }
      break;
    case 'checking':
      btn.disabled = true;
      btn.classList.add('btn-locked');
      btn.innerHTML = '<span class="material-icons-outlined">hourglass_top</span> Prüfe...';
      if (statusEl) {
        statusEl.innerHTML = '<span class="material-icons-outlined" style="font-size:14px; color:var(--text-muted);">hourglass_top</span> Seite wird geprüft…';
        statusEl.className = 'analyze-status status-info';
      }
      break;
    case 'paywall':
      btn.disabled = true;
      btn.classList.add('btn-locked');
      btn.innerHTML = '<span class="material-icons-outlined">lock</span> Eingeschränkt';
      if (statusEl) {
        statusEl.innerHTML = '<span class="material-icons-outlined" style="font-size:14px; color:var(--yellow);">lock</span> Zugriffsbeschränkung erkannt – Analyse gesperrt';
        statusEl.className = 'analyze-status status-warn';
      }
      break;
    case 'too-short':
      btn.disabled = true;
      btn.classList.add('btn-locked');
      btn.innerHTML = '<span class="material-icons-outlined">short_text</span> Zu wenig Text';
      if (statusEl) {
        statusEl.innerHTML = '<span class="material-icons-outlined" style="font-size:14px; color:var(--yellow);">short_text</span> Kein Artikel erkannt – zu wenig sichtbarer Text';
        statusEl.className = 'analyze-status status-warn';
      }
      break;
    case 'no-article':
    case 'no-tab':
    default:
      btn.disabled = true;
      btn.classList.add('btn-locked');
      btn.innerHTML = '<span class="material-icons-outlined">article</span> Kein Artikel';
      if (statusEl) {
        statusEl.innerHTML = '<span class="material-icons-outlined" style="font-size:14px; color:var(--text-muted);">info</span> Öffne einen Nachrichtenartikel in einem Tab';
        statusEl.className = 'analyze-status status-info';
      }
      break;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    // Override zurücksetzen bei URL-Wechsel
    if (_paywallOverrideUrl && tab.url !== _paywallOverrideUrl) {
      _paywallOverrideUrl = null;
    }
    checkRefreshStatus();
    clearTimeout(_probeTimeout);
    _probeTimeout = setTimeout(probeArticle, 300);
    // Guided Tour: detect article page
    if (GuidedTourController.active && GuidedTourController.step === 'browseHomepage') {
      GuidedTourController.showCoach('tapAnalyze', 'Artikel erkannt!', 'Tippe unten auf „Analyse Starten", um den Artikel zu durchleuchten.');
    }
  }
});
chrome.tabs.onActivated.addListener(() => {
  checkRefreshStatus();
  clearTimeout(_probeTimeout);
  _probeTimeout = setTimeout(probeArticle, 300);
});

// --- BACKEND AUFRUF: ANALYSE ---
async function callBackendAnalysis(text, imageUrl, base64Image) {
  // Wir senden die Daten an unseren Vercel-Server
  const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
          text: text,
          imageUrl: base64Image || imageUrl
      })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Server Fehler bei Analyse");
  return data;
}

// --- FARB-FUNKTIONEN (Flutter 1:1) ---
function scoreColor(score) {
  if (score >= 80) return '#69F0AE';
  if (score >= 60) return '#fbbf24';
  return '#FF5252';
}
function scoreColorLowIsGood(score) {
  if (score <= 39) return '#69F0AE';
  if (score <= 59) return '#fbbf24';
  return '#FF5252';
}

// --- SVG GAUGE BUILDER ---
function buildGaugeSVG(score) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const totalLen = 157; // half-circle arc length
  const dashLen = totalLen * pct;
  const color = scoreColor(score);
  // Needle position on arc: angle from PI to 0
  const angle = Math.PI - pct * Math.PI;
  const cx = 60 + 50 * Math.cos(angle);
  const cy = 65 - 50 * Math.sin(angle);
  return `<svg viewBox="0 0 120 75" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FF5252"/>
        <stop offset="40%" stop-color="#f97316"/>
        <stop offset="60%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#69F0AE"/>
      </linearGradient>
    </defs>
    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="10" stroke-linecap="round"/>
    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="url(#scGaugeGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dashLen} ${totalLen}"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="#05050a" stroke-width="2"/>
    <text x="60" y="60" text-anchor="middle" fill="${color}" font-size="24" font-weight="900">${score}</text>
    <text x="60" y="72" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="8" letter-spacing="1" text-transform="uppercase">Score</text>
  </svg>`;
}

// --- RENDER FUNKTION (Flutter-Style GlassCards) ---
function renderData(data, imageUrl) {
  if (!data) return;
  const container = document.getElementById("scorecardCards");
  if (!container) return;
  container.innerHTML = "";

  // Helper: Create a GlassCard
  function glassCard(icon, title, iconColor, content) {
    const card = document.createElement("div");
    card.className = "glass-card";
    card.innerHTML = `<div class="gc-header"><span class="material-icons-outlined gc-icon" style="color:${iconColor || 'var(--primary)'}">${icon}</span><span class="gc-title">${title}</span></div>`;
    if (typeof content === "string") {
      card.innerHTML += content;
    } else if (content) {
      card.appendChild(content);
    }
    return card;
  }

  // Helper: Create content fragment
  function frag() { return document.createDocumentFragment(); }

  // ======= 1. GESAMT CARD =======
  if (data.total_score) {
    const ts = data.total_score;
    const f = frag();
    const row = document.createElement("div");
    row.className = "sc-gauge-row";
    row.innerHTML = `
      <div class="sc-gauge-svg">${buildGaugeSVG(ts.value)}</div>
      <div class="sc-gauge-info">
        <div class="sc-gauge-label">${ts.label || ''}</div>
        <div class="sc-gauge-summary">${ts.summary || ''}</div>
      </div>`;
    f.appendChild(row);
    container.appendChild(glassCard("speed", "Gesamt", "#69F0AE", f));
  }

  // ======= 2. SCORECARD CARD =======
  {
    const f = frag();
    // Word count + Ressort meta
    const wordCount = data.word_count || data.wordCount || null;
    const ressort = data.topic || data.ressort || null;
    if (wordCount || ressort) {
      const meta = document.createElement("div");
      meta.className = "sc-meta-row";
      if (wordCount) meta.innerHTML += `<span><span class="material-icons-outlined" style="font-size:16px">text_fields</span> ${wordCount} Wörter</span>`;
      if (ressort) {
        const label = TOPIC_LABELS[ressort] || ressort;
        meta.innerHTML += `<span><span class="material-icons-outlined" style="font-size:16px">category</span> ${label}</span>`;
      }
      f.appendChild(meta);
    }

    // 4 Metrics
    const metrics = [
      { label: "Clickbait-Faktor", data: data.headline, lowIsGood: true },
      { label: "Informationsgehalt", data: data.facts, lowIsGood: false },
      { label: "Objektivität", data: data.neutrality, lowIsGood: false },
      { label: "Emotionalität", data: data.emotion, lowIsGood: true },
    ];
    metrics.forEach(m => {
      const score = m.data?.score || 0;
      const reason = m.data?.reason || "";
      const color = m.lowIsGood ? scoreColorLowIsGood(score) : scoreColor(score);
      const div = document.createElement("div");
      div.className = "metric-score";
      div.innerHTML = `
        <div class="metric-header"><span>${m.label}</span><span class="metric-value" style="color:${color}">${score}</span></div>
        <div class="metric-bar-track"><div class="metric-bar-fill" style="width:${score}%; background:${color}"></div></div>
        ${reason ? `<div class="metric-reason">${reason}</div>` : ''}`;
      f.appendChild(div);
    });
    container.appendChild(glassCard("bar_chart", "Scorecard", "#3B82F6", f));
  }

  // ======= 3. AKTEURE & TONALITÄT CARD =======
  if (data.actors && data.actors.length > 0) {
    const f = frag();
    data.actors.forEach(actor => {
      const card = document.createElement("div");
      card.className = "actor-card";
      const sentClass = actor.sentiment === "positive" ? "sentiment-positive" : actor.sentiment === "negative" ? "sentiment-negative" : "sentiment-neutral";
      const sentLabel = actor.sentiment === "positive" ? "Positiv" : actor.sentiment === "negative" ? "Negativ" : "Neutral";
      card.innerHTML = `
        <div><span class="actor-name">${actor.name}</span><span class="sentiment-chip ${sentClass}">${sentLabel}</span></div>
        ${actor.desc ? `<div class="actor-desc">${actor.desc}</div>` : ''}`;
      f.appendChild(card);
    });
    container.appendChild(glassCard("groups", "Akteure & Tonalität", "#00BCD4", f));
  }

  // ======= 5. RHETORIK & MUSTER CARD =======
  if (data.rhetoric && data.rhetoric.length > 0) {
    const f = frag();
    data.rhetoric.forEach(item => {
      const card = document.createElement("div");
      card.className = "rhetoric-card";
      card.innerHTML = `
        <div class="rhetoric-label">${item.label}</div>
        ${item.quote ? `<div class="rhetoric-quote">"${item.quote}"</div>` : ''}
        ${item.desc ? `<div class="sc-rhetoric-desc">${item.desc}</div>` : ''}`;
      card.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
        chrome.tabs.sendMessage(tab.id, {action: "highlight_quote", quote: item.quote});
      });
      f.appendChild(card);
    });
    container.appendChild(glassCard("format_quote", "Rhetorik & Muster", "#fbbf24", f));
  }

  // ======= 6. BLINDE FLECKEN CARD =======
  if (data.missing && data.missing.length > 0) {
    const f = frag();
    data.missing.forEach(text => {
      const div = document.createElement("div");
      div.className = "sc-bullet";
      div.textContent = text;
      f.appendChild(div);
    });
    container.appendChild(glassCard("visibility_off", "Blinde Flecken", "#f97316", f));
  }

  // ======= 7. TL;DR CARD =======
  if (data.tldr && data.tldr.length > 0) {
    const f = frag();
    data.tldr.forEach(text => {
      const div = document.createElement("div");
      div.className = "sc-bullet";
      div.textContent = text;
      f.appendChild(div);
    });
    container.appendChild(glassCard("notes", "TL;DR", "#69F0AE", f));
  }

  // ======= 8. FAKTENCHECK-SUCHE CARD =======
  if (data.fact_check_searches && data.fact_check_searches.length > 0) {
    const f = frag();
    data.fact_check_searches.forEach(term => {
      const a = document.createElement("a");
      a.href = `https://www.google.com/search?q=${encodeURIComponent(term)}`;
      a.target = "_blank";
      a.className = "search-chip";
      a.innerHTML = `<span class="material-icons-outlined" style="font-size:18px; color:var(--primary)">search</span><span style="flex:1">${term}</span><span class="material-icons-outlined" style="font-size:14px; opacity:0.5">open_in_new</span>`;
      f.appendChild(a);
    });
    container.appendChild(glassCard("search", "Faktencheck-Suche", "#3B82F6", f));
  }

  // ======= 9. FEEDBACK CARD =======
  {
    const f = frag();
    const row = document.createElement("div");
    row.className = "feedback-row";
    row.innerHTML = `
      <button class="feedback-btn" id="feedbackLike"><span class="material-icons-outlined" style="font-size:20px">thumb_up</span> Hilfreich</button>
      <button class="feedback-btn" id="feedbackDislike"><span class="material-icons-outlined" style="font-size:20px">thumb_down</span> Nicht hilfreich</button>`;
    f.appendChild(row);
    const feedbackCard = glassCard("thumb_up", "Feedback", "var(--primary)", f);
    container.appendChild(feedbackCard);

    // Bind feedback buttons
    setTimeout(() => {
      const likeBtn = document.getElementById("feedbackLike");
      const dislikeBtn = document.getElementById("feedbackDislike");
      if (likeBtn) likeBtn.addEventListener("click", () => submitFeedback("like", likeBtn, dislikeBtn));
      if (dislikeBtn) dislikeBtn.addEventListener("click", () => submitFeedback("dislike", dislikeBtn, likeBtn));
    }, 0);
  }
}

// --- FEEDBACK SUBMIT ---
async function submitFeedback(type, activeBtn, otherBtn) {
  activeBtn.classList.add(type === "like" ? "active-like" : "active-dislike");
  otherBtn.classList.remove("active-like", "active-dislike");
  try {
    const deviceId = await getDeviceId();
    const headers = { "Content-Type": "application/json" };
    if (authState?.access_token) headers["Authorization"] = `Bearer ${authState.access_token}`;
    await fetch(`${BACKEND_URL}/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        device_id: deviceId,
        url: currentArticleUrl,
        feedback: type,
        user_id: authState?.user?.id || null
      })
    });
  } catch (e) {
    console.error('[Feedback] Error:', e);
  }
}

async function saveToHistory(analysis, url, title, imageUrl) {
  const domain = new URL(url).hostname.replace('www.', '');

  // Check if this analysis was triggered from Debatten Radar CTA
  const stored = await chrome.storage.local.get(['debate_cta_url']);
  let source = 'web';
  if (stored.debate_cta_url && stored.debate_cta_url === url) {
    source = 'debate_cta';
    await chrome.storage.local.remove(['debate_cta_url']);
  }

  const synced = !!(authState?.user?.id);
  const now = new Date();
  const entry = {
    id: Date.now(),
    date: now.toLocaleDateString('de-DE'),
    time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    title, domain, url,
    score: analysis.total_score.value,
    source,
    synced_with_user: synced,
    // Keep full data for retroactive sync on login
    _analysis: analysis,
    _image_url: imageUrl || null,
  };
  const data = await chrome.storage.local.get(['history']);
  const history = data.history || [];
  history.unshift(entry);
  if (history.length > 50) history.pop();
  await chrome.storage.local.set({ history });
  await syncHistoryRemote({
    analysis,
    url,
    title,
    domain,
    image_url: imageUrl || null,
    total_score: analysis?.total_score?.value ?? null,
    source: source,
  });
}

async function getDeviceId() {
  const stored = await chrome.storage.local.get(['device_id']);
  if (stored.device_id) return stored.device_id;
  const id = (crypto.randomUUID ? crypto.randomUUID() : `ext-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await chrome.storage.local.set({ device_id: id });
  return id;
}

function bindAuthUI() {
  const btnAuth = document.getElementById("btnAuth");
  const modal = document.getElementById("authModal");
  const closeBtn = document.getElementById("authClose");
  const backdrop = document.getElementById("authBackdrop");
  const card = modal ? modal.querySelector('.auth-card') : null;
  const sendLinkBtn = document.getElementById("authSendLink");
  const googleBtn = document.getElementById("authGoogleBtn");
  const logoutBtn = document.getElementById("authLogoutBtn");
  const deleteBtn = document.getElementById("authDeleteBtn");

  const open = () => { if (modal) modal.classList.remove("hidden"); updateAuthUI(); resetMagicLinkUI(); };
  const close = () => { if (modal) modal.classList.add("hidden"); resetMagicLinkUI(); };

  if (btnAuth) btnAuth.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", (e) => { e.stopPropagation(); close(); });
  if (backdrop) backdrop.addEventListener("click", close);
  if (card) card.addEventListener("click", (e) => e.stopPropagation());

  if (sendLinkBtn) sendLinkBtn.addEventListener("click", handleSendMagicLink);
  if (googleBtn) googleBtn.addEventListener("click", handleGoogleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", handleSignOut);
  if (deleteBtn) deleteBtn.addEventListener("click", handleDeleteAccount);
}

async function initAuth() {
  const stored = await chrome.storage.local.get(['auth']);
  if (stored.auth && stored.auth.access_token) authState = stored.auth;
  if (authState && isAuthExpired(authState)) {
    const refreshed = await refreshAuth(authState.refresh_token);
    if (!refreshed) await clearAuth();
  }
  if (authState && authState.access_token && !authState.user) {
    const user = await fetchAuthUser(authState.access_token);
    if (user) {
      authState.user = user;
      await chrome.storage.local.set({ auth: authState });
    }
  }
  updateAuthUI();
  if (authState && authState.access_token && authState.user) {
    claimDeviceHistory().then((claimed) => {
      if (claimed > 0) return markUnsyncedHistoryAsSynced();
      return syncUnsyncedHistory();
    }).catch(() => {});
  }

  // Listen for auth state changes (from background script / content script)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.auth) {
      console.log('[Auth] Storage changed, updating auth state');
      authState = changes.auth.newValue;
      updateAuthUI();
      // Close modal if now logged in
      if (authState && authState.access_token && authState.user) {
        const modal = document.getElementById("authModal");
        if (modal) modal.classList.add("hidden");
        resetMagicLinkUI();
        claimDeviceHistory().then((claimed) => {
          if (claimed > 0) return markUnsyncedHistoryAsSynced();
          return syncUnsyncedHistory();
        }).catch(() => {});
      }
    }
  });
}

async function ensureAuthFresh() {
  if (authState && isAuthExpired(authState)) {
    const refreshed = await refreshAuth(authState.refresh_token);
    if (!refreshed) await clearAuth();
  }
}

function isAuthExpired(auth) {
  if (!auth || !auth.expires_at) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= (auth.expires_at - 60);
}

function setAuthError(message) {
  const el = document.getElementById("authError");
  if (!el) return;
  if (!message) {
    el.classList.add("hidden");
    el.innerText = "";
  } else {
    el.classList.remove("hidden");
    el.innerText = message;
  }
}

function updateAuthUI() {
  const authBtn = document.getElementById("btnAuth");
  const status = document.getElementById("authStatus");
  const loggedInBox = document.getElementById("authLoggedIn");
  const loggedOutBox = document.getElementById("authLoggedOut");
  const emailEl = document.getElementById("authUserEmail");

  const isLoggedIn = !!(authState && authState.access_token && authState.user);

  // Update auth button: avatar with initial when logged in, icon when not
  if (authBtn) {
    if (isLoggedIn) {
      const email = authState.user.email || authState.user.user_metadata?.name || '';
      const initial = (email.charAt(0) || '?').toUpperCase();
      authBtn.innerHTML = `<span class="auth-avatar">${initial}</span>`;
    } else {
      authBtn.innerHTML = `<span id="authIcon" class="material-icons-outlined">login</span>`;
    }
  }
  if (status) status.innerText = isLoggedIn ? "Eingeloggt" : "Login zum Radar";
  if (loggedInBox) loggedInBox.classList.toggle("hidden", !isLoggedIn);
  if (loggedOutBox) loggedOutBox.classList.toggle("hidden", isLoggedIn);
  if (emailEl) emailEl.innerText = isLoggedIn ? (authState.user.email || authState.user.id) : "—";
}

async function handleSendMagicLink() {
  setAuthError("");
  const emailInput = document.getElementById("authEmail");
  const email = emailInput ? emailInput.value.trim() : "";
  if (!email) {
    setAuthError("Bitte eine E‑Mail eingeben.");
    return;
  }
  const hint = document.getElementById("authHint");
  const sendBtn = document.getElementById("authSendLink");

  if (hint) hint.innerText = "Sende Magic‑Link ...";
  if (sendBtn) sendBtn.disabled = true;

  try {
    await sendMagicLink(email);
    if (hint) hint.innerHTML = '<span style="color:#00D9B8">E‑Mail gesendet!</span><br>Klicke auf den Link in der E‑Mail \u2013 du wirst automatisch eingeloggt.';
    if (sendBtn) {
      sendBtn.innerText = "Warte auf Login...";
    }
  } catch (e) {
    console.error('[Auth] Send magic link error:', e);
    resetMagicLinkUI();
    setAuthError(e.message || "Link konnte nicht gesendet werden.");
  }
}


function resetMagicLinkUI() {
  const hint = document.getElementById("authHint");
  const sendBtn = document.getElementById("authSendLink");

  if (hint) hint.innerText = "Wir senden dir einen Magic‑Link an deine E‑Mail.";
  if (sendBtn) {
    sendBtn.innerText = "Magic‑Link senden";
    sendBtn.disabled = false;
  }
}

async function handleGoogleLogin() {
  setAuthError("");
  if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
    setAuthError("Google‑Login ist hier nicht verfügbar.");
    return;
  }
  const redirectUrl = chrome.identity.getRedirectURL("supabase");
  console.log('[Auth] Google OAuth redirect URL:', redirectUrl);

  // Supabase OAuth URL with scopes
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&prompt=select_account`;
  console.log('[Auth] Starting Google OAuth flow...');

  chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
    if (chrome.runtime.lastError) {
      console.error('[Auth] Google OAuth error:', chrome.runtime.lastError.message);
      setAuthError("Google‑Login fehlgeschlagen: " + chrome.runtime.lastError.message);
      return;
    }
    if (!responseUrl) {
      console.error('[Auth] No response URL from OAuth');
      setAuthError("Google‑Login abgebrochen.");
      return;
    }
    console.log('[Auth] OAuth response URL received');

    const session = extractSessionFromUrl(responseUrl);
    if (!session) {
      console.error('[Auth] Could not extract session from URL');
      setAuthError("Session konnte nicht extrahiert werden. Prüfe die Supabase-Konfiguration.");
      return;
    }

    console.log('[Auth] Session extracted, setting auth state...');
    await setAuthState(session);
    const modal = document.getElementById("authModal");
    if (modal) modal.classList.add("hidden");
  });
}

async function handleSignOut() {
  setAuthError("");
  await ensureAuthFresh();
  try {
    if (authState && authState.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${authState.access_token}`
        }
      });
    }
  } catch (_) {}
  await clearAuth();
}

async function handleDeleteAccount() {
  setAuthError("");
  await ensureAuthFresh();
  if (!authState || !authState.access_token) {
    setAuthError("Kein Login aktiv.");
    return;
  }
  const sure = confirm("Konto wirklich löschen?");
  if (!sure) return;
  const deleteData = confirm("Analysen auch löschen?");
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${BACKEND_URL}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authState.access_token}`
      },
      body: JSON.stringify({
        action: "delete_account",
        device_id: deviceId,
        delete_data: deleteData
      })
    });
    if (!res.ok) throw new Error("delete_failed");
    await clearAuth();
    const modal = document.getElementById("authModal");
    if (modal) modal.classList.add("hidden");
  } catch (_) {
    setAuthError("Konto konnte nicht gelöscht werden.");
  }
}

async function sendMagicLink(email) {
  console.log('[Auth] Sending magic link to:', email);
  const redirectUrl = "https://medienradar-backend.vercel.app/auth-callback.html";
  console.log('[Auth] Magic link redirect URL:', redirectUrl);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectUrl)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectUrl
      }
    })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('[Auth] Magic link failed:', res.status, errorData);
    throw new Error(errorData.error_description || errorData.msg || "otp_failed");
  }
  console.log('[Auth] Magic link sent successfully');
  return true;
}

function extractSessionFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hash = new URLSearchParams((url.hash || "").replace(/^#/, ""));
    const query = url.searchParams;
    const access_token = hash.get("access_token") || query.get("access_token");
    const refresh_token = hash.get("refresh_token") || query.get("refresh_token");
    const expires_in = parseInt(hash.get("expires_in") || query.get("expires_in") || "0", 10);
    if (access_token && refresh_token) {
      return {
        access_token,
        refresh_token,
        expires_in
      };
    }
  } catch (_) {}
  return null;
}

async function verifyMagicLinkFromUrl(raw) {
  const sessionFromUrl = extractSessionFromUrl(raw);
  if (sessionFromUrl) {
    const now = Math.floor(Date.now() / 1000);
    return {
      ...sessionFromUrl,
      expires_at: sessionFromUrl.expires_in ? now + sessionFromUrl.expires_in : null,
      user: authState?.user || null
    };
  }
  let token = "";
  let type = "magiclink";
  try {
    const url = new URL(raw);
    token = url.searchParams.get("token") || "";
    type = url.searchParams.get("type") || type;
  } catch (_) {}
  if (!token) return null;
  console.log('[Auth] Verifying magic link token...');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ type, token })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error('[Auth] Verify failed:', res.status, errorData);
    throw new Error(errorData.error_description || "verify_failed");
  }
  const data = await res.json();
  console.log('[Auth] Magic link verified successfully');
  return data;
}

async function refreshAuth(refreshToken) {
  if (!refreshToken) return false;
  try {
    console.log('[Auth] Refreshing auth token...');
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) {
      console.warn('[Auth] Token refresh failed:', res.status);
      return false;
    }
    const data = await res.json();
    console.log('[Auth] Token refreshed successfully');
    await setAuthState(data);
    return true;
  } catch (e) {
    console.error('[Auth] Token refresh error:', e);
    return false;
  }
}

async function setAuthState(session) {
  if (!session || !session.access_token || !session.refresh_token) {
    await clearAuth();
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at || (session.expires_in ? now + session.expires_in : null);
  let user = session.user || authState?.user || null;
  if (!user) {
    user = await fetchAuthUser(session.access_token);
  }
  authState = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: expiresAt,
    user: user
  };
  await chrome.storage.local.set({ auth: authState });
  updateAuthUI();
  try {
    const claimed = await claimDeviceHistory();
    if (claimed > 0) {
      await markUnsyncedHistoryAsSynced();
    } else {
      await syncUnsyncedHistory();
    }
  } catch (_) {}
  try { await loadDashboard(); } catch (_) {}
  try { await loadMedienlage(); } catch (_) {}
}

async function fetchAuthUser(accessToken) {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${accessToken}`
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function clearAuth() {
  authState = null;
  await chrome.storage.local.remove(['auth']);
  updateAuthUI();
  try { await loadDashboard(); } catch (_) {}
  try { await loadMedienlage(); } catch (_) {}
}

async function syncHistoryRemote(payload) {
  await ensureAuthFresh();
  // Sync with device_id always, add user_id if logged in
  try {
    const deviceId = await getDeviceId();
    const body = {
      device_id: deviceId,
      platform: "extension",
      ...payload // includes source (e.g. 'debate_cta' or 'web')
    };
    // Add user_id if logged in
    if (authState?.access_token && !authState.user) {
      authState.user = await fetchAuthUser(authState.access_token);
      if (authState.user) {
        await chrome.storage.local.set({ auth: authState });
      }
    }
    if (authState?.user?.id) {
      body.user_id = authState.user.id;
    }
    const headers = { "Content-Type": "application/json" };
    if (authState?.access_token) {
      headers["Authorization"] = `Bearer ${authState.access_token}`;
    }
    console.log('[Sync] Sending history to backend', { device_id: deviceId, user_id: body.user_id, source: payload.source });
    await fetch(`${BACKEND_URL}/history`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('[Sync] Failed to sync history:', e);
  }
}

async function syncUnsyncedHistory() {
  if (!authState?.user?.id) return;
  try {
    const data = await chrome.storage.local.get(['history']);
    const history = data.history || [];
    const unsynced = history.filter(e => !e.synced_with_user && e._analysis);
    if (unsynced.length === 0) return;
    console.log(`[Sync] Retroactively syncing ${unsynced.length} analyses with user account...`);
    for (const entry of unsynced) {
      await syncHistoryRemote({
        analysis: entry._analysis,
        url: entry.url,
        title: entry.title,
        domain: entry.domain,
        image_url: entry._image_url || null,
        total_score: entry._analysis?.total_score?.value ?? null,
        source: entry.source || 'web',
      });
      entry.synced_with_user = true;
    }
    await chrome.storage.local.set({ history });
    console.log('[Sync] Retroactive sync complete.');
  } catch (e) {
    console.error('[Sync] Retroactive sync error:', e);
  }
}

async function markUnsyncedHistoryAsSynced() {
  try {
    const data = await chrome.storage.local.get(['history']);
    const history = data.history || [];
    let changed = false;
    for (const entry of history) {
      if (entry && entry._analysis && !entry.synced_with_user) {
        entry.synced_with_user = true;
        changed = true;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ history });
    }
  } catch (_) {}
}

async function claimDeviceHistory() {
  if (!authState?.access_token) return 0;
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${BACKEND_URL}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authState.access_token}`
      },
      body: JSON.stringify({
        action: "claim_device_history",
        device_id: deviceId
      })
    });
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return data.updated || 0;
  } catch (_) {
    return 0;
  }
}

async function fetchHistoryRemote() {
  await ensureAuthFresh();
  try {
    const deviceId = await getDeviceId();
    const params = new URLSearchParams({ device_id: deviceId });
    // Add user_id if logged in - backend will merge both device and user history
    if (authState?.user?.id) {
      params.set('user_id', authState.user.id);
    }
    const url = `${BACKEND_URL}/history?${params.toString()}`;
    console.log('[Sync] Fetching history from backend...');
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[Sync] Fetch history failed:', res.status);
      return null;
    }
    const data = await res.json();
    console.log('[Sync] Received', data.data?.length || 0, 'history entries');
    return Array.isArray(data.data) ? data.data : null;
  } catch (e) {
    console.error('[Sync] Fetch history error:', e);
    return null;
  }
}

async function getHistoryData() {
  const remoteRows = await fetchHistoryRemote();
  if (remoteRows && remoteRows.length) return normalizeRemoteHistory(remoteRows);
  const data = await chrome.storage.local.get(['history']);
  return data.history || [];
}

function normalizeRemoteHistory(rows) {
  return rows.map((row) => {
    const analysis = row.analysis || {};
    const totalScore = row.total_score ?? analysis.total_score?.value ?? analysis.total_score ?? 0;
    const title = row.title || analysis.article_title || analysis.original_headline || analysis.headline || analysis.title || "Unbekannter Artikel";
    const url = row.url || "";
    const domain = row.domain || safeDomainFromUrl(url) || "—";
    return {
      id: row.id || Date.parse(row.created_at || "") || Date.now(),
      date: formatDateShort(row.created_at) || new Date().toLocaleDateString('de-DE'),
      time: formatTimeShort(row.created_at) || '',
      title,
      domain,
      url,
      score: totalScore,
      source: row.source || 'web',
      topic: row.topic || analysis.topic || '',
      analysis: row.analysis || null,
      image_url: row.image_url || null
    };
  });
}

function safeDomainFromUrl(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace('www.', '');
  } catch (_) {
    return "";
  }
}

function getScoreRingClass(val) {
  if (val >= 90) return "score-green";
  if (val >= 75) return "score-green";
  if (val >= 60) return "score-lime";
  if (val >= 45) return "score-yellow";
  if (val >= 30) return "score-orange";
  return "score-red";
}

function buildTopSources(history) {
  const counts = {};
  history.forEach(h => {
    if (!h.domain) return;
    counts[h.domain] = (counts[h.domain] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));
}

function renderTopSourcesList(listEl, sources) {
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!sources || sources.length === 0) {
    listEl.innerHTML = "<div style='padding:10px; text-align:center; color:var(--text-muted); font-size:13px;'>Noch keine Daten.</div>";
    return;
  }
  sources.slice(0, 5).forEach((item, index) => {
    const div = document.createElement("div");
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px;";
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="color:var(--text-muted); font-weight:600; width:10px;">${index + 1}.</span>
        <span style="color:var(--text-main);">${item.domain}</span>
      </div>
      <span style="background:var(--bg-hover); padding:2px 8px; border-radius:10px; font-size:11px; color:var(--text-muted);">${item.count}x</span>
    `;
    listEl.appendChild(div);
  });
}

function renderCommunityRanking(listEl, ranking, limit) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!ranking || ranking.length === 0) {
    listEl.innerHTML = "<div style='padding:10px; text-align:center; color:var(--text-muted); font-size:13px;'>Noch keine Daten.</div>";
    return;
  }

  // Normalize API fields
  const items = ranking.map(item => ({
    domain: item.domain || '',
    score: Math.round(item.avg_total_score || item.avg_score || item.score || 0),
    count: item.count || 0,
    clickbait: item.avg_clickbait,
    facts: item.avg_facts,
    neutrality: item.avg_neutrality,
    emotion: item.avg_emotion,
    delta: item.delta_total_score,
    trends: item.trends || null
  }));

  // --- PODIUM (Top 3) ---
  if (items.length >= 3) {
    const podium = document.createElement("div");
    podium.className = "rank-podium";
    // Order: 2nd | 1st | 3rd
    const podiumOrder = [1, 0, 2];
    const barClasses = ['second', 'first', 'third'];
    const podiumLabels = ['2', '1', '3'];
    podiumOrder.forEach((idx, i) => {
      const p = items[idx];
      const scColor = p.score >= 80 ? '#69F0AE' : p.score >= 60 ? '#ffab40' : '#FF5252';
      const col = document.createElement("div");
      col.className = "rank-podium-item";
      col.innerHTML = `
        ${idx === 0 ? '<span class="material-icons-outlined rank-podium-crown">emoji_events</span>' : ''}
        <div class="rank-podium-name">${p.domain}</div>
        <div class="rank-podium-score" style="color:${scColor}">${p.score}</div>
        <div class="rank-podium-bar ${barClasses[i]}">${podiumLabels[i]}</div>
      `;
      podium.appendChild(col);
    });
    listEl.appendChild(podium);
  }

  // --- LIST (items after podium) ---
  const max = limit || 5;
  const startIdx = items.length >= 3 ? 3 : 0;
  const endIdx = Math.min(items.length, max);

  for (let index = startIdx; index < endIdx; index++) {
    const item = items[index];
    const div = document.createElement("div");
    div.className = "rank-tile";
    div.style.animationDelay = `${0.1 + (index - startIdx) * 0.08}s`;

    const scoreClass = item.score >= 80 ? "score-high" : item.score >= 60 ? "score-mid" : "score-low";
    const trendGrid = buildTrendGrid(item);

    div.innerHTML = `
      <div class="rank-box">${index + 1}</div>
      <div class="rank-pub">
        <div class="rank-pub-name">${item.domain}</div>
        <div class="rank-trend-grid">${trendGrid}</div>
      </div>
      <div class="rank-score-col">
        <div class="rank-score-val ${scoreClass}">${item.score}</div>
        <div class="rank-score-sub">Score</div>
      </div>
    `;
    listEl.appendChild(div);
  }
}

function buildTrendGrid(item) {
  const chipData = [
    { label: "Clickbait", value: item.clickbait, inverted: true, trendKey: "clickbait" },
    { label: "Informationsgehalt", value: item.facts, inverted: false, trendKey: "info" },
    { label: "Objektivität", value: item.neutrality, inverted: false, trendKey: "objectivity" },
    { label: "Emotionalität", value: item.emotion, inverted: true, trendKey: "emotion" }
  ];

  return chipData.map(({ label, value, inverted, trendKey }) => {
    let iconName, iconClass;

    // Use pre-computed trends if available (local/mock data)
    if (item.trends && item.trends[trendKey]) {
      const t = item.trends[trendKey];
      if (t === "neutral" || t === "flat") {
        iconName = "trending_flat";
        iconClass = "trend-flat";
      } else {
        const isUp = t === "up";
        iconName = isUp ? "trending_up" : "trending_down";
        iconClass = inverted
          ? (isUp ? "trend-up-bad" : "trend-down-good")
          : (isUp ? "trend-up-good" : "trend-down-bad");
      }
    } else if (value != null) {
      // Derive trend from absolute dimension score
      if (inverted) {
        // Clickbait/Emotion: low = good(down-arrow green), high = bad(up-arrow red)
        if (value <= 25) { iconName = "trending_down"; iconClass = "trend-down-good"; }
        else if (value >= 50) { iconName = "trending_up"; iconClass = "trend-up-bad"; }
        else { iconName = "trending_flat"; iconClass = "trend-flat"; }
      } else {
        // Facts/Neutrality: high = good(up-arrow green), low = bad(down-arrow red)
        if (value >= 75) { iconName = "trending_up"; iconClass = "trend-up-good"; }
        else if (value <= 50) { iconName = "trending_down"; iconClass = "trend-down-bad"; }
        else { iconName = "trending_flat"; iconClass = "trend-flat"; }
      }
    } else {
      iconName = "trending_flat";
      iconClass = "trend-flat";
    }

    return `<div class="rank-trend-chip">
      <span class="rank-trend-label">${label}</span>
      <span class="material-icons-outlined rank-trend-icon ${iconClass}">${iconName}</span>
    </div>`;
  }).join("");
}

// --- WINDOW CHIPS HELPER ---
function initWindowChips(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const windows = [
    { label: '7 Tage', days: 7 },
    { label: '30 Tage', days: 30 },
    { label: 'Gesamt', days: 0 }
  ];
  windows.forEach((w, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (i === 0 ? ' active-chip' : '');
    chip.textContent = w.label;
    chip.style.cursor = 'pointer';
    if (i === 0) chip.style.background = 'rgba(0, 191, 166, 0.3)';
    chip.addEventListener('click', () => {
      el.querySelectorAll('.chip').forEach(c => {
        c.classList.remove('active-chip');
        c.style.background = 'rgba(0, 191, 166, 0.12)';
      });
      chip.classList.add('active-chip');
      chip.style.background = 'rgba(0, 191, 166, 0.3)';
      onChange(w.days);
    });
    el.appendChild(chip);
  });
}

// --- OVERALL RANKING LOADER (with window chip support) ---
async function loadOverallRanking(days) {
  const d = days || 7;
  const url = d > 0
    ? `${BACKEND_URL}/community-ranking?days=${d}&delta_days=${d}`
    : `${BACKEND_URL}/community-ranking?delta_days=30`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    const ranking = Array.isArray(json?.data) ? json.data : [];
    window._lastOverallRanking = ranking;
    const list = document.getElementById('rankingOverallList');
    if (list) renderCommunityRanking(list, ranking, window._rankingShowAll ? 999 : 5);
    const toggle = document.getElementById('rankingToggleBtn');
    if (toggle) toggle.classList.toggle('hidden', ranking.length <= 5);
  } catch (_) { /* silent */ }
}

// --- TOPIC RANKING LOADER ---
// Uses the dedicated topic-ranking endpoint which reads from analysis_topic_daily.
// Only returns media houses that actually have articles in the selected topic/ressort.
async function loadTopicRanking(topic, days) {
  window._topicRankingLoaded = true;
  const t = topic || document.getElementById('topicSelect')?.value || 'politik_de';
  const d = days || window._topicDays || 7;
  const params = new URLSearchParams({ topic: t });
  if (d > 0) {
    params.set('days', d);
    params.set('trend_days', d);
  } else {
    params.set('days', '0');
  }
  params.set('limit', '30');
  const url = `${BACKEND_URL}/topic-ranking?${params.toString()}`;
  const list = document.getElementById('topicRankingList');
  if (list) list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px;">Lade...</div>';
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (list) list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:13px;">Keine Daten für dieses Ressort.</div>';
      return;
    }
    const json = await res.json();
    const rawData = Array.isArray(json?.data) ? json.data : [];
    // Normalize topic-ranking fields: media_house → domain (for renderCommunityRanking)
    const ranking = rawData.map(item => ({
      domain: item.media_house || item.domain || '',
      count: item.count || 0,
      avg_total_score: item.avg_total_score,
      avg_clickbait: item.avg_clickbait,
      avg_facts: item.avg_facts,
      avg_neutrality: item.avg_neutrality,
      avg_emotion: item.avg_emotion,
      delta_total_score: item.delta_total_score
    }));
    window._lastTopicRanking = ranking;
    if (ranking.length === 0) {
      if (list) list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:13px;">Noch keine Artikel im Ressort „' + t.charAt(0).toUpperCase() + t.slice(1) + '" analysiert.</div>';
      const toggle = document.getElementById('topicToggleBtn');
      if (toggle) toggle.classList.add('hidden');
      return;
    }
    if (list) renderCommunityRanking(list, ranking, window._topicShowAll ? 999 : 5);
    const toggle = document.getElementById('topicToggleBtn');
    if (toggle) toggle.classList.toggle('hidden', ranking.length <= 5);
  } catch (_) {
    if (list) list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:13px;">Fehler beim Laden.</div>';
  }
}

// --- MEINE ANALYSEN LOGIK ---
function isDebateSource(source) {
  return source && source.startsWith('debate_');
}

const TOPIC_LABELS = {
  politik_de: 'Politik (DE)', politik_int: 'Politik (Int.)', economy: 'Wirtschaft',
  sport: 'Sport', culture_media: 'Kultur & Medien', tech_ai: 'Tech & KI',
  science_edu: 'Wissenschaft', health: 'Gesundheit', climate: 'Klima & Umwelt',
  finance_markets: 'Finanzen', security: 'Sicherheit', war_conflict: 'Krieg & Konflikte'
};

// State for Meine Analysen
window._maSelectionMode = false;
window._maSelectedIds = new Set();
window._maSearchQuery = '';
window._maAllHistory = [];
window._maFilteredHistory = [];

function dashboardAdvice(total, avg, isDebate) {
  if (isDebate) {
    if (total === 0) return 'Noch keine Debatten-Radar-Analysen. Tippe auf \u201EAnalysieren\u201C, um zu helfen.';
    return 'Diese Analysen stammen aus dem Debatten Radar und z\u00E4hlen nicht in deinen pers\u00F6nlichen Mix.';
  }
  if (total === 0) return 'Scanne deine ersten Artikel, um eine Analyse zu erhalten.';
  if (avg >= 80) return 'Top! Deine Medien-Di\u00E4t ist sehr hochwertig und faktenbasiert.';
  if (avg >= 60) return 'Gut. Du informierst dich \u00FCberwiegend seri\u00F6s, mit etwas Meinung.';
  if (avg >= 40) return 'Durchwachsen. Achte darauf, ob deine Quellen dich emotionalisieren wollen.';
  return 'Kritisch. Du konsumierst viel Clickbait oder einseitige Berichterstattung.';
}

function filterHistoryByQuery(entries, query) {
  if (!query) return entries;
  const q = query.toLowerCase().trim();
  if (!q) return entries;
  // Score keywords
  if (['gut','stark','hochwertig','qualit\u00E4t'].includes(q)) return entries.filter(e => e.score >= 75);
  if (['clickbait','schlecht','kritisch','rei\u00DFerisch'].includes(q)) return entries.filter(e => e.score < 45);
  if (['mittel','okay','durchschnitt'].includes(q)) return entries.filter(e => e.score >= 45 && e.score < 75);
  const words = q.split(/\s+/).filter(Boolean);
  return entries.filter(e => {
    const fields = [e.title, e.domain, e.url, e.topic || '', TOPIC_LABELS[e.topic] || ''].map(f => (f||'').toLowerCase());
    if (words.length > 1) return words.every(w => fields.some(f => f.includes(w)));
    return fields.some(f => f.includes(q));
  });
}

async function loadDashboard() {
  const loadEl = document.getElementById('maLoading');
  const emptyEl = document.getElementById('maEmpty');
  const contentEl = document.getElementById('maContent');
  if (loadEl) loadEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) contentEl.classList.add('hidden');

  const allHistory = await getHistoryData();
  const showDebate = window._historyTabIndex ? window._historyTabIndex() === 1 : false;
  const history = allHistory.filter(h => showDebate ? isDebateSource(h.source) : !isDebateSource(h.source));
  window._maAllHistory = history;

  if (loadEl) loadEl.classList.add('hidden');

  if (history.length === 0) {
    if (emptyEl) {
      emptyEl.classList.remove('hidden');
      const t = document.getElementById('maEmptyTitle');
      const p = document.getElementById('maEmptyText');
      if (t) t.textContent = showDebate ? 'Noch keine Debatten-Analysen' : 'Noch keine Analysen';
      if (p) p.textContent = showDebate
        ? 'Tippe im Debatten Radar auf \u201EAnalysieren\u201C, um deinen Beitrag zu leisten.'
        : 'Sobald du einen Artikel analysierst, erscheint er hier automatisch.';
    }
    return;
  }
  if (contentEl) contentEl.classList.remove('hidden');

  const total = history.length;
  const avg = Math.round(history.reduce((a,b) => a + b.score, 0) / total);

  const elTotal = document.getElementById('dashTotal'); if(elTotal) elTotal.innerText = total;
  const elAvg = document.getElementById('dashAvg'); if(elAvg) elAvg.innerText = avg;
  const adviceEl = document.getElementById('dashAdvice');
  if(adviceEl) adviceEl.innerText = dashboardAdvice(total, avg, showDebate);

  // Qualitaets-Mix
  const green = history.filter(h => h.score >= 80).length;
  const yellow = history.filter(h => h.score >= 60 && h.score < 80).length;
  const pGreen = Math.round((green / total) * 100);
  const pYellow = Math.round((yellow / total) * 100);
  const pRed = 100 - pGreen - pYellow;
  const bGreen = document.getElementById('barGreen'); if(bGreen) bGreen.style.width = Math.max(pGreen, green ? 3 : 0) + "%";
  const bYellow = document.getElementById('barYellow'); if(bYellow) bYellow.style.width = Math.max(pYellow, yellow ? 3 : 0) + "%";
  const bRed = document.getElementById('barRed'); if(bRed) bRed.style.width = Math.max(pRed, (total - green - yellow) ? 3 : 0) + "%";
  const lGreen = document.getElementById('labelGreen'); if(lGreen) lGreen.innerText = pGreen + "% Stark";
  const lYellow = document.getElementById('labelYellow'); if(lYellow) lYellow.innerText = pYellow + "% Mittel";
  const lRed = document.getElementById('labelRed'); if(lRed) lRed.innerText = pRed + "% Kritisch";

  // Top Quellen
  renderTopSourcesList(document.getElementById('topSourcesList'), buildTopSources(history));

  // Ressort-Mix
  const topicCounts = {};
  history.forEach(h => {
    const raw = h.topic || '';
    if (!raw) return;
    const label = TOPIC_LABELS[raw] || raw;
    topicCounts[label] = (topicCounts[label] || 0) + 1;
  });
  const topTopics = Object.entries(topicCounts).sort((a,b) => b[1] - a[1]);
  const topicTotal = topTopics.reduce((s,t) => s + t[1], 0);
  const topicList = document.getElementById('topTopicsList');
  if (topicList) {
    topicList.innerHTML = '';
    if (topTopics.length === 0) {
      topicList.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">Noch keine Ressort-Daten.</div>';
    } else {
      topTopics.slice(0, 5).forEach(([label, count]) => {
        const pct = topicTotal === 0 ? 0 : Math.round((count / topicTotal) * 100);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; font-size:13px;';
        row.innerHTML = `<span style="color:rgba(255,255,255,0.7); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span><span style="color:rgba(255,255,255,0.5); flex-shrink:0; margin-left:8px;">${pct}%</span>`;
        topicList.appendChild(row);
      });
    }
  }

  // Verlauf
  renderMaHistory();
}

function renderMaHistory() {
  const history = window._maAllHistory || [];
  const filtered = filterHistoryByQuery(history, window._maSearchQuery);
  window._maFilteredHistory = filtered;
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="hist-no-results">Keine Treffer.</div>';
    return;
  }

  const selMode = window._maSelectionMode;
  filtered.forEach(h => {
    let color = '#FF5252';
    if (h.score >= 80) color = '#69F0AE'; else if (h.score >= 60) color = '#fbbf24';

    const div = document.createElement('div');
    div.className = 'hist-item';

    if (selMode) {
      const circle = document.createElement('div');
      circle.className = 'hist-select-circle' + (window._maSelectedIds.has(h.id) ? ' selected' : '');
      if (window._maSelectedIds.has(h.id)) {
        circle.innerHTML = '<span class="material-icons-outlined" style="font-size:14px; color:#000;">check</span>';
      }
      circle.addEventListener('click', (e) => { e.stopPropagation(); toggleMaSelection(h.id); });
      div.appendChild(circle);
    }

    const scoreEl = document.createElement('div');
    scoreEl.className = 'hist-score';
    scoreEl.style.color = color;
    scoreEl.style.borderColor = color;
    scoreEl.textContent = h.score;
    div.appendChild(scoreEl);

    const infoEl = document.createElement('div');
    infoEl.className = 'hist-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'hist-title';
    titleEl.textContent = h.title || 'Analyse';
    const metaEl = document.createElement('div');
    metaEl.className = 'hist-meta';
    const parts = [];
    if (h.domain) parts.push(h.domain);
    if (isDebateSource(h.source)) parts.push('Debatten-Radar');
    if (h.date) parts.push(h.date);
    if (h.time) parts.push(h.time);
    metaEl.innerHTML = parts.map((p, i) => i === 0 ? `<span>${p}</span>` : `<span>\u00B7 ${p}</span>`).join('');
    infoEl.appendChild(titleEl);
    infoEl.appendChild(metaEl);
    div.appendChild(infoEl);

    if (!selMode) {
      const delBtn = document.createElement('button');
      delBtn.className = 'hist-delete-btn';
      delBtn.innerHTML = '<span class="material-icons-outlined" style="font-size:20px;">delete_outline</span>';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteEntry(h); });
      div.appendChild(delBtn);
    }

    div.addEventListener('click', () => {
      if (selMode) { toggleMaSelection(h.id); return; }
      if (h.analysis) { showHistoryScorecard(h); return; }
      if (h.url) window.open(h.url, '_blank');
    });
    list.appendChild(div);
  });

  // Update delete button state
  const delBtn = document.getElementById('maDeleteSelected');
  if (delBtn) delBtn.disabled = window._maSelectedIds.size === 0;
}

function toggleMaSelection(id) {
  if (window._maSelectedIds.has(id)) window._maSelectedIds.delete(id);
  else window._maSelectedIds.add(id);
  renderMaHistory();
}

function setMaSelectionMode(on) {
  window._maSelectionMode = on;
  window._maSelectedIds.clear();
  const controls = document.getElementById('maControls');
  const selBar = document.getElementById('maSelectionBar');
  if (controls) controls.classList.toggle('hidden', on);
  if (selBar) selBar.classList.toggle('hidden', !on);
  renderMaHistory();
}

async function confirmDeleteEntry(entry) {
  const title = entry.title || 'Analyse';
  if (!confirm(`"${title}" wird dauerhaft entfernt.`)) return;
  await deleteHistoryEntry(entry.id);
  loadDashboard();
}

async function deleteSelectedEntries() {
  const ids = [...window._maSelectedIds];
  if (ids.length === 0) return;
  if (!confirm(`${ids.length} Eintr\u00E4ge dauerhaft l\u00F6schen?`)) return;
  for (const id of ids) await deleteHistoryEntry(id);
  setMaSelectionMode(false);
  loadDashboard();
}

async function deleteHistoryEntry(id) {
  try {
    const token = authState && authState.access_token;
    if (token) {
      await fetch(`${BACKEND_URL}/analysis-history?id=${id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch(_) {}
  // Also remove from local storage
  const data = await chrome.storage.local.get(['history']);
  const local = data.history || [];
  await chrome.storage.local.set({ history: local.filter(h => h.id !== id) });
}

// --- MEDIENLAGE LOGIK ---
async function loadMedienlage() {
  const statusEl = document.getElementById("mediaStatus");
  if (statusEl) statusEl.innerText = "Lade Medienlage ...";

  const remote = await loadMedienlageRemote();
  if (remote) {
    if (statusEl) statusEl.innerText = "Quelle: Vercel/Supabase";
    renderMedienlageRemote(remote);
    return;
  }

  if (statusEl) statusEl.innerText = "Quelle: Lokaler Verlauf";
  const history = await getHistoryData();
  renderMedienlageLocal(history);
}

async function loadMedienlageRemote() {
  try {
    const [weatherRes, debateRes, rankingRes, historyRes] = await Promise.allSettled([
      fetch(`${BACKEND_URL}/media-weather-latest`),
      fetch(`${BACKEND_URL}/debate-radar-latest`),
      fetch(`${BACKEND_URL}/community-ranking?days=7&delta_days=7`),
      fetch(`${BACKEND_URL}/media-weather-history?days=7`),
    ]);

    const safeJson = async (res) => {
      if (!res || res.status !== 'fulfilled' || !res.value) return null;
      if (!res.value.ok) return null;
      try { return await res.value.json(); } catch (_) { return null; }
    };

    const weatherJson = await safeJson(weatherRes);
    const debateJson = await safeJson(debateRes);
    const rankingJson = await safeJson(rankingRes);
    const historyJson = await safeJson(historyRes);

    const weather = weatherJson?.data || null;
    const debate = debateJson?.data || null;
    const ranking = Array.isArray(rankingJson?.data) ? rankingJson.data : null;
    const weatherHistory = Array.isArray(historyJson?.data) ? historyJson.data : null;

    // Attach history to weather object
    if (weather && weatherHistory) {
      weather.history = weatherHistory;
    }

    if (!weather && !debate && !ranking) return null;
    return { weather, debate, ranking };
  } catch (_) {
    return null;
  }
}

function renderMedienlageRemote(remote) {
  const empty = document.getElementById("medienlageEmpty");
  const content = document.getElementById("medienlageContent");
  if (empty) empty.classList.add("hidden");
  if (content) content.classList.remove("hidden");

  // --- Medienwetter ---
  const weather = remote.weather;
  if (weather) {
    const avgScore = Math.round(weather.weather_score || 0);
    const wm = getWeatherMeta(avgScore);
    animateGauge(avgScore);

    const labelEl   = document.getElementById("mediaWeatherLabel");
    const summaryEl = document.getElementById("mediaWeatherSummary");
    const metaEl    = document.getElementById("mediaWeatherMeta");
    if (labelEl)   labelEl.innerText = weather.label || wm.label;
    if (summaryEl) summaryEl.innerText = wm.summary;
    if (metaEl) {
      const n = weather.headline_count || weather.article_count || weather.total_articles || "";
      const m = weather.source_count  || weather.total_sources  || "";
      const stamp = formatTimeShort(weather.created_at);
      metaEl.innerText = n
        ? `Berechnet aus ${n} Schlagzeilen${m ? ` von ${m} Medienh\u00e4usern` : ''} \u00b7 Stand ${stamp || '\u2014'}`
        : `Snapshot: ${stamp || '\u2014'}`;
    }

    // --- Detaillierte Analyse ---
    renderWeatherMetrics(weather);

    // --- 7-Tage-Verlauf ---
    renderWeatherTrend(weather);
  }

  // --- Debatten ---
  renderDebateList(remote.debate?.clusters || []);

  // --- Ranking ---
  const rankingList = document.getElementById("rankingOverallList");
  const rankingData = remote.ranking || [];
  window._lastOverallRanking = rankingData;
  if (rankingList) {
    renderCommunityRanking(rankingList, rankingData, window._rankingShowAll ? 999 : 5);
  }
  const rankToggle = document.getElementById('rankingToggleBtn');
  if (rankToggle) rankToggle.classList.toggle('hidden', rankingData.length <= 5);
}

// Shared debate renderer used by both remote + local
function renderDebateList(clusters) {
  const list = document.getElementById("debateList");
  if (!list) return;
  list.innerHTML = "";

  if (!clusters.length) {
    list.innerHTML = "<div class='subtle-text'>Noch keine Debatten erkannt.</div>";
    return;
  }

  clusters.slice(0, 5).forEach((c, i) => {
    const topic        = c.topic || "Unbekanntes Thema";
    const articles     = c.count || c.article_count || 0;
    const sources      = c.source_count  || 0;
    // heat 0-100: 0 = cold, 100 = hot (backend field: tone_score)
    const heat         = c.tone_score ?? c.heat ?? c.avg_sentiment_score ?? 50;
    const heatPct      = Math.max(0, Math.min(100, heat));
    const badgeInfo    = heatBadge(heatPct);

    const item = document.createElement("div");
    item.className = "debate-item";
    item.style.animationDelay = `${0.08 + i * 0.1}s`;

    item.innerHTML = `
      <div class="debate-header">
        <span class="debate-title">${topic}</span>
        <div class="debate-badge-row">
          <span class="debate-badge ${badgeInfo.cls}">${badgeInfo.text}</span>
          <span class="material-icons-outlined debate-chevron">chevron_right</span>
        </div>
      </div>
      <div class="debate-subtitle">${articles} Schlagzeilen${sources ? ` · ${sources} Medienhäuser` : ''}</div>
      <div class="temp-bar-wrap">
        <span class="temp-label">kalt</span>
        <div class="temp-bar">
          <div class="temp-seg"></div><div class="temp-seg"></div><div class="temp-seg"></div>
          <div class="temp-seg"></div><div class="temp-seg"></div><div class="temp-seg"></div>
          <div class="temp-seg"></div><div class="temp-seg"></div><div class="temp-seg"></div>
          <div class="temp-seg"></div>
          <div class="temp-dim" style="left:${heatPct}%"></div>
          <div class="temp-needle" style="left:${heatPct}%"></div>
        </div>
        <span class="temp-label">heiß</span>
      </div>
    `;
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => showClusterDetail(c));
    list.appendChild(item);
  });
}

function heatBadge(pct) {
  if (pct < 10) return { text: 'Kristallklar', cls: 'cool' };
  if (pct < 20) return { text: 'Klar',         cls: 'cool' };
  if (pct < 30) return { text: 'Ruhig',        cls: 'cool' };
  if (pct < 40) return { text: 'Mild',         cls: 'mild' };
  if (pct < 50) return { text: 'Warm',         cls: 'warm' };
  if (pct < 60) return { text: 'Angewärmt',    cls: 'warm' };
  if (pct < 70) return { text: 'Aufgeheizt',   cls: 'aufgeheizt' };
  if (pct < 80) return { text: 'Heiß',         cls: 'heiss' };
  if (pct < 90) return { text: 'Sehr heiß',    cls: 'heiss' };
  return               { text: 'Glühend',      cls: 'gluehend' };
}

function showClusterDetail(cluster) {
  const modal = document.getElementById('debateModal');
  const titleEl = document.getElementById('debateModalTitle');
  const bodyEl = document.getElementById('debateModalBody');
  if (!modal || !bodyEl) return;

  const topic = cluster.topic || 'Unbekannt';
  const count = cluster.count || cluster.article_count || 0;
  const sources = cluster.source_count || 0;

  if (titleEl) titleEl.textContent = topic;
  bodyEl.innerHTML = '';

  // Subtitle
  const sub = document.createElement('div');
  sub.className = 'cluster-detail-subtitle';
  sub.textContent = `${count} Schlagzeilen · ${sources} Medienhäuser`;
  bodyEl.appendChild(sub);

  // Analyzed articles section
  const articles = Array.isArray(cluster.articles) ? cluster.articles : [];
  if (articles.length) {
    const sec = document.createElement('div');
    sec.className = 'cluster-detail-section';
    sec.innerHTML = `<div class="cluster-detail-section-title">
      <span class="material-icons-outlined">analytics</span> Analysierte Artikel
    </div>`;
    articles.forEach((art, i) => {
      const score = art.analysis?.total_score?.value ?? art.analysis?.total_score ?? null;
      const headline = art.headline || art.title || 'Unbekannt';
      const source = art.source || '';
      const url = art.url || '';
      const card = document.createElement('div');
      card.className = 'cluster-article-card';
      card.style.animationDelay = `${i * 0.08}s`;

      let scoreColor = '#ef4444';
      if (score >= 75) scoreColor = '#22c55e';
      else if (score >= 60) scoreColor = '#84cc16';
      else if (score >= 45) scoreColor = '#fbbf24';
      else if (score >= 30) scoreColor = '#f97316';

      card.innerHTML = `
        ${score !== null ? `<div class="cluster-article-score" style="border: 2px solid ${scoreColor}; color: ${scoreColor};">
          ${Math.round(score)}<span>Score</span>
        </div>` : ''}
        <div class="cluster-article-info">
          <div class="cluster-article-headline">${escapeHtml(headline)}</div>
          <div class="cluster-article-source">${escapeHtml(source)}</div>
        </div>
      `;
      if (url) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => chrome.tabs.create({ url }));
      }
      sec.appendChild(card);
    });
    bodyEl.appendChild(sec);
  }

  // Headlines section
  const headlines = Array.isArray(cluster.headlines) ? cluster.headlines : [];
  // Filter out already-analyzed URLs
  const analyzedUrls = new Set(articles.map(a => a.url).filter(Boolean));
  const remaining = headlines.filter(h => !analyzedUrls.has(h.url));

  if (remaining.length) {
    const sec = document.createElement('div');
    sec.className = 'cluster-detail-section';
    sec.innerHTML = `<div class="cluster-detail-section-title">
      <span class="material-icons-outlined">bolt</span> Weitere Schlagzeilen
    </div>
    <div class="cluster-hilf-mit">
      <span class="material-icons-outlined" style="font-size:18px;color:#fb923c;flex-shrink:0">auto_awesome</span>
      <span>Hilf mit und analysiere folgende Artikel.</span>
    </div>`;

    // Show hint if some headlines were filtered out
    if (headlines.length !== remaining.length) {
      const hint = document.createElement('div');
      hint.className = 'cluster-filter-hint';
      hint.textContent = 'Bereits analysierte Artikel werden automatisch ausgeblendet.';
      sec.appendChild(hint);
    }

    const INITIAL_SHOW = 5;
    let showAll = false;

    function renderHeadlines() {
      // Remove old headline rows
      sec.querySelectorAll('.cluster-headline-row, .cluster-show-all-btn, .cluster-all-done').forEach(el => el.remove());

      const visible = showAll ? remaining : remaining.slice(0, INITIAL_SHOW);
      visible.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'cluster-headline-row';
        row.style.animationDelay = `${i * 0.06}s`;
        row.innerHTML = `
          <div class="cluster-headline-text">
            <div class="hl-source">${escapeHtml(h.source || '')}</div>
            <div class="hl-title">${escapeHtml(h.headline || '')}</div>
          </div>
          <button class="cluster-cta-btn">Analysieren</button>
        `;
        const ctaBtn = row.querySelector('.cluster-cta-btn');
        ctaBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (h.url) {
            // Mark this URL as debate-sourced so the analysis lands in the debate tab
            await chrome.storage.local.set({ debate_cta_url: h.url });
            chrome.tabs.create({ url: h.url, active: true });
            modal.classList.add('hidden');
          }
        });
        sec.appendChild(row);
      });

      if (remaining.length > INITIAL_SHOW) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'cluster-show-all-btn';
        toggleBtn.textContent = showAll ? 'Weniger anzeigen' : `Alle ${remaining.length} anzeigen`;
        toggleBtn.addEventListener('click', () => {
          showAll = !showAll;
          renderHeadlines();
        });
        sec.appendChild(toggleBtn);
      }
    }

    renderHeadlines();
    bodyEl.appendChild(sec);
  }

  // If everything is analyzed
  if (!remaining.length && articles.length) {
    const msg = document.createElement('div');
    msg.className = 'cluster-all-done';
    msg.textContent = 'Du hast bereits alle Schlagzeilen aus diesem Cluster analysiert.';
    bodyEl.appendChild(msg);
  }

  // If no content at all, show sample headlines
  if (!articles.length && !remaining.length && cluster.sample_headlines?.length) {
    const sec = document.createElement('div');
    sec.className = 'cluster-detail-section';
    sec.innerHTML = `<div class="cluster-detail-section-title">
      <span class="material-icons-outlined">bolt</span> Beispiel-Schlagzeilen
    </div>`;
    cluster.sample_headlines.forEach((hl, i) => {
      const row = document.createElement('div');
      row.className = 'cluster-headline-row';
      row.style.animationDelay = `${i * 0.06}s`;
      row.innerHTML = `<div class="cluster-headline-text">
        <div class="hl-title">${escapeHtml(typeof hl === 'string' ? hl : hl.headline || '')}</div>
      </div>`;
      sec.appendChild(row);
    });
    bodyEl.appendChild(sec);
  }

  modal.classList.remove('hidden');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderWeatherMetrics(weather) {
  const el = document.getElementById('mwDetails');
  if (!el) return;

  // Compute derived metrics from available data
  const emotion = weather.avg_emotion;
  const clickbait = weather.avg_clickbait;
  // Herdentrieb: estimated from how close emotion & clickbait are (both high = herd)
  const herd = (emotion != null && clickbait != null)
    ? Math.round(Math.min(emotion, clickbait) * 0.5) : null;
  // Breaking density: estimate from weather score components
  const breaking = weather.breaking_density ?? (emotion != null
    ? Math.round(emotion * 0.25) : null);
  // Extrem-Anteil: ratio of extreme scores
  const extreme = weather.extreme_ratio ?? (emotion != null
    ? Math.round(Math.max(0, emotion - 35) * 0.3) : null);

  const metrics = [
    { label: 'Emotion',       value: emotion },
    { label: 'Clickbait',     value: clickbait },
    { label: 'Herdentrieb',   value: herd },
    { label: 'Breaking',      value: breaking },
    { label: 'Extrem-Anteil', value: extreme },
  ];
  const scoreColor = getWeatherAccentColor(weather.weather_score || 0);
  el.innerHTML = `<div class="mw-metrics-grid">
    ${metrics.map(m => {
      const v = m.value != null ? Math.round(m.value) : null;
      return `<div class="mw-metric">
        <div class="mw-metric-row">
          <span class="mw-metric-label">${m.label}</span>
          <span class="mw-metric-value" style="color:${scoreColor}">${v != null ? v + '%' : '\u2013'}</span>
        </div>
        <div class="mw-metric-bar"><div class="mw-metric-fill" style="width:${v || 0}%;background:${scoreColor}"></div></div>
      </div>`;
    }).join('')}
  </div>`;
}

// HIGH score = bad (red), LOW score = good (green)
function getWeatherAccentColor(score) {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 45) return '#fbbf24';
  if (score >= 30) return '#84cc16';
  return '#22c55e';
}

function renderWeatherTrend(weather) {
  const el = document.getElementById('mwTrend');
  if (!el) return;
  // Use history from backend (media-weather-history endpoint)
  const history = weather.history || weather.trend || null;
  if (history && Array.isArray(history) && history.length >= 2) {
    // Group by day, take the latest snapshot per day
    const byDay = new Map();
    for (const h of history) {
      const day = h.created_at ? h.created_at.slice(0, 10) : null;
      if (day) byDay.set(day, h.weather_score || 0);
    }
    const points = Array.from(byDay.entries()).map(([date, score]) => ({ date, score }));
    if (points.length >= 2) {
      renderSparkline(el, points);
      return;
    }
  }
  // Fallback: local storage
  renderWeatherTrendFromLocal(el, weather.weather_score || 0);
}

async function renderWeatherTrendFromLocal(el, currentScore) {
  // Store current score in local weather history
  const stored = await chrome.storage.local.get(['weather_history']);
  const wh = stored.weather_history || [];
  const today = new Date().toISOString().slice(0, 10);
  if (!wh.length || wh[wh.length - 1].date !== today) {
    wh.push({ date: today, score: currentScore });
    if (wh.length > 7) wh.shift();
    await chrome.storage.local.set({ weather_history: wh });
  } else {
    wh[wh.length - 1].score = currentScore;
    await chrome.storage.local.set({ weather_history: wh });
  }
  if (wh.length < 2) {
    el.innerHTML = '<div class="mw-trend-empty">Noch kein Verlauf verfügbar.</div>';
    return;
  }
  renderSparkline(el, wh);
}

function renderSparkline(container, dataPoints) {
  const scores = dataPoints.map(d => d.score || d.weather_score || 0);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;
  const w = 260, h = 64, pad = 4;
  const stepX = (w - pad * 2) / (scores.length - 1);
  const scoreColor = getWeatherAccentColor(scores[scores.length - 1]);

  const points = scores.map((s, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((s - min) / range) * (h - pad * 2);
    return { x, y };
  });

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const fillD = lineD + ` L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`;
  const last = points[points.length - 1];

  // Day labels
  const dayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const todayIdx = new Date().getDay();
  const labels = dataPoints.map((d, i) => {
    if (i === dataPoints.length - 1) return 'Heute';
    const dateObj = d.date ? new Date(d.date) : null;
    if (dateObj && !isNaN(dateObj.getTime())) return dayNames[dateObj.getDay()];
    return '';
  });

  container.innerHTML = `
    <div class="mw-trend-header">Trend (7 Tage)</div>
    <div class="mw-sparkline-card">
      <svg viewBox="0 0 ${w} ${h}" class="mw-sparkline-svg">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${scoreColor}" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="${scoreColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${fillD}" fill="url(#sparkFill)"/>
        <path d="${lineD}" fill="none" stroke="${scoreColor}" stroke-width="2" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${last.x}" cy="${last.y}" r="3.8" fill="${scoreColor}" stroke="rgba(5,5,10,0.8)" stroke-width="1.5"/>
      </svg>
    </div>
    <div class="mw-sparkline-labels">
      ${labels.map(l => `<span>${l}</span>`).join('')}
    </div>
  `;
}

function renderMedienlageLocal(history) {
  const empty = document.getElementById("medienlageEmpty");
  const content = document.getElementById("medienlageContent");
  if (!history.length) {
    if (empty) empty.classList.remove("hidden");
    if (content) content.classList.add("hidden");
    return;
  }

  if (empty) empty.classList.add("hidden");
  if (content) content.classList.remove("hidden");

  const total = history.length;
  const avgScore = Math.round(history.reduce((a, b) => a + b.score, 0) / total);
  const wm = getWeatherMeta(avgScore);

  animateGauge(avgScore);

  const labelEl   = document.getElementById("mediaWeatherLabel");
  const summaryEl = document.getElementById("mediaWeatherSummary");
  const metaEl    = document.getElementById("mediaWeatherMeta");

  if (labelEl)   labelEl.innerText = wm.label;
  if (summaryEl) summaryEl.innerText = wm.summary;
  if (metaEl)    metaEl.innerText = `Berechnet aus ${total} Analysen · Letztes Update: ${history[0].date}`;

  // Build local debate clusters from topic extraction
  const topics = extractTopTopics(history, 5);
  const localClusters = topics.map(t => ({
    topic: t.charAt(0).toUpperCase() + t.slice(1),
    article_count: 0,
    source_count: 0,
    heat: 20 + (t.charCodeAt(0) % 60)
  }));
  renderDebateList(localClusters);

  const rankingList = document.getElementById("rankingOverallList");
  if (rankingList) {
    const sources = buildTopSources(history);
    const rankingData = sources.slice(0, 5).map((s) => ({
      domain: s.domain,
      avg_score: 50 + Math.floor(Math.random() * 40),
      count: s.count,
      trends: {
        clickbait: Math.random() > 0.5 ? "down" : "up",
        info: Math.random() > 0.5 ? "up" : "down",
        objectivity: Math.random() > 0.5 ? "up" : "down",
        emotion: Math.random() > 0.5 ? "down" : "up"
      }
    }));
    window._lastOverallRanking = rankingData;
    renderCommunityRanking(rankingList, rankingData, window._rankingShowAll ? 999 : 5);
  }
}

// Weather meta: HIGH score = BAD weather (more emotion/clickbait), LOW score = GOOD weather
function getWeatherMeta(score) {
  if (score >= 90) return {
    label: "Orkan", summary: "Extreme Verzerrung. Kaum belastbare Information.",
    gradientTop: "rgba(220, 38, 38, 0.35)", gradientBottom: "rgba(5, 5, 10, 0.8)"
  };
  if (score >= 80) return {
    label: "Schwerer Sturm", summary: "Stark emotional aufgeladen. Faktencheck dringend empfohlen.",
    gradientTop: "rgba(239, 68, 68, 0.3)", gradientBottom: "rgba(5, 5, 10, 0.75)"
  };
  if (score >= 70) return {
    label: "Gewitterfront", summary: "Hohe Clickbait- und Bias-Dichte. Vorsicht bei der Einordnung.",
    gradientTop: "rgba(239, 68, 68, 0.25)", gradientBottom: "rgba(5, 5, 10, 0.7)"
  };
  if (score >= 60) return {
    label: "St\u00fcrmisch", summary: "Erhöhter Clickbait und Meinung. Quellen genau prüfen.",
    gradientTop: "rgba(249, 115, 22, 0.25)", gradientBottom: "rgba(5, 5, 10, 0.65)"
  };
  if (score >= 50) return {
    label: "Frischer Wind", summary: "Durchmischte Qualität. Achte auf Emotionalisierung.",
    gradientTop: "rgba(251, 191, 36, 0.3)", gradientBottom: "rgba(5, 5, 10, 0.55)"
  };
  if (score >= 40) return {
    label: "Nieselregen / Tr\u00fcb", summary: "Die Sicht ist leicht eingeschränkt. Vereinzelt emotional.",
    gradientTop: "rgba(251, 191, 36, 0.25)", gradientBottom: "rgba(5, 5, 10, 0.6)"
  };
  if (score >= 30) return {
    label: "Diesig / Neblig", summary: "Die Sicht ist eingeschränkt. Fakten und Meinung verschwimmen.",
    gradientTop: "rgba(200, 180, 50, 0.25)", gradientBottom: "rgba(5, 5, 10, 0.55)"
  };
  if (score >= 20) return {
    label: "Bew\u00f6lkt / Bedeckt", summary: "Solide Qualität, vereinzelt emotionale Tendenzen.",
    gradientTop: "rgba(132, 204, 22, 0.25)", gradientBottom: "rgba(5, 5, 10, 0.55)"
  };
  if (score >= 10) return {
    label: "Heiter bis wolkig", summary: "Gute Tendenz mit einzelnen Ausreißern. Weiter so.",
    gradientTop: "rgba(34, 197, 94, 0.3)", gradientBottom: "rgba(5, 5, 10, 0.55)"
  };
  return {
    label: "Strahlend Sonnig", summary: "Außergewöhnlich hohe Qualität. Kaum Clickbait, sehr faktenstark.",
    gradientTop: "rgba(34, 197, 94, 0.4)", gradientBottom: "rgba(5, 5, 10, 0.5)"
  };
}

function extractTopTopics(history, limit = 6) {
  const stopwords = new Set([
    "und","der","die","das","ein","eine","einer","eines","mit","für","von","auf","im","in","am","an","aus",
    "zu","den","dem","des","ist","sind","war","wie","was","wer","bei","über","nach","vor","als","auch","noch",
    "nicht","nur","mehr","weniger","dass","oder","aber","sich","sein","haben","hat","wird","werden","gegen",
    "ihre","sein","seine","seinen","seiner","seinem","ihr","ihre","ihren","ihrem","ihres"
  ]);
  const counts = {};
  history.forEach(h => {
    if (!h.title) return;
    const words = h.title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stopwords.has(w));
    words.forEach(w => counts[w] = (counts[w] || 0) + 1);
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function formatDateShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString('de-DE');
}

function formatTimeShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// --- GAUGE ANIMATION (half-arc + dot) ---
function animateGauge(score) {
  const arc   = document.getElementById('mwArc');
  const dot   = document.getElementById('mwDot');
  const numEl = document.getElementById('mediaWeatherScore');
  if (!arc) return;

  const s = Math.max(0, Math.min(100, score));
  // Arc length ≈ π * 50 ≈ 157
  const maxLen = 157;
  // HIGH score = bad = more arc filled (right/red side)
  const pct = s / 100;                    // 0 = left (good), 1 = right (bad)
  const filled = pct * maxLen;
  arc.setAttribute('stroke-dasharray', `${filled} ${maxLen}`);

  // Move the indicator dot along the arc  (center 60,65  r=50)
  if (dot) {
    const angle = Math.PI * pct;          // 0 → π   (left → right)
    const cx = 60 - 50 * Math.cos(angle);
    const cy = 65 - 50 * Math.sin(angle);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    // Colour the dot: left=green, right=red
    const colors = ['#22c55e','#84cc16','#fbbf24','#f97316','#ef4444'];
    dot.setAttribute('fill', colors[Math.min(4, Math.floor(pct * 5))]);
  }

  // Animate number counting
  if (numEl) {
    const dur = 1400, t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      numEl.textContent = Math.round(ease * s);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  // Set hero background gradient to match score
  const hero = document.getElementById('mwHero');
  if (hero) {
    const meta = getWeatherMeta(s);
    hero.style.background =
      `linear-gradient(135deg, ${meta.gradientTop}, ${meta.gradientBottom})`;
  }

  // Set label colour: HIGH score = red (bad), LOW score = green (good)
  const labelEl = document.getElementById('mediaWeatherLabel');
  if (labelEl) {
    const colors = ['#22c55e','#84cc16','#fbbf24','#f97316','#ef4444'];
    labelEl.style.color = colors[Math.min(4, Math.floor(s / 20))];
  }

  // Weather icon with animations: HIGH score = storm, LOW score = sunny
  const iconEl = document.getElementById('mwWeatherIcon');
  if (iconEl) {
    // Remove old animation classes
    iconEl.classList.remove('anim-rotate', 'anim-pulse', 'anim-wobble', 'anim-shake');

    // Set icon + animation based on score (matching Backend tiers)
    if (s >= 90)       { iconEl.textContent = 'cyclone';            iconEl.classList.add('anim-rotate'); }
    else if (s >= 80)  { iconEl.textContent = 'tornado';            iconEl.classList.add('anim-shake'); }
    else if (s >= 70)  { iconEl.textContent = 'thunderstorm';       iconEl.classList.add('anim-shake'); }
    else if (s >= 60)  { iconEl.textContent = 'thunderstorm';       iconEl.classList.add('anim-wobble'); }
    else if (s >= 50)  { iconEl.textContent = 'air';                iconEl.classList.add('anim-wobble'); }
    else if (s >= 40)  { iconEl.textContent = 'rainy';              iconEl.classList.add('anim-pulse'); }
    else if (s >= 30)  { iconEl.textContent = 'foggy';              iconEl.classList.add('anim-pulse'); }
    else if (s >= 20)  { iconEl.textContent = 'cloud';              iconEl.classList.add('anim-wobble'); }
    else if (s >= 10)  { iconEl.textContent = 'partly_cloudy_day';  iconEl.classList.add('anim-pulse'); }
    else               { iconEl.textContent = 'wb_sunny';           iconEl.classList.add('anim-rotate'); }

    // Glow behind icon
    const glowColor = getWeatherAccentColor(s);
    iconEl.style.textShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;
    iconEl.style.opacity = '0.7';

    // Lightning flash for high scores
    if (s >= 70) {
      startLightningFlashes(s);
    }

    // Auto-stop animations after 10s
    setTimeout(() => {
      iconEl.classList.remove('anim-rotate', 'anim-pulse', 'anim-wobble', 'anim-shake');
      stopLightningFlashes();
    }, 10000);
  }

  // Start weather particle animation
  startWeatherParticles(s);
}

let _lightningInterval = null;
function startLightningFlashes(score) {
  stopLightningFlashes();
  const hero = document.getElementById('mwHero');
  if (!hero) return;
  let flash = hero.querySelector('.mw-lightning');
  if (!flash) {
    flash = document.createElement('div');
    flash.className = 'mw-lightning';
    hero.style.position = 'relative';
    hero.appendChild(flash);
  }
  const interval = score >= 80 ? 1500 : 3000;
  _lightningInterval = setInterval(() => {
    flash.classList.remove('flash');
    void flash.offsetWidth; // force reflow
    flash.classList.add('flash');
  }, interval);
}
function stopLightningFlashes() {
  if (_lightningInterval) { clearInterval(_lightningInterval); _lightningInterval = null; }
}

// --- WEATHER PARTICLE ANIMATION ---
let _weatherParticleRAF = null;
function startWeatherParticles(score) {
  // Stop any previous animation
  if (_weatherParticleRAF) { cancelAnimationFrame(_weatherParticleRAF); _weatherParticleRAF = null; }

  const canvas = document.getElementById('mwWeatherCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const hero = document.getElementById('mwHero');
  if (!hero) return;

  // Size canvas to hero
  const rect = hero.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  const W = rect.width, H = rect.height;

  const s = Math.max(0, Math.min(100, score));
  const particles = [];
  const count = 30 + Math.floor(s * 0.2);

  // Determine particle type based on score
  // HIGH score = bad weather (storm), LOW score = good weather (sunny)
  if (s >= 80) {
    // Sturm/Orkan: fast diagonal rain
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'rain', x: Math.random() * W * 1.3, y: Math.random() * H,
        speed: 4 + Math.random() * 4, len: 12 + Math.random() * 10,
        opacity: 0.4 + Math.random() * 0.4, drift: -3
      });
    }
  } else if (s >= 60) {
    // Stürmisch/Gewitter: medium rain
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'rain', x: Math.random() * W * 1.1, y: Math.random() * H,
        speed: 2.5 + Math.random() * 2.5, len: 8 + Math.random() * 8,
        opacity: 0.3 + Math.random() * 0.3, drift: -1.5
      });
    }
  } else if (s >= 40) {
    // Nieselregen/Trüb: light drops + fog wisps
    for (let i = 0; i < Math.floor(count * 0.6); i++) {
      particles.push({
        type: 'rain', x: Math.random() * W, y: Math.random() * H,
        speed: 1 + Math.random() * 1.5, len: 4 + Math.random() * 5,
        opacity: 0.2 + Math.random() * 0.2, drift: -0.5
      });
    }
    for (let i = 0; i < Math.floor(count * 0.4); i++) {
      particles.push({
        type: 'fog', x: Math.random() * W, y: H * 0.3 + Math.random() * H * 0.5,
        speed: 0.3 + Math.random() * 0.4, w: 40 + Math.random() * 50, h: 8 + Math.random() * 6,
        opacity: 0.06 + Math.random() * 0.06
      });
    }
  } else if (s >= 20) {
    // Bewölkt/Diesig: fog wisps
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'fog', x: Math.random() * W, y: H * 0.2 + Math.random() * H * 0.6,
        speed: 0.2 + Math.random() * 0.3, w: 50 + Math.random() * 60, h: 8 + Math.random() * 8,
        opacity: 0.05 + Math.random() * 0.06
      });
    }
  } else if (s >= 10) {
    // Heiter: light cloud particles
    for (let i = 0; i < Math.floor(count * 0.5); i++) {
      particles.push({
        type: 'fog', x: Math.random() * W, y: H * 0.1 + Math.random() * H * 0.4,
        speed: 0.15 + Math.random() * 0.2, w: 30 + Math.random() * 40, h: 6 + Math.random() * 6,
        opacity: 0.04 + Math.random() * 0.04
      });
    }
  } else {
    // Sonnig: golden sun rays from top
    for (let i = 0; i < 12; i++) {
      const angle = -0.3 + Math.random() * 0.6;
      particles.push({
        type: 'ray', x: W * 0.3 + Math.random() * W * 0.4, y: 0,
        speed: 0.3 + Math.random() * 0.3, len: H * 0.5 + Math.random() * H * 0.4,
        opacity: 0.04 + Math.random() * 0.04, angle: angle,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  const startTime = performance.now();
  const duration = 10000; // 10s

  function draw(now) {
    const elapsed = now - startTime;
    if (elapsed > duration) {
      ctx.clearRect(0, 0, W, H);
      _weatherParticleRAF = null;
      return;
    }
    // Fade out in last 2s
    const globalAlpha = elapsed > 8000 ? (10000 - elapsed) / 2000 : 1;

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = globalAlpha;

    for (const p of particles) {
      if (p.type === 'rain') {
        p.y += p.speed;
        p.x += p.drift || 0;
        if (p.y > H + 10) { p.y = -p.len; p.x = Math.random() * W * 1.3; }
        if (p.x < -20) { p.x = W + 10; }
        ctx.strokeStyle = `rgba(200, 220, 255, ${p.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + (p.drift || 0) * 2, p.y + p.len);
        ctx.stroke();
      } else if (p.type === 'fog') {
        p.x += p.speed;
        if (p.x > W + p.w) { p.x = -p.w; }
        ctx.fillStyle = `rgba(180, 200, 220, ${p.opacity})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'ray') {
        const pulse = 0.7 + 0.3 * Math.sin(now * 0.001 + p.phase);
        const alpha = p.opacity * pulse;
        const endX = p.x + Math.sin(p.angle) * p.len;
        const endY = p.y + Math.cos(p.angle) * p.len;
        const grad = ctx.createLinearGradient(p.x, p.y, endX, endY);
        grad.addColorStop(0, `rgba(255, 215, 80, ${alpha})`);
        grad.addColorStop(1, `rgba(255, 215, 80, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    _weatherParticleRAF = requestAnimationFrame(draw);
  }

  _weatherParticleRAF = requestAnimationFrame(draw);
}

function clearHistory() {
    if(confirm("Wirklich den gesamten Verlauf löschen?")) {
        chrome.storage.local.remove(['history'], () => { loadDashboard(); alert("Verlauf gelöscht."); });
    }
}

// --- STAGGERED ANIMATION HELPER ---
function applyStaggerAnimation(container, selector = '.stagger-item') {
  const items = container.querySelectorAll(selector);
  items.forEach((item, i) => {
    item.style.animationDelay = `${0.1 + i * 0.08}s`;
  });
}

// Apply stagger to sections when view changes
function animateSections(viewId) {
  const view = document.getElementById(viewId);
  if (!view) return;

  const sections = view.querySelectorAll('.section');
  sections.forEach((section, i) => {
    section.style.opacity = '0';
    section.style.animation = 'none';
    setTimeout(() => {
      section.style.animation = `staggerFadeIn 0.5s ease forwards`;
      section.style.animationDelay = `${i * 0.1}s`;
    }, 10);
  });
}


// ================================================================
// ONBOARDING & GUIDED TOUR
// ================================================================

// --- kAllMedia: Complete media list with categories ---
const kAllMedia = [
  // Überregional
  { name: "Spiegel", url: "spiegel.de", cat: "ueberregional" },
  { name: "Die Zeit", url: "zeit.de", cat: "ueberregional" },
  { name: "FAZ", url: "faz.net", cat: "ueberregional" },
  { name: "Süddeutsche", url: "sueddeutsche.de", cat: "ueberregional" },
  { name: "Die Welt", url: "welt.de", cat: "ueberregional" },
  { name: "BILD", url: "bild.de", cat: "ueberregional" },
  { name: "Taz", url: "taz.de", cat: "ueberregional" },
  { name: "Stern", url: "stern.de", cat: "ueberregional" },
  { name: "Focus", url: "focus.de", cat: "ueberregional" },
  { name: "Handelsblatt", url: "handelsblatt.com", cat: "ueberregional" },
  { name: "WirtschaftsWoche", url: "wiwo.de", cat: "ueberregional" },
  { name: "Manager Magazin", url: "manager-magazin.de", cat: "ueberregional" },
  { name: "N-TV", url: "n-tv.de", cat: "ueberregional" },
  { name: "T-Online", url: "t-online.de", cat: "ueberregional" },
  { name: "RND", url: "rnd.de", cat: "ueberregional" },
  { name: "Tagesspiegel", url: "tagesspiegel.de", cat: "ueberregional" },
  { name: "Web.de News", url: "web.de", cat: "ueberregional" },
  { name: "GMX News", url: "gmx.net", cat: "ueberregional" },
  { name: "Business Insider", url: "businessinsider.de", cat: "ueberregional" },
  { name: "Capital", url: "capital.de", cat: "ueberregional" },
  { name: "Finanztip", url: "finanztip.de", cat: "ueberregional" },
  // Regional
  { name: "Berliner Zeitung", url: "berliner-zeitung.de", cat: "regional" },
  { name: "Frankfurter Rundschau", url: "fr.de", cat: "regional" },
  { name: "Stuttgarter Zeitung", url: "stuttgarter-zeitung.de", cat: "regional" },
  { name: "Stuttgarter Nachr.", url: "stuttgarter-nachrichten.de", cat: "regional" },
  { name: "Hamburger Abendblatt", url: "abendblatt.de", cat: "regional" },
  { name: "Kölner Stadt-Anzeiger", url: "ksta.de", cat: "regional" },
  { name: "Rheinische Post", url: "rp-online.de", cat: "regional" },
  { name: "WAZ", url: "waz.de", cat: "regional" },
  { name: "Münchner Merkur", url: "merkur.de", cat: "regional" },
  { name: "tz München", url: "tz.de", cat: "regional" },
  { name: "Augsburger Allgemeine", url: "augsburger-allgemeine.de", cat: "regional" },
  { name: "B.Z. Berlin", url: "bz-berlin.de", cat: "regional" },
  { name: "Express", url: "express.de", cat: "regional" },
  { name: "Abendzeitung", url: "abendzeitung-muenchen.de", cat: "regional" },
  { name: "Mopo Hamburg", url: "mopo.de", cat: "regional" },
  { name: "Berliner Kurier", url: "berliner-kurier.de", cat: "regional" },
  { name: "Berliner Morgenpost", url: "morgenpost.de", cat: "regional" },
  { name: "Nürnberger Nachr.", url: "nn.de", cat: "regional" },
  { name: "Mitteldeutsche Ztg.", url: "mz.de", cat: "regional" },
  { name: "Leipziger Volksz.", url: "lvz.de", cat: "regional" },
  { name: "Sächsische Zeitung", url: "saechsische.de", cat: "regional" },
  { name: "Nordkurier", url: "nordkurier.de", cat: "regional" },
  { name: "Ostsee-Zeitung", url: "ostsee-zeitung.de", cat: "regional" },
  { name: "Freie Presse", url: "freiepresse.de", cat: "regional" },
  { name: "Thüringer Allg.", url: "thueringer-allgemeine.de", cat: "regional" },
  { name: "Neue Westfälische", url: "nw.de", cat: "regional" },
  { name: "Westfalen-Blatt", url: "westfalen-blatt.de", cat: "regional" },
  { name: "Weser-Kurier", url: "weser-kurier.de", cat: "regional" },
  { name: "Braunschweiger Ztg.", url: "braunschweiger-zeitung.de", cat: "regional" },
  { name: "Hannoversche Allg.", url: "haz.de", cat: "regional" },
  { name: "Neue Osnabrücker", url: "noz.de", cat: "regional" },
  { name: "Nordwest-Zeitung", url: "nwzonline.de", cat: "regional" },
  { name: "Kieler Nachrichten", url: "kn-online.de", cat: "regional" },
  { name: "Lübecker Nachr.", url: "ln-online.de", cat: "regional" },
  { name: "Flensburger Tagebl.", url: "shz.de", cat: "regional" },
  { name: "Badische Zeitung", url: "badische-zeitung.de", cat: "regional" },
  { name: "Schwäbische Ztg.", url: "schwaebische.de", cat: "regional" },
  { name: "Südkurier", url: "suedkurier.de", cat: "regional" },
  { name: "Mannheimer Morgen", url: "mannheimer-morgen.de", cat: "regional" },
  { name: "Pforzheimer Ztg.", url: "pz-news.de", cat: "regional" },
  { name: "Heilbronner Stimme", url: "stimme.de", cat: "regional" },
  { name: "Main-Post", url: "mainpost.de", cat: "regional" },
  { name: "Passauer Neue Presse", url: "pnp.de", cat: "regional" },
  { name: "Mittelbayerische", url: "mittelbayerische.de", cat: "regional" },
  { name: "Donaukurier", url: "donaukurier.de", cat: "regional" },
  { name: "Allgäuer Zeitung", url: "all-in.de", cat: "regional" },
  { name: "Trierischer Volksfr.", url: "volksfreund.de", cat: "regional" },
  { name: "Saarbrücker Ztg.", url: "saarbruecker-zeitung.de", cat: "regional" },
  { name: "Rhein-Zeitung", url: "rhein-zeitung.de", cat: "regional" },
  { name: "Hessische/Nieders. Allg.", url: "hna.de", cat: "regional" },
  { name: "Gießener Allgemeine", url: "giessener-allgemeine.de", cat: "regional" },
  // ÖRR
  { name: "Tagesschau", url: "tagesschau.de", cat: "oerr" },
  { name: "ZDF Heute", url: "zdf.de", cat: "oerr" },
  { name: "Deutschlandfunk", url: "deutschlandfunk.de", cat: "oerr" },
  { name: "BR24", url: "br.de", cat: "oerr" },
  { name: "NDR", url: "ndr.de", cat: "oerr" },
  { name: "WDR", url: "wdr.de", cat: "oerr" },
  { name: "SWR Aktuell", url: "swr.de", cat: "oerr" },
  { name: "MDR", url: "mdr.de", cat: "oerr" },
  { name: "HR", url: "hr.de", cat: "oerr" },
  { name: "RBB24", url: "rbb24.de", cat: "oerr" },
  { name: "SR", url: "sr.de", cat: "oerr" },
  { name: "Deutsche Welle", url: "dw.com", cat: "oerr" },
  { name: "Hessenschau", url: "hessenschau.de", cat: "oerr" },
  // Meinung & Magazin
  { name: "Cicero", url: "cicero.de", cat: "other" },
  { name: "Telepolis", url: "heise.de/tp", cat: "other" },
  { name: "Der Freitag", url: "freitag.de", cat: "other" },
  { name: "Blätter", url: "blaetter.de", cat: "other" },
  { name: "Krautreporter", url: "krautreporter.de", cat: "other" },
  { name: "Correctiv", url: "correctiv.org", cat: "other" },
  { name: "Übermedien", url: "uebermedien.de", cat: "other" },
  { name: "Medieninsider", url: "medieninsider.com", cat: "other" },
  { name: "Volksverpetzer", url: "volksverpetzer.de", cat: "other" },
  { name: "NachDenkSeiten", url: "nachdenkseiten.de", cat: "other" },
  { name: "Jungle World", url: "jungle.world", cat: "other" },
  { name: "Jacobin", url: "jacobin.de", cat: "other" },
  { name: "nd Journalismus", url: "nd-aktuell.de", cat: "other" },
  // Konservativ / Alternativ
  { name: "Tichys Einblick", url: "tichyseinblick.de", cat: "other" },
  { name: "Nius", url: "nius.de", cat: "other" },
  { name: "Achgut", url: "achgut.com", cat: "other" },
  { name: "Junge Freiheit", url: "jungefreiheit.de", cat: "other" },
  { name: "Die Tagespost", url: "die-tagespost.de", cat: "other" },
  { name: "Cato", url: "cato-magazin.de", cat: "other" },
  { name: "Deutschland-Kurier", url: "deutschlandkurier.de", cat: "other" },
  { name: "Freilich Magazin", url: "freilich-magazin.com", cat: "other" },
  { name: "Sezession", url: "sezession.de", cat: "other" },
  { name: "Compact", url: "compact-online.de", cat: "other" },
  // Boulevard & Entertainment
  { name: "Bunte", url: "bunte.de", cat: "other" },
  { name: "Gala", url: "gala.de", cat: "other" },
  { name: "Promiflash", url: "promiflash.de", cat: "other" },
  { name: "Watson DE", url: "watson.de", cat: "other" },
  { name: "BuzzFeed DE", url: "buzzfeed.de", cat: "other" },
  { name: "Vice", url: "vice.com", cat: "other" },
  { name: "Musikexpress", url: "musikexpress.de", cat: "other" },
  { name: "Rolling Stone", url: "rollingstone.de", cat: "other" },
  // Sport
  { name: "Kicker", url: "kicker.de", cat: "other" },
  { name: "Sport1", url: "sport1.de", cat: "other" },
  { name: "Sportschau", url: "sportschau.de", cat: "other" },
  { name: "11 Freunde", url: "11freunde.de", cat: "other" },
  { name: "Transfermarkt", url: "transfermarkt.de", cat: "other" },
  { name: "auto motor sport", url: "auto-motor-und-sport.de", cat: "other" },
  // Wissenschaft & Wissen
  { name: "Spektrum", url: "spektrum.de", cat: "other" },
  { name: "Geo", url: "geo.de", cat: "other" },
  // Tech
  { name: "Heise Online", url: "heise.de", cat: "tech" },
  { name: "Golem", url: "golem.de", cat: "tech" },
  { name: "T3n", url: "t3n.de", cat: "tech" },
  { name: "Chip", url: "chip.de", cat: "tech" },
  { name: "Netzpolitik", url: "netzpolitik.org", cat: "tech" },
  { name: "ComputerBild", url: "computerbild.de", cat: "tech" },
  { name: "Netzwelt", url: "netzwelt.de", cat: "tech" },
  { name: "Inside Digital", url: "inside-digital.de", cat: "tech" },
  // International
  { name: "NZZ", url: "nzz.ch", cat: "international" },
  { name: "SRF News", url: "srf.ch", cat: "international" },
  { name: "Tages-Anzeiger", url: "tagesanzeiger.ch", cat: "international" },
  { name: "20 Minuten CH", url: "20min.ch", cat: "international" },
  { name: "Blick", url: "blick.ch", cat: "international" },
  { name: "Watson CH", url: "watson.ch", cat: "international" },
  { name: "Der Standard", url: "derstandard.at", cat: "international" },
  { name: "Die Presse", url: "diepresse.com", cat: "international" },
  { name: "Kurier", url: "kurier.at", cat: "international" },
  { name: "ORF", url: "orf.at", cat: "international" },
  { name: "Kronen Zeitung", url: "krone.at", cat: "international" },
  { name: "Kleine Zeitung", url: "kleinezeitung.at", cat: "international" },
  { name: "Salzburger Nachr.", url: "sn.at", cat: "international" },
  { name: "Heute AT", url: "heute.at", cat: "international" },
  { name: "Vorarlberg Online", url: "vol.at", cat: "international" },
  { name: "Aargauer Zeitung", url: "aargauerzeitung.ch", cat: "international" },
  { name: "Berner Zeitung", url: "bernerzeitung.ch", cat: "international" },
  { name: "BBC News", url: "bbc.com", cat: "international" },
  { name: "The Guardian", url: "theguardian.com", cat: "international" },
  { name: "Reuters", url: "reuters.com", cat: "international" },
  { name: "AP News", url: "apnews.com", cat: "international" },
  { name: "CNN", url: "cnn.com", cat: "international" },
  { name: "New York Times", url: "nytimes.com", cat: "international" },
  { name: "Washington Post", url: "washingtonpost.com", cat: "international" },
  { name: "Al Jazeera", url: "aljazeera.com", cat: "international" },
  { name: "Le Monde", url: "lemonde.fr", cat: "international" },
  { name: "El País", url: "elpais.com", cat: "international" },
  { name: "Politico EU", url: "politico.eu", cat: "international" },
  { name: "Euronews", url: "euronews.com", cat: "international" },
  { name: "The Economist", url: "economist.com", cat: "international" },
  { name: "Financial Times", url: "ft.com", cat: "international" },
  { name: "Bloomberg", url: "bloomberg.com", cat: "international" },
  { name: "Forbes", url: "forbes.com", cat: "international" },
];

// ================================================================
// SCHNELLZUGRIFF (QUICK ACCESS) WIDGET
// ================================================================

const QuickAccessController = {
  favorites: [],
  searchTerm: '',
  mediaSearchTerm: '',
  mediaCat: 'all',
  isSearching: false,
  displayedItems: [],
  gridTimer: null,

  async init() {
    const data = await chrome.storage.local.get(['qa_favorites']);
    this.favorites = Array.isArray(data.qa_favorites) ? data.qa_favorites : [];
    this.initGrid();
    this.renderGrid();
    this.bindEvents();
    const countEl = document.getElementById('qaMediaCount');
    if (countEl) countEl.textContent = `${kAllMedia.length} Quellen`;
  },

  async saveFavorites() {
    await chrome.storage.local.set({ qa_favorites: this.favorites });
  },

  isFav(url) {
    return this.favorites.includes(url);
  },

  async toggleFav(url) {
    if (this.isFav(url)) {
      this.favorites = this.favorites.filter(u => u !== url);
    } else {
      this.favorites.push(url);
    }
    await this.saveFavorites();
    if (this.isSearching) {
      this.updateGridForSearch();
    } else {
      this.initGrid();
      this.renderGrid();
    }
    this.renderMediaList();
  },

  faviconUrl(domain, size = 64) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  },

  // --- Living Grid Logic ---

  initGrid() {
    if (this.gridTimer) {
      clearInterval(this.gridTimer);
      this.gridTimer = null;
    }

    const favItems = this.favorites
      .map(url => kAllMedia.find(m => m.url === url))
      .filter(Boolean);

    // If 9+ favorites, show all favorites (scrollable grid)
    if (favItems.length >= 9) {
      this.displayedItems = favItems;
      return; // no auto-rotation when all slots are favorites
    }

    const displayedFavs = favItems.slice(0, 9);
    const nonFavMedia = kAllMedia.filter(m => !this.isFav(m.url));
    const shuffled = [...nonFavMedia].sort(() => Math.random() - 0.5);

    this.displayedItems = [...displayedFavs];
    let idx = 0;
    while (this.displayedItems.length < 9 && idx < shuffled.length) {
      if (!this.displayedItems.find(d => d.url === shuffled[idx].url)) {
        this.displayedItems.push(shuffled[idx]);
      }
      idx++;
    }

    // Start auto-rotation timer
    this.gridTimer = setInterval(() => this.swapRandomTile(), 3000);
  },

  swapRandomTile() {
    // Find non-favorite slot indices
    const swappableIndices = [];
    this.displayedItems.forEach((item, i) => {
      if (!this.isFav(item.url)) swappableIndices.push(i);
    });
    if (swappableIndices.length === 0) return;

    const slotIndex = swappableIndices[Math.floor(Math.random() * swappableIndices.length)];
    const displayedUrls = new Set(this.displayedItems.map(d => d.url));
    const candidates = kAllMedia.filter(m => !this.isFav(m.url) && !displayedUrls.has(m.url));
    if (candidates.length === 0) return;

    const newItem = candidates[Math.floor(Math.random() * candidates.length)];
    this.animateTileSwap(slotIndex, newItem);
  },

  animateTileSwap(index, newItem) {
    this.displayedItems[index] = newItem;
    const grid = document.getElementById('qaLivingGrid');
    if (!grid) return;
    const tile = grid.children[index];
    if (!tile) return;

    tile.style.opacity = '0';
    setTimeout(() => {
      this._updateTileContent(tile, newItem);
      tile.style.opacity = '1';
    }, 400);
  },

  _updateTileContent(tile, item) {
    const isFav = this.isFav(item.url);
    tile.className = 'qa-living-tile' + (isFav ? ' is-fav' : '');
    tile.innerHTML = `
      <span class="material-icons-outlined tile-star">${isFav ? 'star' : 'star_border'}</span>
      <div class="tile-logo"><img src="${this.faviconUrl(item.url, 64)}" alt=""></div>
      <div class="tile-name">${item.name}</div>`;
    tile.onclick = () => this.openMedia(item.url);
    tile.querySelector('.tile-star').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFav(item.url);
    });
  },

  renderGrid() {
    const grid = document.getElementById('qaLivingGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // Wrap in scroll container when >9 items
    const isScrollable = this.displayedItems.length > 9;
    const parent = grid.parentElement;
    let scrollWrap = parent.querySelector('.qa-living-grid-scroll');
    if (isScrollable) {
      if (!scrollWrap) {
        scrollWrap = document.createElement('div');
        scrollWrap.className = 'qa-living-grid-scroll';
        grid.replaceWith(scrollWrap);
        scrollWrap.appendChild(grid);
      }
    } else if (scrollWrap) {
      scrollWrap.replaceWith(grid);
    }

    this.displayedItems.forEach((item) => {
      const tile = document.createElement('div');
      tile.className = 'qa-living-tile' + (this.isFav(item.url) ? ' is-fav' : '');
      tile.innerHTML = `
        <span class="material-icons-outlined tile-star">${this.isFav(item.url) ? 'star' : 'star_border'}</span>
        <div class="tile-logo"><img src="${this.faviconUrl(item.url, 64)}" alt=""></div>
        <div class="tile-name">${item.name}</div>`;
      tile.addEventListener('click', () => this.openMedia(item.url));
      tile.querySelector('.tile-star').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFav(item.url);
      });
      grid.appendChild(tile);
    });
  },

  // --- Random Overlay ---

  openRandomOverlay() {
    const nonFav = kAllMedia.filter(m => !this.isFav(m.url));
    const pool = nonFav.length > 0 ? nonFav : kAllMedia;
    const item = pool[Math.floor(Math.random() * pool.length)];

    const overlay = document.getElementById('randomOverlay');
    const logo = document.getElementById('randomOverlayLogo');
    const name = document.getElementById('randomOverlayName');
    if (!overlay || !logo || !name) return;

    logo.innerHTML = `<img src="${this.faviconUrl(item.url, 128)}" alt="">`;
    name.textContent = item.name;

    overlay.classList.remove('hidden');

    const card = overlay.querySelector('.random-overlay-card');
    const backdrop = overlay.querySelector('.random-overlay-backdrop');
    const close = () => overlay.classList.add('hidden');

    const openAndClose = () => {
      this.openMedia(item.url);
      close();
    };

    card.onclick = openAndClose;
    backdrop.onclick = close;
  },

  // --- Media List (unchanged logic) ---

  renderMediaList() {
    const container = document.getElementById('qaMediaList');
    if (!container) return;
    const search = (this.mediaSearchTerm || '').toLowerCase();
    const cat = this.mediaCat || 'all';
    const filtered = kAllMedia.filter(m => {
      if (cat !== 'all' && m.cat !== cat) return false;
      if (search && !m.name.toLowerCase().includes(search) && !m.url.toLowerCase().includes(search)) return false;
      return true;
    });
    container.innerHTML = '';
    filtered.forEach(m => {
      const isFav = this.isFav(m.url);
      const row = document.createElement('div');
      row.className = 'qa-media-item';
      row.innerHTML = `<img class="qa-media-icon" src="${this.faviconUrl(m.url, 32)}" alt="">
        <span class="qa-media-name">${m.name}</span>
        <span class="qa-media-domain">${m.url}</span>
        <button class="qa-media-fav-btn material-icons-outlined ${isFav ? 'is-fav' : ''}">${isFav ? 'star' : 'star_border'}</button>`;
      row.querySelector('.qa-media-fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFav(m.url);
      });
      row.addEventListener('click', () => this.openMedia(m.url));
      container.appendChild(row);
    });
  },

  openMedia(domain) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.tabs.update(tab.id, { url: `https://${domain}` });
    });
  },

  bindEvents() {
    // Grid search (Schnellzugriff)
    const searchInput = document.getElementById('qaSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchTerm = searchInput.value;
        this.updateGridForSearch();
      });
    }
    // All-media view search
    const allMediaSearch = document.getElementById('qaAllMediaSearch');
    if (allMediaSearch) {
      allMediaSearch.addEventListener('input', () => {
        this.mediaCat = this.mediaCat || 'all';
        this.mediaSearchTerm = allMediaSearch.value;
        this.renderMediaList();
      });
    }
    const catChips = document.getElementById('qaCategoryChips');
    if (catChips) {
      catChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        catChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.mediaCat = chip.dataset.cat;
        this.renderMediaList();
      });
    }
    const randomBtn = document.getElementById('qaRandomBtn');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => this.openRandomOverlay());
    }
    const showAllLink = document.getElementById('qaShowAllLink');
    if (showAllLink) {
      showAllLink.addEventListener('click', () => {
        this.renderMediaList();
        showView('viewAllMedia');
      });
    }
    const backBtn = document.getElementById('qaBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        showView('viewScanner');
        // Re-activate Radar tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const radarTab = document.querySelector('.tab-btn[data-target="viewScanner"]');
        if (radarTab) radarTab.classList.add('active');
      });
    }
  },

  updateGridForSearch() {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      // Restore normal grid
      this.isSearching = false;
      this.initGrid();
      this.renderGrid();
      return;
    }
    this.isSearching = true;
    // Stop rotation during search
    if (this.gridTimer) {
      clearInterval(this.gridTimer);
      this.gridTimer = null;
    }
    const results = kAllMedia.filter(m =>
      m.name.toLowerCase().includes(query) || m.url.toLowerCase().includes(query)
    );
    this.displayedItems = results.slice(0, 9);
    this.renderGrid();
  },

  show() {
    const el = document.getElementById('quickAccessWidget');
    if (el) el.classList.remove('hidden');
  },

  hide() {
    const el = document.getElementById('quickAccessWidget');
    if (el) el.classList.add('hidden');
  },
};

// --- Onboarding Controller ---
const OnboardingController = {
  currentPage: 0,
  selectedMedia: new Set(),
  radarAnimId: null,
  confettiAnimId: null,
  counterStarted: false,
  featureAnimated: false,

  async init() {
    const data = await chrome.storage.local.get(['onboarding_completed']);
    if (data.onboarding_completed === true) {
      this.hideOverlay();
      return false; // already completed
    }
    this.showOverlay();
    this.bindEvents();
    this.buildMediaGrid();
    this.startRadarAnimation();
    return true; // showing onboarding
  },

  showOverlay() {
    const el = document.getElementById('onboardingOverlay');
    if (el) el.classList.remove('hidden');
  },

  hideOverlay() {
    const el = document.getElementById('onboardingOverlay');
    if (el) el.classList.add('hidden');
    this.stopRadarAnimation();
    this.stopConfetti();
  },

  bindEvents() {
    const self = this;
    document.getElementById('onbCloseBtn')?.addEventListener('click', () => self.skip());
    document.getElementById('onbBtnWelcome')?.addEventListener('click', () => self.goToPage(1));
    document.getElementById('onbBtnProblem')?.addEventListener('click', () => self.goToPage(2));
    document.getElementById('onbBtnSolution')?.addEventListener('click', () => self.goToPage(3));
    document.getElementById('onbBtnMedia')?.addEventListener('click', () => self.saveMediaAndNext());
    document.getElementById('onbBtnComplete')?.addEventListener('click', () => self.completeWithTour());
    document.getElementById('onbBtnSkipTour')?.addEventListener('click', () => self.completeWithoutTour());
  },

  goToPage(page) {
    this.currentPage = page;
    const container = document.getElementById('onbPagesContainer');
    if (container) {
      container.style.transform = `translateX(-${page * 100}%)`;
    }
    this.updateDots();
    this.onPageEnter(page);
  },

  updateDots() {
    const dots = document.querySelectorAll('.onb-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentPage);
    });
  },

  onPageEnter(page) {
    if (page === 1 && !this.counterStarted) {
      this.counterStarted = true;
      setTimeout(() => this.animateCounters(), 300);
    }
    if (page === 2 && !this.featureAnimated) {
      this.featureAnimated = true;
      this.animateFeatureGrid();
    }
    if (page === 4) {
      this.startConfetti();
    }
  },

  // --- Counter Animations ---
  animateCounters() {
    // Headline counter: 0 → 1000 in ~470ms
    this.animateNumber('onbHeadlineCounter', 0, 1000, 470);
    // Emotion counter: 0 → 67 in ~1340ms
    this.animateNumber('onbEmotionCounter', 0, 67, 1340);
  },

  animateNumber(elementId, from, to, duration) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(from + (to - from) * eased);
      el.textContent = current >= 1000 ? current.toLocaleString('de-DE') : current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },

  // --- Feature Grid Animation ---
  animateFeatureGrid() {
    const cards = document.querySelectorAll('.onb-feature-card');
    cards.forEach((card, i) => {
      setTimeout(() => {
        card.classList.add('onb-visible');
      }, i * 150);
    });
  },

  // --- Media Grid ---
  buildMediaGrid() {
    const grid = document.getElementById('onbMediaGrid');
    if (!grid) return;
    grid.innerHTML = '';
    kAllMedia.forEach((media) => {
      const tile = document.createElement('div');
      tile.className = 'onb-media-tile';
      tile.dataset.url = media.url;
      tile.innerHTML = `
        <img class="onb-media-favicon"
             src="https://www.google.com/s2/favicons?domain=${media.url}&sz=128"
             alt="${media.name}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2394a3b8%22><path d=%22M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z%22/></svg>'">
        <span class="onb-media-name">${media.name}</span>
        <div class="onb-media-check"><span class="material-icons-outlined">check</span></div>
      `;
      tile.addEventListener('click', () => this.toggleMedia(tile, media.url));
      grid.appendChild(tile);
    });
  },

  toggleMedia(tile, url) {
    if (this.selectedMedia.has(url)) {
      this.selectedMedia.delete(url);
      tile.classList.remove('selected');
    } else {
      this.selectedMedia.add(url);
      tile.classList.add('selected');
    }
    this.updateMediaCounter();
  },

  updateMediaCounter() {
    const counter = document.getElementById('onbMediaCounter');
    const btn = document.getElementById('onbBtnMedia');
    const count = this.selectedMedia.size;
    if (counter) counter.textContent = `${count}/1 ausgewählt`;
    if (btn) {
      if (count >= 1) {
        btn.disabled = false;
        btn.classList.remove('onb-btn-disabled');
      } else {
        btn.disabled = true;
        btn.classList.add('onb-btn-disabled');
      }
    }
  },

  async saveMediaAndNext() {
    const urls = Array.from(this.selectedMedia);
    await chrome.storage.local.set({ favorite_media: urls });
    this.goToPage(4);
  },

  async skip() {
    await chrome.storage.local.set({ onboarding_completed: true });
    this.hideOverlay();
  },

  async completeWithTour() {
    await chrome.storage.local.set({ onboarding_completed: true });
    this.hideOverlay();
    GuidedTourController.start();
  },

  async completeWithoutTour() {
    await chrome.storage.local.set({ onboarding_completed: true });
    this.hideOverlay();
  },

  // --- Radar Canvas Animation ---
  startRadarAnimation() {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2 - 10;
    let angle = 0;
    const sweepSpeed = (2 * Math.PI) / 3200; // 3.2s per revolution in ms

    // Static blips
    const blips = [];
    for (let i = 0; i < 8; i++) {
      const r = 20 + Math.random() * (maxR - 30);
      const a = Math.random() * Math.PI * 2;
      blips.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), size: 2 + Math.random() * 3 });
    }

    let lastTime = performance.now();
    const draw = (now) => {
      const dt = now - lastTime;
      lastTime = now;
      angle += sweepSpeed * dt;
      if (angle > Math.PI * 2) angle -= Math.PI * 2;

      ctx.clearRect(0, 0, w, h);

      // Background
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      bgGrad.addColorStop(0, '#0B2018');
      bgGrad.addColorStop(1, '#03050A');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Grid circles
      ctx.strokeStyle = 'rgba(0, 191, 166, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR / 4) * i, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cross lines
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Sweep beam
      ctx.save();
      const sweepGrad = ctx.createConicalGradient
        ? null // not available, use arc approach
        : null;
      // Draw sweep as filled arc
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, angle - 0.5, angle, false);
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(0, 191, 166, 0.4)');
      grad.addColorStop(1, 'rgba(0, 191, 166, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = 'rgba(0, 191, 166, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Blips
      blips.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fillStyle = '#00BFA6';
        ctx.shadowColor = '#00BFA6';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Center glow
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
      centerGlow.addColorStop(0, 'rgba(0, 191, 166, 0.5)');
      centerGlow.addColorStop(1, 'rgba(0, 191, 166, 0)');
      ctx.fillStyle = centerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();

      this.radarAnimId = requestAnimationFrame(draw);
    };
    this.radarAnimId = requestAnimationFrame(draw);
  },

  stopRadarAnimation() {
    if (this.radarAnimId) {
      cancelAnimationFrame(this.radarAnimId);
      this.radarAnimId = null;
    }
  },

  // --- Confetti Animation ---
  startConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement?.offsetWidth || 400;
    canvas.height = canvas.parentElement?.offsetHeight || 600;
    const w = canvas.width;
    const h = canvas.height;
    const colors = ['#00BFA6', '#3B82F6', '#EC4899', '#F59E0B'];
    const particles = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.5,
        w: 4 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: 1.5 + Math.random() * 2.5,
        drift: (Math.random() - 0.5) * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        delay: Math.random() * 600,
        opacity: 1,
      });
    }

    const startTime = performance.now();
    const duration = 2500;

    const draw = (now) => {
      const elapsed = now - startTime;
      if (elapsed > duration + 1000) {
        this.stopConfetti();
        return;
      }
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        const t = elapsed - p.delay;
        if (t < 0) return;
        const progress = t / duration;
        p.y += p.speed;
        p.x += Math.sin(t / 300) * p.drift;
        p.rotation += p.rotSpeed;
        p.opacity = Math.max(0, 1 - progress * 0.8);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      this.confettiAnimId = requestAnimationFrame(draw);
    };
    this.confettiAnimId = requestAnimationFrame(draw);
  },

  stopConfetti() {
    if (this.confettiAnimId) {
      cancelAnimationFrame(this.confettiAnimId);
      this.confettiAnimId = null;
    }
  },
};

// --- Guided Tour Controller ---
const GuidedTourController = {
  active: false,
  step: null, // 'browseHomepage' | 'tapAnalyze' | 'analyzing' | 'resultExplain' | 'complete'
  resultPage: 0,
  miniRadarId: null,
  analyzeStepTimer: null,

  resultPages: [
    { icon: 'balance', color: '#00BFA6', title: 'Neutralität', desc: 'Wie ausgewogen berichtet das Medium? Werden alle Seiten gehört oder wird einseitig dargestellt?' },
    { icon: 'fact_check', color: '#3B82F6', title: 'Fakten', desc: 'Enthält der Artikel überprüfbare Fakten, Zahlen und Quellenangaben?' },
    { icon: 'psychology', color: '#EC4899', title: 'Emotion', desc: 'Wird geladene Sprache verwendet, die dich wütend oder ängstlich machen soll?' },
    { icon: 'ads_click', color: '#F59E0B', title: 'Clickbait', desc: 'Lockt die Überschrift mit falschen Versprechen oder übertriebenen Behauptungen?' },
    { icon: 'score', color: '#8B5CF6', title: 'Gesamtscore', desc: 'Aus allen vier Dimensionen berechnet JournalRadar einen Gesamtscore von 0 bis 100.' },
    { icon: 'category', color: '#06B6D4', title: 'Einordnung', desc: 'JournalRadar ordnet den Artikel ein und zeigt dir mögliche blinde Flecken.' },
  ],

  start() {
    this.active = true;
    this.showCoach('browseHomepage', 'Navigiere zu einer Nachrichtenseite', 'Öffne einen Artikel, den du analysieren möchtest. JournalRadar erkennt den Inhalt automatisch.');
  },

  stop() {
    this.active = false;
    this.step = null;
    this.hideAll();
    this.stopMiniRadar();
    if (this.analyzeStepTimer) {
      clearInterval(this.analyzeStepTimer);
      this.analyzeStepTimer = null;
    }
    chrome.storage.local.set({ guided_tour_completed: true });
  },

  hideAll() {
    document.getElementById('guidedTourCoach')?.classList.add('hidden');
    document.getElementById('tourAnalyzingOverlay')?.classList.add('hidden');
    document.getElementById('tourResultOverlay')?.classList.add('hidden');
    document.getElementById('tourCompleteOverlay')?.classList.add('hidden');
  },

  showCoach(step, title, desc) {
    this.step = step;
    this.hideAll();
    const el = document.getElementById('guidedTourCoach');
    const titleEl = document.getElementById('tourCoachTitle');
    const descEl = document.getElementById('tourCoachDesc');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (el) el.classList.remove('hidden');

    // Bind close
    document.getElementById('tourCoachClose')?.addEventListener('click', () => this.stop(), { once: true });
  },

  // Called when user clicks analyze (hook from startAnalysis)
  onAnalysisStarted() {
    if (!this.active) return;
    this.step = 'analyzing';
    this.hideAll();
    const overlay = document.getElementById('tourAnalyzingOverlay');
    if (overlay) overlay.classList.remove('hidden');
    this.startMiniRadar();
    this.animateAnalyzeSteps();
  },

  animateAnalyzeSteps() {
    const steps = document.querySelectorAll('.tour-step');
    let current = 0;
    steps.forEach(s => {
      s.classList.remove('done', 'active');
      const icon = s.querySelector('.tour-step-icon');
      if (icon) icon.textContent = 'hourglass_empty';
    });

    const advance = () => {
      if (current > 0 && steps[current - 1]) {
        steps[current - 1].classList.remove('active');
        steps[current - 1].classList.add('done');
        const prevIcon = steps[current - 1].querySelector('.tour-step-icon');
        if (prevIcon) prevIcon.textContent = 'check_circle';
      }
      if (current < steps.length) {
        steps[current].classList.add('active');
        const curIcon = steps[current].querySelector('.tour-step-icon');
        if (curIcon) curIcon.textContent = 'autorenew';
        current++;
      } else {
        clearInterval(this.analyzeStepTimer);
        this.analyzeStepTimer = null;
      }
    };

    advance();
    this.analyzeStepTimer = setInterval(advance, 1200);
  },

  // Called when analysis completes (hook from startAnalysis)
  onAnalysisComplete() {
    if (!this.active) return;
    this.stopMiniRadar();
    if (this.analyzeStepTimer) {
      clearInterval(this.analyzeStepTimer);
      this.analyzeStepTimer = null;
    }
    // Mark all steps done
    document.querySelectorAll('.tour-step').forEach(s => {
      s.classList.remove('active');
      s.classList.add('done');
      const icon = s.querySelector('.tour-step-icon');
      if (icon) icon.textContent = 'check_circle';
    });

    setTimeout(() => {
      this.resultPage = 0;
      this.showResultPage();
    }, 800);
  },

  showResultPage() {
    this.step = 'resultExplain';
    this.hideAll();
    const overlay = document.getElementById('tourResultOverlay');
    if (overlay) overlay.classList.remove('hidden');

    const page = this.resultPages[this.resultPage];
    const iconEl = document.getElementById('tourResultIcon');
    const titleEl = document.getElementById('tourResultTitle');
    const descEl = document.getElementById('tourResultDesc');
    const nextBtn = document.getElementById('tourResultNext');

    if (iconEl) { iconEl.textContent = page.icon; iconEl.style.color = page.color; }
    if (titleEl) titleEl.textContent = page.title;
    if (descEl) descEl.textContent = page.desc;

    // Dots
    const dotsEl = document.getElementById('tourResultDots');
    if (dotsEl) {
      dotsEl.innerHTML = '';
      this.resultPages.forEach((p, i) => {
        const dot = document.createElement('span');
        dot.className = 'tour-result-dot' + (i === this.resultPage ? ' active' : '');
        dot.style.background = i === this.resultPage ? p.color : 'rgba(255,255,255,0.15)';
        dotsEl.appendChild(dot);
      });
    }

    // Button text
    if (nextBtn) {
      nextBtn.textContent = this.resultPage < this.resultPages.length - 1 ? 'Weiter' : 'Verstanden';
    }

    // Bind buttons (remove old listeners by cloning)
    const nextBtnNew = nextBtn?.cloneNode(true);
    if (nextBtn && nextBtnNew) {
      nextBtn.parentNode.replaceChild(nextBtnNew, nextBtn);
      nextBtnNew.id = 'tourResultNext';
      nextBtnNew.addEventListener('click', () => {
        if (this.resultPage < this.resultPages.length - 1) {
          this.resultPage++;
          this.showResultPage();
        } else {
          this.showComplete();
        }
      });
    }

    const skipBtn = document.getElementById('tourResultSkip');
    const skipBtnNew = skipBtn?.cloneNode(true);
    if (skipBtn && skipBtnNew) {
      skipBtn.parentNode.replaceChild(skipBtnNew, skipBtn);
      skipBtnNew.id = 'tourResultSkip';
      skipBtnNew.addEventListener('click', () => this.showComplete());
    }
  },

  showComplete() {
    this.step = 'complete';
    this.hideAll();
    const overlay = document.getElementById('tourCompleteOverlay');
    if (overlay) overlay.classList.remove('hidden');

    document.getElementById('tourCompleteBtn')?.addEventListener('click', () => this.stop(), { once: true });
  },

  // Mini Radar for analyzing overlay
  startMiniRadar() {
    const canvas = document.getElementById('tourRadarMini');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = w / 2 - 5;
    let angle = 0;
    const sweepSpeed = (2 * Math.PI) / 2000;
    let lastTime = performance.now();

    const draw = (now) => {
      const dt = now - lastTime;
      lastTime = now;
      angle += sweepSpeed * dt;

      ctx.clearRect(0, 0, w, h);
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      bgGrad.addColorStop(0, '#0B2018');
      bgGrad.addColorStop(1, '#03050A');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 191, 166, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR / 3) * i, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, angle - 0.5, angle, false);
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(0, 191, 166, 0.4)');
      grad.addColorStop(1, 'rgba(0, 191, 166, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = 'rgba(0, 191, 166, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      this.miniRadarId = requestAnimationFrame(draw);
    };
    this.miniRadarId = requestAnimationFrame(draw);
  },

  stopMiniRadar() {
    if (this.miniRadarId) {
      cancelAnimationFrame(this.miniRadarId);
      this.miniRadarId = null;
    }
  },
};
