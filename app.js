
/**
 * 🎵 SAN PLAYER - APP.JS
 * 
 * ⚠️ ARCHITECHT PROTECTION ATIVO ⚠️
 * 
 * Problema RESOLVIDO (5ª ocorrência): Indicador 🎵 na posição errada
 * Solução: Função central getCurrentPlayingVideo() como fonte única de verdade
 * 
 * 📖 LEIA OBRIGATORIAMENTE:
 * - ARCHITECTURE_PROTECTION.md (documentação completa)
 * - QUICK_REFERENCE.md (guia rápido)
 * 
 * ✅ Checklist antes de modificar estado:
 * 1. Usando getCurrentPlayingVideo()? ✓
 * 2. Chamado updateActivePlaylistItem() após mudar índice? ✓
 * 3. Using data-video-id (nunca data-video-index)? ✓
 * 4. Testei em playlist + favorites? ✓
 * 
 * Ignorar = Bug volta (NUNCA MAIS!). 🔒
 */

// ============================================================================
// CONFIGURAÇÃO CENTRAL DE INICIALIZAÇÃO
// ============================================================================

/**
 * 🛡️ TRACK INICIAL FALLBACK - INFRAESTRUTURA CRÍTICA
 * 
 * ⚠️ NÃO é uma "feature visual", é última linha de defesa contra:
 * - Estado corrompido
 * - IDs inválidos
 * - Falhas de API
 * - Modo anônimo
 * - Multi-device sem sincronização
 * 
 * ✅ TRÊS RESPONSABILIDADES DISTINTAS:
 * 1. Primeira visita (UX controlada) - via localStorage.hasVisited
 * 2. Estado persistido (prioridade máxima) - sempre ganha se válido
 * 3. Fallback técnico (erro/edge case) - último recurso
 * 
 * 🔧 Para mudar, altere 'id' para valor existente em playlists.
 * 💾 VALIDE MANUALMENTE que o ID existe nos arquivos JSON!
 */
const INITIAL_TRACK_FALLBACK = {
    id: "m21zfosnqls",              // ⭐ ID ÚNICO - MUDE AQUI PARA OUTRA MÚSICA
    title: "Chill Out Mix 2023🍓 Chillout Lounge 117",
    artist: "Helios Deep",
    _description: "Infraestrutura: fallback de integridade do player"
};

/**
 * 🔒 VALIDAÇÃO: Garante que track tem estrutura mínima válida
 * 
 * Edge cases protegidos:
 * - localStorage corrompido
 * - ID inválido
 * - Objeto vazio ou null
 * - Estrutura alterada
 * 
 * @param {Object} track - Track a validar
 * @returns {Boolean} true se track é confiável
 */
function isValidTrack(track) {
    if (!track || typeof track !== 'object') return false;
    if (typeof track.id !== 'string' || track.id.trim() === '') return false;
    if (typeof track.title !== 'string' || track.title.trim() === '') return false;
    if (typeof track.artist !== 'string' || track.artist.trim() === '') return false;
    return true;
}

/**
 * 🚪 FALLBACK SEGURO: Retorna track válido ou INITIAL_TRACK_FALLBACK
 * 
 * Uso obrigatório ANTES de:
 * - Renderizar track
 * - Tocar vídeo
 * - Salvar em localStorage
 * 
 * Garante player NUNCA fica em estado inválido.
 * 
 * @param {Object} possibleTrack - Track que pode estar inválido
 * @returns {Object} Track válido garantido
 */
function getSafeTrack(possibleTrack) {
    if (isValidTrack(possibleTrack)) {
        return possibleTrack;
    }
    console.warn('[getSafeTrack] ⚠️ Track inválido, usando FALLBACK:', possibleTrack);
    return INITIAL_TRACK_FALLBACK;
}

/**
 * 🎯 FLAG DE PRIMEIRA VISITA
 * 
 * Separa claramente:
 * - Primeira vez: UX controlada (INITIAL_TRACK_FALLBACK)
 * - Retorno: estado persistido (localStorage)
 * - Erro: fallback técnico (INITIAL_TRACK_FALLBACK)
 * 
 * Inicialmente undefined, definido em resolveInitialTrack()
 */
let hasVisitedBefore = undefined;

/**
 * Feature flag para nova lógica de inicialização
 * true = Nova lógica (prioridade: URL → localStorage → fallback)
 * false = Lógica legada (loadLastState → loadDefaultState)
 * 
 * Use para rollback imediato se problemas forem encontrados
 */
const USE_NEW_INIT_LOGIC = true;

/**
 * 🔒 LOCK DE INICIALIZACIÓN
 * Garante que o player é inicializado UMA VEZ apenas
 * Previne múltiplos fluxos competindo e sobrescrevendo o estado
 */
let playerInitialized = false;

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

const player = {
    playlistsIndex: [],             // Metadata from index.json only
    playlistsData: [],              // Legacy, now used for cache reference
    currentPlaylist: null,
    currentPlaylistIndex: null,
    currentVideoIndex: 0,
    // 🔒 CONGELADO: Sincronização crítica entre UI e YouTube player
    // REGRA: isPlaying DEVE refletir EXATAMENTE o estado do YouTube player
    // - true = YouTube.PLAYING (vídeo tocando)
    // - false = Qualquer outro estado (paused, cued, stopped, etc)
    // NÃO manipule este valor diretamente exceto em:
    //   → onPlayerStateChange() (YouTube events)
    //   → togglePlayPause() (user action)
    // ⚠️ Qualquer outra modificação QUEBRARÁ a UI de play/pause
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
    previewVideo: null,             // 🎬 Rastreia qual vídeo está em preview na tela (pode não estar tocando)
};

// ============================================================================
// � AVISO IMPORTANTE: PROTOCOLO DE PROTEÇÃO ATIVO
// ============================================================================
// 
// 🚨 Problema recorrente RESOLVIDO (5ª ocorrência):
// Indicador de 🎵 (equalizador) aparecia na posição errada quando navegava
// entre playlists e favoritos.
//
// 🔒 Solução implementada: Função central getCurrentPlayingVideo()
// 
// ⭐ LEIA OBRIGATORIAMENTE:
// Arquivo: ARCHITECTURE_PROTECTION.md (em ROOT do projeto)
// 
// Contém:
// ✅ Como usar getCurrentPlayingVideo() (SEMPRE!)
// ✅ Onde adicionar guardrails ao modificar estado crítico
// ✅ Checklist para adicionar novas features
// ✅ Debugging se algo quebrar
// ✅ Cenários críticos para testar
//
// Ignorar este protocolo = Bug voltará (ou piores consequences).
//
// ============================================================================

// ============================================================================
// �🔒 FUNÇÃO RAINHA: FONTE ÚNICA DE VERDADE SOBRE QUAL VÍDEO ESTÁ TOCANDO
// ============================================================================
/**
 * ⚡ CRÍTICO: Esta é a ÚNICA função que deve ser usada para obter o vídeo que está tocando
 * 
 * ❌ NÃO FAÇA:
 * - player.currentPlaylist.videos[player.currentVideoIndex]
 * - Lógica condicional baseada em viewingFavorites
 * - Diferentes formas em funções diferentes
 * 
 * ✅ SEMPRE FAÇA:
 * - const video = getCurrentPlayingVideo();
 * 
 * Razão: Protege contra bugs de:
 * - Modo favoritos vs modo playlist (MÚLTIPLOS contextos de índice)
 * - Indicador visual em item errado (5º bug relacionado - NUNCA MAIS!)
 * - Sincronização quebrada entre estados
 * - Mudanças futuras em user.viewingFavorites ou player.currentFavoriteId
 * 
 * REGRA: Se você precisa saber "qual música está tocando", use ESTA função.
 * 
 * @returns {Object|null} Objeto video {id, title, artist} ou null se nenhum
 */
function getCurrentPlayingVideo() {
    // PASSO 1: Validar estado básico
    if (!player.currentPlaylist || !player.currentPlaylist.videos) {
        console.warn('[getCurrentPlayingVideo] ❌ Nenhuma playlist carregada');
        return null;
    }
    
    // PASSO 2: Se estamos em modo favoritos, lógica especial
    if (player.viewingFavorites && player.favorites.length > 0) {
        // Em modo favoritos, o índice atual é relativo à PLAYLIST (não à view favoritos)
        const video = player.currentPlaylist.videos[player.currentVideoIndex];
        if (!video) return null;
        
        // Validar: a música que está tocando é realmente um favorito?
        const isFavorited = player.favorites.some(fav => fav.video.id === video.id);
        if (!isFavorited) {
            // ✅ Caso válido: Usuário favoritou depois de começar a tocar
            return video;
        }
        
        // Caso normal: usar currentFavoriteId como referência
        if (player.currentFavoriteId !== null) {
            const favorite = player.favorites.find(fav => fav.id === player.currentFavoriteId);
            if (favorite) {
                return favorite.video;
            }
        }
        
        // Fallback: voltar para playlist
        return video;
    }
    
    // PASSO 3: Modo normal (playlist)
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    if (!video) {
        console.warn('[getCurrentPlayingVideo] ⚠️ currentVideoIndex inválido:', player.currentVideoIndex);
        return null;
    }
    
    return video;
}

/**
 * 🎨 HELPER: Obter YouTube ID do vídeo que está tocando
 * Wrapper útil para encontrar elementos no DOM
 */
function getCurrentPlayingVideoId() {
    const video = getCurrentPlayingVideo();
    return video?.id || null;
}

/**
 * ⚡ FONTE ÚNICA DE VERDADE: Vídeos que DEVEM aparecer na sidebar
 * 
 * Encapsula: "qual view o usuário está vendo agora?"
 * 
 * ✅ SEMPRE use isto em vez de:
 * - navigationContext.currentView?.data?.videos
 * - player.currentPlaylist?.videos
 * - lógica condicional baseada em viewingFavorites
 * 
 * @returns {Array} Lista de vídeos que a sidebar deve exibir
 */
function getCurrentViewVideos() {
    return navigationContext.currentView?.data?.videos 
        || player.currentPlaylist?.videos 
        || [];
}

// ============================================================================
// NAVEGAÇÃO E CONTEXTO DE VISUALIZAÇÃO
// ============================================================================

/**
 * 🧭 NOVO SISTEMA DE NAVEGAÇÃO
 * 
 * Separação entre:
 * - Contexto original: A fonte de dados que o usuário escolheu inicialmente (playlist/artista)
 * - Visualização atual: O que o usuário está vendo AGORA (pode ser favoritos, artista, etc)
 * - Player: COMPLETAMENTE INDEPENDENTE - continua tocando independente da view
 * 
 * FLUXO:
 * 1. Usuário escolhe uma playlist → originalSource = playlist, currentView = playlist
 * 2. Usuário clica em "Favoritos" → originalSource = playlist (PRESERVADO), currentView = favorites
 * 3. Usuário clica "Voltar" → currentView volta a originalSource, música continua tocando
 * 
 * ⚠️ REGRA CRÍTICA: O botão "Voltar" só aparece quando currentView !== originalSource
 */
const navigationContext = {
    originalSource: null,      // { type: 'playlist'|'artist', id?: string|number, data: {...} }
    currentView: null,         // { type: 'favorites'|'artist'|'playlist', data: [...] }
    canGoBack: false,          // Sincronizado: true quando currentView != originalSource
    
    /**
     * Atualizar contexto quando usuário escolhe uma nova visualização
     * @param {Object} source - Nova fonte { type, id?, data }
     */
    setOriginalSource(source) {
        console.log('[Navigation.setOriginalSource]', source);
        
        this.originalSource = source;
        this.currentView = source;  // Ambos começam iguais
        this.canGoBack = false;
        
        console.log('[Navigation.setOriginalSource] Contexto guardado:', {
            originalSource: this.originalSource,
            currentView: this.currentView,
            canGoBack: this.canGoBack
        });
        
        updateBackButtonVisibility();
    },
    
    /**
     * 🔒 REFATORADO: Mudar visualização para algo diferente (favoritos, artista, etc)
     * @param {Object} view - Nova view { type, data }
     */
    setCurrentView(view) {
        console.log('[Navigation.setCurrentView]', { viewType: view.type, originalType: this.originalSource?.type });
        
        this.currentView = view;
        
        // ⚡ SIMPLIFICADO: Comparação por referência (mais robusta)
        // Pode voltar APENAS se:
        // 1. originalSource existe
        // 2. currentView é diferente (referência !== originalSource)
        this.canGoBack = (
            this.originalSource &&
            this.currentView &&
            this.currentView !== this.originalSource
        );
        
        console.log('[Navigation.setCurrentView] canGoBack:', this.canGoBack);
        updateBackButtonVisibility();
    },
    
    /**
     * 🔒 REFATORADO: Voltar para o contexto original
     * Usa referência direta (sem clone) - mais simples e robusto
     */
    restoreOriginal() {
        if (!this.originalSource) return;
        
        // ⚡ Usar referência direta (não clonar)
        // Evita:
        // - Perda de referência original
        // - Bugs em comparação (===)
        // - Inconsistência de dados
        this.currentView = this.originalSource;
        this.canGoBack = false;
        
        updateBackButtonVisibility();
    }
};

/**
 * 🔒 ENCODE SEGURO PARA COMPARTILHAMENTO
 * 
 * ⚠️ CRÍTICO: Esta função FORÇA encode de pontos finais
 * Sem isso: "Fábio Jr." vira "?artistId=Fábio%20Jr." (ponto não encodado)
 * Com isso: "Fábio Jr." vira "?artistId=Fábio%20Jr%2E" (ponto SEMPRE %2E)
 * 
 * Por quê:
 * - Navegadores interpretam "." como fim de extensão
 * - Query string pode truncar se não encodado corretamente
 * - normalize() também funciona, mas URL fica limpa
 * 
 * ⚠️ REGRAS OBRIGATÓRIAS:
 * ❌ NUNCA use: encodeURIComponent(str)
 * ✅ SEMPRE use: safeEncode(str)
 * 
 * @param {String} str - Nome de artista/playlist com possíveis pontos
 * @returns {String} String encoded com %2E para pontos
 */
function safeEncode(str) {
    return encodeURIComponent(str)
        .replace(/\.\.\./g, '%2E%2E%2E')  // Três pontos primeiro
        .replace(/\.\.\./g, '%2E%2E')     // Dois pontos
        .replace(/\./g, '%2E');            // Um ponto
}

/**
 * 🔒 WRAPPER CRÍTICO: Centraliza renderização após mudança de visualização
 * 
 * ⚠️ REGRA OBRIGATÓRIA:
 * Quando você quiser mudar a visualização (sidebar):
 * ❌ NUNCA faça: navigationContext.setCurrentView(...)
 * ✅ SEMPRE faça: setView(...)
 * 
 * Isso garante que:
 * 1. Contexto é atualizado com formato correto {type, data}
 * 2. Sidebar é re-renderizada
 * 3. Indicador não fica desincronizado (persistPlayerState() consegue ler viewType)
 * 
 * 🆕 CRÍTICO: Converte automaticamente para formato esperado
 * - Se receber {type, data} → usa direto
 * - Se receber {name, videos} (playlist object) → converte para {type: 'playlist', data: ...}
 * - Isso evita viewType ser undefined e quebrar persistência!
 */
function setView(view) {
    // 🔥 CONVERSÃO AUTOMÁTICA: Se recebeu objeto de playlist sem type, converter
    // Isso é necessário para compatibilidade com código que chama setView(playlistData)
    let normalizedView = view;
    
    if (view && !view.type && (view.name || view.videos)) {
        // 🆕 View recebida em formato de playlist {name, videos}
        // Converter para formato esperado {type, data}
        console.log('[setView] ⚠️ Convertendo playlist object para view format:', {
            from: view.name,
            type: 'playlist'
        });
        
        normalizedView = {
            type: 'playlist',
            data: view
        };
    }
    
    // � NORMALIZAR DADOS DE FAVORITOS para renderização correta
    // Favoritos vêm como [{ id, video: {...} }]
    // Mas loadPlaylistVideos() espera { videos: [...] }
    if (normalizedView.type === 'favorites' && normalizedView.data && Array.isArray(normalizedView.data)) {
        normalizedView.data = {
            name: 'Favoritos',
            videos: normalizedView.data.map(fav => fav.video || fav)
        };
        console.log('[setView] 📝 Dados de favoritos normalizados para renderização');
    }
    
    // �🔒 Usar view normalizada
    navigationContext.setCurrentView(normalizedView);
    loadPlaylistVideos();
    updateActivePlaylistItem?.();
    
    // 🧭 CRÍTICO: Registrar no histórico de navegação
    // Toda mudança de sidebar passa AQUI, garantindo histórico correto
    // ⚠️ MAS: Não registrar quando restaurando do histórico (evita duplicação)
    if (appInitComplete && !isRestoringFromHistory) {
        sidebarHistory.push({
            type: normalizedView.type,
            data: normalizedView.data,
            name: normalizedView.data?.name || normalizedView.name
        });
        console.log('[setView] 🧭 View registrada no histórico:', {
            type: normalizedView.type,
            name: normalizedView.data?.name || normalizedView.name
        });
    } else if (isRestoringFromHistory) {
        console.log('[setView] ⏭️ Restaurando do histórico - NÃO registrando novamente');
    }
}


// ============================================================================
// 💾 MÓDULO DE PERSISTÊNCIA (localStorage)
// ============================================================================
/**
 * 🔒 Centralizado: Todas operações com localStorage passam por aqui
 * Evita: strings mágicas espalhadas, bugs de serialização
 */
const storage = {
    /**
     * Salva dados em localStorage como JSON
     * @param {string} key - Chave (ex: 'sanplayer:state')
     * @param {*} data - Dados a serializar
     */
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`[Storage] ✅ Saved "${key}"`);
        } catch (e) {
            console.warn(`[Storage] ⚠️ Falhou em salvar "${key}":`, e.message);
        }
    },
    
    /**
     * Carrega dados de localStorage e desserializa
     * @param {string} key - Chave
     * @returns {*|null} Dados ou null se não existir/falhar
     */
    load(key) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            console.warn(`[Storage] ⚠️ Falhou em carregar "${key}":`, e.message);
            return null;
        }
    },

    /**
     * Remove dados de localStorage
     * @param {string} key - Chave
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            console.log(`[Storage] ✅ Removed "${key}"`);
        } catch (e) {
            console.warn(`[Storage] ⚠️ Falhou em remover "${key}":`, e.message);
        }
    }
};

// ============================================================================
// 💾 FUNÇÕES DE PERSISTÊNCIA
// ============================================================================

/**
 * 🔒 Salva estado do player em localStorage
 * 
 * Persiste:
 * - Qual vídeo está tocando (por YouTube ID)
 * - Em qual minuto parou
 * - Se tava tocando ou pausado
 * - Contexto da playlist (nome + tipo)
 * - Contexto da view (se em favoritos, artista, etc)
 */
