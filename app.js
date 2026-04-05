// ============================================================================
// ESTADO GLOBAL
// ============================================================================

const player = {
    playlistsIndex: [],             // Metadata from index.json only
    playlistsData: [],              // Legacy, now used for cache reference
    currentPlaylist: null,
    currentPlaylistIndex: null,
    currentVideoIndex: 0,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 0,                  // 0: no repeat, 1: repeat all, 2: repeat one
    favorites: [],
    currentDuration: 0,
    currentTime: 0,
    playOrder: [],
    originalOrder: [],
    ytReady: false,
    shouldPlayOnReady: false,
    viewingFavorites: false,
    currentFavoriteId: null,        // ID do favorito quando visualizando favoritos
    isLoadingPlaylist: false,       // Flag para indicar carregamento
};

// ============================================================================
// CACHE E ESTADO DE REQUISIÇÕES
// ============================================================================

const playlistCache = new Map();    // Map<url, playlistData>
let playlistLoadController = null;  // AbortController para requisições de playlist
let allPlaylistsLoadController = null; // AbortController para carregar todos os playlists

let ytPlayer = null;
let ytPlayerInitialized = false;
let updateProgressInterval = null;
let progressDragging = false;
let addingItemToPlaylist = false;   // Flag para indicar se estamos adicionando um item a uma playlist
let previousPlaylistState = null;   // Guardar estado anterior de playlist
let videoToAdd = null;              // Guardar vídeo a ser adicionado

// PWA Install
let pwaInstallPrompt = null;        // Será preenchido pelo evento beforeinstallprompt
let pwaInstallTimeout = null;       // Timer para mostrar o prompt depois de 30s

// Keyboard offset throttle
let keyboardOffsetTimeout = null;   // Throttle para updateKeyboardOffset

// Theme Color Control (Android Navbar - PWA Excellence)
const THEME_COLOR = '#0f0f0f';
let metaThemeColor = null;


// ============================================================================
// CAMADA DE DADOS - LAZY LOADING COM CACHE
// ============================================================================

/**
 * Carrega o índice de playlists (metadados)
 * @returns {Promise<Array>}
 */
async function loadPlaylistsIndex() {
    try {
        const response = await fetch('./data/playlists/index.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const index = await response.json();
        player.playlistsIndex = Array.isArray(index) ? index : [];
        return player.playlistsIndex;
    } catch (error) {
        console.error('Erro ao carregar índice de playlists:', error);
        return [];
    }
}

/**
 * Carrega uma playlist individual usando sua URL
 * @param {String} url - URL da playlist (do index.json)
 * @returns {Promise<Object|null>}
 */
async function loadPlaylistByUrl(url) {
    if (!url) return null;

    // Verificar cache
    if (playlistCache.has(url)) {
        return playlistCache.get(url);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        // Extrair playlist da estrutura wrapper
        // Estrutura esperada: { playlists: [{ name, coverage, videos }] }
        const playlist = (data.playlists && data.playlists[0]) ? data.playlists[0] : data;
        
        // Armazenar em cache
        playlistCache.set(url, playlist);
        return playlist;
    } catch (error) {
        console.error(`Erro ao carregar playlist (${url}):`, error);
        return null;
    }
}

/**
 * Carrega todas as playlists (para funcionalidades que precisam de todos os dados)
 * Usa cache quando possível
 * @returns {Promise<Array>}
 */
async function loadAllPlaylists() {
    if (player.playlistsIndex.length === 0) {
        await loadPlaylistsIndex();
    }

    const playlists = [];
    
    for (const playlistMeta of player.playlistsIndex) {
        if (!playlistMeta.url) continue;
        
        const playlist = await loadPlaylistByUrl(playlistMeta.url);
        if (playlist) {
            playlists.push(playlist);
        }
    }

    return playlists;
}

/**
 * Busca uma playlist por ID no index
 * @param {String} playlistId - ID da playlist
 * @returns {Object|null}
 */
function findPlaylistMetaById(playlistId) {
    return player.playlistsIndex.find(pl => pl.id === playlistId) || null;
}

/**
 * Busca um vídeo por ID em todas as playlists carregadas (cache + index)
 * @param {String} videoId - ID do vídeo
 * @returns {Promise<Object>} {playlist, video, playlistIndex}
 */
async function findVideoById(videoId) {
    // Primeiro, verificar playlists já em cache
    for (const [url, playlist] of playlistCache) {
        if (playlist.videos) {
            for (let i = 0; i < playlist.videos.length; i++) {
                if (playlist.videos[i].id === videoId) {
                    const playlistMeta = player.playlistsIndex.find(p => p.url === url);
                    return {
                        playlist: playlist,
                        video: playlist.videos[i],
                        playlistIndex: player.playlistsIndex.indexOf(playlistMeta),
                        videoIndex: i
                    };
                }
            }
        }
    }

    // Se não estiver em cache, carregar todas as playlists
    const allPlaylists = await loadAllPlaylists();
    for (let playlistIndex = 0; playlistIndex < allPlaylists.length; playlistIndex++) {
        const playlist = allPlaylists[playlistIndex];
        if (playlist.videos) {
            for (let i = 0; i < playlist.videos.length; i++) {
                if (playlist.videos[i].id === videoId) {
                    return {
                        playlist: playlist,
                        video: playlist.videos[i],
                        playlistIndex: playlistIndex,
                        videoIndex: i
                    };
                }
            }
        }
    }

    return null;
}

// ============================================================================
// FUNÇÕES DE RENDER REUTILIZÁVEIS
// ============================================================================

/**
 * Renderiza um card para playlist, artista ou música
 * @param {Object} data - {src, title, subtitle}
 * @returns {HTMLElement}
 */
function renderCard(data) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const img = document.createElement('img');
    img.src = data.src;
    img.alt = data.title;
    img.className = 'card-image';
    img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
    
    const body = document.createElement('div');
    body.className = 'card-body';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = data.title;
    
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'card-subtitle';
    subtitleEl.textContent = data.subtitle;
    
    body.appendChild(titleEl);
    body.appendChild(subtitleEl);
    card.appendChild(img);
    card.appendChild(body);
    
    return card;
}

/**
 * Renderiza item de playlist
 * @param {Object} video - {id, title, artist}
 * @param {Number} index - índice na lista
 * @returns {HTMLElement}
 */
function renderPlaylistItem(video, index) {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    
    const img = document.createElement('img');
    img.src = getArtistCoverUrl(video.artist);
    img.alt = video.artist;
    img.className = 'thumb-mini';
    img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
    
    const info = document.createElement('div');
    info.className = 'playlist-info';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'm-title';
    titleEl.textContent = video.title;
    
    const artistEl = document.createElement('span');
    artistEl.className = 'm-artist';
    artistEl.textContent = video.artist;
    
    info.appendChild(titleEl);
    info.appendChild(artistEl);
    
    const kebabBtn = document.createElement('button');
    kebabBtn.className = 'kebab-btn';
    kebabBtn.setAttribute('data-index', index);
    kebabBtn.setAttribute('title', 'Opções');
    const kebabIcon = document.createElement('i');
    kebabIcon.className = 'material-icons';
    kebabIcon.textContent = 'more_vert';
    kebabBtn.appendChild(kebabIcon);
    
    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(kebabBtn);
    
    return item;
}

/**
 * Renderiza header do modal com thumbnail + título + artista + botão fechar
 * @param {Object} video - {title, artist}
 * @param {Function} onClose - callback para fechar
 * @returns {HTMLElement}
 */
function renderModalHeader(video, onClose) {
    const header = document.createElement('div');
    header.className = 'modal-header--item';
    
    const img = document.createElement('img');
    img.src = getArtistCoverUrl(video.artist);
    img.alt = video.artist;
    img.className = 'thumb';
    img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
    
    const meta = document.createElement('div');
    meta.className = 'meta';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'title';
    titleEl.textContent = video.title;
    
    const artistEl = document.createElement('div');
    artistEl.className = 'artist';
    artistEl.textContent = video.artist;
    
    meta.appendChild(titleEl);
    meta.appendChild(artistEl);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'material-icons';
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', onClose);
    
    header.appendChild(img);
    header.appendChild(meta);
    header.appendChild(closeBtn);
    
    return header;
}

/**
 * Renderiza linha de opção do modal (kebab)
 * @param {Object} data - {icon, text, onClick}
 * @returns {HTMLElement}
 */
function renderOptionRow(data) {
    const row = document.createElement('div');
    row.className = 'option-row is-clickable';
    
    const icon = document.createElement('div');
    icon.className = 'option-icon';
    const i = document.createElement('i');
    i.className = 'material-icons';
    i.textContent = data.icon;
    icon.appendChild(i);
    
    const text = document.createElement('div');
    text.className = 'option-text';
    text.textContent = data.text;
    
    row.appendChild(icon);
    row.appendChild(text);
    
    if (data.onClick) {
        row.addEventListener('click', data.onClick);
    }
    
    return row;
}

/**
 * Renderiza separador visual
 * @returns {HTMLElement}
 */
function renderSeparator() {
    const sep = document.createElement('div');
    sep.className = 'option-separator';
    return sep;
}

