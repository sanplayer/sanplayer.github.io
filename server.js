/**
 * 🎵 SAN PLAYER - SERVIDOR EXPRESS
 * 
 * Propósito: OpenGraph dinâmica + Static serving
 * 
 * ⚠️ ARQUITETURA CRÍTICA:
 * - Express = APENAS injetor de metadata OG
 * - SPA app = 100% preservado e intacto
 * - Deep linking = funcionando normalmente
 * - App.js/share.js = sem alterações
 * 
 * Fluxo:
 * 1. GET /index.html?videoId=xyz → detecta param
 * 2. Busca metadata em cache/arquivos
 * 3. Injeta <meta property="og:*"> tags
 * 4. Devolve HTML com app intacto
 * 5. App bootstrappa normalmente (zero impacto)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const url = require('url');

const app = express();

// ============================================================================
// CACHE EM MEMÓRIA
// ============================================================================

const cache = {
    playlistsIndex: null,
    playlistsIndexTime: 0,
    playlistsData: new Map(), // Map<fileName, { data, timestamp }>
    CACHE_TTL: 60 * 60 * 1000, // 1 hora
};

// ============================================================================
// UTILITÁRIOS DE CACHE
// ============================================================================

/**
 * Verifica se cache expirou
 */
function isCacheExpired(timestamp) {
    return Date.now() - timestamp > cache.CACHE_TTL;
}

// ============================================================================
// DETECÇÃO DE CRAWLER vs NAVEGADOR HUMANO (FASE 1)
// ============================================================================

/**
 * Detecta se a requisição é de um crawler ou navegador humano
 * Retorna: { type: 'crawler'|'browser'|'unknown', name: 'string', isBot: boolean }
 */
function detectClient(userAgent) {
    if (!userAgent) {
        return { type: 'unknown', name: 'No User-Agent', isBot: null };
    }

    const ua = userAgent.toLowerCase();

    // 🤖 CRAWLERS DE REDES SOCIAIS
    const socialCrawlers = {
        'facebookexternalhit': 'Facebook Bot',
        'twitterbot': 'Twitter Bot',
        'telegrambot': 'Telegram Bot',
        'discordbot': 'Discord Bot',
        'whatsapp': 'WhatsApp',
        'linkedinbot': 'LinkedIn Bot',
        'pinterestbot': 'Pinterest Bot',
        'slurp': 'Yahoo Slurp',
    };

    // 🤖 SEARCH ENGINE CRAWLERS
    const searchCrawlers = {
        'googlebot': 'Google Bot',
        'bingbot': 'Bing Bot',
        'yandexbot': 'Yandex Bot',
        'baiduspider': 'Baidu Spider',
        'duckduckbot': 'DuckDuckGo Bot',
    };

    // 🤖 OUTRAS BOTS
    const otherBots = {
        'curl': 'cURL',
        'wget': 'Wget',
        'scrapy': 'Scrapy',
        'python': 'Python',
        'bot': 'Generic Bot',
        'spider': 'Generic Spider',
        'crawl': 'Generic Crawler',
    };

    // Verificar crawlers de redes sociais
    for (const [pattern, name] of Object.entries(socialCrawlers)) {
        if (ua.includes(pattern)) {
            return { type: 'crawler', name, isBot: true, category: 'social' };
        }
    }

    // Verificar search engine crawlers
    for (const [pattern, name] of Object.entries(searchCrawlers)) {
        if (ua.includes(pattern)) {
            return { type: 'crawler', name, isBot: true, category: 'search' };
        }
    }

    // Verificar outras bots
    for (const [pattern, name] of Object.entries(otherBots)) {
        if (ua.includes(pattern)) {
            return { type: 'crawler', name, isBot: true, category: 'other' };
        }
    }

    // 🌐 NAVEGADORES HUMANOS
    const browsers = {
        'chrome': 'Chrome',
        'firefox': 'Firefox',
        'safari': 'Safari',
        'edge': 'Edge',
        'opera': 'Opera',
        'mobile': 'Mobile Browser',
        'iphone': 'iPhone',
        'android': 'Android',
    };

    for (const [pattern, name] of Object.entries(browsers)) {
        if (ua.includes(pattern)) {
            return { type: 'browser', name, isBot: false, category: 'human' };
        }
    }

    // Fallback: se tem "Mozilla" provavelmente é navegador
    if (ua.includes('mozilla')) {
        return { type: 'browser', name: 'Mozilla-based Browser', isBot: false, category: 'human' };
    }

    return { type: 'unknown', name: userAgent.substring(0, 60), isBot: null, category: 'unknown' };
}