function persistPlayerState() {
    const video = getCurrentPlayingVideo();
    
    // 🧨 VALIDAÇÃO CRÍTICA: Se vídeo inválido, não salvar
    // Evita corromper localStorage com dados inválidos
    if (!isValidTrack(video)) {
        console.warn('[persistPlayerState] ⚠️ Video inválido, não salvando:', video);
        return;
    }
    
    const stateToSave = {
        // 🎬 Video (use ID, nunca objeto)
        currentVideoId: video.id,
        currentVideoTitle: video.title,
        currentVideoArtist: video.artist,
        
        // ⏱️ Timing - 🔥 USAR tempo real do YouTube player, não player.currentTime
        currentTime: (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : (player.currentTime || 0),
        isPlaying: player.isPlaying,
        
        // 📋 Contexto da playlist
        playlistName: player.currentPlaylist?.name,
        
        // 🧭 Contexto COMPLETO da view (não apenas tipo, mas dados)
        viewType: navigationContext.currentView?.type,
        viewData: navigationContext.currentView?.data ? {
            id: navigationContext.currentView.data.id,
            name: navigationContext.currentView.data.name
        } : null,
        isFavorites: player.viewingFavorites,
        
        // 🕐 Timestamp (para validação de age e debug)
        timestamp: Date.now(),
        savedAt: new Date().toISOString()
    };
    
    storage.save('sanplayer:state', stateToSave);
    
    // � DEBUG: Logging removido para evitar spam massivo (1630+ messages)
    // Descomentar só para troubleshooting
    // console.log('[persistPlayerState] Saved:', stateToSave.currentVideoId);
}

/**
 * 📂 Restaura estado do player do localStorage no init
 * 
 * Valida:
 * - Se o vídeo salvo ainda existe nas playlists
 * - Se o tempo salvo é válido
 * 
 * Restaura:
 * - Carrega o vídeo
 * - Resume no tempo certo
 * - Auto-play se estava tocando
 */
async function restorePlayerState() {
    const saved = storage.load('sanplayer:state');
    if (!saved) {
        console.log('[Restore] ℹ️ Nenhum estado salvo');
        return false;
    }
    
    console.log('[Restore] 📂 Estado encontrado:', {
        videoId: saved.currentVideoId,
        videoTitle: saved.currentVideoTitle,
        currentTime: saved.currentTime,
        wasPlaying: saved.isPlaying,
        savedAt: saved.savedAt
    });
    
    // 🔍 VALIDAÇÃO: Procurar vídeo em todas as playlists
    let foundVideo = null;
    let foundPlaylist = null;
    let foundPlaylistData = null;  // 🆕 Guardar dados completos, não apenas metadata
    for (const playlist of player.playlistsIndex) {
        const data = await loadPlaylistByUrl(playlist.url);
        if (data?.videos) {
            foundVideo = data.videos.find(v => v.id === saved.currentVideoId);
            if (foundVideo) {
                foundPlaylist = playlist;
                foundPlaylistData = data;  // 🆕 Guardar dados completos
                break;
            }
        }
    }
    
    if (!foundVideo) {
        console.warn('[Restore] ❌ Vídeo salvo não encontrado nas playlists:', saved.currentVideoId);
        storage.remove('sanplayer:state');
        return false;
    }
    
    console.log('[Restore] ✅ Vídeo encontrado:', foundVideo.title);
    
    // � RESET: Limpar estado anterior ANTES de restaurar
    // Isso garante que não há conflito entre o estado antigo e novo
    player.currentPlaylist = foundPlaylistData;  // Use dados completos, não metadata
    
    // 🆕 CRÍTICO: Encontrar o índice CORRETO do vídeo  na playlist
    player.currentVideoIndex = foundPlaylistData.videos.findIndex(v => v.id === foundVideo.id);
    
    if (player.currentVideoIndex === -1) {
        console.error('[Restore] ❌ Vídeo encontrado mas índice não localizado!');
        return false;
    }
    
    console.log('[Restore] 🧹 Estado anterior limpo - vídeo restaurado no índice:', player.currentVideoIndex);
    
    // �🧭 CRÍTICO: Restaurar a view CORRETA (pode ser Artista, Favoritos ou Playlist)
    console.log('[Restore] 🧭 View anterior era:', saved.viewType);
    
    // Restaurar a view ANTES de chamar loadVideo
    // Isso garante que navigationContext está correto
    if (saved.viewType === 'artist' && saved.viewData?.name) {
        // Restaurar vista de artista
        console.log('[Restore] 🎨 Restaurando view do artista:', saved.viewData.name);
        const artistName = saved.viewData.name;
        const artistVideos = [];
        
        // Procurar todos os vídeos deste artista
        for (const playlist of player.playlistsIndex) {
            const data = await loadPlaylistByUrl(playlist.url);
            if (data?.videos) {
                const filtered = data.videos.filter(v => normalize(v.artist) === normalize(artistName));
                artistVideos.push(...filtered);
            }
        }
        
        if (artistVideos.length > 0) {
            // Preparar contexto de artista
            navigationContext.setCurrentView({
                type: 'artist',
                data: {
                    name: artistName,
                    videos: artistVideos,
                    id: `artist-${artistName}`
                }
            });
            player.currentPlaylistIndex = -1;
            console.log('[Restore] ✅ Contexto de artista restaurado');
        } else {
            console.warn('[Restore] ⚠️ Nenhum vídeo encontrado para artista:', artistName);
            // Fallback: restaurar com playlist completa (não com formato incorreto)
            navigationContext.setCurrentView({
                type: 'playlist',
                data: foundPlaylistData
            });
        }
    } else if (saved.isFavorites === true) {
        // Restaurar vista de favoritos
        console.log('[Restore] ❤️ Restaurando view de favoritos');
        player.viewingFavorites = true;
        navigationContext.setCurrentView({
            type: 'favorites',
            data: { videos: player.favorites || [] }
        });
    } else {
        // Padrão: restaurar a playlist que contém o vídeo
        // 🆕 CRÍTICO: Usar formato correto {type: 'playlist', data: ...}
        console.log('[Restore] 📋 Restaurando view da playlist:', foundPlaylist.name);
        navigationContext.setCurrentView({
            type: 'playlist',
            data: foundPlaylistData
        });
        player.viewingFavorites = false;  // Garantir que não está em modo favoritos
    }
    
    console.log('[Restore] 🧭 View restaurada:', {
        viewType: navigationContext.currentView?.type,
        viewName: navigationContext.currentView?.data?.name || navigationContext.currentView?.data?.id
    });
    
    // Validar tempo salvo (não pode ser negativo ou > duração esperada)
    const validTime = saved.currentTime >= 0 ? saved.currentTime : 0;
    
    // � CRÍTICO: Restaurar estado interno do player ANTES de chamar loadVideo
    player.currentVideo = foundVideo;
    
    // �🔄 Restaurar vídeo via loadVideo (que chama ytPlayer.cueVideoById)
    console.log('[Restore] 🎬 Carregando vídeo:', foundVideo.title);
    loadVideo(foundVideo);
    
    // 💾 Armazenar tempo restaurado para pedir ao player depois
    // (O seek só funciona APÓS o vídeo estar CUED, que onPlayerStateChange vai detectar)
    player._restoreTime = validTime;
    player._restoreAutoPlay = saved.isPlaying;
    
    console.log('[Restore] 💾 Agendado:', {
        tempo: validTime,
        autoPlay: saved.isPlaying
    });
    
    // 🎯 CRÍTICO: Renderizar a sidebar para mostrar os items
    // sem isso o player restaura mas a sidebar fica vazia
    console.log('[Restore] 📋 Renderizando sidebar...');
    loadPlaylistVideos();
    updateActivePlaylistItem();
    console.log('[Restore] ✅ Sidebar renderizada');
    
    return true;
}

// ============================================================================
// CACHE E ESTADO DE REQUISIÇÕES
// ============================================================================

const playlistCache = new Map();    // Map<url, playlistData>

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

// 🔔 Service Worker Update
let pendingWorker = null;           // Referência ao worker em espera para atualização

// Keyboard offset throttle & cache
let keyboardOffsetTimeout = null;   // Throttle para updateKeyboardOffset
let lastKeyboardOffset = 0;         // Cache do último offset calculado (evita reflow desnecessário)

// Theme Color Control (Android Navbar - PWA Excellence)
const THEME_COLOR = '#0f0f0f';
let metaThemeColor = null;

// 💾 Persistência de estado (localStorage throttle)
let lastPersistTime = 0;            // Throttle: última vez que salvou
const PERSIST_THROTTLE_MS = 3000;   // Salvar a cada 3s (timeupdate)

// 🎵 Media Session Position State throttle
let lastMediaSessionUpdateTime = 0;  // Throttle: última atualização de posição
const MEDIA_SESSION_THROTTLE_MS = 500; // Atualizar a cada 500ms (sincronizar barra de notificação)

// 🚀 Flag de inicialização completa (para não registrar primeira carga no histórico)
let appInitComplete = false;

// 🧭 Flag para indicar que estamos restaurando estado do histórico
// Quando TRUE, setView() NÃO registra novamente no histórico
let isRestoringFromHistory = false;

// 🧭 NAVEGAÇÃO DA SIDEBAR: Histórico de views (playlists, artistas, favoritos, etc)
const sidebarHistory = {
    stack: [],                      // Array de estados de view completos
    currentIndex: -1,               // Posição atual no histórico
    
    /**
     * Captura um snapshot COMPLETO do estado atual
     * Inclui: tipo, dados, scroll, item selecionado, etc
     */
    captureSnapshot(viewState) {
        let dataDeepCopy = null;
        
        try {
            // Tentar fazer deep copy
            dataDeepCopy = JSON.parse(JSON.stringify(viewState.data));
        } catch (e) {
            // Se falhar (referência circular, etc), usar apenas referência
            console.warn('[SidebarHistory.captureSnapshot] ⚠️ Deep copy falhou, usando referência:', {
                error: e.message,
                type: viewState.type,
                name: viewState.name
            });
            dataDeepCopy = viewState.data;
        }
        
        return {
            type: viewState.type,                    // 'playlist', 'artist', 'favorites'
            data: dataDeepCopy,                      // Deep copy (ou referência se falhar)
            name: viewState.name,                    // Nome para exibição
            timestamp: Date.now(),                   // Quando foi capturado
            currentVideoIndex: player.currentVideoIndex,  // Qual vídeo estava tocando
            currentPlaylistIndex: player.currentPlaylistIndex,
            scrollPosition: this.captureScrollPosition(),  // Posição de scroll da sidebar
            dataSnapshot: {
                videoCount: viewState.data?.videos?.length || 0,
                hasItems: !!(viewState.data?.videos?.length)
            }
        };
    },
    
    /**
     * Captura a posição de scroll atual da sidebar
     */
    captureScrollPosition() {
        try {
            const itemsContainer = document.querySelector('.playlist-items');
            return itemsContainer ? itemsContainer.scrollTop : 0;
        } catch (e) {
            console.warn('[SidebarHistory.captureScrollPosition] ⚠️ Erro ao capturar scroll:', e.message);
            return 0;
        }
    },
    
    /**
     * Compara se dois estados são EXATAMENTE idênticos (evita duplicata imediata)
     * ⚠️ CRÍTICO: Só rejeita se for 100% idêntico
     * Permite: mesma playlist visitada 2x (são 2 momentos diferentes)
     * Rejeita: chamar push() duas vezes no mesmo frame (race condition)
     */
    isDuplicate(state1, state2) {
        if (!state1 || !state2) return false;
        
        // Só considera duplicata se:
        // 1. Tipo idêntico
        // 2. Name idêntico
        // 3. Ambas criadas no mesmo segundo (race condition)
        const sameSec = Math.floor(state1.timestamp / 1000) === Math.floor(state2.timestamp / 1000);
        if (!sameSec) return false;  // Se não é no mesmo segundo, é diferente (contexto diferente)
        
        if (state1.type !== state2.type) return false;
        if (state1.name !== state2.name) return false;
        
        // Se é playlist, comparar ID
        if (state1.type === 'playlist' && state2.type === 'playlist') {
            const id1 = state1.data?.id || state1.name;
            const id2 = state2.data?.id || state2.name;
            return id1 === id2;  // Mesmo ID = mesma playlist
        }
        
        return true;  // Mesma view, mesmo segundo = duplicata
    },
    
    /**
     * Adiciona um novo estado ao histórico
     * Remove qualquer histórico "forward" se houver
     * 🔥 CRÍTICO: Só adiciona após a inicialização estar completa
     * 🆕 CRÍTICO: Monitora se o estado REALMENTE mudou
     */
    push(viewState) {
        console.log('[SidebarHistory.push] 📌 CHAMADO com:', {
            type: viewState?.type,
            name: viewState?.name,
            appInitComplete: appInitComplete,
            stackSize: this.stack.length
        });
        
        // ⚠️ Durante a inicialização, não adicionar ao histórico
        if (!appInitComplete) {
            console.warn('[SidebarHistory.push] ⏸️ REJEITADO - Inicialização em progresso (appInitComplete=false)');
            console.log('[SidebarHistory.push] Stack atual:', this.stack.length, 'items');
            return;
        }
        
        console.log('[SidebarHistory.push] ✅ ACEITO - appInitComplete=true, prosseguindo...');
        
        try {
            // Capturar snapshot completo
            const newSnapshot = this.captureSnapshot(viewState);
            console.log('[SidebarHistory.push] ✅ Snapshot capturado com sucesso');
            
            // Verificar se é duplicata (race condition) - MUITO RÍGIDO
            const previousState = this.stack[this.currentIndex];
            if (previousState && this.isDuplicate(previousState, newSnapshot)) {
                console.log('[SidebarHistory] ⏭️ Duplicata detectada (mesmo estado no mesmo segundo)', {
                    type: newSnapshot.type,
                    name: newSnapshot.name
                });
                return;
            }
            
            // Remover forward history se existir
            if (this.currentIndex < this.stack.length - 1) {
                this.stack = this.stack.slice(0, this.currentIndex + 1);
            }
            
            this.stack.push(newSnapshot);
            this.currentIndex = this.stack.length - 1;
            
            console.log('[SidebarHistory.push] 📌 Item adicionado ao stack:', {
                type: newSnapshot.type,
                name: newSnapshot.name,
                newStackSize: this.stack.length,
                newCurrentIndex: this.currentIndex
            });
            
            console.log('[SidebarHistory.push] 🔄 Chamando updateButtons()...');
            this.updateButtons();
            console.log('[SidebarHistory.push] ✅ updateButtons() completado');
            
            console.log('[SidebarHistory] 📍 Adicionado:', {
                type: newSnapshot.type,
                name: newSnapshot.name,
                videosCount: newSnapshot.dataSnapshot.videoCount,
                stackSize: this.stack.length,
                currentIndex: this.currentIndex,
                canGoBack: this.canGoBack(),
                canGoForward: this.canGoForward()
            });
            
            // 🔍 DEBUG: Mostrar histórico completo após adicionar
            console.log('[SidebarHistory.push] 📊 Chamando printHistory()...');
            this.printHistory();
            console.log('[SidebarHistory.push] ✅ Sequência completa de push() finalizada');
            
        } catch (e) {
            console.error('[SidebarHistory.push] 🔴 ERRO durante push():', {
                error: e.message,
                stack: e.stack,
                viewState: { type: viewState?.type, name: viewState?.name }
            });
        }
    },
    
    /**
     * Volta para o estado anterior
     */
    goBack() {
        console.log('[SidebarHistory.goBack] Tentando voltar...', {
            canGoBack: this.canGoBack(),
            currentIndex: this.currentIndex,
            stackSize: this.stack.length
        });
        
        try {
            if (this.canGoBack()) {
                this.currentIndex--;
                const targetState = this.stack[this.currentIndex];
                console.log('[SidebarHistory.goBack] ✅ Voltado para:', {
                    newIndex: this.currentIndex,
                    type: targetState?.type,
                    name: targetState?.name
                });
                this.restoreState();
                this.printHistory();
            } else {
                console.warn('[SidebarHistory.goBack] ❌ Não pode voltar (no início do histórico)');
            }
        } catch (e) {
            console.error('[SidebarHistory.goBack] 🔴 ERRO:', e.message);
            this.updateButtons();
        }
    },
    
    /**
     * Avança para o próximo estado (se houver)
     */
    goForward() {
        console.log('[SidebarHistory.goForward] Tentando avançar...', {
            canGoForward: this.canGoForward(),
            currentIndex: this.currentIndex,
            stackSize: this.stack.length
        });
        
        try {
            if (this.canGoForward()) {
                this.currentIndex++;
                const targetState = this.stack[this.currentIndex];
                console.log('[SidebarHistory.goForward] ✅ Avançado para:', {
                    newIndex: this.currentIndex,
                    type: targetState?.type,
                    name: targetState?.name
                });
                this.restoreState();
                this.printHistory();
            } else {
                console.warn('[SidebarHistory.goForward] ❌ Não pode avançar (no fim do histórico)');
            }
        } catch (e) {
            console.error('[SidebarHistory.goForward] 🔴 ERRO:', e.message);
            this.updateButtons();
        }
    },
    
    /**
     * Verifica se pode voltar
     */
    canGoBack() {
        return this.currentIndex > 0;
    },
    
    /**
     * Verifica se pode avançar
     */
    canGoForward() {
        return this.currentIndex < this.stack.length - 1;
    },
    
    /**
     * Restaura o estado COMPLETO no índice atual
     * 🆕 Restaura não apenas a view, mas também scroll, item selecionado, etc
     */
    restoreState() {
        try {
            if (this.currentIndex >= 0 && this.currentIndex < this.stack.length) {
                const state = this.stack[this.currentIndex];
                
                console.log('[SidebarHistory.restoreState] Restaurando:', {
                    type: state.type,
                    name: state.name,
                    videoIndex: state.currentVideoIndex,
                    scrollPos: state.scrollPosition
                });
                
                // 🔥 CRÍTICO: Sinalizar que estamos restaurando para não registrar no histórico novamente
                isRestoringFromHistory = true;
                
                try {
                    // 🎯 Regra de ouro: APENAS usar setView() durante restore
                    // Não chamar selectArtist() ou displayFavoritesList() diretamente
                    // para evitar chamadas aninhadas de setView()
                    
                    setView({
                        type: state.type,
                        data: state.data
                    });
                    
                    console.log('[SidebarHistory.restoreState] ✅ View restaurada via setView()');
                } finally {
                    // Resetar flag após restauração
                    isRestoringFromHistory = false;
                }
                
                // 🆕 Restaurar informações adicionais com DELAY
                // Aguardar renderização completa antes de restaurar scroll/indicadores
                setTimeout(() => {
                    try {
                        // Restaurar posição de scroll após renderização
                        const itemsContainer = document.querySelector('.playlist-items');
                        if (itemsContainer && state.scrollPosition !== undefined) {
                            itemsContainer.scrollTop = state.scrollPosition;
                            console.log('[SidebarHistory] ↩️ Scroll restaurado para:', state.scrollPosition);
                        }
                        
                        // Sincronizar estado favorito atual após renderização
                        updatePlayingNowIndicator();
                    } catch (e) {
                        console.warn('[SidebarHistory.restoreState] ⚠️ Erro ao restaurar efeitos:', e.message);
                    }
                }, 150);  // Aguardar 150ms para renderização completa
                
                this.updateButtons();
            }
        } catch (e) {
            console.error('[SidebarHistory.restoreState] 🔴 ERRO ao restaurar estado:', {
                error: e.message,
                stack: e.stack
            });
            // Tentar pelo menos atualizar botões
            this.updateButtons();
        }
    },
    
    /**
     * Atualiza o estado dos botões de navegação
     * 🆕 COM LOGGING DETALHADO para diagnóstico
     */
    updateButtons() {
        try {
            const backBtn = document.getElementById('sidebarBackBtn');
            const forwardBtn = document.getElementById('sidebarForwardBtn');
            
            const canBack = this.canGoBack();
            const canForward = this.canGoForward();
            
            // 🔥 LOG CRÍTICO - Mostrar SEMPRE, mesmo que encontre os botões
            console.log('[SidebarHistory.updateButtons] 🔍 DIAGNÓSTICO:', {
                stackSize: this.stack.length,
                currentIndex: this.currentIndex,
                canGoBack: canBack,
                canGoForward: canForward,
                backBtnFound: !!backBtn,
                forwardBtnFound: !!forwardBtn,
                timestamp: new Date().toLocaleTimeString()
            });
            
            if (!backBtn) {
                console.error('[SidebarHistory.updateButtons] 🔴 ERRO CRÍTICO: sidebarBackBtn não encontrado no DOM!');
                console.log('[SidebarHistory.updateButtons] Tentando buscar novamente...');
                const retryBackBtn = document.getElementById('sidebarBackBtn');
                console.log('[SidebarHistory.updateButtons] Resultado da retry:', !!retryBackBtn);
            }
            
            if (!forwardBtn) {
                console.error('[SidebarHistory.updateButtons] 🔴 ERRO CRÍTICO: sidebarForwardBtn não encontrado no DOM!');
            }
            
            if (backBtn) {
                // Botão sempre visível (independente de ter histórico)
                backBtn.classList.remove('hidden');
                // Apenas desabilita se não houver para voltar
                backBtn.disabled = !canBack;
                backBtn.classList.toggle('disabled', !canBack);
                const isDisabled = backBtn.disabled;
                console.log(`[SidebarHistory.updateButtons] Back btn: ${isDisabled ? 'disabled' : 'enabled'}`);
            }
            
            if (forwardBtn) {
                // Botão sempre visível (independente de ter histórico)
                forwardBtn.classList.remove('hidden');
                // Apenas desabilita se não houver para avançar
                forwardBtn.disabled = !canForward;
                forwardBtn.classList.toggle('disabled', !canForward);
                const isDisabled = forwardBtn.disabled;
                console.log(`[SidebarHistory.updateButtons] Forward btn: ${isDisabled ? 'disabled' : 'enabled'}`);
            }
        } catch (e) {
            console.error('[SidebarHistory.updateButtons] 🔴 ERRO ao atualizar botões:', {
                error: e.message,
                stack: e.stack
            });
        }
    },
    
    /**
     * 🔍 DEBUG: Mostra estado COMPLETO do histórico de navegação
     * Útil para validar fluxo de voltar/avançar
     */
    printHistory() {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║ 📍 SIDEBAR HISTORY - ESTADO COMPLETO                           ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log(`║ Stack Size: ${String(this.stack.length).padEnd(3)}                                             ║`);
        console.log(`║ Current Index: ${String(this.currentIndex).padEnd(2)}                                         ║`);
        console.log(`║ Can Go Back: ${String(this.canGoBack()).padEnd(5)}                                       ║`);
        console.log(`║ Can Go Forward: ${String(this.canGoForward()).padEnd(5)}                                   ║`);
        console.log('╠════════════════════════════════════════════════════════════════╣');
        
        if (this.stack.length === 0) {
            console.log('║ [VAZIO - Nenhuma navegação registrada]                          ║');
        } else {
            this.stack.forEach((state, idx) => {
                const isCurrent = idx === this.currentIndex;
                const prefix = isCurrent ? '→ ' : '  ';
                const type = String(state.type).padEnd(10);
                const name = (state.name || 'Unnamed').substring(0, 35).padEnd(35);
                const mark = isCurrent ? ' ◄ ATUAL' : '';
                console.log(`║ ${prefix}[${idx}] ${type} | ${name}${mark} ║`);
            });
        }
        
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
    },
    
    /**
     * ✅ VALIDAÇÃO: Verifica se o histórico está consistente
     */
    validate() {
        const issues = [];
        
        if (this.currentIndex < -1 || this.currentIndex >= this.stack.length) {
            issues.push(`❌ currentIndex inválido: ${this.currentIndex} (stack size: ${this.stack.length})`);
        }
        
        if (this.canGoBack() && this.currentIndex <= 0) {
            issues.push(`❌ Pode voltar mas está no início (index: ${this.currentIndex})`);
        }
        
        if (this.canGoForward() && this.currentIndex >= this.stack.length - 1) {
            issues.push(`❌ Pode avançar mas está no final (index: ${this.currentIndex})`);
        }
        
        if (issues.length === 0) {
            console.log('✅ [SidebarHistory] Validação confirmada!');
            return true;
        } else {
            console.error('❌ [SidebarHistory] Problemas detectados:');
            issues.forEach(issue => console.error(`   ${issue}`));
            return false;
        }
    },
    
    /**
     * Limpar histórico (útil para reset)
     */
    clear() {
        this.stack = [];
        this.currentIndex = -1;
        this.updateButtons();
    }
};


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
function renderCard(data, config = {}) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const img = document.createElement('img');
    img.src = data.src;
    img.alt = data.title;
    img.className = 'card-image';
    img.addEventListener('error', () => { img.src = 'covers/artists/default.jpg'; });
    
    const body = document.createElement('div');
    body.className = 'card-body card-overlay';
    
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
    
    // Adicionar botão kebab se tipo for fornecido
    if (config.type === 'playlist' || config.type === 'artist') {
        const kebabBtn = document.createElement('button');
        kebabBtn.className = 'card-kebab';
        kebabBtn.setAttribute('aria-label', 'Opções');
        kebabBtn.appendChild(createSvgIcon('more-vert-case'));

        // CORREÇÃO: Adicione o evento de clique corretamente
        kebabBtn.addEventListener('click', (event) => {
            // Previne que o clique no botão ative um evento no card pai (se houver)
            event.stopPropagation(); 
            
            if (config.type === 'playlist') {
                openPlaylistShareModal(config.shareData);
            } else if (config.type === 'artist') {
                openArtistShareModal(config.shareData);
            }
        });
        
        card.appendChild(kebabBtn);
    }
    
    return card;
}

/**
 * Renderiza item de playlist
 * @param {Object} video - {id, title, artist}
 * @param {Number} index - índice na lista
 * @returns {HTMLElement}
 */

/**
 * 🎨 HELPER: Cria um elemento SVG icon reutilizável
 * Padrão: <svg><use href="/icons/package.svg#icon-id"></use></svg>
 * 
 * @param {String} iconId - ID do ícone em package.svg (ex: 'menu-case', 'close-case')
 * @param {String} className - Classes CSS adicionais (ex: 'search-icon', 'shuffle-repeat')
 * @returns {SVGElement} SVG element com <use> reference
 */
function createSvgIcon(iconId, className = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `icon ${className}`.trim());
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/icons/package.svg#${iconId}`);
    
    svg.appendChild(use);
    return svg;
}

/**
 * Cria um SVG animado de equalizador (mini-indicador)
 * @returns {SVGElement} Elemento SVG com viewBox="0 0 24 24"
 */
function createEqualizerSVG() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('class', 'equalizer-icon');
    
    // Criar 4 barras do equalizador com cantos arredondados
    // Sem gradiente ou filtro - apenas cor vermelha sólida
    const barData = [
        { x: 3 },
        { x: 8 },
        { x: 13 },
        { x: 18 }
    ];
    
    barData.forEach((bar, idx) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `eq-bar eq-bar-${idx}`);
        g.setAttribute('data-bar-index', idx);
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bar.x);
        rect.setAttribute('y', '8');
        rect.setAttribute('width', '4');
        rect.setAttribute('height', '12');
        rect.setAttribute('rx', '2');
        rect.setAttribute('ry', '2');
        rect.setAttribute('fill', '#9d00ff');  // Cor roxa vibrante
        
        g.appendChild(rect);
        svg.appendChild(g);
    });
    
    return svg;
}

/**
 * Cria o container do indicador com o SVG
 * @returns {HTMLElement} Elemento div com classe playing-now-indicator
 */
function createPlayingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'playing-now-indicator';
    indicator.appendChild(createEqualizerSVG());
    return indicator;
}