async function initApp() {
    initPlayerUI(); // Inicializa UI primeiro

    await loadPlaylists();
    setupEventListeners();
    loadFavorites();
    setupMobileSearch();
    setupSidbarMobile();

    // Ajustes de layout dependentes do DOM (header/footer)
    setLayoutVars();
    // Atualizar quando a janela for redimensionada
    window.addEventListener('resize', setLayoutVars);

    // Setup do teclado mobile com delay seguro para inicialização
    // Garante que o visualViewport tenha dados precisos
    document.documentElement.style.setProperty('--keyboard-offset', '0px');
    
    setTimeout(() => {
        updateKeyboardOffset();
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateKeyboardOffset);
            window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
            // Detectar zoom
            window.visualViewport.addEventListener('resize', detectZoomChange);
        }
    }, 100);

    // Inicializar detecção de zoom
    initZoomDetection();

    // Registrar Service Worker
    initServiceWorker();
    
    // Inicializar listeners de PWA install
    initPWAInstall();
    
    // ✨ EXCELÊNCIA PWA: Sincronizar tema de Android
    initThemeColor();

    safeRender();
}

document.addEventListener('DOMContentLoaded', initApp);

function safeRender() {
    requestAnimationFrame(() => {
        refreshPlayerUI();
    });
}


// Sincroniza as variáveis CSS de altura do header/footer com os valores reais do DOM
function setLayoutVars() {
    const root = document.documentElement;
    const footer = document.querySelector('.app-player-footer');
    const header = document.querySelector('.app-header');

    const footerHeight = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;

    if (footer) root.style.setProperty('--footer-height', `${footerHeight}px`);
    if (header) root.style.setProperty('--header-height', `${headerHeight}px`);

    // Usar ResizeObserver apenas para footer (header não muda de altura dinamicamente)
    if (typeof ResizeObserver !== 'undefined' && footer && !footer.__observing) {
        try {
            const ro = new ResizeObserver(() => setLayoutVars());
            ro.observe(footer);
            footer.__observing = true;
        } catch (e) {
            // ignore
        }
    }
}

// Atualiza offset do teclado mobile usando visualViewport (com throttle)
function updateKeyboardOffset() {
    // Throttle: só atualiza a cada 100ms máximo (evita flutuar em mobile)
    if (keyboardOffsetTimeout) return;
    
    keyboardOffsetTimeout = setTimeout(() => {
        keyboardOffsetTimeout = null;
    }, 100);
    
    const vv = window.visualViewport;
    if (!vv) return;

    // Calcula o offset do teclado
    const offset = window.innerHeight - (vv.height + vv.offsetTop);
    
    // Valida se o offset é razoável (não pode ser maior que 50% da tela)
    // Para evitar valores absurdos na inicialização
    const maxReasonableOffset = window.innerHeight * 0.5;
    const validOffset = Math.max(0, Math.min(offset, maxReasonableOffset));
    
    document.documentElement.style.setProperty(
        '--keyboard-offset',
        `${validOffset}px`
    );
}

// ============================================================================
// DETECÇÃO DE ZOOM (ACESSIBILIDADE)
// ============================================================================

let previousZoomLevel = 1;
let zoomAlertShown = false; // Flag para evitar múltiplos alertas

function initZoomDetection() {
    // Detector inicial via visualViewport
    if (window.visualViewport) {
        previousZoomLevel = window.visualViewport.scale;
    } else {
        previousZoomLevel = 1;
    }
}

function detectZoomChange() {
    if (!window.visualViewport) return;
    
    const currentZoom = window.visualViewport.scale;
    
    // Detectar qualquer zoom acima do threshold (independente de velocidade)
    if (currentZoom > 1.01 && !zoomAlertShown) {
        // Mostrar alert apenas uma vez até o zoom ser cancelado
        showZoomAlert();
        zoomAlertShown = true;
    }
    // Se voltou ao normal (zoom = 1), resetar a flag
    else if (currentZoom <= 1.01) {
        zoomAlertShown = false;
    }
    
    previousZoomLevel = currentZoom;
}

function showZoomAlert() {
    const modal = document.getElementById('zoomAlertModal');
    const understandBtn = document.getElementById('zoomUnderstandBtn');
    
    if (!modal) return;
    
    // Exibir modal
    modal.style.display = 'flex';
    
    // Handler para botão "Entendi"
    understandBtn.onclick = () => {
        closeZoomAlert();
    };
}

function closeZoomAlert() {
    const modal = document.getElementById('zoomAlertModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============================================================================
// PWA - SERVICE WORKER REGISTRATION
// ============================================================================

function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').then((registration) => {
            console.log('[App] Service Worker registrado com sucesso:', registration);
            
            // Verificar atualizações a cada 1 minuto
            setInterval(() => {
                registration.update();
            }, 60 * 1000);
        }).catch((error) => {
            console.warn('[App] Erro ao registrar Service Worker:', error);
        });
    }
}

// ============================================================================
// PWA - INSTALL PROMPT HANDLER
// ============================================================================

function initPWAInstall() {
    // Capturar o evento beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (event) => {
        console.log('[App] beforeinstallprompt disparado');
        
        // Prevenir o prompt nativo padrão
        event.preventDefault();
        
        // Guardar o evento para usar depois
        pwaInstallPrompt = event;
        
        // Mostrar o prompt customizado após 30 segundos
        pwaInstallTimeout = setTimeout(() => {
            showPWAInstallPrompt();
        }, 60000); // 60 segundos
    });

    // Capturar quando o app for instalado
    window.addEventListener('appinstalled', () => {
        console.log('[App] PWA instalado com sucesso!');
        pwaInstallPrompt = null;
        closePWAInstallPrompt();
    });

    // Configurar botões do modal
    const cancelBtn = document.getElementById('pwaInstallCancelBtn');
    const confirmBtn = document.getElementById('pwaInstallConfirmBtn');
    
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            closePWAInstallPrompt();
        };
    }
    
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            triggerPWAInstall();
        };
    }
}

function showPWAInstallPrompt() {
    if (!pwaInstallPrompt) return;
    
    const modal = document.getElementById('pwaInstallPromptModal');
    if (modal) {
        modal.style.display = 'flex';
        console.log('[App] Modal de instalação PWA exibido');
    }
}

function closePWAInstallPrompt() {
    const modal = document.getElementById('pwaInstallPromptModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Limpar timer
    if (pwaInstallTimeout) {
        clearTimeout(pwaInstallTimeout);
        pwaInstallTimeout = null;
    }
}

function triggerPWAInstall() {
    if (!pwaInstallPrompt) return;
    
    // Disparar o prompt nativo
    pwaInstallPrompt.prompt();
    
    // Esperar o resultado do usuário
    pwaInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('[App] Usuário aceitou a instalação PWA');
        } else {
            console.log('[App] Usuário rejeitou a instalação PWA');
        }
        
        pwaInstallPrompt = null;
        closePWAInstallPrompt();
    });
}

// ============================================================================
// THEME COLOR CONTROL - Android Navbar Excellence
// ============================================================================

function initThemeColor() {
    // Obter a tag meta de theme-color
    metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (!metaThemeColor) {
        console.warn('[App] Meta tag theme-color não encontrada');
        return;
    }
    
    // Aplicar tema na inicialização
    setThemeColor(THEME_COLOR);
    
    // Aplicar quando app entra em foco (voltando do background)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // App voltou do background
            setTimeout(() => {
                setThemeColor(THEME_COLOR);
            }, 10);
        }
    });
    
    // Verificar se está em modo standalone (PWA instalado)
    if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('[App] Executando em modo PWA standalone');
        setThemeColor(THEME_COLOR);
    }
    
    // Listener para mudanças de display mode (em caso de instalação/desinstalação)
    window.matchMedia('(display-mode: standalone)').addListener((e) => {
        if (e.matches) {
            console.log('[App] PWA agora em modo standalone');
            setThemeColor(THEME_COLOR);
        }
    });
    
    console.log('[App] Theme color initialized:', THEME_COLOR);
}

function setThemeColor(color) {
    if (!metaThemeColor) return;
    
    const currentColor = metaThemeColor.getAttribute('content');
    
    // Só atualizar se diferente (evita reflow desnecessário)
    if (currentColor !== color) {
        metaThemeColor.setAttribute('content', color);
        console.log('[App] Theme color atualizada para:', color);
    }
}

// ============================================================================
// UI Template Initialization
// ============================================================================

// Criar UI template uma única vez
function initPlayerUI() {
    const blockInfo = document.querySelector('.block-info');
    
    // Limpar apenas se necessário (primeira vez)
    blockInfo.innerHTML = '';
    
    const img = document.createElement('img');
    img.className = 'current-thumb';
    img.src = 'covers/artists/default.jpg';
    img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
    
    const currentDetails = document.createElement('div');
    currentDetails.className = 'current-details';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'c-title';
    titleEl.textContent = '';
    
    const artistEl = document.createElement('span');
    artistEl.className = 'c-artist';
    artistEl.textContent = '';
    
    currentDetails.appendChild(titleEl);
    currentDetails.appendChild(artistEl);
    
    const currentActions = document.createElement('div');
    currentActions.className = 'current-actions';
    
    const favButton = document.createElement('button');
    favButton.id = 'favButton';
    favButton.setAttribute('aria-label', 'Adicionar aos favoritos');
    const favIcon = document.createElement('i');
    favIcon.className = 'material-icons';
    favIcon.id = 'favIcon';
    favIcon.textContent = 'favorite_border';
    favButton.appendChild(favIcon);
    
    const shareButton = document.createElement('button');
    shareButton.id = 'shareButton';
    shareButton.setAttribute('aria-label', 'Compartilhar');
    const shareIcon = document.createElement('i');
    shareIcon.className = 'material-icons reply';
    shareIcon.textContent = 'reply';
    shareButton.appendChild(shareIcon);
    
    currentActions.appendChild(favButton);
    currentActions.appendChild(shareButton);
    
    blockInfo.appendChild(img);
    blockInfo.appendChild(currentDetails);
    blockInfo.appendChild(currentActions);
    
    document.getElementById('favButton').addEventListener('click', toggleFavorite);
    document.getElementById('shareButton').addEventListener('click', shareMusic);
}

