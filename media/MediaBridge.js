/**
 * 🎵 MEDIA BRIDGE - KERNEL DE MÍDIA UNIVERSAL
 * 
 * ⚠️ RESPONSABILIDADE CRÍTICA: Fonte de verdade para estado de playback
 * 
 * ============================================================================
 * ESCOPO: O que pertence aqui
 * ============================================================================
 * 
 * ✅ RESPONSABILIDADES CORE:
 * - Track atual em reprodução (metadata)
 * - Estado de playback (playing/paused)
 * - Progresso (tempo atual / duração)
 * - Controle de reprodução (play/pause/seek)
 * - YouTube player adapter
 * - Eventos de mídia
 * - Persistência de estado
 * - Sincronização com Android (gateway)
 * 
 * ❌ O QUE NÃO PERTENCE AQUI:
 * - DOM visual, renderização (→ app.js)
 * - Sidebar, navegação (→ app.js)
 * - Modais, histórico visual (→ app.js)
 * - Favoritos, contexto visual (→ app.js)
 * - PlaylistsIndex, previewVideo (→ app.js)
 * - Lógica de UX (→ app.js ou modules)
 * 
 * ============================================================================
 * ARQUITETURA: Evitar monolito (sem fragmentação prematura)
 * ============================================================================
 * 
 * MediaBridge.js (ESTE ARQUIVO) → FASE 1:
 * └─ Organizado em regiões internas
 *    ├─ STATE: Núcleo de dados
 *    ├─ EVENTS: Sistema de eventos
 *    ├─ PERSISTENCE: localStorage
 *    ├─ YOUTUBE ADAPTER: Integração player
 *    └─ ANDROID SYNC: MediaSession/WebView bridge
 * 
 * Futuro (FASE 2) - se necessário:
 * └─ MediaPersistence.js (se crescer muito)
 * └─ MediaEvents.js (se crescer muito)
 * └─ YouTubeAdapter.js (se suportar múltiplos players)
 * 
 * app.js:
 * └─ Renderização visual + navegação + modais
 * └─ Chama MediaBridge para obter/modificar playback
 * 
 * ============================================================================
 * GATEWAY ARQUITECTURE
 * ============================================================================
 * 
 * MediaBridge é o GATEWAY entre:
 * 
 * WebView (app.js)  ←→  MediaBridge  ←→  Android Native
 *                           ↓
 *                       YouTube Player
 * 
 * Fluxo:
 * 1. app.js → MediaBridge.play()
 * 2. MediaBridge → YouTube player
 * 3. YouTube → onPlayerStateChange()
 * 4. MediaBridge → emite evento 'playing'
 * 5. app.js (listener) → atualiza UI
 * 
 * ============================================================================
 * ⚠️ LIMITAÇÕES IMPORTANTES (NÃO ESQUECER)
 * ============================================================================
 * 
 * ❌ navigator.mediaSession NÃO é Android MediaSession nativa:
 * - É apenas sincronização WEB (lockscreen web-compatible)
 * - NÃO substitui ForegroundService
 * - NÃO substitui MediaStyle Notification
 * - NÃO gerencia AudioFocus real
 * - NÃO suporta PiP automático
 * 
 * Para Android nativo completo:
 * → Implementar com Android Bridge (WebView Interface)
 * → Usar ForegroundService real
 * → Usar MediaSession API nativa (não web)
 * → Integração com Android Shortcuts
 * 
 * ============================================================================
 */

// ============================================================================
// CONFIGURAÇÃO FALLBACK
// ============================================================================

const INITIAL_TRACK_FALLBACK = {
    id: "m21zfosnqls",
    title: "Chill Out Mix 2023🍓 Chillout Lounge 117",
    artist: "Helios Deep",
    _description: "Fallback de integridade do player"
};

// ============================================================================
// ESTADO DE MÍDIA (PRIVADO - NÃO ACESSAR DIRETAMENTE)
// ============================================================================

// ============================================================================
// [ STATE ] NÚCLEO DE DADOS - APENAS PLAYBACK + METADATA
// ============================================================================
/**
 * 🔒 PRIVADO: Estado de mídia - CORE APENAS
 * 
 * Regra: Adicione aqui APENAS se for essencial para:
 * - playback control
 * - metadata (track info)
 * - progress tracking
 * - YouTube integration
 * 
 * ❌ NÃO ADICIONE:
 * - favorites, viewingFavorites (→ app.js)
 * - previewVideo, currentFavoriteId (→ app.js)
 * - playlistsIndex (→ app.js)
 * - estados de UX/navegação (→ app.js)
 */