function renderPlaylistItem(video, index) {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.setAttribute('data-video-index', index);
    // 🆕 CRÍTICO: Adicionar ID do vídeo para indicador funcionar MESMO quando view muda
    item.setAttribute('data-video-id', video.id);
    
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
    
    // Container para o indicador (preenchido por updateActivePlaylistItem)
    const indicatorContainer = document.createElement('div');
    indicatorContainer.className = 'indicator-container';
    
    const kebabBtn = document.createElement('button');
    kebabBtn.className = 'kebab-btn';
    kebabBtn.setAttribute('data-index', index);
    kebabBtn.setAttribute('title', 'Opções');
    kebabBtn.appendChild(createSvgIcon('more-vert-case'));
    
    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(indicatorContainer);
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
    closeBtn.appendChild(createSvgIcon('close-case'));
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
    
    // Mapear icon text para IDs de sprite
    const iconMap = {
        'share': 'share-case',
        'close': 'close-case',
        'more_vert': 'more-vert-case',
        'delete': 'delete-case',
        'edit': 'edit-case'
    };
    
    const iconId = iconMap[data.icon] || data.icon;
    icon.appendChild(createSvgIcon(iconId));
    
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

// ============================================================================
// PERSISTÊNCIA DE ESTADO (localStorage)
// ============================================================================

/**
 * Salva o estado atual do player em localStorage
 * Chamado sempre que uma playlist ou artista é carregado
 * 
 * NOVO: Salva também lastTrackId para recuperação robusta
 */
function saveCurrentState() {
    try {
        // Obter vídeo atual
        const currentVideo = player.currentPlaylist?.videos?.[player.currentVideoIndex];
        
        const state = {
            timestamp: Date.now(),
            
            // 🆕 Track ID (PRIMARY key para recovery robusto)
            lastTrackId: currentVideo?.id,
            
            // Legacy/Contexto (para retrocompatibilidade + UI recovery)
            playlistIndex: player.currentPlaylistIndex,
            playlistName: player.currentPlaylist?.name || player.currentPlaylist?.title,
            videoIndex: player.currentVideoIndex,
            
            // Contexto
            viewingFavorites: player.viewingFavorites,
            isArtist: player.currentPlaylistIndex === -1 && player.currentPlaylist?.name,
        };
        
        localStorage.setItem('sanplayer-state', JSON.stringify(state));
        
        if (USE_NEW_INIT_LOGIC) {
            console.log('[State] 💾 Saved (new format):', {
                lastTrackId: state.lastTrackId,
                playlistIndex: state.playlistIndex,
                videoIndex: state.videoIndex,
            });
        }
    } catch (error) {
        // Persist current state
    }
}

/**
 * Restaura o último estado salvo em localStorage
 * @returns {Promise<Boolean>} true se conseguiu restaurar, false se não havia estado salvo
 */
async function loadLastState() {
    try {
        const saved = localStorage.getItem('sanplayer-state');
        if (!saved) return false;
        
        const state = JSON.parse(saved);
        
        // Validar que o estado é válido (não muito antigo, etc)
        const age = Date.now() - state.timestamp;
        if (age > 30 * 24 * 60 * 60 * 1000) { // Mais de 30 dias = descartar
            localStorage.removeItem('sanplayer-state');
            return false;
        }
        
        // Se estava vendo favoritos, restaurar
        if (state.viewingFavorites) {
            player.viewingFavorites = true;
            displayFavoritesList();
            return true;
        }
        
        // Se era uma playlist de artista, restaurar
        if (state.isArtist && state.playlistName) {
            await selectArtist(state.playlistName);
            
            // Restaurar posição do vídeo se existir
            if (state.videoIndex >= 0 && state.videoIndex < player.currentPlaylist.videos.length) {
                player.currentVideoIndex = state.videoIndex;
                const video = player.currentPlaylist.videos[state.videoIndex];
                if (video) {
                    loadVideo(video);
                }
            }
            return true;
        }
        
        // Se tinha playlist normal, restaurar
        if (state.playlistIndex !== null && state.playlistIndex !== undefined && state.playlistIndex >= 0) {
            if (state.playlistIndex < player.playlistsIndex.length) {
                await selectPlaylistByIndex(state.playlistIndex);
                
                // Restaurar posição do vídeo se existir
                if (state.videoIndex >= 0 && state.videoIndex < player.currentPlaylist.videos.length) {
                    player.currentVideoIndex = state.videoIndex;
                    const video = player.currentPlaylist.videos[state.videoIndex];
                    if (video) {
                        loadVideo(video);
                    }
                }
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.warn('Erro ao restaurar estado de localStorage:', error);
        return false;
    }
}

/**
 * Carrega estado padrão (primeira playlist)
 * Fallback para quando não há histórico
 */
async function loadDefaultState() {
    if (player.playlistsIndex.length > 0) {
        await selectPlaylistByIndex(0);
    }
}

// ============================================================================
// NOVA LÓGICA DE INICIALIZAÇÃO (Feature-flagged)
// ============================================================================

/**
 * 🧭 DETERMINA QUAL TRACK DEVE SER CARREGADO - ARQUITETURA DE 3 CAMADAS
 * 
 * Layer 1: Estado Persistido (máxima prioridade)
 * Layer 2: Primeira Visita (UX controlada)
 * Layer 3: Fallback Técnico (erro/edge case)
 * 
 * ⚠️ NUNCA misture essas camadas. Cada uma tem responsabilidade clara.
 * 
 * 🔒 CONGELADO: Resolução de Track Inicial - LÓGICA CRÍTICA
 * 
 * ⚠️ ATENÇÃO DESENVOLVEDORES: Esta função é fundamental para impedir desastres de UX.
 * 
 * REGRAS OBRIGATÓRIAS (NÃO QUEBRE):
 * 
 * 1️⃣ DIFERENCIAÇÃO CRÍTICA: Params de CONTEÚDO vs Params de MODAL
 *    - CONTEÚDO (videoId, playlistId, artistId): Representam o que tocar
 *      → Devem PULAR carregamento normal (deixar handleHashNavigation processar)
 *      → Exemplo: ?videoId=xyz123, ?playlistId=brega, ?artistId=paulo
 *    
 *    - MODAL ONLY (?modal=playlists sem videoId/playlistId/artistId): Apenas UI
 *      → Devem CARREGAR música inicial NORMAL primeiro (localStorage/fallback)
 *      → Depois handleHashNavigation() abre o modal POR CIMA
 *      → Exemplo: ?modal=playlists (sem conteúdo)
 * 
 * 2️⃣ FLUXOS QUE DEVEM CONTINUAR FUNCIONANDO:
 *    
 *    ✅ Shortcut PWA para Playlists:
 *       URL: index.html?modal=playlists
 *       Esperado: Player carrega música salva + Modal de Playlists abre por cima
 *       Se quebrar: Player fica vazio, modal não abre
 *    
 *    ✅ Shortcut PWA para Artistas:
 *       URL: index.html?modal=artists
 *       Esperado: Player carrega música salva + Modal de Artistas abre por cima
 *       Se quebrar: Player fica vazio, modal não abre
 *    
 *    ✅ Shortcut PWA para Favoritos:
 *       URL: index.html?modal=favorites
 *       Esperado: Player carrega música salva + Lista de Favoritos abre por cima
 *       Se quebrar: Player fica vazio, lista não abre
 *    
 *    ✅ Link Compartilhado de Vídeo (outro usuário):
 *       URL: index.html?videoId=xyz123
 *       Esperado: Player pula localStorage, toca o vídeo compartilhado
 *       Se quebrar: Player carrega música anterior do localStorage, não a compartilhada
 *    
 *    ✅ Link Compartilhado de Playlist:
 *       URL: index.html?playlistId=brega
 *       Esperado: Player carrega a playlist "brega" com primeiro vídeo tocando
 *       Se quebrar: Player carrega playlista anterior, não a compartilhada
 * 
 * 3️⃣ O QUE QUEBRARIA TUDO:
 *    ❌ Tratar ?modal= igual a videoId/playlistId/artistId (retornar skipTrackPlayback)
 *       → Resultado: Player fica VAZIO no init
 *    
 *    ❌ Alterar a condição `if (hasModalParam && !hasContentParams)` 
 *       → Resultado: Shortcuts PWA carregam vazio
 *    
 *    ❌ Remover a diferenciação entre hasContentParams e hasModalParam
 *       → Resultado: Quebra tanto shared links quanto PWA shortcuts
 * 
 * 4️⃣ PADRÃO DE PAIRING (OBRIGATÓRIO):
 *    Esta função trabalha em DUPLA com handleHashNavigation():
 *    
 *    resolveInitialTrack() decide:
 *      → skipTrackPlayback=true → "Não toque nada, deixe handleHashNavigation() fazer tudo"
 *      → trackId=abc123 → "Toque este track diretamente"
 *      → trackId=null (fluxo normal) → "Carregue localStorage/fallback"
 *    
 *    handleHashNavigation() executa:
 *      → Se params têm videoId → busca e toca o vídeo
 *      → Se params têm playlistId → carrega e toca a playlist
 *      → Se params têm artistId → carrega e toca o artista
 *      → Se params têm modal → abre o modal SOBRE a música já carregada
 *    
 *    NUNCA SEPARAR ESSAS DUAS FUNÇÕES!
 * 
 * ⛔ LIMITE DE MODIFICAÇÃO:
 *    Você pode:
 *      ✅ Adicionar novo tipo de modal (?modal=novo) → certifique de tratar igual a outros
 *      ✅ Adicionar validações de formato de param
 *      ✅ Adicionar logging mais detalhado
 *    
 *    Você NÃO PODE:
 *      ❌ Mesclar a lógica de modal com conteúdo
 *      ❌ Alterar o significado de skipTrackPlayback
 *      ❌ Deixar player inicializar sem música quando há shortcut
 *      ❌ Ignorar localStorage quando não há params de conteúdo
 */
async function resolveInitialTrack() {
    const params = getRoutingParams();
    
    // 🔥 PRIORIDADE 1 (MÁXIMA): External URL Params (contenteful)
    // Se há parâmetros de CONTEÚDO (videoId, playlistId, artistId), IGNORAR localStorage
    const hasContentParams = params.has('videoId') || params.has('playlistId') || params.has('artistId');
    const hasModalParam = params.has('modal');
    
    if (hasContentParams) {
        console.log('[Init] 🔗 URL params de CONTEÚDO detectados - IGNORANDO localStorage');
        console.log('[Init] 🔗 Parâmetros encontrados:', {
            videoId: params.get('videoId'),
            playlistId: params.get('playlistId'),
            artistId: params.get('artistId'),
        });
        
        // Se tem videoId, resolver direto e tocar
        const videoId = params.get('videoId');
        if (videoId) {
            console.log(`[Init] 🎵 Resolvendo track direto da URL: ${videoId}`);
            return {
                trackId: videoId,
                source: 'url',
            };
        }
        
        // Se tem playlistId ou artistId, deixar handleHashNavigation processar
        // Retornar sinal especial para NÃO tentar tocar diretamente
        console.log('[Init] 📋 playlist/artista detectado - deixar handleHashNavigation processar');
        
        // 🔒 GUARDRAIL: artistId vem JÁ DECODIFICADO do params.get()
        // NUNCA tente decodificar novamente, vai quebrar
        if (params.get('artistId')) {
            console.log(`[Init] 👤 artistId detectado: "${params.get('artistId')}" (já decodificado)`);
        }
        
        return {
            trackId: null,
            source: 'url',
            skipTrackPlayback: true,  // 🔥 Sinal para pular playTrackById
        };
    }
    
    // 🔥 CASO ESPECIAL: Se tem APENAS ?modal= (sem conteúdo)
    // Isso é um shortcut PWA, não um link compartilhado
    // Deve carregar a música anterior NORMAL, depois handleHashNavigation abre o modal
    if (hasModalParam && !hasContentParams) {
        console.log('[Init] 🎯 Modal shortcut detectado (?modal=...) - carregar track normal, depois abrir modal');
        // NÃO retorna aqui, continua fluxo normal de resolução (localStorage/fallback)
    }
    
    // 🔥 LAYER 1: ESTADO PERSISTIDO (máxima prioridade)
    console.log('[Init] 🧭 Layer 1: Tentando restaurar estado persistido...');
    try {
        const saved = storage.load('sanplayer:state');
        if (!saved) throw new Error('No saved state');
        
        // Validar age (descartar se > 30 dias)
        const age = Date.now() - saved.timestamp;
        const MAX_STATE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 dias
        if (age > MAX_STATE_AGE) {
            console.log('[Init] ⏰ Saved state too old (>30 days), discarding');
            storage.remove('sanplayer:state');
            throw new Error('State expired');
        }
        
        // ✅ VALIDAÇÃO: Se tem currentVideoId E é válido, usar isso
        if (saved.currentVideoId && typeof saved.currentVideoId === 'string') {
            console.log(`[Init] ✅ Layer 1 SUCCESS: Resumindo de ${saved.currentVideoId}`);
            return {
                trackId: saved.currentVideoId,
                source: 'localStorage',
                context: saved,
            };
        }
        
        throw new Error('Saved state invalid or corrupted');
    } catch (error) {
        console.warn(`[Init] ⚠️ Layer 1 FAILED: ${error.message}`);
    }
    
    // 🔥 LAYER 2: PRIMEIRA VISITA (UX controlada)
    console.log('[Init] 🧭 Layer 2: Verificando se primeira visita...');
    const hasVisited = localStorage.getItem('_san_player_visited');
    if (!hasVisited) {
        console.log('[Init] 🎬 Layer 2: PRIMEIRA VISITA detectada → usando INITIAL_TRACK_FALLBACK (UX controlada)');
        localStorage.setItem('_san_player_visited', Date.now().toString());
        hasVisitedBefore = false;
        return {
            trackId: INITIAL_TRACK_FALLBACK.id,
            source: 'first-visit',
        };
    }
    
    hasVisitedBefore = true;
    console.log('[Init] 📍 Layer 2: Usuário já visitou antes');
    
    // 🔥 LAYER 3: FALLBACK TÉCNICO (último recurso)
    console.log(`[Init] 🧭 Layer 3: Fallback técnico final → ${INITIAL_TRACK_FALLBACK.id}`);
    return {
        trackId: INITIAL_TRACK_FALLBACK.id,
        source: 'technical-fallback',
    };
}

/**
 * Valida e carrega um track específico pelo ID
 * Busca em cache primeiro, depois em todas as playlists se necessário
 * 
 * NOVO: Logging melhorado para diagnosticar problemas
 * 
 * @param {string} trackId - ID único do vídeo
 * @returns {Promise<{video, playlist, playlistIndex, videoIndex}|null>}
 */
async function resolveTrack(trackId) {
    if (!trackId) {
        console.warn('[Init] ❌ resolveTrack: Empty trackId');
        return null;
    }
    
    console.log(`[Init] 🔍 resolveTrack: Buscando trackId="${trackId}"`);
    
    try {
        // Chamar findVideoById que já verifica cache + todas as playlists
        const result = await findVideoById(trackId);
        
        if (result) {
            console.log(`[Init] ✅ resolveTrack: ENCONTRADO - "${result.video.title}" by ${result.video.artist}`);
            console.log(`[Init] ℹ️ Localização: Playlist "${result.playlist.name}", índice ${result.videoIndex}`);
            return result;
        }
        
        console.error(`[Init] ❌ resolveTrack: Track NÃO ENCONTRADO em nenhuma playlist`);
        console.error(`[Init] ⚠️ Verifique: O ID "${trackId}" existe em um dos arquivos JSON de playlist?`);
        return null;
    } catch (error) {
        console.error(`[Init] ❌ resolveTrack: EXCEÇÃO ao procurar "${trackId}":`, error);
        return null;
    }
}

/**
 * Restaura o estado de uma playlist salva
 * Usado quando localStorage tem playlistIndex mas não tem trackId
 * 
 * @param {object} context - Estado salvo { playlistIndex, videoIndex, ...}
 * @returns {Promise<boolean>} true se conseguiu
 */
async function restorePlaylistState(context) {
    try {
        if (context.playlistIndex >= 0 && context.playlistIndex < player.playlistsIndex.length) {
            console.log(`[Init] 📋 Restoring playlist state: index=${context.playlistIndex}, video=${context.videoIndex}`);
            
            await selectPlaylistByIndex(context.playlistIndex);
            
            // Restaurar posição do vídeo se válida
            if (context.videoIndex >= 0 && context.videoIndex < player.currentPlaylist.videos.length) {
                player.currentVideoIndex = context.videoIndex;
                const video = player.currentPlaylist.videos[context.videoIndex];
                if (video) {
                    player.shouldPlayOnReady = true;
                    loadVideo(video);
                }
            }
            
            return true;
        }
    } catch (error) {
        console.error('[Init] Failed to restore playlist state:', error);
    }
    
    return false;
}

/**
 * Toca um track específico pelo ID
 * Responsável por: validar → carregar → configurar player → renderizar
 * 
 * @param {string} trackId - ID único do vídeo
 * @returns {Promise<boolean>} true se conseguiu tocar, false caso contrário
 */
async function playTrackById(trackId) {
    if (!trackId) {
        console.warn('[Init] ❌ playTrackById: Empty trackId provided');
        return false;
    }
    
    console.log(`[Init] 🎯 playTrackById: Tentando tocar trackId="${trackId}"`);
    
    try {
        // [PASSO 1] Validar e carregar track
        const trackData = await resolveTrack(trackId);
        
        if (!trackData) {
            console.error(`[Init] ❌ playTrackById: resolveTrack retornou null/undefined para "${trackId}"`);
            console.warn(`[Init] ⚠️ Dica: Verifique se o ID "${trackId}" existe em uma das suas playlists JSON`);
            return false;
        }
        
        // ⚠️ VALIDAÇÃO DEFENSIVA: adaptar ao formato real
        let video = trackData.video;
        let playlist = trackData.playlist;
        let playlistIndex = trackData.playlistIndex;
        let videoIndex = trackData.videoIndex;
        
        if (!video) {
            console.error('[Init] ❌ playTrackById: video é null/undefined');
            console.error('[Init] trackData:', trackData);
            return false;
        }

        // 🔥 GARANTIR PLAYLIST MESMO SE NÃO VIER (fallback playlist wrapper)
        if (!playlist) {
            console.warn('[Init] ⚠️ playTrackById: Playlist não encontrada, criando wrapper');

            playlist = {
                name: 'Single Track',
                videos: [video]
            };

            playlistIndex = -1;
            videoIndex = 0;
        }
        
        // [PASSO 2] VALIDAÇÃO FINAL: Garantir que video é válido
        // ⚠️ Edge case: playlist data corrupted, video object invalid
        if (!isValidTrack(video)) {
            console.error('[Init] ❌ Video inválido após resolveTrack:', video);
            const safeVideo = getSafeTrack(video);
            console.log('[Init] 🛡️ Usando fallback safe track:', safeVideo.id);
            // Recursivamente tentar com o fallback
            return await playTrackById(safeVideo.id);
        }
        
        // [PASSO 3] Configurar estado do player
        player.currentPlaylist = playlist;
        player.currentPlaylistIndex = playlistIndex;
        player.currentVideoIndex = videoIndex;
        player.viewingFavorites = false;
        player.currentFavoriteId = undefined;
        player.shouldPlayOnReady = false;  // 🔥 INICIALIZACIÓN: não tocar automaticamente
        player.isPlaying = false;          // 🔥 INICIALIZACIÓN: reset estado de play
        player.playOrder = [...Array(playlist.videos.length).keys()];
        player.originalOrder = [...player.playOrder];
        
        console.log('[Init] 📝 playTrackById: Player state configured', {
            currentVideoIndex: player.currentVideoIndex,
            playlistName: playlist.name,
            videosCount: playlist.videos.length
        });
        
        // [PASSO 4] Renderizar UI
        updateCurrentVideoDisplay();
        loadPlaylistVideos();
        
        console.log('[Init] 🎨 playTrackById: UI rendered');
        
        // [PASSO 5] Carregar vídeo no player YouTube
        loadVideo(video);
        console.log('[Init] ▶️ playTrackById: Video loaded to YouTube player');
        
        // Persist current state
        saveCurrentState();
        
        console.log(`[Init] ✅ playTrackById SUCCESS: "${video.title}" by ${video.artist}`);
        return true;
    } catch (error) {
        console.error(`[Init] ❌ playTrackById EXCEPTION for "${trackId}":`, error);
        console.error('[Init] Stack:', error.stack);
        return false;
    }
}

/**
 * Camada de resiliência: tenta múltiplas resoluções de forma agressiva
 * Se uma falha, tenta a próxima em sequência
 * 
 * NOVO: Garante que SEMPRE toca algo - não deixa player vazio
 */
async function initializePlayerWithResilience() {
    console.log('[Init] 🚀 Starting resilient player initialization...');
    
    // [PASSO 1] Resolver qual track deve soar
    const resolution = await resolveInitialTrack();
    console.log('[Init] 📍 PASSO 1 - Resolution:', { 
        source: resolution.source, 
        trackId: resolution.trackId,
        skipTrackPlayback: resolution.skipTrackPlayback,
        hasSavedContext: !!resolution.context
    });
    
    let played = false;
    
    // 🔥 CASO ESPECIAL: Se URL tem playlistId/artistId/modal
    // NÃO tocar nada aqui, deixar handleHashNavigation() fazer tudo
    // Sincronizar estado favorito atual
    if (resolution.skipTrackPlayback) {
        console.log('[Init] 📍 PASSO 2: PULANDO - SEM o trackId direto (deixar handleHashNavigation() processar)');
        console.log('[Init] ℹ️ handleHashNavigation() será chamado em sequência para processar playlist/artista/modal');
        console.log('[Init] ✅ initializePlayerWithResilience() OK - handleHashNavigation() tomará conta');
        // Sincronizar estado favorito atual
    }
    // [PASSO 2] Se tem trackId E não é skipTrackPlayback, tentar tocar diretamente
    if (resolution.trackId) {
        console.log(`[Init] 📍 PASSO 2: Tentando tocar trackId = "${resolution.trackId}"`);
        played = await playTrackById(resolution.trackId);
        
        if (played) {
            console.log(`[Init] ✅ PASSO 2: SUCCESS - Track playing`);
            // Sincronizar estado favorito atual
        } else {
            console.warn(`[Init] ⚠️ PASSO 2: FALHOU - playTrackById retornou false`);
        }
    }
    
    // [PASSO 3] Se falhou e tem contexto de playlist, restaurar assim
    if (!played && resolution.context?.playlistIndex >= 0) {
        console.log(`[Init] 📍 PASSO 3: Restaurando playlist salva (index=${resolution.context.playlistIndex})`);
        played = await restorePlaylistState(resolution.context);
        
        if (played) {
            console.log(`[Init] ✅ PASSO 3: SUCCESS - Playlist restored`);
            // Sincronizar estado favorito atual
        } else {
            console.warn(`[Init] ⚠️ PASSO 3: FALHOU - restorePlaylistState retornou false`);
        }
    }
    
    // [PASSO 4] Se O FALLBACK é diferente do que tentou antes, tentar novamente
    // (Protege contra bugs de fallback ID inválido sendo tentado em PASSO 2)
    if (!played && resolution.source !== 'fallback') {
        console.warn(`[Init] 📍 PASSO 4: Fallback direto (source era ${resolution.source}, tentando ${INITIAL_TRACK_FALLBACK.id})`);
        played = await playTrackById(INITIAL_TRACK_FALLBACK.id);
        
        if (played) {
            console.log(`[Init] ✅ PASSO 4: SUCCESS - Fallback playing`);
            return; // 🔥 CRÍTICO
        } else {
            console.warn(`[Init] ⚠️ PASSO 4: FALHOU - Fallback ID também não encontrado!`);
        }
    }
    
    // [PASSO 5] ÚLTIMA LINHA DE DEFESA: Carregar primeira playlist
    // Se chegou aqui, significa que:
    // - Fallback ID não existe nas playlists
    // - Ou há erro crítico no sistema
    // ⚠️ PROTEÇÃO: Se há localStorage com estado, NÃO execute este fallback agressivo
    if (storage.load('sanplayer:state')) {
        console.log('[Init] ⚠️ PASSO 5: Estado salvo detectado - bloqueando fallback agressivo (deixar restorePlayerState() processar)');
        return;
    }
    
    if (player.playlistsIndex.length > 0) {
        console.error('[Init] 🆘 PASSO 5: CRITICAL - Nenhum track conseguiu tocar. Carregando primeira playlist como último recurso.');
        console.error('[Init] ⚠️ ISSUE: Invalid INITIAL_TRACK_FALLBACK ID? ID="${INITIAL_TRACK_FALLBACK.id}" não encontrado em nenhuma playlist!');
        
        await selectPlaylistByIndex(0);
        played = !!player.currentPlaylist;
    }
    
    // Validação final
    if (!played || !player.currentPlaylist) {
        // Sincronizar estado favorito atual
        console.error('[Init] ❌ Isso indica falha completa do sistema de inicialização');
    } else {
        console.log('[Init] ✅ Player initialization complete');
    }
}

/**
 * Carrega estado padrão (primeira playlist)
 * Fallback para quando não há histórico - LÓGICA LEGADA
 */
async function loadDefaultState_Legacy() {
    if (player.playlistsIndex.length > 0) {
        await selectPlaylistByIndex(0);
    }
}

/**
 * Wrapper para loadDefaultState() que usa a lógica apropriada
 * Se USE_NEW_INIT_LOGIC está habilitado, não é chamado (usa initializePlayerWithResilience)
 * Mantido para compatibilidade com código mais antigo
 */
async function loadDefaultState() {
    if (USE_NEW_INIT_LOGIC) {
        // Não deve chegar aqui na nova lógica
        console.warn('[Init] loadDefaultState() called but USE_NEW_INIT_LOGIC is true');
        await initializePlayerWithResilience();
    } else {
        // Usar lógica legada
        await loadDefaultState_Legacy();
    }
}

/**
 * 🎬 Fecha um modal com animação padrão de bottom-sheet
 * 
 * Função helper para gerenciar fechamento com animação suave
 * Aplicável a qualquer modal bottom-sheet futuro
 * 
 * @param {string} modalId - ID do modal a fechar (ex: 'playlistModal')
 * @param {function} callback - Função a executar após fechar (ex: restaurar conteúdo)
 * @param {boolean} skipAnimation - Se true, fecha sem animação
 */
function closeModalWithAnimation(modalId, callback, skipAnimation = false) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    if (skipAnimation) {
        // Fechar instantaneamente sem animação
        modal.classList.remove('show');
        if (callback) callback();
        return;
    }
    
    // Adicionar classes de fechamento para ativar animação
    modal.classList.add('closing');
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.classList.add('closing');
    }
    
    // Esperar a animação terminar (duração em CSS: 0.5s)
    // + pequeno buffer para garantir
    setTimeout(() => {
        modal.classList.remove('show', 'closing');
        if (modalContent) {
            modalContent.classList.remove('closing');
        }
        // Executar callback (ex: restaurar conteúdo, limpar state)
        if (callback) {
            callback();
        }
    }, 550); // 500ms (animação) + 50ms (buffer)
}

async function initApp() {
    // 🔒 Proteger contra múltiplas inicializações
    if (playerInitialized) {
        console.warn('[Init] ⚠️ Player já foi inicializado. Ignorando segunda execução.');
        return;
    }

    // 🎯 BANNER: Fluxo de inicialização
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ 🎵 SAN PLAYER - FLUXO DE INICIALIZAÇÃO                        ║');
    console.log('║                                                                ║');
    console.log('║ 1️⃣  Primeira vez → INITIAL_TRACK_FALLBACK (Helios Deep)       ║');
    console.log('║ 2️⃣  Próximas → localStorage (resumir do ponto anterior)       ║');
    console.log('║                                                                ║');
    console.log('║ 📚 Leia: INITIALIZATION_FLOW.md                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    initPlayerUI(); // Inicializa UI primeiro

    // Sincronizar estado favorito atual
    // Assim quando updateFavoriteButton() for chamada, player.favorites já está populado
    loadFavorites();
    
    await loadPlaylists();
    
    // ============================================================================
    // NOVA LÓGICA DE INICIALIZAÇÃO (Feature-flagged)
    // ============================================================================
    if (USE_NEW_INIT_LOGIC) {
        console.log('[Init] 🆕 Using NEW initialization logic (v2)');
        console.log('[Init] Feature flag: USE_NEW_INIT_LOGIC =', USE_NEW_INIT_LOGIC);
        
        // 🔥 NOVO FLUXO CORRETO: Restaurar PRIMEIRO, init SÓ se restauração falhar
        console.log('[Init] 🔄 [PASSO 1] Tentando restaurar estado do localStorage...');
        const restored = await restorePlayerState();
        
        if (restored) {
            console.log('[Init] ✅ [PASSO 1] Estado restaurado com sucesso - pulando inicialização normal');
        } else {
            console.log('[Init] 📝 [PASSO 1] Nenhum estado prévio - continuando fluxo normal');
            console.log('[Init] 🎯 [PASSO 2] Executando inicialização com resiliência...');
            // Usar nova lógica com resiliência APENAS se não houver estado
            await initializePlayerWithResilience();
        }
        
        // Sincronizar estado favorito atual
        // Garante que o novo track está visível na UI
        refreshPlayerUI();
        
        // �🔒 MARCA COMO INICIALIZADO (bloqueia overlays)
        playerInitialized = true;
        console.log('[Init] 🔒 Player initialized. Lock acquired.');
        
        if (restored) {
            console.log('[Init] 📝 [RESUMO] 2ª+ execução → localStorage restaurado');
        } else {
            console.log('[Init] 📝 [RESUMO] 1ª execução → INITIAL_TRACK_FALLBACK ativado');
        }
    } else {
        // 🔒 LEGADO DESABILITADO: Manter apenas para referência histórica
        // Se você precisar voltar ao sistema antigo, mude USE_NEW_INIT_LOGIC para false
        // MAS: Sistema antigo pode ter conflitos com o novo. Use com cuidado.
        console.log('[Init] 🔴 Using LEGACY initialization logic (v1) - NÃO RECOMENDADO');
        
        // ❌ CÓDIGO ANTIGO - NÃO USE EM PRODUÇÃO
        if (false) {  // Force desabilitar permanentemente
            const restored = await loadLastState();
            if (!restored) {
                await loadDefaultState_Legacy();
            }
        }
        playerInitialized = true;
    }
    
    // ============================================================================
    // RESTO DA INICIALIZACIÓN (Comum a ambas as lógicas)
    // ============================================================================
    
    // ✨ Roteamento: processa qualquer parâmetro (?modal=, ?artist=, etc)
    // CRÍTICO para links compartilhados: handleHashNavigation() DEVE ser chamada
    // quando hay playlistId, artistId ou modal, INDEPENDENTE da nova lógica
    const params = getRoutingParams();
    const hasPlaylistParam = params.has('playlistId');
    const hasArtistParam = params.has('artistId');
    const hasModalParam = params.has('modal');
    
    // Sincronizar estado favorito atual
    // ORDEM OBRIGATÓRIA:
    // 1️⃣ setupEventListeners() PRIMEIRO - registra todos os listeners
    // 2️⃣ handleHashNavigation() DEPOIS - processa params e clica nos botões
    // 
    // ⚠️ SE INVERTER A ORDEM:
    // - btn.click() será chamado ANTES dos listeners existirem
    // - Nada acontece, modais não abrem
    // - Player aparenta estar travado
    // - O problema é SILENCIOSO (nenhum erro no console)
    // 
    // 🔒 JAMAIS SEPARAR ESSAS DUAS LINHAS OU INVERTER A ORDEM
    setupEventListeners();
    
    // 🔔 Inicializar sistema de notificações (atualização SW)
    updateNotificationIconState();  // Restaurar estado ao carregar
    setupNotificationButtonListener();  // Setup listener do botão
    
    if (hasPlaylistParam || hasArtistParam || hasModalParam) {
        console.log('[Init] 🔗 Parâmetros de navegação detectados, chamando handleHashNavigation()');
        console.log('[Init] Params:', { playlistId: params.get('playlistId'), artistId: params.get('artistId'), modal: params.get('modal') });
        await handleHashNavigation();
    }
    
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

    // Sincronizar estado favorito atual
    // Importante para PWA: manter posição exata quando usuário volta
    window.addEventListener('pagehide', () => {
        saveCurrentState();
    });
    
    // Fallback para navegadores que não suportam pagehide
    window.addEventListener('beforeunload', () => {
        saveCurrentState();
    });

    // Registrar Service Worker
    initServiceWorker();
    
    // Inicializar listeners de PWA install
    initPWAInstall();
    
    // ✨ EXCELÊNCIA PWA: Sincronizar tema de Android
    initThemeColor();

    safeRender();
    
    // ✅ MARCA INICIALIZAÇÃO COMO COMPLETA (agora histórico pode funcionar)
    appInitComplete = true;
    
    // 🧭 REGISTRAR ESTADO INICIAL NO HISTÓRICO
    // Após app estar completa, registra a primeira playlist como ponto de partida
    if (player.currentPlaylist) {
        sidebarHistory.push({
            type: 'playlist',
            data: player.currentPlaylist,
            name: player.currentPlaylist?.name
        });
        console.log('[Init] 🧭 Estado inicial registrado no histórico:', player.currentPlaylist.name);
    }
    
    console.log('[Init] ✅ App initialization complete. Sidebar history tracking ENABLED.');
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ ✨ SAN PLAYER PRONTO                                          ║');
    console.log('║                                                                ║');
    console.log('║ 📚 Documentação: INITIALIZATION_FLOW.md                        ║');
    console.log('║ 🐛 Debug: Verifique console para logs [Init]                  ║');
    console.log('║ 🧭 Histórico: Digite "navHistory()" no console               ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // 🔍 DEBUG GLOBAL: Função para inspecionar histórico a qualquer momento
    window.navHistory = function() {
        console.log('[DEBUG] navHistory() chamado');
        sidebarHistory.printHistory();
        sidebarHistory.validate();
    };
    
    // Alias para print apenas
    window.navStack = function() {
        console.log('[DEBUG] navStack() chamado');
        sidebarHistory.printHistory();
    };
    
    console.log('[Init] 🧭 Funções de debug globais configuradas:');
    console.log('[Init]    - window.navHistory() : Mostra histórico completo + validação');
    console.log('[Init]    - window.navStack() : Mostra apenas o histórico');
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
    if (!vv) return;  // Fallback: browser sem visualViewport

    // Calcula o offset do teclado
    const offset = window.innerHeight - (vv.height + vv.offsetTop);
    
    // Valida se o offset é razoável (não pode ser maior que 50% da tela)
    // Para evitar valores absurdos na inicialização
    const maxReasonableOffset = window.innerHeight * 0.5;
    const validOffset = Math.max(0, Math.min(offset, maxReasonableOffset));
    
    // ✨ Otimização: só atualiza CSS se o offset realmente mudou
    // Evita reflows desnecessários que causam jank
    if (validOffset !== lastKeyboardOffset) {
        lastKeyboardOffset = validOffset;
        document.documentElement.style.setProperty(
            '--keyboard-offset',
            `${validOffset}px`
        );
    }
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
    
    if (!modal || !understandBtn) return;
    
    // Exibir modal
    modal.classList.add('show');
    
    // Handler para botão "Entendi" - usar 'once: true' para evitar múltiplos listeners
    understandBtn.addEventListener('click', closeZoomAlert, { once: true });
}

function closeZoomAlert() {
    const modal = document.getElementById('zoomAlertModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    // Sincronizar estado favorito atual
    // Caso contrário, modais subsequentes ficam deslocados para baixo
    document.documentElement.style.setProperty('--keyboard-offset', '0px');
    if (typeof lastKeyboardOffset !== 'undefined') {
        lastKeyboardOffset = 0;
    }
}

// ============================================================================
// PWA - SERVICE WORKER REGISTRATION
// ============================================================================

function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').then((registration) => {
            console.log('[App] ✅ Service Worker registrado:', registration.scope);
            
            // Escuta por novas atualizações sendo instaladas
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[App] 🔍 updatefound: novo worker detectado');
                
                newWorker.addEventListener('statechange', () => {
                    console.log('[App] Worker state changed:', newWorker.state);
                    
                    // Quando o novo worker termina de instalar e fica 'waiting'
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[App] 📢 Novo worker está waiting, mostrando banner');
                        showUpdateBanner(newWorker);
                    }
                });
            });

            // Verificar atualizações a cada 1 minuto
            setInterval(() => {
                console.log('[App] 🔄 Verificando atualizações do Service Worker...');
                registration.update();
            }, 60 * 1000);
        }).catch((error) => {
            console.warn('[App] Erro ao registrar Service Worker:', error);
        });
    }
}