async function handleHashNavigation() {
    const hash = window.location.hash;
    if (hash.includes('videoId=')) {
        const videoId = hash.split('videoId=')[1].split('&')[0];
        
        try {
            // Buscar vídeo em cache e playlists
            const result = await findVideoById(videoId);
            if (result) {
                player.currentPlaylist = result.playlist;
                player.currentPlaylistIndex = result.playlistIndex;
                player.currentVideoIndex = result.videoIndex;
                player.viewingFavorites = false;
                
                loadPlaylistVideos();
                loadVideo(result.video);
                player.shouldPlayOnReady = true;
                refreshPlayerUI();
            }
        } catch (error) {
            console.error('Erro ao navegar para vídeo:', error);
        }
    }
}

// Listener para alterações na URL
window.addEventListener('hashchange', handleHashNavigation);

// Garantir refresh ao focar na janela (reentrar no player)
window.addEventListener('focus', () => {
    if (player.currentPlaylist && player.ytReady) {
        updateProgressBar();
    }
});

// Atualiza UI completa de player sem fazer novo fetch pesado
function refreshPlayerUI() {
    updateCurrentVideoDisplay();
    updatePlayPauseButton();
    updateProgressBar();
    updateFavoriteButton();
    updateActivePlaylistItem();
    updateShuffleButton();
    updateRepeatButton();
    if (ytPlayer && player.ytReady) {
        player.currentTime = ytPlayer.getCurrentTime();
        player.currentDuration = ytPlayer.getDuration();
    }
}

// ============================================================================
// CARREGAR DADOS (LAZY LOADING)
// ============================================================================

async function loadPlaylists() {
    try {
        // 1. Carregar índice de playlists
        await loadPlaylistsIndex();

        if (player.playlistsIndex.length === 0) {
            console.warn('Nenhuma playlist encontrada no índice');
            return;
        }

        // 2. Verificar hash navigation (precisa de playlist específica ou procura)
        const hash = window.location.hash;
        if (hash.includes('videoId=')) {
            handleHashNavigation();
        } else {
            // 3. Carregar primeira playlist como padrão
            await selectPlaylistByIndex(0);
        }

        refreshPlayerUI();
    } catch (error) {
        console.error('Erro ao carregar playlists:', error);
    }
}

/**
 * Seleciona uma playlist pelo índice e a carrega
 * @param {Number} index - índice no playlistsIndex
 */
async function selectPlaylistByIndex(index) {
    if (index < 0 || index >= player.playlistsIndex.length) return;

    const playlistMeta = player.playlistsIndex[index];
    if (!playlistMeta.url) return;

    player.isLoadingPlaylist = true;
    try {
        const playlist = await loadPlaylistByUrl(playlistMeta.url);
        if (playlist) {
            player.currentPlaylist = playlist;
            player.currentPlaylistIndex = index;
            player.currentVideoIndex = 0;
            player.playOrder = [...Array(playlist.videos.length).keys()];
            player.originalOrder = [...player.playOrder];
            player.shouldPlayOnReady = true;
            player.viewingFavorites = false;

            closePlaylistsModal();
            loadPlaylistVideos();
            loadFirstVideo();
        }
    } catch (error) {
        console.error('Erro ao selecionar playlist:', error);
    } finally {
        player.isLoadingPlaylist = false;
    }
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function getArtistCoverUrl(artistName) {
    // Preserva & e hífens para compatibilidade com arquivos já existentes
    const normalized = artistName.toLowerCase().trim().replace(/\s+/g, '-');
    return `covers/artists/${normalized}.jpg`;
}

// ============================================================================
// MODAL DE PLAYLISTS
// ============================================================================

// ============================================================================
// MODAL DE PLAYLISTS
// ============================================================================

function openPlaylistsModal() {
    const modal = document.getElementById('playlistModal');
    const container = document.getElementById('playlistCardsContainer');
    
    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();
    
    player.playlistsIndex.forEach((playlistMeta, index) => {
        // Tentar obter count do cache, se disponível
        let videoCount = '';
        if (playlistCache.has(playlistMeta.url)) {
            const playlist = playlistCache.get(playlistMeta.url);
            videoCount = `${playlist.videos?.length || 0} músicas`;
        } else {
            videoCount = 'Carregando...';
        }

        const card = renderCard({
            src: `covers/playlists/${playlistMeta.cover}`,
            title: playlistMeta.title || playlistMeta.name,
            subtitle: videoCount
        });
        card.addEventListener('click', () => selectPlaylistByIndex(index));
        fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
    modal.classList.add('show');
}

function closePlaylistsModal() {
    document.getElementById('playlistModal').classList.remove('show');
}

// ============================================================================
// MODAL DE ARTISTAS
// ============================================================================

async function openArtistsModal() {
    const modal = document.getElementById('artistsModal');
    const container = document.getElementById('artistsCardsContainer');
    
    // Mostrar loading enquanto busca artistas
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-dim);">Carregando artistas...</div>';

    try {
        // Carregar todas as playlists (necessário para listar todos os artistas)
        const allPlaylists = await loadAllPlaylists();

        // Coletar artistas únicos
        const artistsSet = new Set();
        allPlaylists.forEach(playlist => {
            playlist.videos?.forEach(video => {
                if (video.artist) {
                    artistsSet.add(video.artist);
                }
            });
        });

        const artists = Array.from(artistsSet).sort();

        // Usar DocumentFragment para melhor performance
        const fragment = document.createDocumentFragment();

        artists.forEach(artist => {
            const artistCover = getArtistCoverUrl(artist);
            const card = renderCard({
                src: artistCover,
                title: artist,
                subtitle: 'Artista'
            });
            card.addEventListener('click', () => selectArtist(artist));
            fragment.appendChild(card);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    } catch (error) {
        console.error('Erro ao carregar artistas:', error);
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-dim);">Erro ao carregar artistas</div>';
    }

    modal.classList.add('show');
}

function closeArtistsModal() {
    document.getElementById('artistsModal').classList.remove('show');
}

// ----------------------
// Gestão de Playlists do Usuário
// ----------------------

function openCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.add('show');
    document.getElementById('newPlaylistName').focus();
}

function closeCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.remove('show');
    document.getElementById('createPlaylistForm').reset();
}

function getUserPlaylists() {
    const saved = localStorage.getItem('sanplayerUserPlaylists');
    return saved ? JSON.parse(saved) : [];
}

function saveUserPlaylists(list) {
    localStorage.setItem('sanplayerUserPlaylists', JSON.stringify(list));
}

function submitCreatePlaylist(e) {
    e.preventDefault();
    const name = document.getElementById('newPlaylistName').value.trim();
    if (!name) return;
    const list = getUserPlaylists();
    const newPlaylist = { name, cover: 'playlist.jpg', videos: [] };
    list.push(newPlaylist);
    saveUserPlaylists(list);
    closeCreatePlaylistModal();
    // abrir lista de playlists do usuário
    openUserPlaylistsModal();
}

function openUserMenuModal() {
    document.getElementById('userMenuModal').classList.add('show');
}

function closeUserMenuModal() {
    document.getElementById('userMenuModal').classList.remove('show');
}

function openUserPlaylistsModal() {
    const container = document.getElementById('userPlaylistsContainer');
    const list = getUserPlaylists();
    
    // Se está em modo de adicionar item e não tem playlist, abrir modal de criar
    if (addingItemToPlaylist && list.length === 0) {
        closeUserPlaylistsModal();
        openCreatePlaylistModal();
        return;
    }
    
    // Atualizar título dependendo do contexto
    const headerTitle = document.querySelector('#userPlaylistsModal h2');
    if (addingItemToPlaylist && videoToAdd) {
        headerTitle.textContent = `Adicionar "${videoToAdd.title}" a:`;
    } else {
        headerTitle.textContent = 'Minhas Playlists';
    }
    
    container.innerHTML = '';
    if (list.length === 0) {
        // Sem playlist e em modo normal (não está adicionando)
        showFeedbackModal('Nenhuma playlist criada. Use "Criar Playlist" para adicionar.');
        document.getElementById('userPlaylistsModal').classList.remove('show');
        return;
    }
    
    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();
    
    list.forEach((pl, idx) => {
        const row = renderUserPlaylistRow(pl, idx, addingItemToPlaylist);
        fragment.appendChild(row);
    });
    
    container.appendChild(fragment);
    // ABRIR O MODAL
    document.getElementById('userPlaylistsModal').classList.add('show');
}

/**
 * Abre modal para editar nome da playlist
 * @param {Number} idx - índice da playlist
 * @param {String} currentName - nome atual
 */
function openEditPlaylistModal(idx, currentName) {
    const modal = document.getElementById('editPlaylistModal');
    const inputEl = document.getElementById('editPlaylistNameInput');
    const saveBtn = document.getElementById('editPlaylistSaveBtn');
    const cancelBtn = document.getElementById('editPlaylistCancelBtn');
    
    // Preencher com nome atual
    inputEl.value = currentName;
    inputEl.focus();
    inputEl.select();
    
    // Limpar listeners anteriores
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Adicionar novo listener para salvar
    newSaveBtn.addEventListener('click', () => {
        const newName = inputEl.value.trim();
        if (newName && newName !== currentName) {
            const list = getUserPlaylists();
            list[idx].name = newName;
            saveUserPlaylists(list);
            showFeedbackModal(`Playlist renomeada para "${newName}"`);
        }
        modal.classList.remove('show');
        // Reabrir modal de playlists
        setTimeout(() => openUserPlaylistsModal(), 300);
    });
    
    // Fechar ao cancelar
    newCancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => openUserPlaylistsModal(), 300);
    });
    
    // Enter para salvar
    inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            newSaveBtn.click();
        }
    });
    
    // Escape para cancelar
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            newCancelBtn.click();
        }
    });
    
    modal.classList.add('show');
}

