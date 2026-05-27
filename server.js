const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

async function getYtDlpInfo(videoUrl) {
    return new Promise((resolve, reject) => {
        const args = [
            '--no-warnings',
            '--no-call-home',
            '--no-check-certificate',
            '--dump-json',
            '-f',
            'bestaudio[ext=m4a]/bestaudio',
            videoUrl
        ];

        execFile(YTDLP_PATH, args, { maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(`yt-dlp failed: ${error.message} ${stderr || ''}`));
            }
            try {
                const payload = JSON.parse(stdout);
                const entry = payload?.entries?.[0] || payload;
                if (!entry || !Array.isArray(entry.formats)) {
                    return reject(new Error('yt-dlp returned invalid metadata'));
                }
                const info = {
                    formats: entry.formats,
                    videoDetails: {
                        title: entry.title || 'SanPlayer',
                        author: { name: entry.uploader || null },
                        lengthSeconds: entry.duration ? String(Math.round(entry.duration)) : '0'
                    }
                };
                resolve(info);
            } catch (parseError) {
                reject(new Error(`Failed to parse yt-dlp JSON: ${parseError.message}`));
            }
        });
    });
}

function selectBestAudioFormat(formats) {
    if (!Array.isArray(formats)) return null;
    const audioFormats = formats.filter(format => {
        if (!format || !format.url) return false;
        const hasAudioCodec = typeof format.acodec === 'string' ? format.acodec !== 'none' : true;
        const hasAudioMime = typeof format.mimeType === 'string' && format.mimeType.includes('audio');
        return hasAudioCodec || hasAudioMime || typeof format.audioBitrate === 'number' || typeof format.abr === 'number';
    });

    if (audioFormats.length === 0) return null;
    return audioFormats.sort((a, b) => {
        const scoreA = (a.audioBitrate || a.abr || 0);
        const scoreB = (b.audioBitrate || b.abr || 0);
        return scoreB - scoreA;
    })[0];
}

app.get('/api/resolveStream', async (req, res) => {
    const videoId = String(req.query.videoId || '').trim();
    if (!videoId) {
        return res.status(400).json({ error: 'Missing videoId query parameter' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    try {
        let info;
        try {
            info = await ytdl.getInfo(videoUrl, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                }
            });
        } catch (firstError) {
            console.warn('ytdl-core failed, falling back to yt-dlp:', firstError.message);
            info = await getYtDlpInfo(videoUrl);
        }

        const bestFormat = selectBestAudioFormat(info.formats);
        if (!bestFormat || !bestFormat.url) {
            return res.status(502).json({ error: 'Unable to resolve stream URL' });
        }

        return res.json({
            streamUrl: bestFormat.url,
            videoId,
            title: info.videoDetails.title,
            author: info.videoDetails.author?.name || null,
            duration: parseInt(info.videoDetails.lengthSeconds || '0', 10)
        });
    } catch (error) {
        console.error('resolveStream error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to resolve YouTube stream', detail: error?.message || 'unknown' });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`SanPlayer stream resolver running on http://localhost:${PORT}`);
});