// ============================================================================
// SERVICE WORKER UPDATE - HANDLERS DOS BOTÕES
// ============================================================================
// ============================================================================

// ============================================================================
// SERVICE WORKER UPDATE - HANDLERS DOS BOTÕES
// ============================================================================

/**
 * Handler para botão "ATUALIZAR AGORA"
 * Executa o skipWaiting e recarrega a página
 * 
 * 🧠 Lógica robusta:
 * - Se registration.waiting existe: enviar SKIP_WAITING
 * - Se não existe: o worker já foi promovido, fazer reload simples
 * - Resultado: funciona sempre
 */
async function handleUpdateNow(event) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('[Update] ⏱️ handleUpdateNow disparado');
    
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        
        console.log('[Update] Registration:', {
            scope: registration?.scope,
            waiting: registration?.waiting?.state,
            active: registration?.active?.state,
            installing: registration?.installing?.state
        });
        
        if (registration?.waiting) {
            console.log('[Update] ✅ Waiting worker encontrado, enviando SKIP_WAITING');
            
            // Limpar localStorage ANTES de atualizar
            localStorage.removeItem('hasUpdatePending');
            updateNotificationIconState();
            
            // Enviar mensagem ao worker para pular a fase de "waiting"
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            
            console.log('[Update] 👂 Aguardando controllerchange...');
            
            // Aguardar o novo controller assumir controle
            let refreshing = false;
            const controllerChangeHandler = () => {
                console.log('[Update] 🔄 controllerchange disparado!');
                if (!refreshing) {
                    console.log('[Update] 🔄 Recarregando página...');
                    window.location.reload();
                    refreshing = true;
                }
            };
            
            navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);
            
            // Timeout de segurança: se o controllerchange não disparar em 3s, reload mesmo assim
            setTimeout(() => {
                console.log('[Update] ⏰ Timeout atingido, refreshing:', refreshing);
                if (!refreshing) {
                    console.log('[Update] 🔄 Recarregando página (timeout)...');
                    window.location.reload();
                    refreshing = true;
                }
                navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
            }, 3000);
            
        } else {
            // Caso B: waiting foi promovido para active (browser atualizou sozinho)
            // Solução: reload simples carrega a versão nova
            console.warn('[Update] ⚠️ Nenhum waiting encontrado (browser pode ter atualizado)');
            console.log('[Update] 🔄 Forçando reload para carregar versão atualizada...');
            
            localStorage.removeItem('hasUpdatePending');
            updateNotificationIconState();
            
            // Reload simples = carrega nova versão
            window.location.reload();
        }
        
    } catch (error) {
        console.error('[Update] ❌ Erro ao atualizar:', error);
        alert('Erro ao atualizar. Tentando novamente...');
    }
}

/**
 * Handler para botão "DEPOIS"
 * Salva o estado e fecha o banner
 */
function handleUpdateLater(event) {
    event.preventDefault();
    event.stopPropagation();
    
    localStorage.setItem('hasUpdatePending', 'true');
    
    const banner = document.getElementById('update-banner');
    banner.classList.remove('show');
    
    updateNotificationIconState();
}

// Função para exibir o banner e configurar os botões
function showUpdateBanner(worker) {
    console.log('[Update] 📢 Mostrando banner de atualização');
    
    const banner = document.getElementById('update-banner');
    const btnNow = document.getElementById('btn-update-now');
    const btnLater = document.getElementById('btn-update-later');
    
    if (!banner || !btnNow || !btnLater) {
        console.error('[Update] ❌ Elementos do banner não encontrados');
        return;
    }

    // 🔒 Guardar referência do worker (pode ser perdida depois)
    pendingWorker = worker;

    // 🔄 Remover listeners anteriores
    btnNow.removeEventListener('click', handleUpdateNow);
    btnLater.removeEventListener('click', handleUpdateLater);

    // ✅ Adicionar listeners frescos
    btnNow.addEventListener('click', handleUpdateNow);
    btnLater.addEventListener('click', handleUpdateLater);

    // Mostrar banner
    banner.classList.add('show');
    console.log('[Update] ✅ Banner aberto');
}

// ============================================================================
// SERVICE WORKER - GERENCIAMENTO DE ESTADO DE NOTIFICAÇÃO
// ============================================================================

/**
 * Atualiza o estado visual do ícone de notificações no header
 * Verifica localStorage para saber se há atualização pendente
 */
function updateNotificationIconState() {
    const notificationBtn = document.getElementById('btn-notifications');
    const hasUpdatePending = localStorage.getItem('hasUpdatePending') === 'true';

    if (hasUpdatePending) {
        notificationBtn.classList.add('unread');
    } else {
        notificationBtn.classList.remove('unread');
    }
}

/**
 * Listener para botão de notificações
 * Se há atualização pendente, reabre o banner
 */
function setupNotificationButtonListener() {
    const notificationBtn = document.getElementById('btn-notifications');
    
    notificationBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const hasUpdatePending = localStorage.getItem('hasUpdatePending') === 'true';
        console.log('[Update] 🔔 Ícone clicado, hasUpdatePending:', hasUpdatePending);
        
        if (hasUpdatePending) {
            console.log('[Update] 📋 Reabrindo banner de atualização');
            
            // Reabrir banner
            const banner = document.getElementById('update-banner');
            banner.classList.add('show');
            
            // Registrar listeners novamente
            const btnNow = document.getElementById('btn-update-now');
            const btnLater = document.getElementById('btn-update-later');
            
            console.log('[Update] 🔄 Re-registrando listeners dos botões');
            
            btnNow.removeEventListener('click', handleUpdateNow);
            btnLater.removeEventListener('click', handleUpdateLater);
            
            btnNow.addEventListener('click', handleUpdateNow);
            btnLater.addEventListener('click', handleUpdateLater);
        }
    });
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
        }, 5000); // 5 segundos
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
        cancelBtn.addEventListener('click', closePWAInstallPrompt);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', triggerPWAInstall);
    }

    // ============================================================================
    // MODAIS: ABOUT, AUTHOR, PRIVACY, TERMS
    // ============================================================================

    // Modal Sobre
    const linkSobre = document.getElementById('link-sobre');
    if (linkSobre) {
        linkSobre.addEventListener('click', (e) => {
            e.preventDefault();
            openAboutModal();
        });
    }

    const closeAboutModal = document.getElementById('closeAboutModal');
    if (closeAboutModal) {
        closeAboutModal.addEventListener('click', () => {
            closeModalWithAnimation('aboutModal');
        });
    }

    const aboutModalElement = document.getElementById('aboutModal');
    if (aboutModalElement) {
        aboutModalElement.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                closeModalWithAnimation('aboutModal');
            }
        });
    }

    // Links do modal About
    const privacyLink = document.getElementById('privacyLink');
    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModalWithAnimation('aboutModal');
            setTimeout(() => openPrivacyModal(), 200);
        });
    }

    const termsLink = document.getElementById('termsLink');
    if (termsLink) {
        termsLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModalWithAnimation('aboutModal');
            setTimeout(() => openTermsModal(), 200);
        });
    }

    const creditsLink = document.getElementById('creditsLink');
    if (creditsLink) {
        creditsLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModalWithAnimation('aboutModal');
            setTimeout(() => openAuthorModal(), 200);
        });
    }

    // Modal Autor (com navegação de volta para About)
    const closeAuthorModal = document.getElementById('closeAuthorModal');
    if (closeAuthorModal) {
        closeAuthorModal.addEventListener('click', () => {
            goBackToAboutModal('authorModal');
        });
    }

    const authorModalElement = document.getElementById('authorModal');
    if (authorModalElement) {
        authorModalElement.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                goBackToAboutModal('authorModal');
            }
        });
    }

    // Modal Política de Privacidade (com navegação de volta para About)
    const closePrivacyModal = document.getElementById('closePrivacyModal');
    if (closePrivacyModal) {
        closePrivacyModal.addEventListener('click', () => {
            goBackToAboutModal('privacyModal');
        });
    }

    const privacyModalElement = document.getElementById('privacyModal');
    if (privacyModalElement) {
        privacyModalElement.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                goBackToAboutModal('privacyModal');
            }
        });
    }

    // Modal Termos de Serviços (com navegação de volta para About)
    const closeTermsModal = document.getElementById('closeTermsModal');
    if (closeTermsModal) {
        closeTermsModal.addEventListener('click', () => {
            goBackToAboutModal('termsModal');
        });
    }

    const termsModalElement = document.getElementById('termsModal');
    if (termsModalElement) {
        termsModalElement.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                goBackToAboutModal('termsModal');
            }
        });
    }
}

function openAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function openAuthorModal() {
    const modal = document.getElementById('authorModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function openPrivacyModal() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function openTermsModal() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.classList.add('show');
    }
}

// ============================================================================
// Navegação entre Modals do About
// ============================================================================
// Quando o usuário está em Privacy/Terms/Author e clica em Voltar,
// deve voltar para o modal About em vez de fechar tudo
function goBackToAboutModal(currentModalId) {
    const currentModal = document.getElementById(currentModalId);
    if (currentModal) {
        currentModal.classList.remove('show');
    }
    
    // Aguardar animação de fechamento antes de abrir o About
    setTimeout(() => {
        openAboutModal();
    }, 300);
}

// ============================================================================
// Navegação entre Modals do About
// ============================================================================
// Quando o usuário está em Privacy/Terms/Author e clica em Voltar,
// deve voltar para o modal About em vez de fechar tudo
function goBackToAboutModal(currentModalId) {
    const currentModal = document.getElementById(currentModalId);
    if (currentModal) {
        currentModal.classList.remove('show');
    }
    
    // Aguardar animação de fechamento antes de abrir o About
    setTimeout(() => {
        openAboutModal();
    }, 300);
}

function showPWAInstallPrompt() {
    if (!pwaInstallPrompt) return;
    
    const modal = document.getElementById('pwaInstallPromptModal');
    if (modal) {
        modal.classList.add('show');
        console.log('[App] Modal de instalação PWA exibido');
    }
}

function closePWAInstallPrompt() {
    const modal = document.getElementById('pwaInstallPromptModal');
    if (modal) {
        modal.classList.remove('show');
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
    
    // 🎯 CLICÁVEL: Tornar nome do artista navegável
    // quando clica no artista, abre a view do artista
    artistEl.style.cursor = 'pointer';
    artistEl.addEventListener('click', (e) => {
        const artistName = e.target.textContent?.trim();
        if (artistName) {
            selectArtist(artistName);
        }
    });
    
    currentDetails.appendChild(titleEl);
    currentDetails.appendChild(artistEl);
    
    const currentActions = document.createElement('div');
    currentActions.className = 'current-actions';
    
    const favButton = document.createElement('button');
    favButton.id = 'favButton';
    favButton.className = 'favorite-btn';
    favButton.setAttribute('aria-label', 'Adicionar aos favoritos');
    favButton.setAttribute('aria-pressed', 'false');
    favButton.type = 'button';
    favButton.appendChild(createSvgIcon('favorite-outlined-case'));
    const favIcon = favButton.querySelector('svg use');
    
    const shareButton = document.createElement('button');
    shareButton.id = 'shareButton';
    shareButton.className = 'share-btn';
    shareButton.setAttribute('aria-label', 'Compartilhar');
    shareButton.appendChild(createSvgIcon('share-case'));
    
    currentActions.appendChild(favButton);
    currentActions.appendChild(shareButton);
    
    blockInfo.appendChild(img);
    blockInfo.appendChild(currentDetails);
    blockInfo.appendChild(currentActions);
    
    document.getElementById('favButton').addEventListener('click', toggleFavorite);
    document.getElementById('shareButton').addEventListener('click', shareMusic);
}

// 🔍 Extrai parâmetros de rota de AMBOS query string e hash
// Suporta:  ?param=value e #param=value
function getRoutingParams() {
    // Tenta query string primeiro (?modal=playlists) - mais confiável em PWA
    let params = new URLSearchParams(window.location.search);
    if (params.has('modal') || params.has('videoId') || params.has('playlistId') || params.has('artistId')) {
        return params;
    }
    
    // Fallback para hash (#modal=playlists) - retrocompatibilidade
    params = new URLSearchParams(window.location.hash.replace('#', ''));
    return params;
}

/**
 * 🔒 CONGELADO: Roteamento de Navegação - PAIRING CRÍTICO COM resolveInitialTrack()
 * 
 * ⚠️ ATENÇÃO DESENVOLVEDORES: Esta função é a SEGUNDA METADE de um sistema de duas partes.
 * 
 * RELAÇÃO OBRIGATÓRIA COM resolveInitialTrack():
 * 
 * resolveInitialTrack() DECIDE o que fazer:
 * ├─ skipTrackPlayback=true → "NÃO toque nada, deixe handleHashNavigation() fazer tudo"
 * ├─ trackId=videoId → "Toque este vídeo direto"
 * └─ trackId=null (normal) → "Carregue localStorage/fallback, depois handleHashNavigation() processa modais"
 * 
 * handleHashNavigation() EXECUTA a decisão:
 * ├─ ?videoId=xyz → busca e toca o vídeo
 * ├─ ?playlistId=brega → carrega e toca a playlist
 * ├─ ?artistId=paulo → carrega e toca o artista
 * └─ ?modal=playlists → abre modal POR CIMA da musica já carregada
 * 
 * PAIRING CRÍTICO - O QUE NÃO QUEBRAR:
 * 
 * 1️⃣ ORDEM DE EXECUÇÃO OBRIGATÓRIA:
 *    1. resolveInitialTrack() → decide o que fazer
 *    2. initializePlayerWithResilience() → carrega musik ou pula
 *    3. handleHashNavigation() → processa rutas e abre modais
 *    
 *    Se trocar a ordem → Modais abrem antes do player estar pronto, player fica vazio, etc.
 * 
 * 2️⃣ BUTTON LISTENERS DEVEM EXISTIR:
 *    Quando handleHashNavigation() chama btn.click(), os event listeners
 *    devem JÁ estar registrados via setupEventListeners()
 *    
 *    Se removerem setupEventListeners() ANTES de handleHashNavigation()
 *    → btn.click() não dispara nada, modal fica fechado
 * 
 * 3️⃣ MODAIS DEVEM ESTAR NO DOM:
 *    document.getElementById('link-playlists')
 *    document.getElementById('link-artistas')
 *    document.getElementById('link-favoritos')
 *    
 *    Se mudarem os IDs:
 *    → getElementById retorna null
 *    → btn.click() não funciona
 *    → Modais não abrem
 * 
 * 4️⃣ FLUXO CORRETO ESPERADO:
 *    
 *    Cenário A - Shortcut PWA (?modal=playlists):
 *    ├─ resolveInitialTrack() → trackId=null, continue normal
 *    ├─ playTrackById(fallback) → carrega música padrão
 *    ├─ handleHashNavigation() → deteccta modal=playlists
 *    ├─ btn.click() → abre modal SOBRE a música
 *    └─ Resultado: ✅ Música toca + Modal aberto
 *    
 *    Cenário B - Link compartilhado (?videoId=xyz123):
 *    ├─ resolveInitialTrack() → trackId=xyz123
 *    ├─ playTrackById(xyz123) → carrega vídeo compartilhado
 *    ├─ handleHashNavigation() → deteccta videoId, busca e toca
 *    └─ Resultado: ✅ Vídeo compartilhado toca imediatamente
 * 
 * ⛔ REGRA DE OURO:
 *    NUNCA separar esta função de resolveInitialTrack()
 *    Se alguém disser "vou remover handleHashNavigation()",
 *    os shortcuts PWA quebram IMEDIATAMENTE
 * 
 * ✅ Você pode:
 *    ✅ Adicionar novo tipo de modal (?modal=novo)
 *    ✅ Adicionar mais validações
 *    ✅ Melhorar o logging
 * 
 * ❌ Você NÃO PODE:
 *    ❌ Mudar IDs dos botões sem atualizar aqui
 *    ❌ Remover a chamada a setupEventListeners() ANTES desta função
 *    ❌ Trocar a ordem de execução em initApp()
 *    ❌ Remover a verificação de params.has('modal')
 */
async function handleHashNavigation() {
    const params = getRoutingParams();
    const hash = window.location.hash;
    
    const videoId = params.get('videoId');
    const playlistId = params.get('playlistId');
    const artistId = params.get('artistId');
    const modal = params.get('modal');
    
    // ✨ Suporte a atalhos de modais (PWA shortcuts) - via query string OU hash
    if (modal === 'playlists') {
        const btn = document.getElementById('link-playlists');
        if (btn) btn.click();
        return;
    } else if (modal === 'artists') {
        const btn = document.getElementById('link-artistas');
        if (btn) btn.click();
        return;
    } else if (modal === 'favorites') {
        const btn = document.getElementById('link-favoritos');
        if (btn) btn.click();
        return;
    }
    
    // Roteamento de conteúdo (música, playlist, artista) - suporta ambos formatos
    // (Nota: videoId, playlistId, artistId já foram extraídos acima)
    
    if (videoId) {
        
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
    } else if (playlistId) {
        
        try {
            // Encontrar índice da playlist com matching robusto (case-insensitive)
            const index = player.playlistsIndex.findIndex(p => {
                const pName = (p.name || '').trim();
                const pTitle = (p.title || '').trim();
                return pName.toLowerCase() === playlistId.toLowerCase() || 
                       pTitle.toLowerCase() === playlistId.toLowerCase();
            });
            
            if (index !== -1) {
                await selectPlaylistByIndex(index);
            } else {
                console.warn(`Playlist não encontrada: "${playlistId}". Disponíveis:`, 
                    player.playlistsIndex.map(p => p.name || p.title));
                // Feedback ao usuário e fallback para home com limpeza de URL
                showToast(`Playlist "${playlistId}" não encontrada`);
                await loadHome();
                // Limpar URL inválida (remove tanto ? quanto #)
                window.location.replace(window.location.pathname);
            }
        } catch (error) {
            console.error('Erro ao navegar para playlist:', error);
            showToast('Erro ao carregar playlist');
            await loadHome();
            window.location.replace(window.location.pathname);
        }
    } else if (artistId) {
        
        try {
            // 🔒 GUARDRAIL: artistId já está DECODIFICADO
            // ❌ NUNCA faça: selectArtist(decodeURIComponent(artistId))
            // ✅ SEMPRE: selectArtist(artistId) direto
            console.log('[handleHashNavigation] 👤 Carregando artista:', {
                artistId: artistId,
                length: artistId.length,
                hasPoints: artistId.includes('.')
            });
            
            await selectArtist(artistId);
        } catch (error) {
            console.error('Erro ao navegar para artista:', error);
        }
    }
}

// Listeners para alterações de rota
// ✨ Hashchange: quando usuário muda #hash manualmente
window.addEventListener('hashchange', async () => {
    // 🔒 GUARDRAIL: Não processar roteamento durante inicialização
    if (!appInitComplete) {
        console.log('[hashchange] 🔄 Ignorando - app ainda está inicializando');
        return;
    }
    
    // Garantir que playlistsIndex está disponível antes de navegar
    if (player.playlistsIndex.length === 0) {
        await loadPlaylistsIndex();
    }
    
    // 💾 CRÍTICO: Se vai processar artistId, carregar TODAS as playlists
    const params = getRoutingParams();
    if (params.has('artistId') && playlistCache.size === 0) {
        console.log('[hashchange] 📦 Pré-carregando playlists antes de selectArtist()...');
        await loadAllPlaylists();
    }
    
    await handleHashNavigation();
});

// 🔥 Load: fallback robusto para acesso direto via URL (?modal=playlists)
// Alguns cenários de PWA/shortcuts não disparam hashchange no init
window.addEventListener('load', async () => {
    // 🔒 GUARDRAIL: Não processar roteamento durante inicialização
    if (!appInitComplete) {
        console.log('[load] 🔄 Ignorando - app ainda está inicializando (appInitComplete=false)');
        return;
    }
    
    const params = getRoutingParams();
    // Se houver parâmetros de rota, garantir que foram processados
    if (params.has('modal') || params.has('videoId') || params.has('playlistId') || params.has('artistId')) {
        console.log('[load] 🔍 Parâmetros de rota detectados:', {
            modal: params.get('modal'),
            videoId: params.get('videoId'),
            playlistId: params.get('playlistId'),
            artistId: params.get('artistId')
        });
        
        if (player.playlistsIndex.length === 0) {
            await loadPlaylistsIndex();
        }
        
        // 💾 CRÍTICO: Se vai processar artistId, carregar TODAS as playlists
        if (params.has('artistId') && playlistCache.size === 0) {
            console.log('[load] 📦 Pré-carregando playlists antes de selectArtist()...');
            await loadAllPlaylists();
        }
        
        // handleHashNavigation() já foi chamada em initApp(), mas chamar novamente garante
        // que PWA shortcuts diretos funcionam mesmo em casos edge
        await handleHashNavigation();
    }
});

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
        // 1. Carregar índice de playlists (MANDATORY)
        await loadPlaylistsIndex();

        if (player.playlistsIndex.length === 0) {
            console.warn('Nenhuma playlist encontrada no índice');
            return;
        }

        // Sincronizar estado favorito atual
        // Deixar `initializePlayerWithResilience()` fazer o trabalho
        if (USE_NEW_INIT_LOGIC) {
            console.log('[Init] ℹ️ loadPlaylists: Pulando seleção (USE_NEW_INIT_LOGIC=true), deixar para initializePlayerWithResilience()');
            return;
        }

        // 2. Verificar tipo de navegação (query params OU hash para retrocompatibilidade)
        const params = getRoutingParams();
        if (params.has('videoId') || params.has('playlistId') || params.has('artistId') || params.has('modal')) {
            // Router suporta todos os 4 tipos
            await handleHashNavigation();
        } else {
            // 3. Sem parâmetros de rota: carregar primeira playlist como padrão
            await selectPlaylistByIndex(0);
        }

        refreshPlayerUI();
    } catch (error) {
        console.error('Erro ao carregar playlists:', error);
    }
}