/**
 * Deleta uma playlist do usuário
 * @param {Number} idx - índice da playlist
 */
function deleteUserPlaylist(idx) {
    const list = getUserPlaylists();
    const playlistName = list[idx].name;
    
    if (confirm(`Tem certeza que deseja remover a playlist "${playlistName}"? Esta ação não pode ser desfeita.`)) {
        list.splice(idx, 1);
        saveUserPlaylists(list);
        showFeedbackModal(`Playlist "${playlistName}" removida`);
        // Reabrir modal de playlists
        setTimeout(() => openUserPlaylistsModal(), 300);
    }
}

/**
 * Renderiza linha de playlist do usuário com botões de ações
 * @param {Object} pl - {name, videos, cover}
 * @param {Number} idx - índice na lista
 * @param {Boolean} isAddingMode - se está em modo de adicionar item
 * @returns {HTMLElement}
 */
function renderUserPlaylistRow(pl, idx, isAddingMode) {
    const row = document.createElement('div');
    row.className = 'playlist-item-row';
    
    // Nome + Badge
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'playlist-content-wrapper';
    
    const name = document.createElement('span');
    name.className = 'playlist-name';
    name.textContent = pl.name;
    
    const badge = document.createElement('span');
    badge.className = 'playlist-count-badge';
    badge.textContent = pl.videos.length;
    
    contentWrapper.appendChild(name);
    contentWrapper.appendChild(badge);
    
    // Wrapper para ações (quando NÃO está em modo de adicionar item)
    if (!isAddingMode) {
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'playlist-actions-wrapper';
        
        // Botão Editar
        const editBtn = document.createElement('button');
        editBtn.className = 'icon-btn icon-btn-edit';
        editBtn.setAttribute('aria-label', 'Editar playlist');
        editBtn.setAttribute('title', 'Editar');
        const editIcon = document.createElement('i');
        editIcon.className = 'material-icons';
        editIcon.textContent = 'edit';
        editBtn.appendChild(editIcon);
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditPlaylistModal(idx, pl.name);
        });
        
        // Botão Remover
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn icon-btn-delete';
        deleteBtn.setAttribute('aria-label', 'Remover playlist');
        deleteBtn.setAttribute('title', 'Remover');
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'material-icons';
        deleteIcon.textContent = 'delete';
        deleteBtn.appendChild(deleteIcon);
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteUserPlaylist(idx);
        });
        
        actionsWrapper.appendChild(editBtn);
        actionsWrapper.appendChild(deleteBtn);
        
        row.appendChild(contentWrapper);
        row.appendChild(actionsWrapper);
    } else {
        row.appendChild(contentWrapper);
    }
    
    // Evento click para selecionar (apenas quando não está em modo ações)
    row.addEventListener('click', () => {
        if (isAddingMode) {
            addItemToUserPlaylist(idx);
        } else {
            // Carregar a playlist
            const list = getUserPlaylists();
            const selectedPl = list[idx];
            player.currentPlaylist = JSON.parse(JSON.stringify(selectedPl));
            player.currentPlaylistIndex = -1;
            player.currentVideoIndex = 0;
            player.playOrder = [...Array(player.currentPlaylist.videos.length).keys()];
            player.originalOrder = [...player.playOrder];
            closeUserPlaylistsModal();
            closeUserMenuModal();
            loadPlaylistVideos();
            if (player.currentPlaylist.videos.length > 0) {
                loadFirstVideo();
            }
            refreshPlayerUI();
        }
    });
    
    return row;
}

function closeUserPlaylistsModal() {
    document.getElementById('userPlaylistsModal').classList.remove('show');
    // Resetar modo de adicionar item
    if (addingItemToPlaylist) {
        addingItemToPlaylist = false;
        videoToAdd = null;
        // Restaurar estado anterior de playlist
        if (previousPlaylistState) {
            player.currentPlaylist = previousPlaylistState.playlist;
            player.currentPlaylistIndex = previousPlaylistState.playlistIndex;
            player.currentVideoIndex = previousPlaylistState.videoIndex;
            player.viewingFavorites = previousPlaylistState.viewingFavorites;
            player.currentFavoriteId = previousPlaylistState.currentFavoriteId;
            previousPlaylistState = null;
        }
    }
}

// ----------------------
// Modal opções do item (kebab)
// ----------------------

let currentKebabIndex = null;

function openItemOptionsModal(index) {
    currentKebabIndex = index;
    const video = player.currentPlaylist.videos[index];
    const modal = document.getElementById('itemOptionsModal');
    const headerEl = modal.querySelector('.modal-header');
    
    // Limpar header anterior
    headerEl.innerHTML = '';
    
    // Renderizar novo header
    const header = renderModalHeader(video, closeItemOptionsModal);
    headerEl.appendChild(header);

    const body = document.getElementById('itemOptionsBody');
    body.innerHTML = '';

    const userList = getUserPlaylists();
    const isInAnyPlaylist = userList.some(pl => pl.videos.some(v => v.id === video.id));

    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();

    // Opção: Adicionar/Remover da playlist
    const playlistRow = renderOptionRow({
        icon: isInAnyPlaylist ? 'remove_circle' : 'add_circle',
        text: isInAnyPlaylist ? 'Remover da Playlist' : 'Adicionar a playlist',
        onClick: () => {
            if (isInAnyPlaylist) {
                // Remover de todas as playlists onde está
                userList.forEach((pl, idx) => {
                    if (pl.videos.some(v => v.id === video.id)) {
                        removeItemFromUserPlaylist(idx);
                    }
                });
            } else {
                // Adicionar à primeira playlist, ou abrir modal se múltiplas
                if (userList.length === 0) {
                    showToast('Crie uma playlist primeiro');
                } else if (userList.length === 1) {
                    addItemToUserPlaylist(0);
                } else {
                    // Abrir modal de playlists para escolher
                    addingItemToPlaylist = true;
                    videoToAdd = video;
                    previousPlaylistState = {
                        playlist: player.currentPlaylist,
                        playlistIndex: player.currentPlaylistIndex,
                        videoIndex: player.currentVideoIndex,
                        viewingFavorites: player.viewingFavorites,
                        currentFavoriteId: player.currentFavoriteId
                    };
                    openUserPlaylistsModal();
                }
            }
            closeItemOptionsModal();
        }
    });
    fragment.appendChild(playlistRow);
    fragment.appendChild(renderSeparator());

    // Opção: Compartilhar
    const shareRow = renderOptionRow({
        icon: 'share',
        text: 'Compartilhar',
        onClick: () => shareItem(currentKebabIndex)
    });
    fragment.appendChild(shareRow);

    body.appendChild(fragment);
    modal.classList.add('show');
}

function closeItemOptionsModal() {
    document.getElementById('itemOptionsModal').classList.remove('show');
}

// Ao clicar em "Adicionar a playlist"
function addToPlaylistOption() {
    const userList = getUserPlaylists();
    
    if (userList.length === 0) {
        // Mostrar toast e fechar modal
        closeItemOptionsModal();
        showToast('Crie uma playlist');
        return;
    }
    
    // Mostrar lista de playlists
    const modal = document.getElementById('itemOptionsModal');
    const body = document.getElementById('itemOptionsBody');
    body.innerHTML = '';
    
    // Botão voltar
    const backRow = document.createElement('div');
    backRow.className = 'option-row';
    const backIconDiv = document.createElement('div');
    backIconDiv.className = 'option-icon';
    const backIcon = document.createElement('i');
    backIcon.className = 'material-icons';
    backIcon.textContent = 'arrow_back';
    backIconDiv.appendChild(backIcon);
    const backTextDiv = document.createElement('div');
    backTextDiv.className = 'option-text';
    backTextDiv.textContent = 'Voltar';
    backRow.appendChild(backIconDiv);
    backRow.appendChild(backTextDiv);
    backRow.classList.add('is-clickable');
    backRow.addEventListener('click', () => openItemOptionsModal(currentKebabIndex));
    body.appendChild(backRow);
    
    const hr1 = document.createElement('div');
    hr1.className = 'option-separator';
    body.appendChild(hr1);
    
    // Listar playlists
    userList.forEach((pl, idx) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        const rowIconDiv = document.createElement('div');
        rowIconDiv.className = 'option-icon';
        const rowIcon = document.createElement('i');
        rowIcon.className = 'material-icons';
        rowIcon.textContent = 'library_music';
        rowIconDiv.appendChild(rowIcon);
        const rowTextDiv = document.createElement('div');
        rowTextDiv.className = 'option-text';
        rowTextDiv.textContent = pl.name;
        row.appendChild(rowIconDiv);
        row.appendChild(rowTextDiv);
        row.classList.add('is-clickable');
        row.addEventListener('click', () => addItemToUserPlaylist(idx));
        body.appendChild(row);
    });
}