/**
 * Log estruturado de acesso (FASE 2: com ação de redirect/serving)
 */
function logAccess(req, clientInfo, action = 'UNKNOWN') {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.path;
    const queryString = req.url.split('?')[1] || '';
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Extrair query params interessantes
    const params = new URLSearchParams(queryString);
    const videoId = params.get('videoId') || '-';
    const playlistId = params.get('playlistId') || '-';
    const artistId = params.get('artistId') || '-';

    const emoji = clientInfo.isBot === true ? '🤖' : clientInfo.isBot === false ? '👤' : '❓';
    const category = clientInfo.category || 'unknown';

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ${emoji} ACESSO DETECTADO                                            ║
╚════════════════════════════════════════════════════════════════╝
[TIMESTAMP] ${timestamp}
[CLIENT]    ${clientInfo.type.toUpperCase()} (${clientInfo.name})
[CATEGORY]  ${category}
[ACTION]    ${action}
[METHOD]    ${method}
[PATH]      ${path}
[IP]        ${ip}
[PARAMS]    videoId=${videoId} | playlistId=${playlistId} | artistId=${artistId}
[USER-AGENT] ${req.get('user-agent')?.substring(0, 80)}
    `);
}

/**
 * Carrega index.json com cache
 */
function loadPlaylistsIndex() {
    if (cache.playlistsIndex && !isCacheExpired(cache.playlistsIndexTime)) {
        return cache.playlistsIndex;
    }

    try {
        // ⚠️ CRÍTICO: Usar caminhos relativos que funcionam em Render + local
        let indexPath = path.resolve('./data/playlists/index.json');
        
        if (!fs.existsSync(indexPath)) {
            indexPath = path.resolve(__dirname, 'data/playlists/index.json');
        }

        if (!fs.existsSync(indexPath)) {
            console.error('[Cache] index.json não encontrado. Cwd:', process.cwd(), '__dirname:', __dirname);
            return [];
        }

        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        cache.playlistsIndex = data;
        cache.playlistsIndexTime = Date.now();
        return data;
    } catch (error) {
        console.error('[Cache] Erro ao carregar index.json:', error.message);
        return [];
    }
}

/**
 * Carrega uma playlist com cache
 */
function loadPlaylist(fileName) {
    // Verificar cache válido
    const cached = cache.playlistsData.get(fileName);
    if (cached && !isCacheExpired(cached.timestamp)) {
        return cached.data;
    }

    try {
        // ⚠️ CRÍTICO: Usar caminhos relativos que funcionam em Render + local
        let playlistPath = path.resolve('./data/playlists', fileName);
        
        if (!fs.existsSync(playlistPath)) {
            playlistPath = path.resolve(__dirname, 'data/playlists', fileName);
        }

        if (!fs.existsSync(playlistPath)) {
            console.error(`[Cache] ${fileName} não encontrado. Cwd:`, process.cwd());
            return null;
        }

        const data = JSON.parse(fs.readFileSync(playlistPath, 'utf-8'));
        cache.playlistsData.set(fileName, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error(`[Cache] Erro ao carregar ${fileName}:`, error.message);
        return null;
    }
}

// ============================================================================
// FUNÇÕES DE BUSCA DE METADATA
// ============================================================================

/**
 * Busca um vídeo por ID em todas as playlists
 */
function findVideoById(videoId) {
    const index = loadPlaylistsIndex();

    for (const playlistMeta of index) {
        const playlist = loadPlaylist(path.basename(playlistMeta.url));
        if (!playlist || !playlist.playlists) continue;

        // Estrutura: { playlists: [{ name, videos: [...] }] }
        for (const playlistGroup of playlist.playlists) {
            if (!playlistGroup.videos) continue;

            for (const video of playlistGroup.videos) {
                if (video.id === videoId) {
                    return {
                        video,
                        playlist: playlistGroup,
                        playlistMeta,
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Busca uma playlist por nome (case-insensitive)
 */
function findPlaylist(playlistId) {
    const index = loadPlaylistsIndex();

    // Buscar por name ou title (case-insensitive)
    const found = index.find(
        p => (p.name || '').toLowerCase() === playlistId.toLowerCase() ||
             (p.title || '').toLowerCase() === playlistId.toLowerCase()
    );

    if (found) {
        const playlist = loadPlaylist(path.basename(found.url));
        if (playlist && playlist.playlists && playlist.playlists.length > 0) {
            return {
                meta: found,
                data: playlist.playlists[0],
            };
        }
    }

    return null;
}

/**
 * Busca todos os vídeos de um artista
 */
function findArtistVideos(artistName) {
    const index = loadPlaylistsIndex();
    const videos = [];

    for (const playlistMeta of index) {
        const playlist = loadPlaylist(path.basename(playlistMeta.url));
        if (!playlist || !playlist.playlists) continue;

        for (const playlistGroup of playlist.playlists) {
            if (!playlistGroup.videos) continue;

            for (const video of playlistGroup.videos) {
                // Normalizar comparação (case-insensitive, trim)
                if ((video.artist || '').trim().toLowerCase() === artistName.trim().toLowerCase()) {
                    videos.push(video);
                }
            }
        }
    }

    return videos;
}

// ============================================================================
// GERADOR DE OPEN GRAPH DINÂMICA
// ============================================================================

/**
 * Build YouTube thumbnail URL
 */
function getYouTubeThumbnail(videoId) {
    // Usar highest quality disponível
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Build artist cover URL
 * Procura arquivo em /covers/artists/{artistName}.{jpg|png|webp}
 */
function getArtistCoverUrl(artistName) {
    if (!artistName) {
        return 'https://sanplayer.github.io/icons/og-image.webp';
    }

    // Normalizar nome do artista para procurar arquivo
    // Converter para lowercase e substituir espaços por hífens
    const normalizedName = artistName.toLowerCase().replace(/\s+/g, '-');
    
    // Tentar encontrar arquivo de cover
    let coversPath = path.resolve('./covers/artists');
    if (!fs.existsSync(coversPath)) {
        coversPath = path.resolve(__dirname, 'covers/artists');
    }
    
    if (!fs.existsSync(coversPath)) {
        console.warn(`[Artist] Diretório ${coversPath} não encontrado`);
        return 'https://sanplayer.github.io/icons/og-image.webp';
    }
    
    // Tentar extensões comuns
    const extensions = ['jpg', 'png', 'webp'];
    for (const ext of extensions) {
        const filePath = path.join(coversPath, `${normalizedName}.${ext}`);
        if (fs.existsSync(filePath)) {
            console.log(`[Artist] Cover encontrado: ${normalizedName}.${ext}`);
            return `https://sanplayer.github.io/covers/artists/${normalizedName}.${ext}`;
        }
    }
    
    // Fallback para imagem padrão
    console.warn(`[Artist] Cover não encontrado para: ${artistName} (normalizado: ${normalizedName})`);
    return 'https://sanplayer.github.io/icons/og-image.webp';
}