/**
 * Carrega o estado "home" padrão (primeira playlist)
 * Garante sempre um estado visual válido
 */
async function loadHome() {
    // Iniciar transição visual
    document.body.classList.add('is-routing');
    
    try {
        await selectPlaylistByIndex(0);
        refreshPlayerUI();
    } catch (error) {
        console.error('Erro ao carregar home:', error);
    } finally {
        // Completar transição no próximo frame
        requestAnimationFrame(() => {
            document.body.classList.remove('is-routing');
        });
    }
}

/**
 * 🔒 FUNÇÃO CRÍTICA: Seleciona playlist apenas para VISUALIZAÇÃO na sidebar
 * 
 * ⚠️ IMPORTANTE: NÃO afeta player.currentPlaylist (o que está tocando)
 * 
 * Fluxo:
 * 1. Usuário está ouvindo música da Playlist A
 * 2. Clica em Playlist B
 * 3. Esta função carrega Playlist B e mostra na sidebar
 * 4. ✅ Música de A CONTINUA tocando (player.currentPlaylist não muda)
 * 
 * @param {Number} index - índice no playlistsIndex
 * @param {Boolean} startPlaying - se true, inicia reprodução ao clicar (APENAS se nada tocando)
 */
async function selectPlaylistForVisualization(index, startPlaying = false) {
    console.log('[SelectPlaylist] INICIADO - index:', index, 'startPlaying:', startPlaying);
    console.log('[SelectPlaylist] playlistsIndex.length:', player.playlistsIndex.length);
    console.log('[SelectPlaylist] isLoadingPlaylist:', player.isLoadingPlaylist);
    
    // ⚠️ CRÍTICO: Validação de índice
    if (index < 0 || index >= player.playlistsIndex.length) {
        console.error('[SelectPlaylist] ❌ RETORNOU CEDO: Índice inválido', {
            index,
            length: player.playlistsIndex.length,
            validRange: `0-${player.playlistsIndex.length - 1}`
        });
        return;
    }

    const playlistMeta = player.playlistsIndex[index];
    console.log('[SelectPlaylist] Playlist metadata:', { index, nome: playlistMeta.name, url: playlistMeta.url });
    
    if (!playlistMeta.url) {
        console.error('[SelectPlaylist] ❌ RETORNOU CEDO: URL não encontrada');
        return;
    }

    console.log('[SelectPlaylist] Carregando playlist apenas para visualização');

    // ⚠️ CRÍTICO: Impedir carregamento simultâneo
    if (player.isLoadingPlaylist) {
        console.warn('[SelectPlaylist] ⚠️ CARREGAMENTO JÁ EM PROGRESSO - ignorando');
        return;
    }

    player.isLoadingPlaylist = true;
    try {
        console.log('[SelectPlaylist] Chamando loadPlaylistByUrl...');
        const playlist = await loadPlaylistByUrl(playlistMeta.url);
        
        if (!playlist) {
            console.error('[SelectPlaylist] ❌ loadPlaylistByUrl retornou null/undefined');
            return;
        }
        
        console.log('[SelectPlaylist] Playlist carregada com sucesso:', { 
            videos: playlist.videos?.length,
            name: playlist.name 
        });
        
        // 🔒 CRITICAMENTE IMPORTANTE: 
        // Se está tocando algo, NÃO mudamos player.currentPlaylist
        // Se não está tocando, podemos mudar para reproduzir
        
        const estaTocanduAlgo = player.isPlaying || (player.shouldPlayOnReady && player.currentPlaylist);
        console.log('[SelectPlaylist] Estado de reprodução:', {
            isPlaying: player.isPlaying,
            shouldPlayOnReady: player.shouldPlayOnReady,
            temPlaylistAtual: !!player.currentPlaylist,
            estaTocanduAlgo
        });
        
        if (!estaTocanduAlgo) {
            // Nada tocando → OK mudar contexto de reprodução
            console.log('[SelectPlaylist] Nada tocando - pode mudar contexto de reprodução');
            player.currentPlaylist = playlist;
            player.currentPlaylistIndex = index;
            player.currentVideoIndex = 0;
            player.playOrder = [...Array(playlist.videos.length).keys()];
            player.originalOrder = [...player.playOrder];
            
            if (startPlaying) {
                player.shouldPlayOnReady = true;
            }
        } else {
            // Algo tocando → NUNCA muda player.currentPlaylist
            console.log('[SelectPlaylist] ✅ Música tocando - player.currentPlaylist PRESERVADO');
        }
        
        player.viewingFavorites = false;
        player.currentFavoriteId = undefined;

        // Guardar novo contexto original
        console.log('[SelectPlaylist] Setando view para esta playlist...');
        // 🧭 Centralizar mudança de sidebar com setView() para registrar automaticamente no histórico
        setView({
            type: 'playlist',
            data: playlist
        });
        
        console.log('[SelectPlaylist] View atualizada e histórico registrado automaticamente');

        // ⚠️ REMOVIDO: updatePlaylistCardsInModal() é chamado AUTOMATICAMENTE por preloadPlaylistsInBackground()
        // Não precisa chamar aqui também - evita race conditions
        
        // Fechar modal ANTES de atualizar sidebar
        console.log('[SelectPlaylist] Fechando modal...');
        closePlaylistsModal();
        
        // Se era primeira vez (no init), carregar primeiro vídeo
        if (!player.ytReady) {
            console.log('[SelectPlaylist] YouTube ainda não está pronto, carregando primeiro vídeo...');
            loadFirstVideo();
        }
        
        // Salvar estado
        console.log('[SelectPlaylist] Salvando estado...');
        saveCurrentState();
        
        console.log('[SelectPlaylist] ✅ COMPLETO - Visualização atualizada (música continua tocando se estava)');
    } catch (error) {
        console.error('[SelectPlaylist] ❌ ERRO CRÍTICO:', error, {
            message: error.message,
            stack: error.stack
        });
    } finally {
        player.isLoadingPlaylist = false;
        console.log('[SelectPlaylist] Flag isLoadingPlaylist resetada para false');
    }
}

/**
 * 🔒 ORIGINAL: Seleciona playlist PARA INICIALIZAÇÃO
 * 
 * NUNCA usar em resposta a clique do usuário em playlist!
 * Use apenas em selectPlaylistForVisualization() ou em inicialização do app
 * 
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
            
            // Sincronizar estado favorito atual
            // Caso contrário, syncFavoriteState() usa ID antigo e botão fica com estado errado
            player.currentFavoriteId = undefined;

            console.log('[SelectPlaylistByIndex] Setando view para esta playlist...');
            // 🧭 Centralizar mudança de sidebar com setView() para registrar automaticamente no histórico
            setView({
                type: 'playlist',
                data: playlist
            });
            
            console.log('[SelectPlaylistByIndex] View atualizada e histórico registrado automaticamente');

            // 🔄 Atualizar os cards do modal com o novo dado cacheado
            updatePlaylistCardsInModal();
            
            closePlaylistsModal();
            sidebarHistory.updateButtons();
            
            loadFirstVideo();
            
            // Persist current state
            saveCurrentState();
        }
    } catch (error) {
        console.error('Erro ao selecionar playlist:', error);
    } finally {
        player.isLoadingPlaylist = false;
    }
}

// ============================================================================
// 🧭 NAVEGAÇÃO - SISTEMA DE CONTEXTO
// ============================================================================

/**
 * 🔒 CONGELADO: Atualizar visibilidade do botão "Voltar"
 * 
 * ⚠️ DEPRECATED: Este botão foi substituído pelo novo sistema de navegação sidebar
 * (sidebarHistory.goBack/goForward)
 * 
 * Mantido para compatibilidade com navigationContext, mas sem efeito visual
 */
function updateBackButtonVisibility() {
    // ✅ Sistema novo: sidebarHistory.updateButtons() já cuida da visibilidade
    // Esta função agora é apenas um placeholder para compatibilidade
    // Se houver elemento #backButton, atualizar; se não, apenas retornar silenciosamente
    
    const backButton = document.getElementById('backButton');
    if (!backButton) {
        // Normal - elemento não existe mais, usar novo sistema
        return;
    }
    
    // Se chegou aqui, elemento legado existe - manter funcionando
    if (navigationContext.canGoBack) {
        backButton.classList.remove('hidden');
    } else {
        backButton.classList.add('hidden');
    }
}

/**
 * 🎯 Restaurar contexto original (FUNÇÃO CRÍTICA)
 * 
 * FLUXO:
 * 1. Restaurar navigationContext para originalSource
 * 2. Re-renderizar sidebar com dados originais
 * 3. NUNCA afetar o player (isPlaying, currentTrack, tempo, etc)
 * 4. Botão voltar desaparece automaticamente
 * 
 * EXEMPLOS DE USO:
 * - Usuário abriu "Favoritos" → clica voltar → volta à playlist original
 * - Usuário abriu "Artista X" → clica voltar → volta à playlist original
 * 
 * ⚠️ INVARIANTES (CRÍTICO):
 * ❌ NÃO resetar player.currentVideoIndex
 * ❌ NÃO parar a música em execução
 * ❌ NÃO resetar favorites ou playOrder
 * ✅ SIM: Restaurar sidebar à visualização original
 * ✅ SIM: Sincronizar indicador de "agora tocando" com nova lista
 */
function restoreViewContext() {
    console.log('[Navigation] restoreViewContext() CHAMADO');
    
    if (!navigationContext.originalSource) {
        console.warn('[Navigation] Nenhum contexto original para restaurar', navigationContext);
        return;
    }
    
    console.log('[Navigation] Contexto original existente:', navigationContext.originalSource);
    
    // Restaurar navegação (volta ao original)
    navigationContext.restoreOriginal();
    
    // 🔒 IMPORTANTE: NÃO mudamos player.currentPlaylist
    // Se algo está tocando, continue tocando da origem
    // Apenas atualizamos a VISUALIZAÇÃO (sidebar)
    
    // Se a música que está tocando é da playlist original, tudo OK
    // Se é de outro contexto, ela continua tocando mas mostramos a playlist original
    
    const { type, data } = navigationContext.originalSource;
    
    if (type === 'playlist' && data) {
        // APENAS mostrar a playlist original na sidebar
        console.log('[Navigation] Restaurando visualização da playlist:', data.name);
        
        // NÃO mudar player.currentPlaylist - deixar tocar
        // Apenas atualizar sidebar para mostrar a playlist original
        
        // Mostrar a playlist na sidebar (sem afetar reprodução)
        player.viewingFavorites = false;
        loadPlaylistVideos();
        
        // Sincronizar indicador de "agora tocando" 
        updatePlayingNowIndicator();
        
        console.log('[Navigation] ✅ Visualização restaurada - música continua tocando');
    } else if (type === 'artist' && data) {
        // Voltar de artista para... playlist original? Não, volta para o artista
        // Mas isso raramente acontece, deixar assim por simplicidade
        console.log('[Navigation] Voltando de artista (edge case)');
        
        player.viewingFavorites = false;
        loadPlaylistVideos();
        updatePlayingNowIndicator();
    }
    
    // Guardar estado
    saveCurrentState();
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
    
    console.log('[openPlaylistsModal] Abrindo modal de playlists');
    
    // 🔄 Mostrar skeletons enquanto carrega (6 cards)
    const skeletonFragment = document.createDocumentFragment();
    for (let i = 0; i < 6; i++) {
        skeletonFragment.appendChild(createCardSkeleton());
    }
    container.innerHTML = '';
    container.appendChild(skeletonFragment);
    modal.classList.add('show');
    
    // 🔒 Marcar que o modal foi aberto nesta chamada
    modal.dataset.openTime = Date.now();
    
    // Agora carregar dados reais em background
    setTimeout(() => {
        // ⚠️ CRÍTICO: Verificar se o modal ainda está visível
        // Se foi fechado/reaberto, NÃO processar este setTimeout
        if (!modal.classList.contains('show')) {
            console.log('[openPlaylistsModal] Modal foi fechado antes do setTimeout executar');
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        console.log('[openPlaylistsModal] Criando cards para', player.playlistsIndex.length, 'playlists');
        
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
            }, {
                type: 'playlist',
                shareData: playlistMeta.name
            });
            
            // 🔒 NOVO: Usar closure para capturar o índice correto
            card.addEventListener('click', () => {
                console.log('[Card Click] Playlist clicado - index:', index, 'nome:', playlistMeta.name);
                selectPlaylistForVisualization(index, true);
            });
            
            fragment.appendChild(card);
        });
        
        // ⚠️ CRÍTICO: Verificar NOVAMENTE antes de atualizar DOM
        if (!modal.classList.contains('show')) {
            console.log('[openPlaylistsModal] Modal foi fechado durante criação de cards');
            return;
        }
        
        container.innerHTML = '';
        container.appendChild(fragment);
        
        console.log('[openPlaylistsModal] Cards criados e renderizados com sucesso');
        
        // 🔄 Pré-carregar playlists em background para atualizar contagens
        preloadPlaylistsInBackground();
    }, 50);
}

/**
 * Pré-carrega playlists não-cacheadas em background
 * Isso permite que os cards sejam atualizados conforme as playlists são carregadas
 */
function preloadPlaylistsInBackground() {
    console.log('[preloadPlaylistsInBackground] Iniciando pré-carregamento de playlists');
    
    const modal = document.getElementById('playlistModal');
    const openTimeSnapshot = modal.dataset.openTime; // Capturar timestamp AGORA
    
    // Não bloqueia a execução principal
    let countToLoad = 0;
    player.playlistsIndex.forEach((playlistMeta) => {
        // Se já está em cache, pular
        if (playlistCache.has(playlistMeta.url)) {
            console.log('[preloadPlaylistsInBackground] Pulando', playlistMeta.name, '(já em cache)');
            return;
        }
        
        countToLoad++;
        console.log('[preloadPlaylistsInBackground] Carregando', playlistMeta.name, '(' + playlistMeta.url + ')');
        
        // Carregar em background (não awaitar aqui)
        loadPlaylistByUrl(playlistMeta.url).then(() => {
            // ⚠️ CRÍTICO: Verificar se modal foi fechado/reaberto enquanto carregávamos
            if (modal.dataset.openTime !== openTimeSnapshot) {
                console.log('[preloadPlaylistsInBackground] ⚠️ Modal foi fechado/reaberto - ignorando atualização');
                return;
            }
            
            // Após carregar, atualizar os cards do modal
            console.log('[preloadPlaylistsInBackground] ✅ Playlist carregada:', playlistMeta.name, '- Atualizando cards');
            updatePlaylistCardsInModal();
        }).catch((error) => {
            console.warn('[preloadPlaylistsInBackground] ❌ Erro ao pré-carregar playlist (' + playlistMeta.url + '):', error);
        });
    });
    
    console.log('[preloadPlaylistsInBackground] Total de playlists para carregar:', countToLoad);
}

/**
 * Atualiza os cards de playlists no modal com dados cacheados
 * Chamado após carregar uma nova playlist para refletir o novo dados
 */
function updatePlaylistCardsInModal() {
    const modal = document.getElementById('playlistModal');
    
    // Se o modal não está visível, não precisa atualizar
    if (!modal.classList.contains('show')) {
        console.log('[updatePlaylistCardsInModal] Modal não está visível - ignorando');
        return;
    }
    
    console.log('[updatePlaylistCardsInModal] Atualizando cards com contagens do cache');
    
    const container = document.getElementById('playlistCardsContainer');
    const fragment = document.createDocumentFragment();
    
    console.log('[updatePlaylistCardsInModal] Recreando', player.playlistsIndex.length, 'cards');
    
    player.playlistsIndex.forEach((playlistMeta, index) => {
        // Tentar obter count do cache
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
        }, {
            type: 'playlist',
            shareData: playlistMeta.name
        });
        
        // 🔒 Usar closure para capturar índice correto
        card.addEventListener('click', () => {
            console.log('[Card Click] Playlist clicado via updatePlaylistCardsInModal - index:', index, 'nome:', playlistMeta.name);
            selectPlaylistForVisualization(index, true);
        });
        
        fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
    
    console.log('[updatePlaylistCardsInModal] ✅ Cards atualizados com sucesso');
}

function closePlaylistsModal() {
    // Limpar filtro de busca
    const searchInput = document.getElementById('playlistSearchInput');
    if (searchInput) searchInput.value = '';
    
    closeModalWithAnimation('playlistModal');
}

// ============================================================================
// UTILITÁRIO: NORMALIZAÇÃO DE STRINGS PARA BUSCA (Remove acentos)
// ============================================================================

/**
 * 🔒 CONGELADO: Normaliza strings removendo diacríticos (acentos)
 * 
 * Permite buscar "fabio" e encontrar "Fábio", "paulo" encontra "Paulô", etc.
 * 
 * ⚠️ TÉCNICA:
 * 1. .normalize('NFD') - Decompõe caracteres acentuados em base + diacrítrico
 * 2. .replace(/[\u0300-\u036f]/g, '') - Remove os diacríticos (acentos)
 * 3. .toLowerCase() - Converte para minúsculas
 * 4. .trim() - Remove espaços extras
 * 
 * Exemplos:
 * - "Fábio" → "fabio"
 * - "José" → "jose"
 * - "São Paulo" → "sao paulo"
 * - "Frida Kahlo" → "frida kahlo"
/**
 * 🔧 Normalização robusta para comparação de strings e filtragem
 * Remove acentos, trata encoding Unicode, lowercase e trim
 * 
 * Resolve:
 * - "Fábio Jr." === "Fábio Jr." (mesmo com variações)
 * - Busca "fabio" encontra "Fábio"
 * - "São Paulo" === "sao paulo"
 * 
 * Se remover esta função, BUSCA e COMPARAÇÃO DE ARTISTA quebram
 */
function normalize(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// ============================================================================
// FILTRO DE PLAYLISTS - BUSCA EM TEMPO REAL
// ============================================================================

/**
 * 🔒 CONGELADO: Filtra cards de playlists em tempo real
 * 
 * ⚠️ LÓGICA CRÍTICA:
 * - Itera sobre cada card no container
 * - Normaliza query e títulos (remove acentos via normalize())
 * - Oculta/mostra cards usando display: none
 * - Não reordena ou remove cards do DOM
 * 
 * ⛔ O QUE QUEBRARIA:
 * ❌ Remover normalize() → busca com acentos quebra
 * ❌ Usar `.remove()` em vez de `display: none` → quebra re-filtragem
 * ❌ Comparar com title.toLowerCase() ao invés de normalize() → acentos quebram
 */
function filterPlaylistCards(query) {
    const container = document.getElementById('playlistCardsContainer');
    if (!container) return;
    
    const normalizedQuery = normalize(query);
    const cards = container.querySelectorAll('.card');
    
    // Se query vazia, mostrar todos os cards
    if (!normalizedQuery) {
        cards.forEach(card => card.style.display = '');
        return;
    }
    
    // Filtrar baseado no título da playlist (contido no primeiro elemento .card-title)
    cards.forEach(card => {
        const titleEl = card.querySelector('.card-title');
        const subtitleEl = card.querySelector('.card-subtitle');
        
        if (!titleEl) {
            card.style.display = 'none';
            return;
        }
        
        // Normalizar título e subtítulo (remove acentos para comparação)
        const normalizedTitle = normalize(titleEl.textContent);
        const normalizedSubtitle = subtitleEl ? normalize(subtitleEl.textContent) : '';
        
        const matches = normalizedTitle.includes(normalizedQuery) || normalizedSubtitle.includes(normalizedQuery);
        card.style.display = matches ? '' : 'none';
    });
}

/**
 * 🔒 CONGELADO: Filtra cards de artistas em tempo real
 * 
 * ⚠️ LÓGICA CRÍTICA:
 * - Itera sobre cada card no container
 * - Normaliza query e nomes (remove acentos via normalize)
 * - Oculta/mostra cards usando display: none
 * - Permite buscar "paulo" e encontrar "Paulo", "jose" encontra "José"
 */
function filterArtistCards(query) {
    const container = document.getElementById('artistsCardsContainer');
    if (!container) return;
    
    const normalizedQuery = normalize(query);
    const cards = container.querySelectorAll('.card');
    
    // Se query vazia, mostrar todos os cards
    if (!normalizedQuery) {
        cards.forEach(card => card.style.display = '');
        return;
    }
    
    // Filtrar baseado no nome do artista (contido no primeiro elemento .card-title)
    cards.forEach(card => {
        const titleEl = card.querySelector('.card-title');
        const subtitleEl = card.querySelector('.card-subtitle');
        
        if (!titleEl) {
            card.style.display = 'none';
            return;
        }
        
        // Normalizar nome do artista e contagem de músicas (remove acentos)
        const normalizedTitle = normalize(titleEl.textContent);
        const normalizedSubtitle = subtitleEl ? normalize(subtitleEl.textContent) : '';
        
        const matches = normalizedTitle.includes(normalizedQuery) || normalizedSubtitle.includes(normalizedQuery);
        card.style.display = matches ? '' : 'none';
    });
}

// ============================================================================
// MODAL DE ARTISTAS
// ============================================================================

/**
 * Cria um card skeleton para loading
 * @returns {HTMLElement}
 */
function createCardSkeleton() {
    const card = document.createElement('div');
    card.className = 'card skeleton-card';
    
    // Image skeleton
    const imgSkeleton = document.createElement('div');
    imgSkeleton.className = 'skeleton skeleton-card-image';
    imgSkeleton.style.paddingBottom = '100%';
    
    // Body skeleton
    const bodySkeleton = document.createElement('div');
    bodySkeleton.className = 'card-body';
    
    const titleSkeleton = document.createElement('div');
    titleSkeleton.className = 'skeleton skeleton-card-title';
    
    const subtitleSkeleton = document.createElement('div');
    subtitleSkeleton.className = 'skeleton skeleton-card-subtitle';
    
    bodySkeleton.appendChild(titleSkeleton);
    bodySkeleton.appendChild(subtitleSkeleton);
    card.appendChild(imgSkeleton);
    card.appendChild(bodySkeleton);
    
    return card;
}

async function openArtistsModal() {
    const modal = document.getElementById('artistsModal');
    const container = document.getElementById('artistsCardsContainer');
    
    console.log('[openArtistsModal] Abrindo modal de artistas');
    
    // � Marcar que este modal foi aberto AGORA
    modal.dataset.openTime = Date.now();
    const openTimeSnapshot = modal.dataset.openTime;
    
    // 🔄 Mostrar skeletons enquanto carrega
    container.innerHTML = '';
    const skeletonContainer = document.createDocumentFragment();
    for (let i = 0; i < 8; i++) {
        skeletonContainer.appendChild(createCardSkeleton());
    }
    container.appendChild(skeletonContainer);
    modal.classList.add('show');

    try {
        // Carregar todas as playlists (necessário para listar todos os artistas)
        const allPlaylists = await loadAllPlaylists();

        // ⚠️ CRÍTICO: Se este modal foi fechado e reabierto, cancelar
        if (modal.dataset.openTime !== openTimeSnapshot) {
            console.log('[openArtistsModal] Modal foi reabierto, cancelando renderização anterior');
            return;
        }

        // Coletar artistas com contagem de músicas
        const artistsMap = new Map();
        allPlaylists.forEach(playlist => {
            playlist.videos?.forEach(video => {
                if (video.artist) {
                    if (!artistsMap.has(video.artist)) {
                        artistsMap.set(video.artist, 0);
                    }
                    artistsMap.set(video.artist, artistsMap.get(video.artist) + 1);
                }
            });
        });

        // Converter para array e ordenar
        const artists = Array.from(artistsMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log('[openArtistsModal] Artistas carregados:', artists.length);

        // ⚠️ CRÍTICO: Verificar NOVAMENTE antes de renderizar
        if (modal.dataset.openTime !== openTimeSnapshot) {
            console.log('[openArtistsModal] Modal foi reabierto, cancelando renderização');
            return;
        }

        // Usar DocumentFragment para melhor performance
        const fragment = document.createDocumentFragment();

        artists.forEach(({ name: artist, count }) => {
            const artistCover = getArtistCoverUrl(artist);
            const card = renderCard({
                src: artistCover,
                title: artist,
                subtitle: `${count} músicas`
            }, {
                type: 'artist',
                shareData: artist
            });
            
            // 🔒 NOVO: Usar closure para capturar o nome do artista correto
            card.addEventListener('click', () => {
                console.log('[Card Click] Artista clicado:', artist);
                selectArtist(artist);
            });
            
            fragment.appendChild(card);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
        
        console.log('[openArtistsModal] Cards de artistas criados com sucesso');
    } catch (error) {
        console.error('[openArtistsModal] Erro ao carregar artistas:', error);
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-dim);">Erro ao carregar artistas</div>';
    }
}

function closeArtistsModal() {
    // Limpar filtro de busca
    const searchInput = document.getElementById('artistSearchInput');
    if (searchInput) searchInput.value = '';
    
    closeModalWithAnimation('artistsModal');
}

// ----------------------
// Gestão de Playlists do Usuário
// ----------------------

function openCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.add('show');
    document.getElementById('newPlaylistName').focus();
}

function closeCreatePlaylistModal() {
    closeModalWithAnimation('createPlaylistModal', () => {
        document.getElementById('createPlaylistForm').reset();
    });
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
    closeModalWithAnimation('userMenuModal');
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
            
            // 🔥 CRITICAL: Fechar editPlaylistModal e esperar feedback fechar antes de reabrir userPlaylistsModal
            closeModalWithAnimation('editPlaylistModal');
            setTimeout(() => {
                // Aguardar feedback fechar (3s por padrão em showFeedbackModal)
                setTimeout(() => {
                    openUserPlaylistsModal();
                }, 3200); // Feedback duration (3000) + buffer (200)
            }, 550); // closeModalWithAnimation duration (550)
        } else {
            // Se nome não mudou, apenas fecha o modal
            closeModalWithAnimation('editPlaylistModal', () => {
                setTimeout(() => openUserPlaylistsModal(), 300);
            });
        }
    });
    
    // Fechar ao cancelar
    newCancelBtn.addEventListener('click', () => {
        closeModalWithAnimation('editPlaylistModal', () => {
            setTimeout(() => openUserPlaylistsModal(), 300);
        });
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
        editBtn.appendChild(createSvgIcon('edit-case'));
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditPlaylistModal(idx, pl.name);
        });
        
        // Botão Remover
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn icon-btn-delete';
        deleteBtn.setAttribute('aria-label', 'Remover playlist');
        deleteBtn.setAttribute('title', 'Remover');
        deleteBtn.appendChild(createSvgIcon('delete-case'));
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
            
            // 🔥 CRÍTICO: Resetar navigationContext para usar player.currentPlaylist
            // Se não fazer isso, loadPlaylistVideos() vai usar navigationContext.currentView (dados antigos)
            navigationContext.currentView = null;
            
            closeUserPlaylistsModal();
            closeUserMenuModal();
            loadPlaylistVideos();
            if (player.currentPlaylist.videos.length > 0) {
                loadFirstVideo();
            }
            refreshPlayerUI();
            
            // 🔄 CRÍTICO: Adicionar ao histórico de navegação da sidebar
            // (Faltava aqui - playlist do usuário não era rastreada!)
            sidebarHistory.push({
                type: 'playlist',
                data: selectedPl,
                name: selectedPl.name || 'Playlist'
            });
            sidebarHistory.updateButtons();
        }
    });
    
    return row;
}

