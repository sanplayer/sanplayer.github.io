// ============================================================================
// SERVICE WORKER - SanPlayer PWA
// ============================================================================

const CACHE_NAME = 'sanplayer-v1.0.3.0';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/media/MediaBridge.js',
    '/adapters/share.js',
    '/icons/favicon-96x96.webp',
    '/icons/favicon.svg',
    '/icons/icon192.png',
    '/icons/icon512.png',
    '/icons/package.svg',
    '/assets/splash.webp',
    '/assets/splash-wide.webp',
    '/assets/offline.webp',
    '/fonts/',
    '/data/playlists/index.json'
];

// Padrões adicionais de URLs a cachear dinamicamente
const DYNAMIC_CACHE_PATTERNS = [
    /^\/data\/playlists\/.+\.json$/,
    /^\/covers\/artists\/.+\.(webp|png|jpg)$/,
    /^\/covers\/playlists\/.+\.(webp|png|jpg)$/,
    /^\/icons\/.+\.(svg|webp|png|jpg)$/
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
// 6. ESTRATÉGIA DE BUSCA (FETCH) - Network First para dinâmicos, Cache First para estáticos
// ============================================================================

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // ❌ Ignorar requisições externas (YouTube/Google APIs)
    if (url.includes('youtube.com') || url.includes('googleapis.com') || url.includes('www.youtube.com')) {
        return;
    }

    // 🔄 Tratamento especial para o Manifest (sempre buscar versão nova, com fallback para cache)
    if (url.includes('manifest.json')) {
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

    // 📊 Estratégia para dados dinâmicos (playlists JSON, etc)
    // Network First: tenta network primeiro, fallback para cache se offline
    const isDynamicData = /^\/data\/playlists\/.+\.json$/.test(new URL(url).pathname);
    
    if (isDynamicData) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (!response || response.status !== 200) {
                        return response;
                    }
                    // Cachear a resposta bem-sucedida
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                })
                .catch(() => {
                    // Offline: retornar do cache se existir
                    return caches.match(event.request)
                        .then((cached) => cached || createOfflineFallback(url));
                })
        );
        return;
    }

    // 🖼️ Estratégia para assets estáticos (imagens, CSS, JS, covers)
    // Cache First: usar cache se existir, caso contrário buscar network
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) return response;

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                // Cachear resposta bem-sucedida
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                console.warn('[ServiceWorker] Falha em fetch offline:', url);
                return createOfflineFallback(url);
            });
        })
    );
});

/**
 * 🔒 Fallback para requisições offline
 * Retorna resposta apropriada de acordo com o tipo de requisição
 */
function createOfflineFallback(url) {
    // Se for imagem/cover, retornar um placeholder preto (cor do design)
    if (/\.(webp|png|jpg|jpeg)$/.test(url)) {
        return new Response(
            new Blob(
                [new Uint8Array([
                    // PNG preto 1x1px (hex: 000000)
                    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
                    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
                    0x54, 0x08, 0x99, 0x63, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x18, 0xDD,
                    0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
                    0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
                ])],
                { type: 'image/png' }
            ),
            { status: 200, headers: { 'Content-Type': 'image/png' } }
        );
    }

    // Se for JSON de playlist, retornar estrutura vazia
    if (url.includes('/data/playlists/')) {
        return new Response(
            JSON.stringify({ name: 'Offline', videos: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Fallback genérico: retornar 503 Service Unavailable
    // O navegador/app tratará naturalmente como erro offline
    return new Response(
        'Recurso não disponível offline',
        { 
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }
    );
}

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