/**
 * Gera OpenGraph baseada em query params
 */
function generateOpenGraph(videoId, playlistId, artistId) {
    const baseUrl = 'https://sanplayer.github.io';
    const defaultOG = {
        title: 'SanPlayer',
        description: 'Música para os seus ouvidos',
        image: `${baseUrl}/icons/og-image.webp`,
        url: baseUrl,
    };

    try {
        // PRIORIDADE 1: videoId
        if (videoId) {
            const found = findVideoById(videoId);
            if (found) {
                return {
                    title: `${found.video.title} • ${found.video.artist}`,
                    description: `Escutando: ${found.video.title} - ${found.video.artist} no SanPlayer`,
                    image: getYouTubeThumbnail(videoId),
                    url: `${baseUrl}/?videoId=${videoId}`,
                };
            }
        }

        // PRIORIDADE 2: playlistId
        if (playlistId) {
            const found = findPlaylist(playlistId);
            if (found) {
                const videoCount = (found.data.videos || []).length;
                return {
                    title: `${found.meta.title || found.meta.name} • Playlist`,
                    description: `${videoCount} músicas na playlist ${found.meta.title || found.meta.name}`,
                    image: `${baseUrl}/covers/playlists/${found.meta.cover || 'default.jpg'}`,
                    url: `${baseUrl}/?playlistId=${encodeURIComponent(playlistId)}`,
                };
            }
        }

        // PRIORIDADE 3: artistId
        if (artistId) {
            const videos = findArtistVideos(artistId);
            if (videos.length > 0) {
                return {
                    title: `${artistId} • Artista`,
                    description: `${videos.length} músicas de ${artistId} no SanPlayer`,
                    image: getArtistCoverUrl(artistId),
                    url: `${baseUrl}/?artistId=${encodeURIComponent(artistId)}`,
                };
            }
        }

        // Fallback
        return defaultOG;
    } catch (error) {
        console.error('[OG] Erro ao gerar OpenGraph:', error);
        return defaultOG;
    }
}