function addItemToUserPlaylist(playlistIdx) {
    const list = getUserPlaylists();
    
    // Determinar qual vídeo adicionar
    let video;
    if (addingItemToPlaylist && videoToAdd) {
        // Estamos em modo "adicionar item a playlist"
        video = videoToAdd;
    } else {
        // Estamos em outro contexto (removendo, etc.)
        if (!player.currentPlaylist) return;
        video = player.currentPlaylist.videos[currentKebabIndex];
    }
    
    // Evitar duplicatas (simples)
    const target = list[playlistIdx];
    if (!target) return;
    const exists = target.videos.some(v => v.id === video.id);
    if (!exists) {
        target.videos.push(video);
        saveUserPlaylists(list);
        showToast(`Adicionado a "${target.name}"`);
    } else {
        showToast(`Ja esta em "${target.name}"`);
    }
    
    // Se estávamos em modo adicionar item a playlist
    if (addingItemToPlaylist) {
        addingItemToPlaylist = false;
        videoToAdd = null;
        closeUserPlaylistsModal();
        // Restaurar estado anterior de playlist
        if (previousPlaylistState) {
            player.currentPlaylist = previousPlaylistState.playlist;
            player.currentPlaylistIndex = previousPlaylistState.playlistIndex;
            player.currentVideoIndex = previousPlaylistState.videoIndex;
            player.viewingFavorites = previousPlaylistState.viewingFavorites;
            player.currentFavoriteId = previousPlaylistState.currentFavoriteId;
            previousPlaylistState = null;
        }
        closeItemOptionsModal();
    } else {
        closeItemOptionsModal();
    }
}

function removeItemFromUserPlaylist(playlistIdx) {
    const list = getUserPlaylists();
    if (!player.currentPlaylist) return;
    const video = player.currentPlaylist.videos[currentKebabIndex];
    const target = list[playlistIdx];
    if (!target) return;
    target.videos = target.videos.filter(v => v.id !== video.id);
    saveUserPlaylists(list);
    closeItemOptionsModal();
}

// Feedback Modal Bottom-Sheet
function showFeedbackModal(message, duration = 3000) {
    const modal = document.getElementById('feedbackModal');
    const content = document.getElementById('feedbackContent');
    
    // Renderizar conteúdo do feedback
    const icon = document.createElement('div');
    icon.className = 'feedback-icon';
    icon.textContent = '✓';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'feedback-message';
    messageEl.textContent = message;
    
    content.innerHTML = '';
    content.appendChild(icon);
    content.appendChild(messageEl);
    
    // Mostrar modal
    modal.classList.add('show');
    
    // Fechar automaticamente após duração
    setTimeout(() => {
        modal.classList.remove('show');
    }, duration);
}

// Alias para compatibilidade (showToast vira showFeedbackModal)
function showToast(message) {
    showFeedbackModal(message);
}

function shareItem(index) {
    const video = player.currentPlaylist.videos[index];
    const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;
    const url = `${window.location.origin}${window.location.pathname}#videoId=${video.id}`;
    if (navigator.share) {
        navigator.share({
            title: 'SanPlayer',
            text: text,
            url: url,
        }).catch(() => {});
    } else {
        // Fallback: copiar para clipboard (mesmo formato do shareMusic)
        const shareText = `${text}\n${url}`;
        try { navigator.clipboard.writeText(shareText); } catch (e) {}
        alert('Música copiada para compartilhamento!');
    }
}

async function selectArtist(artist) {
    try {
        // Carregar todas as playlists para filtrar por artista
        const allPlaylists = await loadAllPlaylists();

        // Filtrar vídeos do artista
        const artistVideos = [];
        allPlaylists.forEach(playlist => {
            playlist.videos?.forEach(video => {
                if (video.artist === artist) {
                    artistVideos.push({
                        ...video,
                        playlistName: playlist.name
                    });
                }
            });
        });

        // Criar uma playlist temporária para o artista
        player.currentPlaylist = {
            name: artist,
            videos: artistVideos
        };
        player.currentPlaylistIndex = -1; // Indica que é uma playlist temporária
        player.currentVideoIndex = 0;
        player.playOrder = [...Array(artistVideos.length).keys()];
        player.originalOrder = [...player.playOrder];
        player.shouldPlayOnReady = true;
        player.viewingFavorites = false;

        closeArtistsModal();
        loadPlaylistVideos();
        loadFirstVideo();
        refreshPlayerUI();
    } catch (error) {
        console.error('Erro ao selecionar artista:', error);
    }
}

// Alias para compatibilidade com código existente
async function selectPlaylist(index) {
    return selectPlaylistByIndex(index);
}

// ============================================================================
// CARREGAR VÍDEOS DA PLAYLIST
// ============================================================================

function loadPlaylistVideos() {
    const container = document.querySelector('.playlist-aside');
    const itemsContainer = document.querySelector('.playlist-items');
    
    // Atualizar título
    const titlePl = container.querySelector('.title-pl');
    titlePl.textContent = `> ${player.currentPlaylist.name}`;
    
    // Mostrar skeleton loading
    itemsContainer.innerHTML = '';
    for (let i = 0; i < player.currentPlaylist.videos.length; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'playlist-item skeleton-loading';
        
        const thumbMini = document.createElement('div');
        thumbMini.className = 'thumb-mini skeleton';
        
        const playlistInfoSkeleton = document.createElement('div');
        playlistInfoSkeleton.className = 'playlist-info-skeleton';
        
        const skeletonTitle = document.createElement('span');
        skeletonTitle.className = 'skeleton skeleton-title';
        
        const skeletonArtist = document.createElement('span');
        skeletonArtist.className = 'skeleton skeleton-artist';
        
        const skeletonDuration = document.createElement('span');
        skeletonDuration.className = 'skeleton skeleton-duration';
        
        playlistInfoSkeleton.appendChild(skeletonTitle);
        playlistInfoSkeleton.appendChild(skeletonArtist);
        
        skeleton.appendChild(thumbMini);
        skeleton.appendChild(playlistInfoSkeleton);
        skeleton.appendChild(skeletonDuration);
        
        itemsContainer.appendChild(skeleton);
    }
    
    // Carregar items reais no próximo frame de pintura
    requestAnimationFrame(() => {
        itemsContainer.innerHTML = '';
        
        // Usar DocumentFragment para melhor performance com listas grandes
        const fragment = document.createDocumentFragment();
        
        player.currentPlaylist.videos.forEach((video, index) => {
            const item = renderPlaylistItem(video, index);
            
            // tocar ao clicar no item (exceto no botão kebab)
            item.addEventListener('click', (e) => {
                const target = e.target;
                if (target.closest('.kebab-btn')) return;
                playVideoByIndex(index);
            });
            
            fragment.appendChild(item);
        });

        itemsContainer.appendChild(fragment);

        // Delegar eventos de kebab
        itemsContainer.querySelectorAll('.kebab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                openItemOptionsModal(idx);
            });
        });
    });
}

function loadFirstVideo() {
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    loadVideo(video);
    updateCurrentVideoDisplay();
}

// ============================================================================
// CARREGAR VÍDEO E ATUALIZAR INTERFACE
// ============================================================================

function loadVideo(video) {
    // Player container já existe no HTML, não precisa recriá-lo

    if (ytPlayer && typeof ytPlayer.cueVideoById === 'function') {
        ytPlayer.cueVideoById(video.id);
        // playVideo() será chamado pelo handler CUED em onPlayerStateChange quando shouldPlayOnReady for true
    } else if (window.YT && window.YT.Player && !ytPlayer && !ytPlayerInitialized) {
        onYouTubeIframeAPIReady();
    }

    updateCurrentVideoDisplay();
    updateFavoriteButton();
}

function onYouTubeIframeAPIReady() {
    if (ytPlayerInitialized) return;
    
    // Verificar se a API do YouTube está disponível
    if (!window.YT || !window.YT.Player) {
        console.warn('YouTube API ainda não está carregada. Tentando novamente...');
        setTimeout(onYouTubeIframeAPIReady, 500);
        return;
    }
    
    ytPlayerInitialized = true;

    ytPlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: player.currentPlaylist?.videos?.[player.currentVideoIndex]?.id || '',
        playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
        }
    });
}

