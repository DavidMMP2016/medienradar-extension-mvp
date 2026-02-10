// Content script that runs on the auth callback page
// Automatically sends auth tokens back to the extension

(function() {
  console.log('[JournalRadar] Auth callback content script loaded');

  // Extract tokens from URL hash
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = params.get('expires_in');

  // Check for errors
  const query = new URLSearchParams(window.location.search);
  const error = query.get('error');

  if (error) {
    console.log('[JournalRadar] Auth error:', error);
    return;
  }

  if (accessToken && refreshToken) {
    console.log('[JournalRadar] Tokens found, sending to extension...');

    // Send tokens to the extension
    chrome.runtime.sendMessage({
      type: 'AUTH_CALLBACK',
      accessToken,
      refreshToken,
      expiresIn: parseInt(expiresIn || '3600', 10)
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[JournalRadar] Error sending to extension:', chrome.runtime.lastError);
        return;
      }
      console.log('[JournalRadar] Extension response:', response);

      // Show success message on the page
      if (response && response.success) {
        showSuccess();
      }
    });
  } else {
    console.log('[JournalRadar] No tokens in URL');
  }

  function showSuccess() {
    // Inject success UI into the page
    const overlay = document.createElement('div');
    overlay.innerHTML = `
      <div style="
        position: fixed; inset: 0;
        background: radial-gradient(ellipse at 50% 30%, #0B2018, #03050A 70%);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
      ">
        <div style="
          background: linear-gradient(135deg, rgba(13, 31, 26, 0.95), rgba(11, 15, 25, 0.95));
          border: 1px solid rgba(0, 217, 184, 0.25);
          border-radius: 24px;
          padding: 40px;
          text-align: center;
          color: white;
          max-width: 400px;
        ">
          <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
          <div style="font-size: 24px; font-weight: 900; margin-bottom: 8px;">
            Journal<span style="color: #00BFA6;">Radar</span>
          </div>
          <div style="font-size: 18px; color: #00D9B8; margin-bottom: 16px;">Login erfolgreich!</div>
          <div style="color: rgba(255,255,255,0.7); line-height: 1.6;">
            Du kannst dieses Fenster schließen und zur Extension zurückkehren.
          </div>
          <div style="
            margin-top: 20px; padding: 12px 20px;
            background: rgba(0, 191, 166, 0.15);
            border: 1px solid rgba(0, 191, 166, 0.3);
            border-radius: 12px;
            font-size: 14px;
          ">
            Fenster schließt automatisch...
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Auto-close after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
  }
})();