// ============================================================================
// INJEÇÃO DE OG NO HTML
// ============================================================================

/**
 * Injeta meta tags OG no HTML
 */
function injectOpenGraphTags(htmlContent, og) {
    const metaTags = `    <meta property="og:title" content="${escapeHtml(og.title)}">
    <meta property="og:description" content="${escapeHtml(og.description)}">
    <meta property="og:image" content="${og.image}">
    <meta property="og:url" content="${og.url}">
    <meta property="og:type" content="website">    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">    <meta name="twitter:title" content="${escapeHtml(og.title)}">
    <meta name="twitter:description" content="${escapeHtml(og.description)}">
    <meta name="twitter:image" content="${og.image}">`;

    // Remover meta tags OG antigas (se existirem)
    let updated = htmlContent.replace(
        /<meta property="og:title"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta property="og:description"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta property="og:image"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta property="og:url"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta name="twitter:title"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta name="twitter:description"[^>]*>[\s\n]*/g,
        ''
    ).replace(
        /<meta name="twitter:image"[^>]*>[\s\n]*/g,
        ''
    );

    // Injetar tags novas ANTES de </head>
    updated = updated.replace('</head>', `${metaTags}\n   </head>`);

    return updated;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

// 🔥 ROTA PRINCIPAL: GET /index.html com OG dinâmica + Redirect Inteligente
app.get(['/', '/index.html', '/index.htm'], (req, res) => {
    try {
        // ============================================================
        // FASE 2: DETECÇÃO + REDIRECT INTELIGENTE
        // ============================================================
        const userAgent = req.get('user-agent') || '';
        const clientInfo = detectClient(userAgent);
        
        // 🚀 NOVA LÓGICA FASE 2: Redirect para navegadores humanos
        // Crawlers e clientes desconhecidos recebem OG dinâmica
        if (clientInfo.type === 'browser') {
            // Redirecionador inteligente: preserva TODOS os query params
            const redirectUrl = `https://sanplayer.github.io${req.originalUrl}`;
            logAccess(req, clientInfo, 'REDIRECTING');
            console.log(`[Redirect] ${req.originalUrl} → ${redirectUrl}`);
            return res.redirect(302, redirectUrl);
        }
        
        // Crawlers e Unknown: servir OG dinâmica (favor à segurança)
        logAccess(req, clientInfo, 'SERVING_OG');
        
        // ============================================================
        // Extrair query params
        const videoId = req.query.videoId || null;
        const playlistId = req.query.playlistId || null;
        const artistId = req.query.artistId || null;

        console.log(`[Server] GET ${req.path} - params:`, { videoId, playlistId, artistId });

        // Gerar OG dinâmica
        const og = generateOpenGraph(videoId, playlistId, artistId);
        console.log(`[Server] OG gerada:`, og);

        // Ler HTML original
        // ⚠️ CRÍTICO: Usar caminhos relativos que funcionam em Render + local
        let htmlPath = path.resolve('./index.html');
        
        // Fallback se não existir no cwd (caso raro)
        if (!fs.existsSync(htmlPath)) {
            htmlPath = path.resolve(__dirname, 'index.html');
        }
        
        // Último fallback: procurar em diretório pai
        if (!fs.existsSync(htmlPath)) {
            htmlPath = path.resolve(__dirname, '..', 'index.html');
        }

        if (!fs.existsSync(htmlPath)) {
            console.error('[Server] ERRO CRÍTICO: index.html não encontrado em nenhum caminho:');
            console.error('[Server] Tentou:', path.resolve('./index.html'));
            console.error('[Server] Tentou:', path.resolve(__dirname, 'index.html'));
            console.error('[Server] Tentou:', path.resolve(__dirname, '..', 'index.html'));
            console.error('[Server] Cwd:', process.cwd());
            console.error('[Server] __dirname:', __dirname);
            res.status(500).send('Erro: index.html não encontrado. Verifique a configuração do servidor.');
            return;
        }

        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Injetar OG tags
        htmlContent = injectOpenGraphTags(htmlContent, og);

        // Responder com status 200 e Content-Type correto
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(htmlContent);

    } catch (error) {
        console.error('[Server] Erro ao processar /index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ============================================================================
// STATIC SERVING (FALLBACK)
// ============================================================================

// Servir todos os arquivos estáticos (CSS, JS, JSON, imagens, etc)
app.use(express.static('.'));

// Fallback 404 → /index.html (para SPA compatibility)
app.use((req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(htmlPath);
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

// 🧪 DIAGNÓSTICO: Verificar estrutura de arquivos
function runDiagnostics() {
    console.log(`
╔════════════════════════════════════════╗
║  🔍 DIAGNÓSTICO DE AMBIENTE            ║
╚════════════════════════════════════════╝
    `);
    console.log('[Diag] Cwd:', process.cwd());
    console.log('[Diag] __dirname:', __dirname);
    console.log('[Diag] NODE_ENV:', process.env.NODE_ENV || 'development');
    
    // Verificar arquivos críticos
    const filesToCheck = [
        './index.html',
        'index.html',
        path.resolve('./index.html'),
        path.resolve(__dirname, 'index.html'),
        './data/playlists/index.json',
        'data/playlists/index.json',
        path.resolve('./data/playlists/index.json'),
    ];

    console.log('[Diag] Verificando arquivos:');
    filesToCheck.forEach(file => {
        const exists = fs.existsSync(file);
        console.log(`  ${exists ? '✅' : '❌'} ${file}`);
    });
}

app.listen(PORT, () => {
    // Diagnóstico
    runDiagnostics();
    
    console.log(`
╔════════════════════════════════════════╗
║  🎵 SAN PLAYER - Server Express        ║
║  🌐 http://localhost:${PORT}                ║
║  ✅ OG dinâmica ativada                ║
║  ✅ Deep linking preservado            ║
║  ✅ Static serving funcional           ║
╚════════════════════════════════════════╝
    `);
});

module.exports = app;
