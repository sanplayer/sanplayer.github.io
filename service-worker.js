// ============================================================================
// SERVICE WORKER - SanPlayer PWA
// ============================================================================

const CACHE_NAME = 'sanplayer-v1';
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
                // Alguns recursos podem falhar, mas não queremos falhar na instalação
                console.warn('[ServiceWorker] Falha ao cachear alguns recursos:', err);
            });
        })
    );
    
    // Forçar o service worker a ficar ativo imediatamente
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
                    // Remover caches antigos
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Assumir controle de todos os clientes imediatamente
    self.clients.claim();
});

// ============================================================================
// ESTRATÉGIA: CACHE FIRST, FALLBACK PARA NETWORK
// COM TRATAMENTO ESPECIAL PARA MANIFEST
// ============================================================================

self.addEventListener('fetch', (event) => {
    // Ignorar requisições não-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ignorar requisições do YouTube (conteúdo externo)
    if (event.request.url.includes('youtube.com') || event.request.url.includes('googleapis.com')) {
        return;
    }

    // ✨ TRATAMENTO ESPECIAL: Manifest sempre atualizado (Network First)
    if (event.request.url.includes('manifest.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Sempre cache o manifest fresco
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Se falhar, usar cache antigo
                    return caches.match(event.request);
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Se encontrou no cache, returnar
            if (response) {
                console.log('[ServiceWorker] Respondendo do cache:', event.request.url);
                return response;
            }

            // Se não encontrou, tentar a rede
            return fetch(event.request).then((response) => {
                // Se a resposta foi bem-sucedida, cachear para futuras requisições
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                // Clonar a resposta antes de cachear (pois a resposta é usada uma vez)
                const responseToCache = response.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Se a rede falhar e não houver cache, retornar página offline (opcional)
                console.warn('[ServiceWorker] Falha na requisição:', event.request.url);
                // return caches.match('./index.html');
            });
        })
    );
});

// ============================================================================
// ATUALIZAÇÃO EM BACKGROUND (OPTIONAL)
// ============================================================================

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[ServiceWorker] Service Worker carregado');