function onPlayerReady(event) {
    player.ytReady = true;

    // 🔥 REAPLICAR O VÍDEO CORRETO
    if (player.currentPlaylist) {
        const video = player.currentPlaylist.videos[player.currentVideoIndex];
        if (video) {
            ytPlayer.cueVideoById(video.id);
            if (player.shouldPlayOnReady) {
                ytPlayer.playVideo();
                player.shouldPlayOnReady = false;
            }
        }
    }

    if (updateProgressInterval) {
        clearInterval(updateProgressInterval);
    }

    updateProgressInterval = setInterval(() => {
        if (!ytPlayer || !player.ytReady) return;

        const duration = ytPlayer.getDuration();
        const currentTime = ytPlayer.getCurrentTime();

        player.currentDuration = duration;
        player.currentTime = currentTime;

        updateProgressBar();
        updatePlaylistDurations();
    }, 250);

    safeRender();
}

function updatePlaylistDurations() {
    if (!player.currentPlaylist) return;
    
    player.currentPlaylist.videos.forEach((video, index) => {
        const durationElement = document.getElementById(`duration-${index}`);
        // Apenas o vídeo atual pode ter sua duração obtida da API Iframe
        // Outros vídeos permanecerão como '-' (limitação da API do YouTube)
        if (durationElement && index === player.currentVideoIndex) {
            if (player.ytReady && ytPlayer) {
                const duration = ytPlayer.getDuration();
                if (duration > 0) {
                    durationElement.textContent = formatTime(duration);
                }
            }
        }
    });
}

function onPlayerStateChange(event) {
    const state = event.data;

    // YT.State: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (state === YT.PlayerState.PLAYING) {
        player.isPlaying = true;
        player.currentDuration = ytPlayer.getDuration();
        player.currentTime = ytPlayer.getCurrentTime();
        updatePlayPauseButton();
        updateProgressBar();
        updateActivePlaylistItem();
    } else if (state === YT.PlayerState.PAUSED) {
        player.isPlaying = false;
        player.currentTime = ytPlayer.getCurrentTime();
        updatePlayPauseButton();
        updateProgressBar();
        updateActivePlaylistItem();
    } else if (state === YT.PlayerState.CUED) {
        // Player entrou em CUED após cueVideoById()
        // Se shouldPlayOnReady for true, é o momento correto para chamar playVideo()
        if (player.shouldPlayOnReady && ytPlayer && player.ytReady) {
            ytPlayer.playVideo();
            player.shouldPlayOnReady = false;
        }
    } else if (state === YT.PlayerState.ENDED) {
        player.isPlaying = false;
        updatePlayPauseButton();
        updateProgressBar();

        if (player.repeatMode === 2) {
            // Repetir a música atual
            ytPlayer.seekTo(0);
            ytPlayer.playVideo();
        } else {
            // Tocar próximo vídeo automaticamente
            // nextVideo() setará shouldPlayOnReady = true
            // loadVideo() chamará cueVideoById()
            // Quando player entrar em CUED, onPlayerStateChange dispará playVideo() pela flag
            nextVideo();
        }
    }
}

function playerPlay() {
    // NOTA IMPORTANTE: NÃO alterar player.isPlaying aqui!
    // O estado DEVE ser alterado APENAS por onPlayerStateChange(PLAYING)
    // Isso garante que o botão muda APENAS quando YouTube confirma playback
    if (player.ytReady && ytPlayer) {
        ytPlayer.playVideo();
    }
}

function playerPause() {
    if (player.ytReady && ytPlayer) {
        ytPlayer.pauseVideo();
    }
    player.isPlaying = false;
    updatePlayPauseButton();
    updateProgressBar();
}


function updateCurrentVideoDisplay() {
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    
    // Atualizar apenas os dados, sem recriar DOM
    const thumb = document.querySelector('.current-thumb');
    const title = document.querySelector('.c-title');
    const artist = document.querySelector('.c-artist');
    
    thumb.src = getArtistCoverUrl(video.artist);
    title.textContent = video.title;
    artist.textContent = video.artist;
    
    // Detectar se título precisa de marquee após renderização
    setTimeout(() => {
        checkIfTitleNeedsTruncation(title);
    }, 0);
}

// ============================================================================
// CONTROLES DO PLAYER
// ============================================================================

function playVideoByIndex(index) {
    player.currentVideoIndex = index;
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    // Sinalizar que DEVE tocar
    player.shouldPlayOnReady = true;
    loadVideo(video);
    updateActivePlaylistItem();
}

function updateActivePlaylistItem() {
    const cTitle = document.querySelector('.current-details .c-title');
    if (!cTitle) return;

    // Detectar se o texto transborda
    checkIfTitleNeedsTruncation(cTitle);
}

function checkIfTitleNeedsTruncation(element) {
    if (!element) return;
    
    // Se não estiver tocando, remove marquee
    if (!player.isPlaying) {
        element.classList.remove('marquee');
        delete element.dataset.truncationChecked;
        return;
    }

    // Evita reflow desnecessário se já foi verificado
    if (element.dataset.truncationChecked === 'true') return;

    // Força layout para calcular corretamente
    const scrollWidth = element.scrollWidth;
    const clientWidth = element.clientWidth;

    // Se o texto transborda, ativa marquee
    const needsScroll = scrollWidth > clientWidth + 5;
    element.classList.toggle('marquee', needsScroll);
    element.dataset.truncationChecked = 'true';
}

function togglePlayPause() {
    if (player.isPlaying) {
        playerPause();
    } else {
        playerPlay();
    }
}

function nextVideo() {
    if (!player.currentPlaylist) return;
    
    if (player.isShuffle) {
        const randomIndex = Math.floor(Math.random() * player.currentPlaylist.videos.length);
        player.currentVideoIndex = randomIndex;
    } else {
        player.currentVideoIndex = (player.currentVideoIndex + 1) % player.currentPlaylist.videos.length;
    }
    
    // IMPORTANTE: Sinalizar que o próximo vídeo DEVE tocar
    player.shouldPlayOnReady = true;
    
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    loadVideo(video);
    updateActivePlaylistItem();
    
    // Se estiver em modo favoritos, atualizar o currentFavoriteId
    if (player.viewingFavorites && player.currentPlaylist.name === 'Favoritos') {
        const nextFavorite = player.favorites[player.currentVideoIndex];
        if (nextFavorite) {
            player.currentFavoriteId = nextFavorite.id;
        }
    }
}

function previousVideo() {
    if (!player.currentPlaylist) return;
    
    player.currentVideoIndex = (player.currentVideoIndex - 1 + player.currentPlaylist.videos.length) % player.currentPlaylist.videos.length;
    
    // IMPORTANTE: Sinalizar que o vídeo anterior DEVE tocar
    player.shouldPlayOnReady = true;
    
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    loadVideo(video);
    updateActivePlaylistItem();
    
    // Se estiver em modo favoritos, atualizar o currentFavoriteId
    if (player.viewingFavorites && player.currentPlaylist.name === 'Favoritos') {
        const prevFavorite = player.favorites[player.currentVideoIndex];
        if (prevFavorite) {
            player.currentFavoriteId = prevFavorite.id;
        }
    }
}

function toggleShuffle() {
    player.isShuffle = !player.isShuffle;

    if (player.isShuffle) {
        player.playOrder = [...player.playOrder].sort(() => Math.random() - 0.5);
    } else {
        player.playOrder = [...player.originalOrder];
    }

    updateShuffleButton();
}

function toggleRepeat() {
    // Primeiro clique: sempre repetir a música atual (repeat_one)
    // Depois: repetir toda playlist (repeat)
    // Depois: desligar
    if (player.repeatMode === 0) {
        player.repeatMode = 2; // repeat one
    } else if (player.repeatMode === 2) {
        player.repeatMode = 1; // repeat all
    } else {
        player.repeatMode = 0; // off
    }
    updateRepeatButton();
}

function updatePlayPauseButton() {
    const btn = document.querySelector('.btn-play-pause i');
    btn.textContent = player.isPlaying ? 'pause' : 'play_arrow';
}

function updateRepeatButton() {
    const btn = document.querySelector('.block-controls button:nth-child(5)');
    const icon = btn.querySelector('i.material-icons') || document.createElement('i');
    icon.className = 'material-icons shuffle-repeat';
    
    if (player.repeatMode === 0) {
        icon.textContent = 'repeat';
        btn.classList.remove('repeat-one-active');
    } else if (player.repeatMode === 1) {
        icon.textContent = 'repeat';
        btn.classList.remove('repeat-one-active');
    } else {
        icon.textContent = 'repeat_one';
        btn.classList.add('repeat-one-active');
    }
    
    if (!btn.querySelector('i.material-icons')) {
        btn.appendChild(icon);
    }
}

function updateShuffleButton() {
    const btn = document.querySelector('.block-controls button:nth-child(1)');
    const icon = btn.querySelector('i.material-icons') || document.createElement('i');
    icon.className = 'material-icons shuffle-repeat';
    
    if (player.isShuffle) {
        icon.textContent = 'shuffle_on';
    } else {
        icon.textContent = 'shuffle';
    }
    
    if (!btn.querySelector('i.material-icons')) {
        btn.appendChild(icon);
    }
}

// ============================================================================
// BARRA DE PROGRESSO
// ============================================================================

