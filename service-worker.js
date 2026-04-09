// ============================================================================
// SERVICE WORKER - SanPlayer PWA
// ============================================================================

const CACHE_NAME = 'sanplayer-v1.0.3';
const URLS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/favicon-96x96.png',
    './icons/favicon.svg',
    './icons/icon192.png',
    './icons/icon512.png'
];

// ============================================================================
// INSTALAÇÃO DO SERVICE WORKER
// ============================================================================

self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching app shell');
            return cache.addAll(URLS_TO_CACHE).catch((err) => {
                console.warn('[ServiceWorker] Falha ao cachear alguns recursos:', err);
            });
        })
    );
    
    self.skipWaiting();
});

// ============================================================================
// ATIVAÇÃO DO SERVICE WORKER
// ============================================================================

self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    self.clients.claim();
});

// ============================================================================
// BACKGROUND SYNC - Sincronização em segundo plano
// ============================================================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-playlists') {
        console.log('[ServiceWorker] Sincronizando dados pendentes...');
        // Aqui você pode adicionar a lógica para enviar dados ao seu servidor ou banco local
        // event.waitUntil(suaFuncaoDeSync()); 
    }
});

// ============================================================================
// PERIODIC BACKGROUND SYNC - Sincronização periódica
// ============================================================================

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-cache-periodically') {
        console.log('[ServiceWorker] Atualizando conteúdo periodicamente...');
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(URLS_TO_CACHE);
            })
        );
    }
});

// ============================================================================
// ESTRATÉGIA: CACHE FIRST, FALLBACK PARA NETWORK
// ============================================================================

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    if (event.request.url.includes('youtube.com') || event.request.url.includes('googleapis.com')) {
        return;
    }

    if (event.request.url.includes('manifest.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                console.warn('[ServiceWorker] Falha na requisição:', event.request.url);
            });
        })
    );
});

// ============================================================================
// MENSAGENS E ATUALIZAÇÃO
// ============================================================================

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[ServiceWorker] Service Worker carregado e pronto');