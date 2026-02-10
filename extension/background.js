// background.js
// Service Worker für JournalRadar Extension

const SUPABASE_URL = "https://wqpgcezcusnqnbdmquff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcGdjZXpjdXNucW5iZG1xdWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MDIwNzMsImV4cCI6MjA4NDQ3ODA3M30.q8xdwcci0G_Fj4ifOl-WHlpusgnRCk-RPHPK4qhY7U0";

// Sorgt dafür, dass sich beim Klick auf das Icon die Seitenleiste öffnet
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  console.log("JournalRadar installiert.");
});

// === MAGIC LINK AUTH INTERCEPTION ===
// Supabase redirects to localhost:3000 with tokens in the URL hash.
// We intercept this navigation, extract the tokens, and close the tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return;

  // Check if this is a Supabase auth redirect (to localhost or our callback)
  const isAuthRedirect = (
    tab.url.startsWith('http://localhost') ||
    tab.url.startsWith('https://medienradar-backend.vercel.app/auth-callback')
  ) && tab.url.includes('access_token=');

  if (isAuthRedirect && changeInfo.status === 'loading') {
    console.log('[Background] Auth redirect detected:', tab.url.substring(0, 80) + '...');

    // Extract tokens from URL hash
    const hashStr = tab.url.split('#')[1];
    if (!hashStr) return;

    const params = new URLSearchParams(hashStr);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

    if (accessToken && refreshToken) {
      // Process the auth callback
      handleAuthCallback({ accessToken, refreshToken, expiresIn }).then(() => {
        console.log('[Background] Auth processed, closing tab');
        // Close the localhost tab
        chrome.tabs.remove(tabId).catch(() => {});
      });
    }
  }
});

// Handle auth callbacks from content script (fallback)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_CALLBACK') {
    console.log('[Background] Received auth callback from content script');
    handleAuthCallback(message).then(result => {
      sendResponse(result);
    }).catch(err => {
      console.error('[Background] Auth callback error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleAuthCallback({ accessToken, refreshToken, expiresIn }) {
  if (!accessToken || !refreshToken) {
    console.error('[Background] Missing tokens');
    return { success: false };
  }

  // Fetch user info from Supabase
  let user = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${accessToken}`
      }
    });
    if (res.ok) {
      user = await res.json();
      console.log('[Background] User fetched:', user.email);
    }
  } catch (e) {
    console.error('[Background] Failed to fetch user:', e);
  }

  // Calculate expiration
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (expiresIn || 3600);

  // Store auth state (sidepanel listens via chrome.storage.onChanged)
  const authState = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    user: user
  };

  await chrome.storage.local.set({ auth: authState });
  console.log('[Background] Auth state saved, user logged in!');

  return { success: true };
}