function closeUserPlaylistsModal() {
    closeModalWithAnimation('userPlaylistsModal', () => {
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
                
                // 🔥 Garantir que sidebar é atualizada com o estado restaurado
                if (player.currentPlaylist && !player.viewingFavorites) {
                    loadPlaylistVideos();
                } else if (player.viewingFavorites) {
                    displayFavoritesList();
                }
            }
        }
    });
}

// ----------------------
// Modal opções do item (kebab)
// ----------------------

let currentKebabIndex = null;

function openItemOptionsModal(index) {
    currentKebabIndex = index;
    // 🔥 CRÍTICO: Usar getCurrentViewVideos() para pegar o vídeo CORRETO da view atual
    // Se estamos em artista/favoritos, o índice é relativo àquela view, não ao playlist original
    const viewVideos = getCurrentViewVideos();
    const video = viewVideos[index];
    
    if (!video) {
        console.error('[openItemOptionsModal] ❌ Vídeo não encontrado no índice:', index, 'views videos:', viewVideos.length);
        return;
    }
    
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
        icon: isInAnyPlaylist ? 'remove-case' : 'add-case',
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
                    // Sem playlists: abrir modal para criar
                    addingItemToPlaylist = true;
                    videoToAdd = video;
                    previousPlaylistState = {
                        playlist: player.currentPlaylist,
                        playlistIndex: player.currentPlaylistIndex,
                        videoIndex: player.currentVideoIndex,
                        viewingFavorites: player.viewingFavorites,
                        currentFavoriteId: player.currentFavoriteId
                    };
                    openCreatePlaylistModal();
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

    // Opção: Favoritar
    const isFavorite = player.favorites.some(fav => fav.id === video.id);
    const favoriteRow = renderOptionRow({
        icon: isFavorite ? 'remove-case' : 'add-case',
        text: isFavorite ? 'Remover de Favoritos' : 'Adicionar a Favoritos',
        onClick: () => {
            // Toggle favorito para este vídeo
            const favoriteId = video.id;
            const favIndex = player.favorites.findIndex(fav => fav.id === favoriteId);
            
            if (favIndex > -1) {
                // Remover de favoritos
                player.favorites.splice(favIndex, 1);
                console.log('[Favoritos] Removendo favorito do modal:', favoriteId);
            } else {
                // Adicionar a favoritos
                const alreadyExists = player.favorites.some(fav => fav.id === favoriteId);
                if (!alreadyExists) {
                    player.favorites.push({
                        id: favoriteId,
                        videoId: video.id,
                        title: video.title,
                        artist: video.artist || 'Desconhecido',
                        video: video,
                        playlist: player.currentPlaylist.name,
                    });
                    console.log('[Favoritos] Adicionando favorito do modal:', favoriteId);
                }
            }
            
            saveFavorites();
            
            // Re-renderizar sidebar se necessário
            if (player.viewingFavorites) {
                displayFavoritesList();
            } else if (player.currentPlaylist) {
                loadPlaylistVideos();
            }
            
            // Se o vídeo que foi favoritado é o que está tocando, atualizar botão de controle
            if (player.currentPlaylist?.videos?.[player.currentVideoIndex]?.id === video.id) {
                updateFavoriteButton();
            }
            
            closeItemOptionsModal();
        }
    });
    fragment.appendChild(favoriteRow);
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

/**
 * 🔥 FUNÇÃO CENTRAL: Assume controle TOTAL do sistema de mídia
 * 
 * Responsabilidades (TUDO em um lugar):
 * 1. Forçar metadados do NOSSO JSON (não YouTube)
 * 2. Registrar handlers que chamam NOSSAS funções
 * 3. Informar ao Android/iOS que somos um "Player de Áudio" legítimo
 * 
 * ⚠️ CRITICAL: Chamar logo após ytPlayer.loadVideoById()
 * Antes: qualquer delay = YouTube retoma controle
 * 
 * @param {Object} track - Objeto vídeo { id, title, artist, ...}
 */
function updateMediaSession(track) {
    // 🔒 SEGURANÇA: Validar track e browser
    if (!('mediaSession' in navigator)) {
        console.warn('[MediaSession] ⚠️ Browser não suporta Media Session API');
        return;
    }
    
    if (!track || !track.id) {
        console.warn('[MediaSession] ⚠️ Track inválido:', track);
        return;
    }

    try {
        // 🔥 PASSO 1: FORÇAR METADADOS DO NOSSO JSON (não YouTube)
        // Isso é o que aparece na lockscreen, notificação e periféricos
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Música Desconhecida',
            artist: track.artist || 'Artista Desconhecido',
            album: 'SanPlayer',
            artwork: [
                {
                    src: getArtistCoverUrl(track.artist),
                    sizes: '512x512',
                    type: 'image/jpeg'
                }
            ]
        });

        // 🔥 PASSO 2: REGISTRAR HANDLERS COM NOSSAS FUNÇÕES REAIS
        // Isso é o que REALMENTE executa quando usuário clica no controle
        
        // ▶️ PLAY: Chama nossa função playerPlay()
        navigator.mediaSession.setActionHandler('play', () => {
            console.log('[MediaSession] ▶️ PLAY (via lockscreen/fone/smartwatch)');
            if (player.ytReady && ytPlayer) {
                ytPlayer.playVideo();
            }
        });

        // ⏸️ PAUSE: Chama nossa função playerPause()
        navigator.mediaSession.setActionHandler('pause', () => {
            console.log('[MediaSession] ⏸️ PAUSE (via lockscreen/fone/smartwatch)');
            if (player.ytReady && ytPlayer) {
                ytPlayer.pauseVideo();
            }
        });

        // ⏭️ NEXT: Chama nossa função nextVideo() (NÃO seek de 10s do YouTube)
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            console.log('[MediaSession] ⏭️ PRÓXIMA (via fone/smartwatch) - mudando música');
            if (player.currentPlaylist) {
                nextVideo(); // 🔥 NOSSA FUNÇÃO, não YouTube
            }
        });

        // ⏮️ PREVIOUS: Chama nossa função previousVideo() (NÃO seek de 10s do YouTube)
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            console.log('[MediaSession] ⏮️ ANTERIOR (via fone/smartwatch) - mudando música');
            if (player.currentPlaylist) {
                previousVideo(); // 🔥 NOSSA FUNÇÃO, não YouTube
            }
        });

        console.log('[MediaSession] ✅ CONTROLE ASSUMIDO', {
            track: track.title,
            artist: track.artist,
            status: 'SanPlayer (não YouTube)'
        });
    } catch (error) {
        console.error('[MediaSession] ❌ Erro:', error);
    }
}

function openItemOptionsModalFromPlayer(video) {
    if (!video || !video.id) {
        console.error('[openItemOptionsModalFromPlayer] ❌ Vídeo inválido');
        return;
    }
    
    const modal = document.getElementById('itemOptionsModal');
    const headerEl = modal.querySelector('.modal-header');
    
    // Limpar header anterior
    headerEl.innerHTML = '';
    
    // Renderizar novo header com o vídeo do player
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
        icon: isInAnyPlaylist ? 'remove-case' : 'add-case',
        text: isInAnyPlaylist ? 'Remover da Playlist' : 'Adicionar a playlist',
        onClick: () => {
            if (isInAnyPlaylist) {
                // Já está em playlist: remover
                const userList = getUserPlaylists();
                userList.forEach(pl => {
                    pl.videos = pl.videos.filter(v => v.id !== video.id);
                });
                saveUserPlaylists(userList);
                showFeedbackModal('Removido da Playlist');
                closeItemOptionsModal();
            } else {
                // Não está em playlist: abrir modal para adicionar
                const userList = getUserPlaylists();
                if (userList.length === 0) {
                    // Sem playlists: abrir modal para criar
                    addingItemToPlaylist = true;
                    videoToAdd = video;
                    openCreatePlaylistModal();
                } else if (userList.length === 1) {
                    // Uma playlist: adicionar direto
                    userList[0].videos.push(video);
                    saveUserPlaylists(userList);
                    showFeedbackModal(`Adicionado a "${userList[0].name}"`);
                    closeItemOptionsModal();
                } else {
                    // Múltiplas: abrir modal para escolher
                    addingItemToPlaylist = true;
                    videoToAdd = video;
                    openUserPlaylistsModal();
                }
            }
        }
    });
    fragment.appendChild(playlistRow);
    fragment.appendChild(renderSeparator());

    // Opção: Favoritar
    const isFavorite = player.favorites.some(fav => fav.id === video.id);
    const favoriteRow = renderOptionRow({
        icon: isFavorite ? 'remove-case' : 'add-case',
        text: isFavorite ? 'Remover de Favoritos' : 'Adicionar a Favoritos',
        onClick: () => {
            // Toggle favorito para este vídeo
            const favoriteId = video.id;
            const favIndex = player.favorites.findIndex(fav => fav.id === favoriteId);
            
            if (favIndex > -1) {
                player.favorites.splice(favIndex, 1);
                showFeedbackModal('Removido de Favoritos');
            } else {
                player.favorites.push(video);
                showFeedbackModal('Adicionado a Favoritos');
                // Criar partículas de coração no botão
                const favButtonOnOverlay = document.getElementById('favButton');
                if (favButtonOnOverlay) {
                    createParticleExplosion(favButtonOnOverlay);
                }
            }
            saveFavorites();
            updateFavoriteButton();
            closeItemOptionsModal();
        }
    });
    fragment.appendChild(favoriteRow);
    fragment.appendChild(renderSeparator());

    // Opção: Compartilhar
    const shareRow = renderOptionRow({
        icon: 'share',
        text: 'Compartilhar',
        onClick: () => shareItem(player.currentVideoIndex)
    });
    fragment.appendChild(shareRow);

    body.appendChild(fragment);
    modal.classList.add('show');
}

function closeItemOptionsModal() {
    closeModalWithAnimation('itemOptionsModal', () => {
        // Limpar estado de "adicionando item"
        addingItemToPlaylist = false;
        videoToAdd = null;
        
        // Se não estamos em modo de adicionar item, sincronizar sidebar
        if (player.currentPlaylist && !player.viewingFavorites) {
            loadPlaylistVideos();
        } else if (player.viewingFavorites) {
            displayFavoritesList();
        }
    });
}

/**
 * Abre modal de compartilhamento para playlist
 * @param {String} playlistName - Nome da playlist
 */
function openPlaylistShareModal(playlistName) {
    const modal = document.getElementById('itemOptionsModal');
    const headerEl = modal.querySelector('.modal-header');
    
    // Atualizar conteúdo do header existente
    headerEl.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = playlistName;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.appendChild(createSvgIcon('close-case'));
    closeBtn.addEventListener('click', closeItemOptionsModal);
    
    headerEl.appendChild(title);
    headerEl.appendChild(closeBtn);
    
    const body = document.getElementById('itemOptionsBody');
    body.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    // Botão: Compartilhar
    const shareRow = renderOptionRow({
        icon: 'share',
        text: 'Compartilhar',
        onClick: () => {
            sharePlaylist(playlistName);
            closeItemOptionsModal();
        }
    });
    fragment.appendChild(shareRow);
    fragment.appendChild(renderSeparator());
    
    // Botão: Cancelar
    const cancelRow = renderOptionRow({
        icon: 'close',
        text: 'Cancelar',
        onClick: closeItemOptionsModal
    });
    fragment.appendChild(cancelRow);
    
    body.appendChild(fragment);
    modal.classList.add('show');
}

/**
 * Abre modal de compartilhamento para artista
 * @param {String} artistName - Nome do artista
 */
function openArtistShareModal(artistName) {
    const modal = document.getElementById('itemOptionsModal');
    const headerEl = modal.querySelector('.modal-header');
    
    // Atualizar conteúdo do header existente
    headerEl.innerHTML = '';
    
    const title = document.createElement('h2');
    title.textContent = artistName;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.appendChild(createSvgIcon('close-case'));
    closeBtn.addEventListener('click', closeItemOptionsModal);
    
    headerEl.appendChild(title);
    headerEl.appendChild(closeBtn);
    
    const body = document.getElementById('itemOptionsBody');
    body.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    // Botão: Compartilhar
    const shareRow = renderOptionRow({
        icon: 'share',
        text: 'Compartilhar',
        onClick: () => {
            shareArtist(artistName);
            closeItemOptionsModal();
        }
    });
    fragment.appendChild(shareRow);
    fragment.appendChild(renderSeparator());
    
    // Botão: Cancelar
    const cancelRow = renderOptionRow({
        icon: 'close',
        text: 'Cancelar',
        onClick: closeItemOptionsModal
    });
    fragment.appendChild(cancelRow);
    
    body.appendChild(fragment);
    modal.classList.add('show');
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
        // 🔥 CRÍTICO: Usar getCurrentViewVideos() para pegar o vídeo CORRETO da view atual
        const viewVideos = getCurrentViewVideos();
        if (!viewVideos || currentKebabIndex < 0 || currentKebabIndex >= viewVideos.length) {
            console.error('[addItemToUserPlaylist] ❌ Vídeo não encontrado no índice:', currentKebabIndex);
            return;
        }
        video = viewVideos[currentKebabIndex];
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
    // 🔥 CRÍTICO: Usar getCurrentViewVideos() para pegar o vídeo CORRETO da view atual
    const viewVideos = getCurrentViewVideos();
    if (!viewVideos || currentKebabIndex < 0 || currentKebabIndex >= viewVideos.length) {
        console.error('[removeItemFromUserPlaylist] ❌ Vídeo não encontrado no índice:', currentKebabIndex);
        return;
    }
    const video = viewVideos[currentKebabIndex];
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
        // Garantir limpeza: remover qualquer classe 'closing' que possa ficar
        modal.classList.remove('closing');
    }, duration + 50); // +50ms de buffer para animação
}

// Alias para compatibilidade (showToast vira showFeedbackModal)
function showToast(message) {
    showFeedbackModal(message);
}

// ============================================================================
// NOVA ARQUITETURA: COMPARTILHAMENTO DESACOPLADO
// ============================================================================
// Em vez de lógica duplicada em cada botão, centralizamos:
// 1. shareVideo() → função única de compartilhamento
// 2. resolveVideoContext() → resolver qual video/contexto compartilhar
// 3. handleShare() → handler genérico reutilizável
// ============================================================================

/**
 * 🎯 FUNÇÃO CENTRAL DE COMPARTILHAMENTO
 * Responsável ÚNICA por compartilhar um vídeo usando navigator.share + fallback
 * 
 * @param {Object} video - Objeto vídeo { id, title, artist }
 * @param {Object} playlist - Objeto playlist opcional (para contexto apenas)
 */
function shareVideo(video, playlist) {
    if (!video || !video.id) {
        console.warn('[Share] Vídeo inválido:', video);
        return;
    }

    // 🌐 Construir URL de compartilhamento
    const url = `${window.location.origin}${window.location.pathname}?videoId=${video.id}`;
    
    // 📝 Construir texto de compartilhamento
    const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;
    
    const shareData = {
        title: 'SanPlayer',
        text: text,
        url: url
    };
    
    // 📤 Tentar Web Share API
    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        // 📋 Fallback: clipboard
        const shareText = `${text}\n${url}`;
        try { 
            navigator.clipboard.writeText(shareText);
            showToast('Link copiado para compartilhamento!');
        } catch (e) {
            console.warn('[Share] Erro ao copiar para clipboard:', e);
        }
    }
}

/**
 * 🧠 RESOLVER DE CONTEXTO
 * Determina qual vídeo/playlist compartilhar baseado na fonte (player, list, preview)
 * 
 * @param {String} source - Fonte de ação: 'player', 'list', 'preview'
 * @param {Object} extra - Dados extras { video, index, ...}
 * @returns {Object} { video, playlist }
 */
function resolveVideoContext(source, extra = {}) {
    const DEFAULT_CONTEXT = { video: null, playlist: null };
    
    switch (source) {
        case 'player':
            // 🎵 Contexto do player: música atual
            if (!player.currentPlaylist || player.currentVideoIndex === undefined) {
                return DEFAULT_CONTEXT;
            }
            return {
                video: player.currentPlaylist.videos[player.currentVideoIndex],
                playlist: player.currentPlaylist
            };
        
        case 'list':
            // 📃 Contexto da lista: item específico
            if (extra.video) {
                return {
                    video: extra.video,
                    playlist: player.currentPlaylist
                };
            }
            return DEFAULT_CONTEXT;
        
        case 'preview':
            // 🔥 Contexto de preview: vídeo na tela (pode não estar tocando)
            if (player.previewVideo) {
                return {
                    video: player.previewVideo,
                    playlist: null
                };
            }
            return DEFAULT_CONTEXT;
        
        default:
            console.warn('[Share] Contexto desconhecido:', source);
            return DEFAULT_CONTEXT;
    }
}

/**
 * 🔘 HANDLER GENÉRICO DE COMPARTILHAMENTO
 * Chamada por TODOS os botões de "compartilhar" de qualquer contexto
 * Resolve o contexto + chama shareVideo()
 * 
 * @param {String} source - Fonte: 'player', 'list', 'preview'
 * @param {Object} extra - Dados extras (ex: { video, index })
 */
function handleShare(source, extra = {}) {
    const context = resolveVideoContext(source, extra);
    
    if (!context.video) {
        console.warn('[Share] Nenhum vídeo encontrado para compartilhar');
        showToast('Impossível compartilhar: nenhum vídeo selecionado');
        return;
    }
    
    // Validar e mesclar dados extras — extra.video deve ter .id válido
    const video = (extra?.video && extra.video.id) 
        ? extra.video 
        : context.video;
    const playlist = context.playlist;
    
    shareVideo(video, playlist);
}

function shareItem(index) {
    // 🔥 CRÍTICO: Usar getCurrentViewVideos() para pegar o vídeo CORRETO da view atual
    // Se estamos em artista/favoritos, o índice é relativo àquela view, não ao playlist original
    const viewVideos = getCurrentViewVideos();
    const video = viewVideos[index];
    
    if (!video) {
        console.error('[shareItem] ❌ Vídeo não encontrado no índice:', index, 'view videos:', viewVideos.length);
        return;
    }
    
    const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;
    const url = `${window.location.origin}${window.location.pathname}?videoId=${video.id}`;
    if (navigator.share) {
        navigator.share({
            title: 'SanPlayer',
            text: text,
            url: url,
        }).catch(() => {});
    } else {
        // Fallback: copiar para clipboard
        const shareText = `${text}\n${url}`;
        try { navigator.clipboard.writeText(shareText); } catch (e) {}
        alert('Música copiada para compartilhamento!');
    }
}

/**
 * 🔒 Compartilha uma playlist com ENCODE SEGURO
 * 
 * ⚠️ CRÍTICO: Usa safeEncode() para garantir pontos em playlistId
 * 
 * Exemplo:
 * - Input: "A.B.C. Música"
 * - URL gerada: "?playlistId=A%2EB%2EC%20M%C3%BAsica"
 * - Recepção automática decodifica para: "A.B.C. Música"
 * 
 * REGRAS:
 * ❌ NUNCA: encodeURIComponent(playlistName)
 * ✅ SEMPRE: safeEncode(playlistName)
 * ❌ NUNCA: mudar window.location.origin + pathname
 * ✅ SEMPRE: manter ambos (dinâmicos)
 * 
 * @param {String} playlistName - Nome da playlist (pode ter pontos)
 */
function sharePlaylist(playlistName) {
    const text = `Acompanhe a playlist: ${playlistName} no SanPlayer`;
    const url = `${window.location.origin}${window.location.pathname}?playlistId=${safeEncode(playlistName)}`;
    if (navigator.share) {
        navigator.share({
            title: 'SanPlayer',
            text: text,
            url: url,
        }).catch(() => {});
    } else {
        // Fallback: copiar para clipboard
        const shareText = `${text}\n${url}`;
        try { navigator.clipboard.writeText(shareText); } catch (e) {}
        alert('Playlist copiada para compartilhamento!');
    }
}

/**
 * 🔒 Compartilha um artista com ENCODE SEGURO
 * 
 * ⚠️ CRÍTICO: Usa safeEncode() para garantir pontos em artistId
 * 
 * Casos de teste OBRIGATÓRIOS:
 * 1. "Fábio Jr." → "?artistId=F%C3%A1bio%20Jr%2E" ✅
 * 2. "A.B.C. Band" → "?artistId=A%2EB%2EC%20Band" ✅
 * 3. Nomes normais → funcionam (sem regressão) ✅
 * 
 * Fluxo:
 * - shareArtist("Fábio Jr.")
 *   ↓
 * - safeEncode("Fábio Jr.") = "F%C3%A1bio%20Jr%2E"
 *   ↓
 * - ?artistId=F%C3%A1bio%20Jr%2E (URL gerada)
 *   ↓
 * - params.get('artistId') [auto decode]
 * - = "Fábio Jr." (ponto RESTAURADO) ✅
 * 
 * REGRAS:
 * ❌ NUNCA: encodeURIComponent(artistName)
 * ✅ SEMPRE: safeEncode(artistName)
 * ❌ NUNCA: URL hardcoded
 * ✅ SEMPRE: window.location.origin + pathname
 * 
 * @param {String} artistName - Nome do artista (pode ter pontos finais)
 */
function shareArtist(artistName) {
    const text = `Ouça todas as músicas de: ${artistName} no SanPlayer`;
    const url = `${window.location.origin}${window.location.pathname}?artistId=${safeEncode(artistName)}`;
    if (navigator.share) {
        navigator.share({
            title: 'SanPlayer',
            text: text,
            url: url,
        }).catch(() => {});
    } else {
        // Fallback: copiar para clipboard
        const shareText = `${text}\n${url}`;
        try { navigator.clipboard.writeText(shareText); } catch (e) {}
        alert('Artista copiado para compartilhamento!');
    }
}

/**
 * Compartilhar a música atual
 * Usa navigator.share (Web Share API) se disponível
 * Fallback: copia para clipboard
 * 
 * ✅ REFATORADO para usar nova arquitetura centralizada
 */
function shareMusic() {
    handleShare('player');
}

/**
 * 🔒 CONGELADO: Busca e carrega vídeos de um artista
 * 
 * ⚠️ CRÍTICO: Esta função é chamada em 2 contextos:
 * 1. Via params: selectArtist(params.get('artistId')) - JÁ decodificado
 * 2. Via histórico: selectArtist(historicoSalvo) - normal
 * 
 * REGRA OBRIGATÓRIA:
 * ❌ NUNCA: const artist_decoded = decodeURIComponent(artist);
 * ❌ NUNCA: normalize(decodeURIComponent(artist))
 * ✅ SEMPRE: Usar artist diretamente (já vem decodificado)
 * 
 * Por quê:
 * - params.get() JÁ decodifica automaticamente
 * - Dupla decodificação quebra nomes com %
 * - normalize() funciona direto com "Fábio Jr."
 * 
 * Exemplo de fluxo correto:
 * URL: ?artistId=F%C3%A1bio%20Jr%2E
 *   ↓ params.get('artistId')
 * "Fábio Jr." ← JÁ decodificado!
 *   ↓ selectArtist("Fábio Jr.")
 * normalize("Fábio Jr.") === normalize(video.artist) ✅
 * 
 * Se você ver: decodeURIComponent em selectArtist() → REMOVA IMEDIATAMENTE
 */