function updateProgressBar() {
    const duration = player.currentDuration || 0;
    const current = player.currentTime || 0;
    const percentage = duration > 0 ? (current / duration) * 100 : 0;
    const progressBar = document.getElementById('progressBar');

    if (progressBar) {
        // Não sobrescrever o valor enquanto o usuário está interagindo (arrastando)
        if (!progressDragging) {
            progressBar.value = Math.min(100, Math.max(0, percentage));
        }

        // Atualizar visual do preenchimento via variável CSS (sempre atualizar para refletir posição)
        progressBar.style.setProperty('--progress-bar-fill', `${Math.min(100, Math.max(0, percentage))}% 100%`);

        // Mostrar preenchimento apenas enquanto a música estiver tocando
        if (player.isPlaying && duration > 0) {
            progressBar.classList.add('active');
        } else {
            progressBar.classList.remove('active');
        }
    }

    const timeCurrentEl = document.getElementById('timeCurrent');
    const timeDurationEl = document.getElementById('timeDuration');
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(current);
    if (timeDurationEl) timeDurationEl.textContent = formatTime(duration);
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function seekProgress(e) {
    // O progresso agora é via range input (progressBar), então esta função pode ser mantida por compatibilidade,
    // mas aqui é apenas uma ponte para o handler do input
    const progressBar = document.getElementById('progressBar');
    if (!progressBar || player.currentDuration === 0) return;

    const rect = progressBar.getBoundingClientRect();
    let percentage = ((e.clientX - rect.left) / rect.width) * 100;
    percentage = Math.max(0, Math.min(100, percentage));

    progressBar.value = percentage;
    const seekTime = (player.currentDuration * percentage) / 100;
    player.currentTime = seekTime;

    if (player.ytReady && ytPlayer) {
        ytPlayer.seekTo(seekTime, true);
    }

    updateProgressBar();
}

// ============================================================================
// FAVORITOS
// ============================================================================

function toggleFavorite() {
    if (!player.currentPlaylist) return;
    
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    
    // Usar o ID correto dependendo do contexto
    let favoriteId;
    if (player.viewingFavorites && player.currentFavoriteId) {
        favoriteId = player.currentFavoriteId;
    } else {
        favoriteId = `${player.currentPlaylistIndex}-${player.currentVideoIndex}`;
    }
    
    const index = player.favorites.findIndex(fav => fav.id === favoriteId);
    
    if (index > -1) {
        player.favorites.splice(index, 1);
    } else {
        player.favorites.push({
            id: favoriteId,
            video: video,
            playlist: player.currentPlaylist.name,
        });
    }
    
    saveFavorites();
    updateFavoriteButton();
}

function updateFavoriteButton() {
    const video = player.currentPlaylist?.videos[player.currentVideoIndex];
    if (!video) return;
    
    // Usar o ID correto dependendo do contexto
    let favoriteId;
    if (player.viewingFavorites && player.currentFavoriteId) {
        favoriteId = player.currentFavoriteId;
    } else {
        favoriteId = `${player.currentPlaylistIndex}-${player.currentVideoIndex}`;
    }
    
    const isFavorite = player.favorites.some(fav => fav.id === favoriteId);
    
    const icon = document.getElementById('favIcon');
    if (icon) {
        icon.textContent = isFavorite ? 'favorite' : 'favorite_border';
    }
}

function saveFavorites() {
    localStorage.setItem('sanplayerFavorites', JSON.stringify(player.favorites));
}

function loadFavorites() {
    const saved = localStorage.getItem('sanplayerFavorites');
    if (saved) {
        player.favorites = JSON.parse(saved);
    }
}

function displayFavoritesList() {
    const container = document.querySelector('.playlist-aside');
    const itemsContainer = document.querySelector('.playlist-items');
    
    // Marcar que estamos visualizando favoritos
    player.viewingFavorites = true;
    
    // Atualizar título
    const titlePl = container.querySelector('.title-pl');
    titlePl.textContent = `Favoritos > ${player.favorites.length} músicas`;
    
    // Limpar itens
    itemsContainer.innerHTML = '';
    
    if (player.favorites.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'empty-state';
        emptyEl.textContent = 'Nenhuma música favoritada';
        itemsContainer.appendChild(emptyEl);
        return;
    }
    
    // Criar uma playlist virtual com todos os favoritos
    const favoritesPlaylist = {
        name: 'Favoritos',
        videos: player.favorites.map(fav => fav.video)
    };
    
    // Renderizar usando requestAnimationFrame para consistência com loadPlaylistVideos
    requestAnimationFrame(() => {
        itemsContainer.innerHTML = '';
        
        // Usar DocumentFragment para melhor performance
        const fragment = document.createDocumentFragment();
        
        player.favorites.forEach((favorite, index) => {
            const item = renderPlaylistItem(favorite.video, index);
            
            // tocar ao clicar no item (exceto no botão kebab)
            item.addEventListener('click', (e) => {
                const target = e.target;
                if (target.closest('.kebab-btn')) return;
                
                // Usar a playlist virtual de favoritos
                player.currentPlaylist = favoritesPlaylist;
                player.currentPlaylistIndex = -1;
                player.currentVideoIndex = index;
                player.currentFavoriteId = favorite.id;
                player.viewingFavorites = true;
                
                // Sinalizar que DEVE tocar
                player.shouldPlayOnReady = true;
                
                const targetVideo = favorite.video;
                loadVideo(targetVideo);
                updateActivePlaylistItem();
                updateFavoriteButton();
                
                // Mantém a visualização de favoritos
                displayFavoritesList();
            });
            
            fragment.appendChild(item);
        });

        itemsContainer.appendChild(fragment);
        
        // Delegar eventos de kebab
        itemsContainer.querySelectorAll('.kebab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                // Ajustar estado para playlist virtual antes de abrir o modal
                player.currentPlaylist = favoritesPlaylist;
                player.currentPlaylistIndex = -1;
                openItemOptionsModal(idx);
            });
        });
    });
}

// ============================================================================
// COMPARTILHAR
// ============================================================================