let mediaState = {
    // 🎬 TRACK ATUAL
    currentTrack: INITIAL_TRACK_FALLBACK,
    
    // ▶️ PLAYBACK STATE
    isPlaying: false,
    shouldPlayOnReady: false,
    
    // ⏱️ PROGRESS
    currentTime: 0,
    duration: 0,
    
    // 🎚️ PLAYER CONTROLS
    isShuffle: false,
    repeatMode: 0,  // 0: no repeat, 1: repeat all, 2: repeat one
    
    // 🎮 YOUTUBE ADAPTER
    ytPlayer: null,
    ytReady: false,
    
    // 💾 RESTORE FLAGS (interno)
    _restoreTime: undefined,
    _restoreAutoPlay: undefined,
};

// ============================================================================
// [ STORAGE ] PERSISTÊNCIA EM LOCALSTORAGE - REGIÃO INTERNA
// ============================================================================
/**
 * 🔒 Centralizar acesso a localStorage
 * Preparado para futura modularização (MediaPersistence.js)
 */
const storage = {
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`[MediaBridge] ✅ Saved "${key}"`);
        } catch (e) {
            console.warn(`[MediaBridge] ⚠️ Save failed "${key}":`, e.message);
        }
    },

    load(key) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            console.warn(`[MediaBridge] ⚠️ Load failed "${key}":`, e.message);
            return null;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            console.log(`[MediaBridge] ✅ Removed "${key}"`);
        } catch (e) {
            console.warn(`[MediaBridge] ⚠️ Remove failed "${key}":`, e.message);
        }
    }
};

// ============================================================================
// [ EVENTS ] SISTEMA DE EVENTOS - REGIÃO INTERNA
// ============================================================================
/**
 * 🔒 Event emitter customizado
 * Preparado para futura modularização (MediaEvents.js)
 * 
 * Eventos emitidos pela MediaBridge:
 * - trackChanged
 * - playbackStateChanged
 * - progressUpdated
 * - playing, paused, cued, ended
 * - playerAttached
 * - trackLoaded
 * - playbackRestored
 * - nextRequested, previousRequested
 * - repeatModeChanged
 * - shuffleChanged
 */
