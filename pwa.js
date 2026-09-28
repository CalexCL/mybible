(() => {
  'use strict';

  let deferredPrompt = null;
  let installButton = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function ensureInstallButton() {
    if (isStandalone() || installButton) return;
    const host = document.querySelector('.top-actions');
    if (!host) return;

    installButton = document.createElement('button');
    installButton.id = 'installAppBtn';
    installButton.className = 'icon-btn';
    installButton.type = 'button';
    installButton.title = 'Install MyBible';
    installButton.setAttribute('aria-label', 'Install MyBible');
    installButton.textContent = '⇩';
    installButton.style.display = 'none';

    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      installButton.disabled = true;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
        installButton.style.display = 'none';
        installButton.disabled = false;
      }
    });

    host.insertBefore(installButton, host.firstChild);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    ensureInstallButton();
    if (installButton) installButton.style.display = 'grid';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installButton) installButton.style.display = 'none';
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureInstallButton();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js', { scope: './' })
          .catch(err => console.warn('[MyBible] service worker registration failed:', err));
      });
    }
  });
})();