function normalizeText(value = '') {
  return String(value).trim();
}

const CANONICAL_SHARE_HOST = 'https://sanplayer-server.onrender.com';

function getShareBaseUrl() {
  if (typeof window === 'undefined') {
    return CANONICAL_SHARE_HOST;
  }

  const origin = window.location.origin;
  if (/^(http:\/\/localhost|http:\/\/127\.0\.0\.1|file:)/.test(origin)) {
    return CANONICAL_SHARE_HOST;
  }

  return origin;
}

function buildShareUrl(videoId = '') {
  return `https://youtu.be/${videoId}`;
}

function buildShareText({
  title = '',
  artist = '',
  url = '',
}) {
  const safeTitle = normalizeText(title);
  const safeArtist = normalizeText(artist);

  return `${safeTitle}${safeArtist ? ` • ${safeArtist}` : ''}`;
}

async function copyToClipboard(text) {
  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard API indisponível');
    }

    await navigator.clipboard.writeText(text);

    return true;
  } catch (error) {
    console.error('[Share] Clipboard error:', error);

    return false;
  }
}

async function nativeShare({
  title = '',
  text = '',
  url = '',
}) {
  try {
    // 📱 1️⃣ Android WebView Native
    if (window.Android?.share) {
      window.Android.share(title, text, url);
      return true;
    }

    // 🌐 2️⃣ Web Share API
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }

    // 📋 3️⃣ Fallback: Clipboard
    const shareText = url && !text.includes(url) ? `${text}\n\n${url}` : text;
    await copyToClipboard(shareText);
    return false;

  } catch (err) {
    console.warn('[nativeShare] Erro:', err);
    return false;
  }
}

/**
 * 🎯 Compartilha um vídeo
 * @param {Object} video - {id, title, artist}
 * @param {Object} playlist - Playlist (contexto opcional)
 */
/* ==========================================================================
 @lock - SAFE AREA COMPONENT
 DO NOT MODIFY: Sharing URL generation and video share text are critical.
 Future edits here may reintroduce duplicate links or broken shared video routing.
 ========================================================================== */
function shareVideo(video, playlist) {
  if (!video || !video.id) {
    console.warn('[shareVideo] Vídeo inválido:', video);
    return;
  }

  const url = `${getShareBaseUrl()}/index.html?videoId=${video.id}`;
  const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;

  nativeShare({
    title: 'SanPlayer',
    text: text,
    url: url
  });
}

/**
 * 🧠 Resolve o contexto (qual vídeo/playlist compartilhar)
 * @param {String} source - 'player', 'list', 'preview'
 * @param {Object} extra - Dados extras {video, playlist}
 */
function resolveVideoContext(source, extra = {}) {
  // Se já foi passado o vídeo em extra, usar diretamente
  if (extra.video) {
    return {
      video: extra.video,
      playlist: extra.playlist || null
    };
  }
  
  // Caso contrário, retornar contexto vazio
  return {
    video: null,
    playlist: null
  };
}

/**
 * 🔘 Handler genérico de compartilhamento
 * @param {String|Object} sourceOrVideo - 'player', 'list', 'preview' OU objeto vídeo direto
 * @param {Object} extra - Dados extras {video, playlist}
 */
function handleShare(sourceOrVideo, extra = {}) {
  // Se recebeu um objeto de vídeo direto (compatibilidade com novo sistema)
  if (sourceOrVideo && typeof sourceOrVideo === 'object' && sourceOrVideo.id) {
    shareVideo(sourceOrVideo, extra.playlist);
    return;
  }
  
  // Se recebeu string com source e extra contém vídeo
  const context = resolveVideoContext(sourceOrVideo, extra);

  if (!context.video) {
    console.warn('[handleShare] Nenhum vídeo encontrado para compartilhar');
    return;
  }

  shareVideo(context.video, context.playlist);
}

/**
 * 🔒 Compartilha uma playlist
 * @param {Object} playlist - {title, name, cover}
 */
function sharePlaylist(playlist) {
  if (!playlist || (!playlist.title && !playlist.name)) {
    console.warn('[sharePlaylist] Inválido:', playlist);
    return false;
  }

  const playlistName = playlist.title || playlist.name;
  const url = `${getShareBaseUrl()}/index.html?playlistId=${encodeURIComponent(playlistName)}`;
  const text = `Playlist: ${playlistName}`;

  nativeShare({
    title: 'SanPlayer',
    text: text,
    url: url
  });

  return true;
}

/**
 * 🎨 Compartilha um artista
 * @param {Object} artist - {name, cover}
 */
function shareArtist(artist) {
  if (!artist || !artist.name) {
    console.warn('[shareArtist] Inválido:', artist);
    return false;
  }

  const url = `${getShareBaseUrl()}/index.html?artistId=${encodeURIComponent(artist.name)}`;
  const text = `Artista: ${artist.name}`;

  nativeShare({
    title: 'SanPlayer',
    text: text,
    url: url
  });

  return true;
}

/**
 * 🎵 Compartilha a música atual tocando
 * @param {Object} video - Vídeo a compartilhar (pode vir de app.js)
 */
function shareMusic(video) {
  if (video) {
    shareVideo(video);
  } else {
    console.warn('[shareMusic] Nenhum vídeo fornecido para compartilhar');
  }
}

/**
 * 🔥 Compartilha um item específico da lista pelo índice
 * @param {Number} index - Índice do vídeo na view atual
 * @param {Function} getCurrentViewVideos - Função para pegar vídeos da view atual
 */
function shareItem(index, getCurrentViewVideos) {
  // 🔥 CRÍTICO: Usar getCurrentViewVideos() para pegar o vídeo CORRETO da view atual
  // Se estamos em artista/favoritos, o índice é relativo àquela view, não ao playlist original
  const viewVideos = getCurrentViewVideos();
  const video = viewVideos[index];
  
  if (!video) {
    console.error('[shareItem] ❌ Vídeo não encontrado no índice:', index, 'view videos:', viewVideos.length);
    return;
  }
  
  const text = `Escutando: ${video.title} - ${video.artist} no SanPlayer`;
  const url = `${getShareBaseUrl()}?videoId=${video.id}`;
  
  // 🔥 Usar função central nativeShare()
  nativeShare({
    title: 'SanPlayer',
    text: text,
    url: url
  });
}

export {
  normalizeText,
  buildShareUrl,
  buildShareText,
  copyToClipboard,
  nativeShare,
  shareVideo,
  resolveVideoContext,
  handleShare,
  sharePlaylist,
  shareArtist,
  shareMusic,
  shareItem,
};