function shareMusic() {
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;
    const url = `${window.location.origin}${window.location.pathname}#videoId=${video.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'SanPlayer',
            text: text,
            url: url,
        });
    } else {
        // Fallback: copiar para clipboard
        const shareText = `${text}\n${url}`;
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Música copiada para compartilhamento!');
        });
    }
}

// ============================================================================
// BUSCA
// ============================================================================

function setupMobileSearch() {
    const searchInput = document.getElementById('searchInput');
    const headerSearch = document.querySelector('.header-search');
    const btnSearchMobile = document.querySelector('.btn-search-mobile');
    let searchTimeout;
    
    // Mobile: mostrar barra ao clicar no ícone de busca
    if (btnSearchMobile) {
        btnSearchMobile.addEventListener('click', () => {
            headerSearch.classList.add('show-search');
            searchInput.focus();
        });
    }
    
    // Fechar barra ao limpar o input no mobile
    searchInput.addEventListener('blur', (e) => {
        if (window.innerWidth <= 1023 && e.target.value.trim().length === 0) {
            headerSearch.classList.remove('show-search');
        }
    });
    
    // Busca em tempo real: digitar qualquer coisa mostra resultados
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length === 0) {
            document.getElementById('searchModal').classList.remove('show');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchMusics(query);
        }, 300);
    });
    
    searchInput.addEventListener('blur', (e) => {
        if (window.innerWidth <= 1023 && e.target.value.trim().length === 0) {
            headerSearch.classList.remove('show-search');
        }
    });
}

async function searchMusics(query) {
    try {
        const results = [];
        const lowerQuery = query.toLowerCase();

        // Carregar todas as playlists para busca
        const allPlaylists = await loadAllPlaylists();

        allPlaylists.forEach((playlist, playlistIndex) => {
            playlist.videos?.forEach((video, videoIndex) => {
                if (
                    video.title.toLowerCase().includes(lowerQuery) ||
                    video.artist.toLowerCase().includes(lowerQuery)
                ) {
                    results.push({
                        video: video,
                        playlistIndex: playlistIndex,
                        videoIndex: videoIndex,
                    });
                }
            });
        });

        displaySearchResults(results, query);
    } catch (error) {
        console.error('Erro ao buscar músicas:', error);
        displaySearchResults([], query);
    }
}

function displaySearchResults(results, query) {
    const container = document.getElementById('searchResultsContainer');
    const modal = document.getElementById('searchModal');
    
    document.getElementById('searchTitle').textContent = `Resultados para "${query}"`;
    
    if (results.length === 0) {
        container.innerHTML = '';
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'no-results';
        noResultsDiv.textContent = 'Nenhuma música encontrada';
        container.appendChild(noResultsDiv);
    } else {
        container.innerHTML = '';
        results.forEach((result) => {
            const card = document.createElement('div');
            card.className = 'card';
            
            const img = document.createElement('img');
            img.src = getArtistCoverUrl(result.video.artist);
            img.alt = result.video.artist;
            img.className = 'card-image';
            img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
            
            const cardBody = document.createElement('div');
            cardBody.className = 'card-body';
            
            const cardTitle = document.createElement('div');
            cardTitle.className = 'card-title';
            cardTitle.textContent = result.video.title;
            
            const cardSubtitle = document.createElement('div');
            cardSubtitle.className = 'card-subtitle';
            cardSubtitle.textContent = result.video.artist;
            
            cardBody.appendChild(cardTitle);
            cardBody.appendChild(cardSubtitle);
            card.appendChild(img);
            card.appendChild(cardBody);
            card.addEventListener('click', async () => {
                await selectPlaylist(result.playlistIndex);
                player.currentVideoIndex = result.videoIndex;
                const video = player.currentPlaylist.videos[player.currentVideoIndex];
                player.shouldPlayOnReady = true;
                loadVideo(video);
                updateActivePlaylistItem();
                modal.classList.remove('show');
            });
            container.appendChild(card);
        });
    }
    
    modal.classList.add('show');
}

// ============================================================================
// SIDEBAR MOBILE
// ============================================================================

function setupSidbarMobile() {
    const btnSearchMobile = document.querySelector('.btn-search-mobile');
    const headerSearch = document.querySelector('.header-search');
    const searchForm = headerSearch.querySelector('form');
    
    btnSearchMobile.addEventListener('click', () => {
        headerSearch.classList.add('show-search');
        searchForm.querySelector('input').focus();
    });
    
    searchForm.querySelector('input').addEventListener('blur', (e) => {
        if (window.innerWidth <= 1023) {
            headerSearch.classList.remove('show-search');
        }
    });

    // Sidebar Mobile
    const btnHamburger = document.querySelector('.btn-hamburger');
    const sidebar = document.querySelector('.app-sidebar');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    
    function isMobile() { return window.innerWidth <= 1023; }
    
    btnHamburger.addEventListener('click', function() {
        if (isMobile()) {
            sidebar.classList.add('show');
        }
    });
    
    sidebarOverlay.addEventListener('click', function() {
        if (isMobile()) {
            sidebar.classList.remove('show');
        }
    });
    
    sidebar.querySelectorAll('.sidebar-nav a').forEach(function(link) {
        link.addEventListener('click', function() {
            if (isMobile()) {
                sidebar.classList.remove('show');
            }
        });
    });
    
    document.addEventListener('mousedown', function(e) {
        if (isMobile() && sidebar.classList.contains('show')) {
            const sidebarContent = sidebar.querySelector('.sidebar-content');
            if (!sidebarContent.contains(e.target) && !btnHamburger.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
    
    window.addEventListener('resize', function() {
        if (!isMobile()) {
            sidebar.classList.remove('show');
        }
    });
}

// ============================================================================
// EVENT LISTENERS PRINCIPAIS
// ============================================================================

function setupEventListeners() {
    // Modal de playlists
    document.getElementById('link-playlists').addEventListener('click', (e) => {
        e.preventDefault();
        openPlaylistsModal();
    });
    
    document.getElementById('closePlaylistModal').addEventListener('click', closePlaylistsModal);
    
    document.getElementById('playlistModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closePlaylistsModal();
        }
    });
    
    // Modal de artistas
    document.getElementById('link-artistas').addEventListener('click', (e) => {
        e.preventDefault();
        openArtistsModal();
    });
    
    document.getElementById('closeArtistsModal').addEventListener('click', closeArtistsModal);
    
    document.getElementById('artistsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeArtistsModal();
        }
    });
    
    // Favoritos na sidebar
    const favoriteLink = document.getElementById('link-favoritos');
    if (favoriteLink) {
        favoriteLink.addEventListener('click', (e) => {
            e.preventDefault();
            displayFavoritesList();
        });
    }
    
    // Modal de busca
    document.getElementById('closeSearchModal').addEventListener('click', () => {
        document.getElementById('searchModal').classList.remove('show');
    });
    
    document.getElementById('searchModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('searchModal').classList.remove('show');
        }
    });
    
    // Controles do player
    const controls = document.querySelector('.block-controls');
    const btnShuffle = controls.children[0];
    const btnPrevious = controls.children[1];
    const btnPlayPause = controls.children[2];
    const btnNext = controls.children[3];
    const btnRepeat = controls.children[4];
    
    btnShuffle.addEventListener('click', toggleShuffle);
    btnPrevious.addEventListener('click', previousVideo);
    btnPlayPause.addEventListener('click', togglePlayPause);
    btnNext.addEventListener('click', nextVideo);
    btnRepeat.addEventListener('click', toggleRepeat);
    
    // Barra de progresso real (range input)
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        // Input contínuo (arrastar) e change (finalizar)
        progressBar.addEventListener('input', (e) => {
            progressDragging = true;
            onProgressInput(e);
        });
        progressBar.addEventListener('change', (e) => {
            // Commit do seek quando usuário solta
            progressDragging = false;
            onProgressChange(e);
        });

        // Pointer events para captura mais robusta (mouse/touch/pen)
        progressBar.addEventListener('pointerdown', () => { progressDragging = true; });
        // pointerup no próprio controle
        progressBar.addEventListener('pointerup', (e) => {
            progressDragging = false;
            // garantir commit
            onProgressChange({ target: progressBar });
        });
        // Caso o usuário solte fora do controle
        document.addEventListener('pointerup', () => {
            if (progressDragging) {
                progressDragging = false;
                if (progressBar) onProgressChange({ target: progressBar });
            }
        });
    }

    // Criar playlist (sidebar)
    const createLink = document.getElementById('link-criar-playlist');
    if (createLink) {
        createLink.addEventListener('click', (e) => {
            e.preventDefault();
            openCreatePlaylistModal();
        });
    }

    // Create playlist modal listeners
    const closeCreateBtn = document.getElementById('closeCreatePlaylistModal');
    if (closeCreateBtn) closeCreateBtn.addEventListener('click', closeCreatePlaylistModal);
    const createForm = document.getElementById('createPlaylistForm');
    if (createForm) createForm.addEventListener('submit', submitCreatePlaylist);
    const cancelCreate = document.getElementById('cancelCreatePlaylist');
    if (cancelCreate) cancelCreate.addEventListener('click', closeCreatePlaylistModal);

    // User menu
    const userBtn = document.getElementById('userMenuButton');
    if (userBtn) userBtn.addEventListener('click', (e) => { e.stopPropagation(); openUserMenuModal(); });
    const closeUserMenu = document.getElementById('closeUserMenuModal');
    if (closeUserMenu) closeUserMenu.addEventListener('click', closeUserMenuModal);
    const userPlaylistsBtn = document.getElementById('userPlaylistsBtn');
    if (userPlaylistsBtn) userPlaylistsBtn.addEventListener('click', () => { closeUserMenuModal(); document.getElementById('userPlaylistsModal').classList.add('show'); openUserPlaylistsModal(); });
    const userFavoritesBtn = document.getElementById('userFavoritesBtn');
    if (userFavoritesBtn) userFavoritesBtn.addEventListener('click', () => { closeUserMenuModal(); displayFavoritesList(); });
    const closeUserPlaylists = document.getElementById('closeUserPlaylistsModal');
    if (closeUserPlaylists) closeUserPlaylists.addEventListener('click', closeUserPlaylistsModal);

    // Item options modal close
    const closeItemOptions = document.getElementById('closeItemOptionsModal');
    if (closeItemOptions) closeItemOptions.addEventListener('click', closeItemOptionsModal);

    // Fechar modais ao clicar fora
    ['createPlaylistModal','userMenuModal','itemOptionsModal','feedbackModal','editPlaylistModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { if (e.target === e.currentTarget) el.classList.remove('show'); });
    });
    
    // Botão fechar modal de edição
    const closeEditPlaylistBtn = document.getElementById('editPlaylistCloseBtn');
    if (closeEditPlaylistBtn) {
        closeEditPlaylistBtn.addEventListener('click', () => {
            document.getElementById('editPlaylistModal').classList.remove('show');
            setTimeout(() => openUserPlaylistsModal(), 300);
        });
    }
    
    // userPlaylistsModal precisa chamar a função para resetar estado
    const userPlaylistsModalEl = document.getElementById('userPlaylistsModal');
    if (userPlaylistsModalEl) {
        userPlaylistsModalEl.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeUserPlaylistsModal();
        });
    }

    // Detectar redimensionamento da janela para ajustar marquee
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const cTitle = document.querySelector('.current-details .c-title');
            checkIfTitleNeedsTruncation(cTitle);
        }, 150);
    });
}

function onProgressInput(event) {
    const progressBar = event.target;
    const value = Number(progressBar.value);
    const duration = player.currentDuration || 0;
    const seconds = (duration * value) / 100;
    // Mostrar tempo atual enquanto arrasta
    document.getElementById('timeCurrent').textContent = formatTime(seconds);
    player.currentTime = seconds;
    // Atualizar visual imediato do preenchimento
    progressBar.style.setProperty('--progress-bar-fill', `${Math.min(100, Math.max(0, value))}% 100%`);
    // Se possível, seek em tempo real para maior fluidez (cauteloso)
    if (player.ytReady && ytPlayer) {
        try { ytPlayer.seekTo(seconds, true); } catch (e) { /* ignore */ }
    }
}

function onProgressChange(event) {
    const value = Number(event.target.value);
    const duration = player.currentDuration || 0;
    const seconds = (duration * value) / 100;

    player.currentTime = seconds;
    if (player.ytReady && ytPlayer) {
        ytPlayer.seekTo(seconds, true);
    }
    updateProgressBar();
}
