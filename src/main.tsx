import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for Android PWA WebAPK installation & offline caching
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Corner Cafe POS ServiceWorker active:', registration.scope);

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version is installed; notify app
                window.dispatchEvent(
                  new CustomEvent('app_toast', {
                    detail: {
                      id: 'update-' + Date.now(),
                      message: 'New app update available! Refresh to get latest features.',
                      type: 'info',
                    },
                  })
                );
              }
            };
          }
        };
      })
      .catch((error) => {
        console.warn('ServiceWorker registration error:', error);
      });
  });
}

// A previous PWA installation must not serve stale source modules in development.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      if (registration.scope === window.location.origin + '/') void registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