const mediaEvents = {
    listeners: {},

    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
    },

    off(eventName, callback) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    },

    emit(eventName, data) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[MediaBridge] Error in event listener "${eventName}":`, e);
            }
        });
    }
};

// ============================================================================
// [ VALIDATION ] VALIDAÇÃO - REGIÃO INTERNA
// ============================================================================

/**
 * 🔒 Valida se track tem estrutura mínima válida
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
 */
function getSafeTrack(possibleTrack) {
    if (isValidTrack(possibleTrack)) {
        return possibleTrack;
    }
    console.warn('[MediaBridge] ⚠️ Track inválido, usando FALLBACK:', possibleTrack);
    return INITIAL_TRACK_FALLBACK;
}

// ============================================================================
// [ YOUTUBE ADAPTER ] INTEGRAÇÃO COM YOUTUBE PLAYER
// ============================================================================
/**
 * 🎮 ADAPTER PATTERN: YouTube é UMA IMPLEMENTAÇÃO, não o core
 * 
 * Permite futuro suporte a outros players (Vimeo, custom HLS, etc)
 * sem alterar arquitetura central da MediaBridge.
 * 
 * Adaptação:
 * - Métodos públicos chamam YouTube via this.attachPlayer()
 * - handlePlayerStateChange() converte eventos YouTube para media events
 * - Isolado: se remover YouTube, API de MediaBridge continua funcionando
 */

// ============================================================================
// [ ANDROID SYNC ] SINCRONIZAÇÃO COM ANDROID - GATEWAY WEBVIEW
// ============================================================================
/**
 * ⚠️ LIMITAÇÃO IMPORTANTE - navigator.mediaSession
 * 
 * O que É:
 * ✅ Sincronização WEB com lockscreen do dispositivo
 * ✅ Metadata no lockscreen/bluetooth
 * ✅ Botões de controle no lockscreen
 * ✅ Compatível com navegadores mobile
 * 
 * O que NÃO É:
 * ❌ Android MediaSession NATIVA (é web-based)
 * ❌ ForegroundService (web browser já é foreground)
 * ❌ MediaStyle Notification (é browser notification)
 * ❌ AudioFocus automático (depende do browser)
 * ❌ PiP automático (depende do browser)
 * 
 * Para Android NATIVO completo:
 * → Implementar Android Bridge (WebView Interface)
 * → Usar @android:attr/MediaSession
 * → Usar ForegroundService com MediaStyle
 * → Gerenciar AudioFocus real
 * → Integrar com Android Shortcuts
 * 
 * Nesta fase: MediaBridge sincroniza com navigator.mediaSession
 * Próximas fases: Android Bridge para sincronização nativa real
 */

// ============================================================================
// 🎵 MEDIA BRIDGE - API PÚBLICA
// ============================================================================

class MediaBridge {
    static _androidSessionStarted = false;

    /**
     * 🎬 Obter track atualmente tocando
     * @returns {Object} { id, title, artist, ... }
     */
    static getCurrentTrack() {
        return mediaState.currentTrack || INITIAL_TRACK_FALLBACK;
    }

    /**
     * 🎬 Definir track para tocar
     * @param {Object} track - { id, title, artist, ... }
     */
    static setCurrentTrack(track) {
        track = getSafeTrack(track);
        track.thumbnail = track.thumbnail || this._getYoutubeThumbnailUrl(track.id);
        track.duration = typeof track.duration === 'number' ? track.duration : mediaState.duration || 0;
        
        if (mediaState.currentTrack?.id !== track.id) {
            console.log('[MediaBridge] 🎬 Track changed:', {
                from: mediaState.currentTrack?.title,
                to: track.title
            });
            
            mediaState.currentTrack = track;
            mediaState.currentTime = 0;
            mediaState.duration = track.duration || mediaState.duration;
            mediaEvents.emit('trackChanged', track);
            this._updateWebMediaSession();
            if (this._androidSessionStarted) {
                this.syncToAndroid();
            }
            
            // Persistir imediatamente quando muda de track
            this._persistState();
        }
    }

    /**
     * ▶️ Obter estado de playback
     * @returns {Boolean} true se tocando
     */
    static isPlaying() {
        return mediaState.isPlaying;
    }

    /**
     * ▶️ Definir estado de playback
     * @param {Boolean} playing - true para play, false para pause
     */
    static setPlaybackState(playing) {
        if (mediaState.isPlaying !== playing) {
            mediaState.isPlaying = playing;
            console.log('[MediaBridge] ▶️ Playback state:', playing ? 'PLAYING' : 'PAUSED');
            mediaEvents.emit('playbackStateChanged', { isPlaying: playing });
            this._updateWebMediaSession();

            if (playing) {
                this._androidSessionStarted = true;
                this.syncToAndroid();
            } else if (this._androidSessionStarted) {
                this.syncToAndroid();
            }
        }
    }

    /**
     * ⏱️ Atualizar progresso da reprodução
     * @param {Number} time - Tempo atual em segundos
     * @param {Number} duration - Duração total em segundos
     */
    static updateProgress(time, duration) {
        const hasChanged = (mediaState.currentTime !== time || mediaState.duration !== duration);
        
        if (hasChanged) {
            const durationChanged = mediaState.duration !== duration;
            mediaState.currentTime = time;
            mediaState.duration = duration;
            
            // Throttle: emitir apenas a cada 500ms para evitar spam
            if (!this._progressThrottle) {
                mediaEvents.emit('progressUpdated', {
                    currentTime: time,
                    duration: duration,
                    percentage: duration > 0 ? (time / duration) * 100 : 0
                });
                if (this._androidSessionStarted) {
                    this._notifyAndroidProgress(time, duration);
                    if (durationChanged) {
                        this.syncToAndroid();
                    }
                }
                
                this._progressThrottle = true;
                setTimeout(() => {
                    this._progressThrottle = false;
                }, 500);
            }
        }
    }

    /**
     * 📡 Sincronizar estado com Android (MediaSession API)
     * 
     * ⚠️ NÃO conhece: renderização, DOM
     * ✅ Sabe: estado de mídia, metadados, playback
     */
    static _updateWebMediaSession() {
        const track = this.getCurrentTrack();

        try {
            if (navigator.mediaSession) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.artist,
                    artwork: [
                        {
                            src: this._getArtworkUrl(track.artist),
                            sizes: '96x96',
                            type: 'image/png'
                        }
                    ]
                });

                navigator.mediaSession.playbackState = mediaState.isPlaying ? 'playing' : 'paused';

                if (!this._androidActionsSetup) {
                    navigator.mediaSession.setActionHandler('play', () => this.play());
                    navigator.mediaSession.setActionHandler('pause', () => this.pause());
                    navigator.mediaSession.setActionHandler('nexttrack', () => mediaEvents.emit('nextRequested', {}));
                    navigator.mediaSession.setActionHandler('previoustrack', () => mediaEvents.emit('previousRequested', {}));
                    navigator.mediaSession.setActionHandler('seekto', ({ seekTime }) => this.seek(seekTime));
                    this._androidActionsSetup = true;
                }
            }
        } catch (e) {
            console.warn('[MediaBridge] ⚠️ Web mediaSession update failed:', e.message);
        }
    }

    static syncToAndroid() {
        if (!this._androidSessionStarted) {
            console.log('[MediaBridge] ⚠️ Android sync skipped: session not started yet');
            return;
        }

        this._updateWebMediaSession();
        this._syncToAndroidBridge();

        const track = this.getCurrentTrack();
        console.log('[MediaBridge] 📡 Android sync completed:', {
            title: track.title,
            playbackState: mediaState.isPlaying ? 'playing' : 'paused'
        });
    }

    static _hasAndroidBridge() {
        return typeof window !== 'undefined' && window.Android && (
            typeof window.Android.updatePlaybackState === 'function' ||
            typeof window.Android.onPlaybackState === 'function' ||
            typeof window.Android.onPlay === 'function' ||
            typeof window.Android.onTrackChange === 'function'
        );
    }

    static _syncToAndroidBridge() {
        if (!this._hasAndroidBridge()) return;

        const track = this.getCurrentTrack();
        const currentTime = Math.round(mediaState.currentTime);
        const duration = Math.round(mediaState.duration || 0);
        const artworkUrl = this._getArtworkUrl(track);

        try {
            if (typeof window.Android.onTrackChange === 'function') {
                window.Android.onTrackChange(track.id, track.title, track.artist, artworkUrl, duration);
            } else {
                window.Android.updateMetadata(track.title, track.artist, artworkUrl, duration);
            }

            if (typeof window.Android.onPlaybackState === 'function') {
                window.Android.onPlaybackState(mediaState.isPlaying, currentTime, duration);
            } else {
                window.Android.updatePlaybackState(mediaState.isPlaying, currentTime);
            }
        } catch (e) {
            console.warn('[MediaBridge] ⚠️ Android bridge event failed:', e.message);
        }
    }

    static _notifyAndroidProgress(time, duration) {
        if (!this._hasAndroidBridge()) return;
        try {
            if (typeof window.Android.onProgress === 'function') {
                window.Android.onProgress(Math.round(time), Math.round(duration));
            }
        } catch (e) {
            console.warn('[MediaBridge] ⚠️ Android onProgress failed:', e.message);
        }
    }

    static _notifyAndroidBuffering() {
        if (!this._androidSessionStarted || !this._hasAndroidBridge()) return;
        try {
            if (typeof window.Android.onBuffering === 'function') {
                window.Android.onBuffering();
            }
        } catch (e) {
            console.warn('[MediaBridge] ⚠️ Android onBuffering failed:', e.message);
        }
    }

    static _notifyAndroidEnded() {
        if (!this._androidSessionStarted || !this._hasAndroidBridge()) return;
        try {
            if (typeof window.Android.onEnded === 'function') {
                window.Android.onEnded();
            }
        } catch (e) {
            console.warn('[MediaBridge] ⚠️ Android onEnded failed:', e.message);
        }
    }

    static notifyEnded() {
        mediaEvents.emit('ended', {});
        this._notifyAndroidEnded();
        this.syncToAndroid();
    }

    static notifyBuffering() {
        mediaEvents.emit('buffering', {});
        this._notifyAndroidBuffering();
        this.syncToAndroid();
    }

    /**
     * 💾 Persistir estado atual em localStorage
     * @private
     */
    static _persistState() {
        const track = this.getCurrentTrack();
        
        if (!isValidTrack(track)) {
            console.warn('[MediaBridge] ⚠️ Invalid track, not persisting:', track);
            return;
        }

        const stateToSave = {
            currentVideoId: track.id,
            currentVideoTitle: track.title,
            currentVideoArtist: track.artist,
            currentTime: mediaState.currentTime,
            isPlaying: mediaState.isPlaying,
            playlistName: mediaState.currentPlaylist?.name,
            isFavorites: mediaState.viewingFavorites,
            timestamp: Date.now(),
            savedAt: new Date().toISOString()
        };

        storage.save('sanplayer:state', stateToSave);
    }

    /**
     * 💾 Restaurar estado anterior
     * @returns {Promise<Boolean>} true se restaurado com sucesso
     */
    static async restorePlayback() {
        const saved = storage.load('sanplayer:state');
        
        if (!saved) {
            console.log('[MediaBridge] ℹ️ Nenhum estado salvo');
            return false;
        }

        console.log('[MediaBridge] 📂 Estado encontrado:', {
            videoId: saved.currentVideoId,
            videoTitle: saved.currentVideoTitle,
            currentTime: saved.currentTime,
            wasPlaying: saved.isPlaying,
            savedAt: saved.savedAt
        });

        // Validar e restaurar
        if (saved.currentVideoId) {
            mediaState.currentTrack = {
                id: saved.currentVideoId,
                title: saved.currentVideoTitle,
                artist: saved.currentVideoArtist
            };

            mediaState.currentTime = saved.currentTime || 0;
            mediaState._restoreTime = saved.currentTime || 0;
            mediaState._restoreAutoPlay = saved.isPlaying || false;

            console.log('[MediaBridge] ✅ Estado restaurado');
            mediaEvents.emit('playbackRestored', {
                track: mediaState.currentTrack,
                time: mediaState.currentTime,
                wasPlaying: mediaState._restoreAutoPlay
            });

            return true;
        }

        return false;
    }

    /**
     * 🎮 Anexar YouTube player para controle
     * @param {Object} ytPlayer - Instância do YouTube player
     */
    static attachPlayer(ytPlayer) {
        if (!ytPlayer) {
            console.warn('[MediaBridge] ⚠️ Invalid YouTube player');
            return;
        }

        mediaState.ytPlayer = ytPlayer;
        mediaState.ytReady = true;

        console.log('[MediaBridge] 🎮 YouTube player attached');
        mediaEvents.emit('playerAttached', { player: ytPlayer });
    }

    /**
     * ▶️ Iniciar reprodução
     */
    static play() {
        if (mediaState.ytPlayer && typeof mediaState.ytPlayer.playVideo === 'function') {
            mediaState.ytPlayer.playVideo();
            console.log('[MediaBridge] ▶️ Play command sent to YouTube');
        }
    }

    /**
     * ⏸️ Pausar reprodução
     */
    static pause() {
        if (mediaState.ytPlayer && typeof mediaState.ytPlayer.pauseVideo === 'function') {
            mediaState.ytPlayer.pauseVideo();
            this.setPlaybackState(false);
            console.log('[MediaBridge] ⏸️ Pause command sent to YouTube');
        }
    }

    /**
     * 🎯 Buscar posição específica
     * @param {Number} time - Tempo em segundos
     */
    static seek(time) {
        if (mediaState.ytPlayer && typeof mediaState.ytPlayer.seekTo === 'function') {
            mediaState.ytPlayer.seekTo(time);
            mediaState.currentTime = time;
            console.log('[MediaBridge] ⏩ Seek to:', time);
        }
    }

    /**
     * 🎯 Carregar vídeo (cue)
     * @param {Object} track - { id, title, artist, ... }
     * @param {Boolean} autoPlay - Tocar automaticamente?
     */
    static loadTrack(track, autoPlay = false) {
        track = getSafeTrack(track);
        
        this.setCurrentTrack(track);
        mediaState.shouldPlayOnReady = autoPlay;

        if (mediaState.ytPlayer && typeof mediaState.ytPlayer.cueVideoById === 'function') {
            mediaState.ytPlayer.cueVideoById(track.id);
            console.log('[MediaBridge] 🎬 Video cued:', track.title);
        }

        mediaEvents.emit('trackLoaded', { track, autoPlay });
    }

    /**
     * 🎤 Manipular eventos do YouTube player
     * @param {Object} event - YouTube player event
     */
    static handlePlayerStateChange(event) {
        const state = event.data;

        // YT.State: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
        if (state === YT.PlayerState.PLAYING) {
            this.setPlaybackState(true);
            mediaState.duration = mediaState.ytPlayer?.getDuration() || 0;
            mediaState.currentTime = mediaState.ytPlayer?.getCurrentTime() || 0;
            mediaEvents.emit('playing', {});

        } else if (state === YT.PlayerState.PAUSED) {
            this.setPlaybackState(false);
            mediaState.currentTime = mediaState.ytPlayer?.getCurrentTime() || 0;
            mediaEvents.emit('paused', {});

        } else if (state === YT.PlayerState.CUED) {
            // Aplicar restore se necessário
            if (mediaState._restoreTime !== undefined && mediaState._restoreTime > 0) {
                mediaState.ytPlayer?.seekTo(mediaState._restoreTime);
                console.log('[MediaBridge] ⏱️ Restored time:', mediaState._restoreTime);
                mediaState._restoreTime = undefined;
            }

            // Auto-play se agendado
            if (mediaState._restoreAutoPlay === true && mediaState.shouldPlayOnReady) {
                this.play();
                mediaState._restoreAutoPlay = undefined;
            }

            mediaEvents.emit('cued', {});

        } else if (state === YT.PlayerState.BUFFERING) {
            mediaEvents.emit('buffering', {});
            this._notifyAndroidBuffering();

        } else if (state === YT.PlayerState.ENDED) {
            this.setPlaybackState(false);
            mediaEvents.emit('ended', {});
            this._notifyAndroidEnded();
        }
    }

    /**
     * 🎚️ Obter/Definir modo shuffle
     */
    static isShuffle() {
        return mediaState.isShuffle;
    }

    static setShuffle(enabled) {
        if (mediaState.isShuffle !== enabled) {
            mediaState.isShuffle = enabled;
            console.log('[MediaBridge] 🎚️ Shuffle:', enabled ? 'ON' : 'OFF');
            mediaEvents.emit('shuffleChanged', { isShuffle: enabled });
        }
    }

    /**
     * 🔁 Obter/Definir modo repeat
     * Valores: 0 = no repeat, 1 = repeat all, 2 = repeat one
     */
    static getRepeatMode() {
        return mediaState.repeatMode;
    }

    static setRepeatMode(mode) {
        if (mediaState.repeatMode !== mode) {
            mediaState.repeatMode = Math.max(0, Math.min(2, mode));
            console.log('[MediaBridge] 🔁 Repeat mode:', ['OFF', 'ALL', 'ONE'][mediaState.repeatMode]);
            mediaEvents.emit('repeatModeChanged', { repeatMode: mediaState.repeatMode });
        }
    }

    /**
     * 📡 OUVIR EVENTOS DE MÍDIA
     * @param {String} eventName - 'trackChanged', 'playbackStateChanged', 'progressUpdated', etc
     * @param {Function} callback - Função a executar
     */
    static on(eventName, callback) {
        mediaEvents.on(eventName, callback);
    }

    static off(eventName, callback) {
        mediaEvents.off(eventName, callback);
    }

    /**
     * 🔧 HELPER: Obter URL de artwork
     * @private
     */
    static _getArtworkUrl(track) {
        if (track && typeof track.thumbnail === 'string' && track.thumbnail.trim()) {
            return track.thumbnail;
        }
        if (track && typeof track.id === 'string' && track.id.trim()) {
            return this._getYoutubeThumbnailUrl(track.id);
        }
        return `/covers/artists/${encodeURIComponent(track?.artist || 'unknown')}.jpg`;
    }

    static _getYoutubeThumbnailUrl(videoId) {
        if (!videoId || typeof videoId !== 'string') return '';
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
}

// ============================================================================
// EXPORTAR
// ============================================================================

export default MediaBridge;