async function selectArtist(artist) {
    console.log('[SelectArtist] 🎯 INICIADO', { 
        artist,
        appInitComplete,
        playlistCacheSize: playlistCache.size,
        playlistsIndexLength: player.playlistsIndex.length
    });
    
    try {
        console.log('[SelectArtist] 📂 Carregando todas as playlists...');
        // Carregar todas as playlists para filtrar por artista
        const allPlaylists = await loadAllPlaylists();
        console.log('[SelectArtist] ✅ Playlists carregadas:', {
            total: allPlaylists.length,
            cacheSize: playlistCache.size
        });
        
        // 🔍 DEBUG: Listar primeiros artistas para validar dados
        const allArtists = new Set();
        allPlaylists.forEach(pl => {
            pl.videos?.forEach(v => allArtists.add(v.artist));
        });
        console.log('[SelectArtist] 🎤 Artistas únicos no sistema:', Array.from(allArtists).slice(0, 10));

        // 🔒 MATCHING ROBUSTO: Usa normalize() para comparar
        // Isso garante que "Fábio Jr." === "fabio jr" após normalização
        const artistVideos = [];
        allPlaylists.forEach(playlist => {
            playlist.videos?.forEach(video => {
                // ✅ FORMA CORRETA: normalize em ambos os lados
                const videoArtistNormalized = normalize(video.artist);
                const parameterNormalized = normalize(artist);
                const matches = videoArtistNormalized === parameterNormalized;
                
                // 🔍 DEBUG: Mostrar comparação para "Fábio Jr." 
                if (video.artist && (video.artist.includes('Fábio') || artist.includes('Fábio'))) {
                    console.log('[SelectArtist] 🔍 DEBUG comparação "Fábio Jr.":', {
                        videoArtist: video.artist,
                        videoNormalized: videoArtistNormalized,
                        parameterArtist: artist,
                        parameterNormalized: parameterNormalized,
                        matches: matches
                    });
                }
                
                if (matches) {
                    artistVideos.push({
                        ...video,
                        playlistName: playlist.name
                    });
                }
            });
        });

        console.log('[SelectArtist] ✅ Vídeos encontrados para artista:', {
            total: artistVideos.length,
            artistRequested: artist
        });

        // Validação: artista sem vídeos → fallback para home
        if (artistVideos.length === 0) {
            console.warn(`[SelectArtist] ❌ Nenhum vídeo encontrado para: "${artist}"`);
            showToast(`Nenhuma música encontrada: "${artist}"`);
            await loadHome(); // ✅ Garante UI válida
            window.location.replace(window.location.pathname); // Limpar URL inválida
            return;
        }

        // 🔒 CRITICAMENTE IMPORTANTE: 
        // Se está tocando algo, NÃO mudamos player.currentPlaylist
        // Se não está tocando, podemos mudar
        
        const estaTocanduAlgo = player.isPlaying || (player.shouldPlayOnReady && player.currentPlaylist);
        console.log('[SelectArtist] estaTocanduAlgo:', estaTocanduAlgo);
        
        if (!estaTocanduAlgo) {
            // Nada tocando → OK mudar contexto de reprodução
            console.log('[SelectArtist] Nada tocando - pode mudar contexto de reprodução');
            
            // Criar uma playlist temporária para o artista
            player.currentPlaylist = {
                name: artist,
                videos: artistVideos,
                id: `artist-${artist}`
            };
            player.currentPlaylistIndex = -1;
            player.currentVideoIndex = 0;
            player.playOrder = [...Array(artistVideos.length).keys()];
            player.originalOrder = [...player.playOrder];
            player.shouldPlayOnReady = true;
        } else {
            // Algo tocando → NUNCA muda player.currentPlaylist
            console.log('[SelectArtist] ✅ Música tocando - player.currentPlaylist PRESERVADO');
        }
        
        player.viewingFavorites = false;
        player.currentFavoriteId = undefined;
        
        console.log('[SelectArtist] Setando view para artista...');
        // 🧭 Centralizar toda mudança de sidebar em setView()
        setView({
            type: 'artist',
            data: {
                name: artist,
                videos: artistVideos,
                id: `artist-${artist}`
            }
        });
        
        console.log('[SelectArtist] Fechando modal de artistas...');
        closeArtistsModal();
        
        console.log('[SelectArtist] View de artista ativa. Histórico registrado automaticamente');
        sidebarHistory.updateButtons();
        
        console.log('[SelectArtist] Verificando se YouTube está pronto...');
        // Se era primeira vez (no init), carregar primeiro vídeo
        if (!player.ytReady) {
            console.log('[SelectArtist] YouTube não pronto - carregando primeiro vídeo...');
            loadFirstVideo();
        }
        
        console.log('[SelectArtist] Refreshing player UI...');
        refreshPlayerUI();
        
        console.log('[SelectArtist] Salvando estado...');
        // Persist current state
        saveCurrentState();
        
        console.log('[SelectArtist] ✅ COMPLETO - Visualização atualizada (música continua tocando se estava)');
    } catch (error) {
        console.error('[SelectArtist] ❌ ERRO CRÍTICO:', error, {
            message: error.message,
            stack: error.stack
        });
        showToast('Erro ao carregar artista');
        await loadHome(); // ✅ Garante UI válida no erro
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
    
    // ✨ CRÍTICO: Usar navigationContext.currentView se disponível (funciona com artista/favoritos)
    // Fallback para player.currentPlaylist para compatibilidade
    const displayData = navigationContext.currentView?.data || player.currentPlaylist;
    
    if (!displayData) {
        console.error('[loadPlaylistVideos] ❌ Nenhuma playlist ou view disponível');
        return;
    }
    
    const videos = displayData.videos || [];
    const playlistName = displayData.name || 'Lista';
    
    // Atualizar título
    const titlePl = container.querySelector('.title-pl');
    titlePl.textContent = `${playlistName}`;
    
    // Mostrar skeleton loading
    itemsContainer.innerHTML = '';
    for (let i = 0; i < videos.length; i++) {
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
        
        videos.forEach((video, index) => {
            const item = renderPlaylistItem(video, index);
            
            // ✨ CRÍTICO: Passar objeto VIDEO direto (não índice)
            // Funcionará mesmo quando a view for artista/favoritos
            item.addEventListener('click', (e) => {
                const target = e.target;
                if (target.closest('.kebab-btn')) return;
                playVideo(video);  // 👈 Usar video direto
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
        
        // Sincronizar estado favorito atual
        // Isso garante que o equalizer-icon apareça após modais serem fechados
        updatePlayingNowIndicator();
    });
}

function loadFirstVideo() {
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    loadVideo(video);
    updateCurrentVideoDisplay();
}

// ============================================================================
// MEDIA SESSION API - CONSOLIDADO
// ============================================================================
// Nota: updateMediaSession() é a ÚNICA função que controla metadados + handlers
// Chamada em loadVideo() logo após cueVideoById()

/**
 * ⏱️ ATUALIZAR POSIÇÃO DE REPRODUÇÃO (Media Session Position State)
 * 
 * Responsável por:
 * - Comunicar ao OS a duração, posição e velocidade da música
 * - Permitir que o OS mostre uma barra de progresso na lockscreen
 * 
 * Sincronizado a cada 500ms no intervalo de 250ms
 * 
 * @returns {void}
 */
function updateMediaSessionPosition() {
    // 🔒 SEGURANÇA: Verificar se browser suporta Media Session API
    if (!('mediaSession' in navigator) || !ytPlayer) {
        return;
    }

    try {
        // 📊 Obter valores do YouTube player
        const duration = ytPlayer.getDuration() || 0;
        const position = ytPlayer.getCurrentTime() || 0;
        const playbackRate = 1;

        // 📡 Enviar para Media Session
        navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: playbackRate,
            position: position
        });

        console.log('[MediaSession] 📊 Position updated', {
            duration: duration,
            position: position,
            playbackRate: playbackRate
        });
    } catch (error) {
        console.warn('[MediaSession] ⚠️ Erro ao atualizar position state:', error);
    }
}

// ============================================================================
// CARREGAR VÍDEO E ATUALIZAR INTERFACE
// ============================================================================

function loadVideo(video) {
    // Player container já existe no HTML, não precisa recriá-lo

    if (ytPlayer && typeof ytPlayer.cueVideoById === 'function') {
        ytPlayer.cueVideoById(video.id);
        // 🎵 MEDIA SESSION: Atualizar IMEDIATAMENTE após cueVideoById()
        // Isso garante que lockscreen mostra dados corretos ANTES do YouTube reafirmar controle
        updateMediaSession(video);
    } else if (window.YT && window.YT.Player && !ytPlayer && !ytPlayerInitialized) {
        onYouTubeIframeAPIReady();
    }

    updateCurrentVideoDisplay();
    // Sincronizar estado favorito atual
    syncFavoriteState(video);
    
    // Persist current state
    saveCurrentState();
    
    // 💾 NEW: Salvar vídeo/contexto no localStorage quando muda de música
    persistPlayerState();
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
        
        // 💾 NEW: Persistência throttled - salvar estado a cada 3s
        const now = Date.now();
        if (now - lastPersistTime > PERSIST_THROTTLE_MS) {
            persistPlayerState();
            lastPersistTime = now;
        }
        
        // 🎵 NEW: Media Session Position - sincronizar barra de notificação a cada 500ms
        if (now - lastMediaSessionUpdateTime > MEDIA_SESSION_THROTTLE_MS) {
            updateMediaSessionPosition();
            lastMediaSessionUpdateTime = now;
        }
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
    // 🔒 CONGELADO: Handler CRÍTICO dos eventos do YouTube player
    // ⚠️ ESTE É O ÚNICO LUGAR onde player.isPlaying deve ser atualizado
    // pelos eventos do YouTube (PLAYING, PAUSED, ENDED, CUED)
    //
    // NUNCA manipule player.isPlaying fora daqui EXCETO em playerPause()
    // que atualiza imediatamente porque é sempre seguro pausar.
    //
    // Fluxo de sincronização:
    // YouTube emite evento → onPlayerStateChange() → atualiza player.isPlaying
    //                                              → updatePlayPauseButton() → UI reflete estado
    //
    // Se remover ou alterar este handler, QUEBRARÁ TUDO:
    // - Botão ficará dessincronizado
    // - Estado não refletirá vídeo real
    // - Links compartilhados falharão
    // =================================================================
    
    const state = event.data;

    // YT.State: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (state === YT.PlayerState.PLAYING) {
        player.isPlaying = true;
        player.currentDuration = ytPlayer.getDuration();
        player.currentTime = ytPlayer.getCurrentTime();
        updatePlayPauseButton();
        updateProgressBar();
        updateActivePlaylistItem();
        updatePlayingIndicatorAnimationState();
        // 💾 NOTA: persistPlayerState() é chamada pelo throttle em setInterval()
        // NÃO chamar aqui para evitar spam desnecessário
    } else if (state === YT.PlayerState.PAUSED) {
        player.isPlaying = false;
        player.currentTime = ytPlayer.getCurrentTime();
        updatePlayPauseButton();
        updateProgressBar();
        updateActivePlaylistItem();
        updatePlayingIndicatorAnimationState();
        // 💾 NOTA: persistPlayerState() é chamada pelo throttle em setInterval()
        // NÃO chamar aqui para evitar spam desnecessário
    } else if (state === YT.PlayerState.CUED) {
        // Player entrou em CUED após cueVideoById()
        // 💾 NEW: Se restaurando do localStorage, aplicar seek + auto-play
        if (player._restoreTime !== undefined && player._restoreTime > 0) {
            ytPlayer.seekTo(player._restoreTime);
            console.log('[Restore] ⏱️ Tempo restaurado:', player._restoreTime);
            player._restoreTime = undefined; // Limpar para não repetir
        }
        
        // Se for restauração com auto-play, fazer play agora
        if (player._restoreAutoPlay === true) {
            player.shouldPlayOnReady = true;
            console.log('[Restore] ▶️ Auto-play ativado');
            player._restoreAutoPlay = undefined; // Limpar
        }
        
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
        updatePlayingIndicatorAnimationState();

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
    // 🔒 CONGELADO: Comando para YouTube player iniciar playback
    // Sincronizar estado favorito atual
    // 
    // O estado DEVE ser alterado APENAS por onPlayerStateChange(PLAYING)
    // quando YouTube CONFIRMA que o vídeo está tocando.
    // Isso garante sincronização entre UI e YouTube player.
    //
    // Fluxo correto:
    // 1. ytPlayer.playVideo() ← chamado aqui
    // 2. YouTube emite PLAYING event
    // 3. onPlayerStateChange() define player.isPlaying = true
    // 4. updatePlayPauseButton() renderiza "pause" icon
    //
    // Se mudar esse fluxo, o botão ficará DESSINCRONIZADO do vídeo.
    // ================================================================
    
    if (player.ytReady && ytPlayer) {
        ytPlayer.playVideo();
    }
}

function playerPause() {
    // 🔒 CONGELADO: Comando para pausar o YouTube player
    // Sincronizar estado favorito atual
    // 
    // Diferença de playerPlay():
    // - playerPlay() espera confirmação do YouTube (online)
    // - playerPause() atualiza state imediatamente porque é sempre seguro pausar
    //
    // Fluxo:
    // 1. ytPlayer.pauseVideo() ← comando YouTube
    // 2. player.isPlaying = false ← atualiza state imediatamente
    // 3. updatePlayPauseButton() ← renderiza "play" icon
    //
    // Se remover qualquer uma dessas linhas, é BUG GARANTIDO.
    // ================================================================
    
    if (player.ytReady && ytPlayer) {
        ytPlayer.pauseVideo();
    }
    player.isPlaying = false;
    updatePlayPauseButton();
    updateProgressBar();
}


function updateCurrentVideoDisplay() {
    // ⚠️ Validação defensiva: evitar erro se currentPlaylist ainda não está pronto
    if (!player.currentPlaylist || !player.currentPlaylist.videos) {
        return;
    }
    
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
    console.log('[PlayVideoByIndex] INICIADO', {
        index,
        playlistName: player.currentPlaylist?.name,
        playlistLength: player.currentPlaylist?.videos.length
    });
    
    // ⚠️ CRÍTICO: Validar que o índice é válido para a PLAYLIST ATUAL
    if (!player.currentPlaylist) {
        console.error('[PlayVideoByIndex] ❌ currentPlaylist é null/undefined');
        return;
    }
    
    if (index < 0 || index >= player.currentPlaylist.videos.length) {
        console.error('[PlayVideoByIndex] ❌ Índice fora da lista', {
            index,
            playlistLength: player.currentPlaylist.videos.length,
            validRange: `0-${player.currentPlaylist.videos.length - 1}`
        });
        return;
    }
    
    player.currentVideoIndex = index;
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    
    // 🔒 GARANTIR: Música não toca automáticamente ao clicar em item
    // Usuário decide quando clica em play/pause
    player.shouldPlayOnReady = false;
    
    console.log('[PlayVideoByIndex] Carregando vídeo', {
        videoIndex: index,
        videoTitle: video.title,
        videoArtist: video.artist
    });
    
    loadVideo(video);
    updateActivePlaylistItem();
    
    console.log('[PlayVideoByIndex] ✅ Completo');
}

/**
 * ✨ NOVO: Toca um vídeo passando o OBJETO direto (não índice)
 * 
 * Funciona MESMO quando a sidebar está exibindo artista/favoritos
 * porque não depende de índice na playlist atual
 * 
 * @param {Object} video - {id, title, artist, ...}
 */
function playVideo(video) {
    if (!video || !video.id) {
        console.warn('[PlayVideo] ❌ Vídeo inválido ou sem ID');
        return;
    }
    
    console.log('[PlayVideo] INICIADO', {
        videoId: video.id,
        videoTitle: video.title,
        videoArtist: video.artist
    });
    
    // 🔒 REFATORADO: Usar getCurrentViewVideos() como fonte única
    // Encapsula toda a lógica de "qual view o usuário está vendo"
    const videos = getCurrentViewVideos();
    
    if (videos.length === 0) {
        console.error('[PlayVideo] ❌ Nenhum vídeo disponível na view atual');
        return;
    }
    
    // Garantir que player.currentPlaylist aponta para a lista correta
    const viewName = navigationContext.currentView?.data?.name || player.currentPlaylist?.name || 'Custom';
    player.currentPlaylist = {
        name: viewName,
        videos: videos
    };
    
    // 🔒 GUARDRAIL: Modificando estado crítico (currentVideoIndex)
    // ⚠️ REGRA: Após alterar currentVideoIndex, SEMPRE chamar updateActivePlaylistItem()
    player.currentVideoIndex = videos.findIndex(v => v.id === video.id);
    
    if (player.currentVideoIndex === -1) {
        console.warn('[PlayVideo] ⚠️ Vídeo não encontrado na visualização atual', {
            videoId: video.id,
            playlistLength: player.currentPlaylist.videos.length
        });
        // Fallback: usar o video que foi passado mesmo assim
        player.currentVideoIndex = 0;
    }
    
    console.log('[PlayVideo] Índice encontrado:', player.currentVideoIndex);
    
    // 🔒 GARANTIR: NÃO toca automáticamente ao clicar
    // Usuário vai clicar em play/pause para controlar
    player.shouldPlayOnReady = false;
    
    loadVideo(video);
    updateActivePlaylistItem();
    
    console.log('[PlayVideo] ✅ Completo');
}

function updateActivePlaylistItem() {
    const cTitle = document.querySelector('.current-details .c-title');
    if (!cTitle) return;

    // Detectar se o texto transborda
    checkIfTitleNeedsTruncation(cTitle);
    
    // Atualizar indicador visual de "tocando agora"
    updatePlayingNowIndicator();
}

/**
 * 🔒 REFATORADO: Agora usa getCurrentPlayingVideo() como fonte única de verdade
 * 
 * Atualiza o indicador visual de "tocando agora" no item conrreto
 * - Encontra sempre pelo YouTube ID (único e imutável)
 * - Funciona em qualquer view (playlist, favoritos, artista, etc)
 * 
 * ⚠️ PROTEGIDO: A lógica "qual vídeo está tocando" está centralizada em getCurrentPlayingVideo()
 * Não duplicar lógica aqui!
 */
function updatePlayingNowIndicator() {
    // Remover indicador de todas as faixas
    const allIndicatorContainers = document.querySelectorAll('.indicator-container');
    allIndicatorContainers.forEach(container => {
        container.innerHTML = '';
        container.classList.remove('playing');
    });
    
    // 🔒 FONTE ÚNICA DE VERDADE: Obter vídeo que está tocando
    const currentVideo = getCurrentPlayingVideo();
    if (!currentVideo || !currentVideo.id) {
        console.warn('[updatePlayingNowIndicator] ⚠️ Nenhum vídeo tocando');
        return;
    }
    
    // 🔍 PROCURAR PELO YOUTUBE ID (único e imutável)
    const activeItem = document.querySelector(
        `.playlist-item[data-video-id="${currentVideo.id}"]`
    );
    
    // Adicionar indicador ao item ativo APENAS se encontrado
    if (activeItem) {
        const indicatorContainer = activeItem.querySelector('.indicator-container');
        if (indicatorContainer) {
            indicatorContainer.appendChild(createPlayingIndicator());
            // Usar classe 'playing' para controlar animation-play-state
            if (player.isPlaying) {
                indicatorContainer.classList.add('playing');
            }
        }
        
        console.log('[updatePlayingNowIndicator] ✅ Indicador atualizado', {
            videoId: currentVideo.id,
            videoTitle: currentVideo.title,
            viewMode: player.viewingFavorites ? 'favoritos' : (navigationContext.currentView?.type || 'playlist')
        });
    } else {
        // � SILENCIOSO: Item não encontrado (normal quando vídeo está em view diferente)
        // Não logar para evitar spam no console quando navegando entre views
    }
}

/**
 * 🔒 REFATORADO: Agora usa getCurrentPlayingVideo() como fonte única de verdade
 * 
 * Atualiza estado de pausa/reprodução (animação) do indicador
 * Chamado quando player muda entre PLAYING e PAUSED
 * 
 * ⚠️ PROTEGIDO: A lógica "qual vídeo está tocando" está centralizada.
 * Não duplicar a lógica de descoberta aqui!
 */
function updatePlayingIndicatorAnimationState() {
    // 🔒 FONTE ÚNICA DE VERDADE: Obter vídeo que está tocando
    const currentVideo = getCurrentPlayingVideo();
    if (!currentVideo || !currentVideo.id) {
        console.warn('[updatePlayingIndicatorAnimationState] ⚠️ Nenhum vídeo tocando');
        return;
    }
    
    // Apenas atualizar animação se encontrou o indicador (baseado em video ID)
    const indicatorContainer = document.querySelector(
        `.playlist-item[data-video-id="${currentVideo.id}"] .indicator-container`
    );
    
    if (indicatorContainer) {
        if (player.isPlaying) {
            indicatorContainer.classList.add('playing');
        } else {
            indicatorContainer.classList.remove('playing');
        }
        
        console.log('[updatePlayingIndicatorAnimationState] ✅ Animação sincronizada', {
            videoId: currentVideo.id,
            videoTitle: currentVideo.title,
            isPlaying: player.isPlaying
        });
    } else {
        return;
    }
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
    // 🔒 CONGELADO: Função crítica que sincroniza UI com YouTube player
    // ⚠️ NÃO MODIFIQUE O COMPORTAMENTO
    // 
    // Essa é a ÚNICA função que deve responder ao clique do botão play/pause.
    // Ela garante:
    // 1. Sincronização com YouTube player (playerPlay/playerPause)
    // 2. Atualização correta de player.isPlaying
    // 3. Renderização do ícone (updatePlayPauseButton)
    // 
    // Se remover ou alterar, QUEBRARÁ:
    // - Estado do botão play/pause
    // - Sincronização entre UI e vídeo
    // - Persistência de estado
    // ================================================================
    
    if (player.isPlaying) {
        playerPause();
    } else {
        playerPlay();
    }
}

function nextVideo() {
    // 🔒 CONGELADO: Navegação para próximo vídeo
    // ⚠️ NÃO MODIFIQUE O COMPORTAMENTO ou ordem das operações
    //
    // Crítico para:
    // - Shuffle: randomizar próximo vídeo corretamente
    // - Normal: navegar sequencialmente com wrap-around
    // - Favoritos: sincronizar currentFavoriteId com currentVideoIndex
    // - Auto-play: sinalizar via shouldPlayOnReady para tocar automaticamente
    //
    // Ordem IMPORTANTE:
    // 1. Calcular nextVideoIndex (shuffle ou sequencial)
    // 2. Sinalizar shouldPlayOnReady = true
    // 3. Carregar vídeo novo
    // 4. Atualizar UI (favoritos)
    //
    // Se mudar a ordem, QUEBRARÁ:
    // - Auto-play ao final da playlist/repeat
    // - Sincronização de favoritos
    // - Estado persistence
    // =================================================================
    
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
    // 🔒 CONGELADO: Navegação para vídeo anterior
    // ⚠️ NÃO MODIFIQUE O COMPORTAMENTO ou ordem das operações
    //
    // Espelho de nextVideo() com:
    // - Cálculo inverso com wrap-around (volta ao final se estiver no início)
    // - Mesma sincronização de shouldPlayOnReady, favoritos, UI
    //
    // Se mudar a ordem ou lógica, QUEBRARÁ:
    // - Navegação anterior (volta ao fim em vez de ir para anterior)
    // - Sincronização de favoritos
    // - Estado persistence
    // =================================================================
    
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
    // 🔒 CONGELADO: Toggle de modo shuffle
    // ⚠️ NÃO MODIFIQUE A LÓGICA de randomização ou ordem
    //
    // Crítico para:
    // - player.isShuffle: flag que nextVideo() lê para randomizar
    // - player.playOrder: array de índices (usado ou não, mantém coerência)
    // - player.originalOrder: cópia da ordem original para restaurar
    //
    // Se mudar o algoritmo de shuffle:
    // - nextVideo() pode deixar de respeitar a ordem
    // - Favoritos podem ficar dessincronizados
    // - Estado puede ficar inconsistente
    // =================================================================
    
    player.isShuffle = !player.isShuffle;

    if (player.isShuffle) {
        player.playOrder = [...player.playOrder].sort(() => Math.random() - 0.5);
    } else {
        player.playOrder = [...player.originalOrder];
    }

    updateShuffleButton();
}

function toggleRepeat() {
    // 🔒 CONGELADO: Ciclo de modos repeat (off → one → all → off)
    // ⚠️ NÃO MODIFIQUE A ORDEM dos modos ou a lógica
    //
    // Sincronizar estado favorito atual
    // 0 = sem repeat (toca até o fim da playlist)
    // 2 = repeat one (repete música atual)
    // 1 = repeat all (volta ao início da playlist)
    //
    // Usado por onPlayerStateChange(ENDED) para decidir próxima ação:
    // - if (repeatMode === 2) → seekTo(0) e playVideo()
    // - else → nextVideo() (que vai para começar se for fim)
    //
    // Se mudar o ciclo:
    // - nextVideo()/previousVideo() podem ficar confusos
    // - Auto-play pode ficar incorreto
    // - Persistência pode salvar valores inválidos
    // =================================================================
    
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
    // 🔒 CONGELADO: Este comportamento é CRÍTICO e NÃO PODE MUDAR
    // O ícone DEVE refletir EXATAMENTE o estado de player.isPlaying
    // 
    // Dependências:
    // - player.isPlaying DEVE ser true APENAS quando YouTube está tocando
    // - player.isPlaying DEVE ser false na inicialização (botão = play_arrow)
    // - Qualquer mudança afeta: Links compartilhados, UI sync, persistência
    // 
    // Se vir bug aqui, NÃO MODIFIQUE esta função.
    // Procure pelo local que está setando player.isPlaying incorretamente.
    // ================================================================
    
    const btn = document.querySelector('.btn-play-pause');
    const use = btn.querySelector('svg use');
    use.setAttribute('href', 
        player.isPlaying ? '/icons/package.svg#control-pause' : '/icons/package.svg#control-play'
    );
}

function updateRepeatButton() {
    const btn = document.querySelector('.block-controls button:nth-child(5)');
    const use = btn.querySelector('svg use');
    
    if (player.repeatMode === 0) {
        use.setAttribute('href', '/icons/package.svg#control-repeat');
        btn.classList.remove('repeat-one-active');
    } else if (player.repeatMode === 1) {
        use.setAttribute('href', '/icons/package.svg#control-repeat');
        btn.classList.remove('repeat-one-active');
    } else {
        use.setAttribute('href', '/icons/package.svg#control-repeat-one');
        btn.classList.add('repeat-one-active');
    }
}

function updateShuffleButton() {
    const btn = document.querySelector('.block-controls button:nth-child(1)');
    const use = btn.querySelector('svg use');
    
    if (player.isShuffle) {
        use.setAttribute('href', '/icons/package.svg#control-shuffle-active');
    } else {
        use.setAttribute('href', '/icons/package.svg#control-shuffle');
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

// ============================================================================
// FAVORITOS
// ============================================================================

/**
 * 🔒 CENTRALIZADO: Atualiza ícone de favorito de forma profissional
 * 
 * ✅ CORRIGE:
 * - Mismatch entre href moderno vs xlink:href legado
 * - Sempre usa caminho absoluto consistente
 * - Elimina duplicação de lógica
 * 
 * @param {SVGUseElement} useElement - Elemento <use> do SVG
 * @param {Boolean} isFavorite - true = filled, false = outlined
 */
function setFavoriteIcon(useElement, isFavorite) {
    if (!useElement) return;
    
    const ICON_PATH = '/icons/package.svg';
    const iconId = isFavorite ? 'favorite-filled-case' : 'favorite-outlined-case';
    const href = `${ICON_PATH}#${iconId}`;
    
    // ✅ SEMPRE usar setAttribute (moderno) em vez de setAttributeNS (legado)
    useElement.setAttribute('href', href);
    
    // ✅ Remover xlink:href para evitar comportamento híbrido em browsers antigos
    useElement.removeAttribute('xlink:href');
}

/**
 * 🔒 CENTRALIZADO: Atualiza ícone de favorito de forma profissional
 * 
 * ✅ CORRIGE:
 * - Mismatch entre href moderno vs xlink:href legado
 * - Sempre usa caminho absoluto consistente
 * - Elimina duplicação de lógica
 * 
 * @param {SVGUseElement} useElement - Elemento <use> do SVG
 * @param {Boolean} isFavorite - true = filled, false = outlined
 */
function setFavoriteIcon(useElement, isFavorite) {
    if (!useElement) return;
    
    const ICON_PATH = '/icons/package.svg';
    const iconId = isFavorite ? 'favorite-filled-case' : 'favorite-outlined-case';
    const href = `${ICON_PATH}#${iconId}`;
    
    // ✅ SEMPRE usar setAttribute (moderno) em vez de setAttributeNS (legado)
    useElement.setAttribute('href', href);
    
    // ✅ Remover xlink:href para evitar comportamento híbrido em browsers antigos
    useElement.removeAttribute('xlink:href');
}

/**
 * Sistema de Partículas Nativo - Explosão de Corações ao Favoritar
 * Microinteração de app nativo (Samsung/One UI)
 * 
 * Características:
 * - Cada partícula com variação independente (ângulo, distância, escala, rotação)
 * - Movimento natural com curva suave
 * - Stagger: 20-60ms de atraso entre partículas
 * - Transform-only: sem reflow, apenas transform + opacity
 * - Duração: 600-900ms
 * - Cleanup automático ao fim da animação
 * 
 * @param {HTMLElement} button - Botão de favoritar
 */
function createParticleExplosion(button) {
    if (!button) return;
    
    // Criar container para as partículas (posicionado relativo ao botão)
    const container = document.createElement('div');
    container.className = 'particle-container';
    button.classList.add('particle-container-parent');
    button.appendChild(container);
    
    // Configuração de partículas
    const particleCount = 8 + Math.floor(Math.random() * 5); // 8-12 partículas
    const baseDelay = 0;
    const delayIncrement = 30 + Math.random() * 30; // 30-60ms stagger
    
    for (let i = 0; i < particleCount; i++) {
        // Criar partícula
        const particle = document.createElement('span');
        particle.className = 'heart-particle';
        particle.textContent = '💜';
        
        // ===== VARIAÇÃO INDEPENDENTE POR PARTÍCULA =====
        
        // 1. Ângulo de dispersão (0-360°) com variação aleatória
        const baseAngle = (360 / particleCount) * i;
        const angleVariation = (Math.random() - 0.5) * 60; // ±30°
        const angle = baseAngle + angleVariation;
        const angleRad = (angle * Math.PI) / 180;
        
        // 2. Distância de dispersão aleatória (60-140px)
        const distance = 60 + Math.random() * 80;
        
        // 3. Coordenadas finais via trigonometria
        const endX = Math.cos(angleRad) * distance;
        const endY = Math.sin(angleRad) * distance - 20; // Sobe naturalmente
        
        // 4. Escala inicial e final (variável)
        const scaleStart = 0.8 + Math.random() * 0.5; // 0.8-1.3
        const scaleEnd = 0.1 + Math.random() * 0.2; // 0.1-0.3
        
        // 5. Rotação aleatória (0-360°)
        const rotation = Math.random() * 360;
        
        // 6. Duração e delay (stagger)
        const duration = 600 + Math.random() * 300; // 600-900ms
        const delay = baseDelay + i * delayIncrement;
        
        // 7. Easing customizado para movimento natural
        const easing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // ease-out smooth
        
        // ===== CONFIGURAR VARIÁVEIS CSS =====
        particle.style.setProperty('--end-x', `${endX}px`);
        particle.style.setProperty('--end-y', `${endY}px`);
        particle.style.setProperty('--scale-start', scaleStart);
        particle.style.setProperty('--scale-end', scaleEnd);
        particle.style.setProperty('--rotation', `${rotation}deg`);
        particle.style.setProperty('--particle-duration', `${duration}ms`);
        particle.style.setProperty('--particle-delay', `${delay}ms`);
        particle.style.setProperty('--particle-timing', easing);
        
        // Adicionar ao container
        container.appendChild(particle);
        
        // ===== CLEANUP AUTOMÁTICO =====
        const handleAnimationEnd = () => {
            particle.removeEventListener('animationend', handleAnimationEnd);
            particle.remove();
            
            // Se foi a última partícula, remover o container
            if (container.children.length === 0) {
                container.remove();
                button.classList.remove('particle-container-parent');
            }
        };
        
        particle.addEventListener('animationend', handleAnimationEnd, { once: true });
    }
}

/**
 * 🔥 ORIGINAL: Botão de favoritar dos controles (header)
 * 
 * Sincroniza:
 * - Estado visual do botão na UI
 * - Lista de favoritos
 * - Todos os items da sidebar (se exibida)
 */
function toggleFavorite(event) {
    if (!player.currentPlaylist) return;
    
    const video = player.currentPlaylist.videos[player.currentVideoIndex];
    if (!video || !video.id) {
        console.error('[Favoritos] Vídeo ou ID do vídeo não encontrado');
        return;
    }
    
    const button = document.getElementById('favButton');
    
    // 🔥 USAR video.id (YouTube ID) como identificador único
    // Isso resolve o problema de duplicatas quando a track é tocada de contextos diferentes
    const favoriteId = video.id;
    
    const index = player.favorites.findIndex(fav => fav.id === favoriteId);
    
    if (index > -1) {
        // ❌ Remover de favoritos
        console.log('[Favoritos] Removendo favorito:', favoriteId);
        player.favorites.splice(index, 1);
        
        if (button) {
            button.classList.remove('active');
            button.setAttribute('aria-pressed', 'false');
            const use = button.querySelector('svg use');
            setFavoriteIcon(use, false); // ✅ USAR FUNÇÃO CENTRALIZADA
        }
        
        // ✨ NOVO: Atualizar ícone em TODOS os items da sidebar que mostram esta música
        const sidebarItems = document.querySelectorAll(`.playlist-item[data-video-id="${favoriteId}"]`);
        sidebarItems.forEach(item => {
            const itemFavBtn = item.querySelector('.item-favorite-btn');
            const itemFavUse = itemFavBtn?.querySelector('svg use');
            setFavoriteIcon(itemFavUse, false); // ✅ USAR FUNÇÃO CENTRALIZADA
            if (itemFavBtn) {
                itemFavBtn.classList.remove('active');
            }
        });
        
        // Re-renderizar lista de favoritos (sempre, se estiver visualizando)
        if (player.viewingFavorites) {
            displayFavoritesList();
        }
    } else {
        // ✅ Adicionar aos favoritos
        // Validar duplicação (profissional: nunca confiar em cliques múltiplos)
        const alreadyExists = player.favorites.some(fav => fav.id === favoriteId);
        if (alreadyExists) {
            console.warn('[Favoritos] Item já está nos favoritos:', favoriteId);
            return;
        }
        
        console.log('[Favoritos] Adicionando favorito:', favoriteId);
        
        player.favorites.push({
            id: favoriteId,
            videoId: video.id,
            title: video.title,
            artist: video.artist || 'Desconhecido',
            video: video,
            playlist: player.currentPlaylist.name,
        });
        
        if (button) {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
            const use = button.querySelector('svg use');
            setFavoriteIcon(use, true); // ✅ USAR FUNÇÃO CENTRALIZADA
            // Dispara explosão de partículas APENAS ao ADICIONAR
            createParticleExplosion(button);
        }
        
        // ✨ NOVO: Atualizar ícone em TODOS os items da sidebar que mostram esta música
        const sidebarItems = document.querySelectorAll(`.playlist-item[data-video-id="${favoriteId}"]`);
        sidebarItems.forEach(item => {
            const itemFavBtn = item.querySelector('.item-favorite-btn');
            const itemFavUse = itemFavBtn?.querySelector('svg use');
            setFavoriteIcon(itemFavUse, true); // ✅ USAR FUNÇÃO CENTRALIZADA
            if (itemFavBtn) {
                itemFavBtn.classList.add('active');
            }
        });
        
        // Re-renderizar lista de favoritos (sempre, se estiver visualizando)
        if (player.viewingFavorites) {
            displayFavoritesList();
        }
    }
    
    // Dispara animação de pulse
    if (button) {
        button.classList.remove('pulse');
        // Force reflow para resetar a animação
        void button.offsetWidth;
        button.classList.add('pulse');
    }
    
    saveFavorites();
    // ✅ REMOVER: updateFavoriteButton() causava SOBRESCRITA imediata
    // Não chamar syncFavoriteState() após atualizar estado - já foi feito acima!
}

/**
 * 🔥 SINCRONIZAÇÃO PROFISSIONAL: Sempre derivar UI do estado real
 * Chamada sempre que carregar uma música para sincronizar o botão com favoritos reais
 */
function syncFavoriteState(track) {
    if (!track || !track.id) {
        console.warn('[Favoritos] Track ou ID não disponível');
        return;
    }
    
    // Sincronizar estado favorito atual
    // Isso garante sincronização correta independente de onde a track foi tocada
    // (playlist, busca, favoritos, artista, etc.)
    const favoriteId = track.id;
    
    console.log('[Favoritos] Sincronizando estado para track:', favoriteId);
    
    const isFavorite = player.favorites.some(fav => fav.id === favoriteId);
    
    console.log('[Favoritos] Resultado da busca:', { favoriteId, isFavorite, totalFavoritos: player.favorites.length });
    
    // Atualizar UI baseado no estado real
    const button = document.getElementById('favButton');
    const use = button?.querySelector('svg use');
    
    // ✅ USAR FUNÇÃO CENTRALIZADA para evitar mismatch de atributos
    setFavoriteIcon(use, isFavorite);
    
    if (button) {
        button.classList.toggle('active', isFavorite);
        button.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    }
}

function updateFavoriteButton() {
    const video = player.currentPlaylist?.videos[player.currentVideoIndex];
    if (!video) return;
    
    // Derivar UI do estado real de favoritos
    syncFavoriteState(video);
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
    
    console.log('[Favorites] displayFavoritesList() CHAMADO');
    
    // 🔒 GUARDRAIL: Modificando estado crítico (viewingFavorites + currentFavoriteId)
    // ⚠️ REGRA: Após alterar viewingFavorites ou currentFavoriteId, SEMPRE chamar updatePlayingNowIndicator()
    // ⚠️ NÃO use lógica local aqui - use getCurrentPlayingVideo() para teste
    player.viewingFavorites = true;
    
    // Atualizar contexto: guardamos que visualizando favoritos mas preservamos contexto original
    // 🧭 Usar setView() para centralizar a mudança e registrar no histórico automaticamente
    setView({
        type: 'favorites',
        data: player.favorites
    });
    
    console.log('[Favorites] Contexto de navegação atualizado e histórico registrado automaticamente');
    sidebarHistory.updateButtons();
    
    console.log('[Favorites] Contexto de navegação atualizado', navigationContext);
    // Sincronizar estado favorito atual
    // Isso garante que o equalizer apareça no item correto
    if (player.currentPlaylist?.videos?.[player.currentVideoIndex]) {
        const currentVideo = player.currentPlaylist.videos[player.currentVideoIndex];
        const matchingFavorite = player.favorites.find(fav => fav.video.id === currentVideo.id);
        if (matchingFavorite) {
            player.currentFavoriteId = matchingFavorite.id;
        } else {
            // ✅ Se NÃO está nos favoritos, resetar para não mostrar indicador
            player.currentFavoriteId = null;
        }
    }
    
    // Persist current state
    saveCurrentState();
    
    // Atualizar título da seleção de favoritos
    const titlePl = container.querySelector('.title-pl');
    titlePl.textContent = `Favoritos (${player.favorites.length})`;
    
    // Limpar itens antigos
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
        
        // Sincronizar estado favorito atual
        updatePlayingNowIndicator();
    });
}

// ============================================================================
// COMPARTILHAR
// ============================================================================
// BUSCA
// ============================================================================

function setupMobileSearch() {
    const searchInput = document.getElementById('searchInput');
    const headerSearch = document.querySelector('.header-search');
    const btnSearchMobile = document.querySelector('.btn-search-mobile');
    const searchModal = document.getElementById('searchModal');
    let searchTimeout;
    
    // Mobile: mostrar barra ao clicar no ícone de busca
    if (btnSearchMobile) {
        btnSearchMobile.addEventListener('click', () => {
            headerSearch.classList.add('show-search');
            searchInput.focus();
        });
    }
    
    // Fechar barra ao perder foco (se vazio)
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
    
    // Fechar barra ao selecionar um resultado (no mobile)
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');
            if (item && window.innerWidth <= 1023) {
                // Limpar pesquisa e fechar
                searchInput.value = '';
                searchModal.classList.remove('show');
                headerSearch.classList.remove('show-search');
            }
        });
    }
}

