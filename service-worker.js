// ============================================================================
// SERVICE WORKER - SanPlayer PWA
// ============================================================================

const CACHE_NAME = 'sanplayer-v1.5.4';
const URLS_TO_CACHE = [
    '/',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/favicon-96x96.png',
    '/icons/favicon.svg',
    '/icons/icon192.png',
    '/icons/icon512.png',
    '/icons/package.svg'
];

// ============================================================================
// 1. INSTALAÇÃO DO SERVICE WORKER
// ============================================================================

self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing... CACHE_NAME:', CACHE_NAME);
    
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
// 2. ATIVAÇÃO E LIMPEZA DE CACHE
// ============================================================================

self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating... CACHE_NAME:', CACHE_NAME);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            console.log('[ServiceWorker] Caches existentes:', cacheNames);
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
    console.log('[ServiceWorker] Ativado e reclamou todos os clientes');
});

// ============================================================================
// 3. BACKGROUND SYNC (Sincronização em segundo plano)
// ============================================================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-playlists') {
        console.log('[ServiceWorker] Sincronizando dados pendentes...');
        // Lógica futura para enviar dados locais ao servidor quando a rede voltar
    }
});

// ============================================================================
// 4. PERIODIC BACKGROUND SYNC (Sincronização periódica)
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
// 5. PUSH NOTIFICATIONS (Notificações)
// ============================================================================

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { 
        title: 'SanPlayer', 
        body: 'Confira as novidades no seu player!' 
    };

    const options = {
        body: data.body,
        icon: '/icons/icon192.png',
        badge: '/icons/favicon-96x96.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Ação ao clicar na notificação
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/index.html')
    );
});

// ============================================================================
// 6. ESTRATÉGIA DE BUSCA (FETCH) - Cache First com Fallback para Network
// ============================================================================

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Ignorar requisições externas (YouTube/Google APIs)
    if (event.request.url.includes('youtube.com') || event.request.url.includes('googleapis.com')) {
        return;
    }

    // Tratamento especial para o Manifest (sempre buscar versão nova)
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
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) return response;

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
                console.warn('[ServiceWorker] Falha na requisição offline:', event.request.url);
            });
        })
    );
});

// ============================================================================
// 7. MENSAGENS E ATUALIZAÇÃO
// ============================================================================

self.addEventListener('message', (event) => {
    console.log('[ServiceWorker] Mensagem recebida:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[ServiceWorker] 🔄 SKIP_WAITING recebido - ativando novo worker...');
        self.skipWaiting();
        console.log('[ServiceWorker] ✅ skipWaiting() chamado');
    }
});

console.log('[ServiceWorker] SanPlayer Service Worker Ativo');