async function searchMusics(query) {
    try {
        const results = [];
        const normalizedQuery = normalize(query);

        // Carregar todas as playlists para busca
        const allPlaylists = await loadAllPlaylists();

        allPlaylists.forEach((playlist, playlistIndex) => {
            playlist.videos?.forEach((video, videoIndex) => {
                // Usar normalize para comparação tolerante a acentos
                const normalizedTitle = normalize(video.title);
                const normalizedArtist = normalize(video.artist);
                
                if (
                    normalizedTitle.includes(normalizedQuery) ||
                    normalizedArtist.includes(normalizedQuery)
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
                // Sincronizar estado favorito atual
                // Isso garante que o equalizer aparece no vídeo selecionado, não no primeiro
                try {
                    const playlistMeta = player.playlistsIndex[result.playlistIndex];
                    if (!playlistMeta?.url) return;
                    
                    const playlist = await loadPlaylistByUrl(playlistMeta.url);
                    if (!playlist) return;
                    
                    // 🔥 Setar TUDO corretamente ANTES de renderizar lista
                    player.currentPlaylist = playlist;
                    player.currentPlaylistIndex = result.playlistIndex;
                    player.currentVideoIndex = result.videoIndex;  // ✅ Índice correto AGORA
                    player.shouldPlayOnReady = true;
                    player.viewingFavorites = false;
                    player.playOrder = [...Array(playlist.videos.length).keys()];
                    player.originalOrder = [...player.playOrder];
                    
                    // Sincronizar estado favorito atual
                    player.currentFavoriteId = undefined;
                    
                    // Renderizar lista com índice correto já setado
                    updatePlaylistCardsInModal();
                    closePlaylistsModal();
                    loadPlaylistVideos();
                    
                    // Carregar o vídeo correto (não o primeiro!)
                    const video = player.currentPlaylist.videos[player.currentVideoIndex];
                    loadVideo(video);
                    updateActivePlaylistItem();
                    
                    // Persist current state
                    saveCurrentState();
                    
                    // Fechar modal de busca
                    modal.classList.remove('show');
                } catch (error) {
                    console.error('Erro ao tocar música da busca:', error);
                }
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
    // ============================================================================
    // ⚠️ AVISO GERAL: Seção de event listeners críticos
    // ============================================================================
    // Os controles do player (play/pause, anterior, próximo, shuffle, repeat)
    // têm comportamentos CONGELADOS e PROTEGIDOS contra modificações futuras.
    //
    // Procure pela seção "CONTROLES DO PLAYER - CONGELADO CONTRA MODIFICAÇÕES"
    // nesta função para ver os comentários de proteção específicos.
    //
    // ⛔ SE PRECISAR ADICIONAR UMA NOVA FUNCIONALIDADE:
    //    NÃO modifique os event listeners existentes
    //    CRIE novos listeners ou novos botões ao invés disso
    // ============================================================================
    
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
    
    // 🧭 NOVO: Botões de navegação da sidebar (Back/Forward)
    const sidebarBackBtn = document.getElementById('sidebarBackBtn');
    if (sidebarBackBtn) {
        sidebarBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebarHistory.goBack();
        });
    }
    
    const sidebarForwardBtn = document.getElementById('sidebarForwardBtn');
    if (sidebarForwardBtn) {
        sidebarForwardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebarHistory.goForward();
        });
    }
    
    // Modal de busca
    document.getElementById('closeSearchModal').addEventListener('click', () => {
        closeModalWithAnimation('searchModal');
    });

    document.getElementById('searchModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeModalWithAnimation('searchModal');
        }
    });

    // ============================================================================
    // 🔍 FILTRO DE BUSCA NOS MODAIS - Novo padrão de navegação
    // ============================================================================
    // Listener para o input de busca do modal de Playlists
    const playlistSearchInput = document.getElementById('playlistSearchInput');
    if (playlistSearchInput) {
        playlistSearchInput.addEventListener('input', (e) => {
            filterPlaylistCards(e.target.value);
        });
        
        // Limpar filtro ao fechar o modal
        const playlistModal = document.getElementById('playlistModal');
        if (playlistModal) {
            playlistModal.addEventListener('auxClick', () => {
                playlistSearchInput.value = '';
            });
        }
    }
    
    // Listener para o input de busca do modal de Artistas
    const artistSearchInput = document.getElementById('artistSearchInput');
    if (artistSearchInput) {
        artistSearchInput.addEventListener('input', (e) => {
            filterArtistCards(e.target.value);
        });
        
        // Limpar filtro ao fechar o modal
        const artistsModal = document.getElementById('artistsModal');
        if (artistsModal) {
            artistsModal.addEventListener('auxClick', () => {
                artistSearchInput.value = '';
            });
        }
    }
    
    // ============================================================================
    // 🔒 CONTROLES DO PLAYER - CONGELADO CONTRA MODIFICAÇÕES
    // ============================================================================
    // Sincronizar estado favorito atual
    // NÃO MODIFIQUE sob nenhuma circunstância:
    // - btnPlayPause: deve refletir EXATAMENTE o estado de player.isPlaying
    // - btnPrevious/btnNext: comportamento de navegação não deve mudar
    // - btnShuffle/btnRepeat: estados visuais e lógica são DEPENDENTES
    // 
    // Qualquer mudança aqui pode QUEBRAR:
    // → Estado de sincronização play/pause
    // → Navegação de playlist
    // → Persistência de estado
    // → Links compartilhados
    //
    // Se precisar adicionar funcionalidades: CRIE NOVOS BOTÕES, não modifique estes.
    // ============================================================================
    
    const controls = document.querySelector('.block-controls');
    const btnShuffle = controls.children[0];
    const btnPrevious = controls.children[1];
    const btnPlayPause = controls.children[2];
    const btnNext = controls.children[3];
    const btnRepeat = controls.children[4];
    
    // 🔥 ESTES LISTENERS SÃO CRÍTICOS - NÃO REMOVA
    btnShuffle.addEventListener('click', toggleShuffle);
    btnPrevious.addEventListener('click', previousVideo);
    btnPlayPause.addEventListener('click', togglePlayPause);  // Sincroniza com player.isPlaying
    btnNext.addEventListener('click', nextVideo);
    btnRepeat.addEventListener('click', toggleRepeat);
    
    // 🔒 BARRA DE PROGRESSO - HITBOX EXPANDIDA PARA MOBILE (40px)
    // ============================================================================
    // Sincronizar estado favorito atual
    // mas os eventos seguem o padrão normal. A zona de toque agora é ~40px,
    // facilitando cliques/toques no mobile sem alterar a aparência (barra continua 3px).
    // 
    // Eventos suportados:
    // - input: Dispara continuamente enquanto arrasta (progressDragging = true)
    // - change: Dispara ao soltar (progressDragging = false, executa seek)
    // - pointerdown/up: Captura robusta cross-browser (mouse, touch, pen)
    // 
    // ⛔ O QUE QUEBRARIA:
    // ❌ Remover event listeners
    // ❌ Remover progressBar.addEventListener (input/change/pointerdown/up)
    // ❌ Alterar logic de progressDragging
    // ❌ Remover onProgressChange call no pointerup
    // ============================================================================
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

    // Fechar modais ao clicar fora (backdrop click)
    // Modais com animação padrão de bottom-sheet
    ['createPlaylistModal','userMenuModal','itemOptionsModal','editPlaylistModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    // Usar ID do modal para fechar com animação
                    closeModalWithAnimation(id);
                }
            });
        }
    });
    
    // feedbackModal: fechar sem animação (auto-close existente)
    const feedbackModal = document.getElementById('feedbackModal');
    if (feedbackModal) {
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) feedbackModal.classList.remove('show');
        });
    }
    
    // Botão fechar modal de edição
    const closeEditPlaylistBtn = document.getElementById('editPlaylistCloseBtn');
    if (closeEditPlaylistBtn) {
        closeEditPlaylistBtn.addEventListener('click', () => {
            closeModalWithAnimation('editPlaylistModal');
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

    // ============================================================================
    // 🎬 BOTÕES DO OVERLAY-LAYER-LEGENDAS (Vídeo em Preview)
    // ============================================================================
    // Listeners para os botões que ficam sobre o vídeo:
    // 1️⃣ queue_music (adicionar à playlist)
    // 2️⃣ add (nova playlist)
    // 3️⃣ share (NOVO: compartilhar vídeo em preview)
    // 4️⃣ more_vert (opções do item)
    // ============================================================================
    const overlayLegendas = document.querySelector('.overlay-layer-legendas');
    if (overlayLegendas) {
        const legendButtons = overlayLegendas.querySelectorAll('button');
        
        // Botão 3: Compartilhar vídeo em preview
        // Usa o novo sistema centralizado de compartilhamento
        if (legendButtons[2]) {
            legendButtons[2].addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Garantir que player.previewVideo está definido
                if (!player.previewVideo && player.currentPlaylist) {
                    // Fallback: usar vídeo atual se preview não estiver definido
                    player.previewVideo = player.currentPlaylist.videos[player.currentVideoIndex];
                }
                handleShare('preview');
            });
        }
        
        // Botão 1: Abrir modal de playlists (adicionar item)
        if (legendButtons[0]) {
            legendButtons[0].addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Definir vídeo em preview para contexto
                if (player.currentPlaylist) {
                    player.previewVideo = player.currentPlaylist.videos[player.currentVideoIndex];
                }
                openPlaylistsModal();
            });
        }
        
        // Botão 2: Criar nova playlist (a partir do vídeo em preview)
        if (legendButtons[1]) {
            legendButtons[1].addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Definir vídeo em preview para contexto
                if (player.currentPlaylist) {
                    player.previewVideo = player.currentPlaylist.videos[player.currentVideoIndex];
                }
                openCreatePlaylistModal();
            });
        }
        
        // Botão 4: Opções do item (mais_vert)
        if (legendButtons[3]) {
            legendButtons[3].addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // ✅ CORRETO: Usar APENAS o estado global - o vídeo que está tocando
                const video = getCurrentPlayingVideo();
                if (!video) return;
                
                // Abrir modal com as opções do item que está tocando
                openItemOptionsModalFromPlayer(video);
            });
        }
    }
    
    // 🎬 NOVO BOTÃO: FULLSCREEN
    // ============================================================================
    const btnFullscreen = document.getElementById('btnFullscreen');
    
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFullscreen();
        });
    }
}

/**
 * 🎬 FULLSCREEN TOGGLE
 * Controla entrada/saída de tela cheia via Fullscreen API
 * ESC sai automaticamente (controle nativo do browser)
 */
function toggleFullscreen() {
    const playerWrapper = document.querySelector('.player-embed');
    if (!playerWrapper) return;
    
    // Se NÃO está em fullscreen, entrar
    if (!document.fullscreenElement) {
        playerWrapper.requestFullscreen();
    } else {
        // Se ESTÁ em fullscreen, sair
        document.exitFullscreen();
    }
}

// Monitorar mudanças de fullscreen (ESC, sistema, etc)
document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    console.log('[Fullscreen] Estado:', isFullscreen ? 'ATIVO' : 'INATIVO');
});

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
