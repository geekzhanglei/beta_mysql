#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const serverEnvPath = '/opt/config/.env';

if (fs.existsSync(serverEnvPath)) {
    require('dotenv').config({ path: serverEnvPath });
} else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const { cleanupExpiredApiCache } = require('../services/tmdbStore');

const API_BASE_URL = process.env.TMDB_WARM_API_BASE_URL || 'http://127.0.0.1:3000';
const TIMEZONE = process.env.TMDB_DEFAULT_TIMEZONE || 'Asia/Shanghai';
const REGIONS = (process.env.TMDB_WARM_REGIONS || 'CN,US,JP,KR,GB').split(',').map(item => item.trim()).filter(Boolean);
const WARM_DAYS = Number(process.env.TMDB_WARM_DAYS || 7);
const IMAGE_LIMIT_PER_ENDPOINT = Number(process.env.TMDB_WARM_IMAGE_LIMIT || 12);
const REQUEST_TIMEOUT = Number(process.env.TMDB_WARM_REQUEST_TIMEOUT || 20000);
const EPISODE_LIMIT = Number(process.env.TMDB_WARM_EPISODE_LIMIT || 40);

function pad(num) {
    return String(num).padStart(2, '0');
}

function dateValue(offset) {
    const date = new Date();

    date.setDate(date.getDate() + offset);
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-');
}

function buildUrl(urlPath) {
    return API_BASE_URL + urlPath;
}

function requestUrl(url) {
    const client = url.indexOf('https://') === 0 ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(url, { timeout: REQUEST_TIMEOUT }, res => {
            const chunks = [];

            res.on('data', chunk => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const body = Buffer.concat(chunks);

                if (res.statusCode >= 400) {
                    reject(new Error('HTTP ' + res.statusCode + ' ' + url));
                    return;
                }

                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('timeout ' + url));
        });

        req.on('error', reject);
    });
}

async function requestJson(urlPath) {
    const url = buildUrl(urlPath);
    const res = await requestUrl(url);

    return JSON.parse(res.body.toString('utf8'));
}

function collectImages(payload) {
    const urls = [];
    const list = payload && payload.data && Array.isArray(payload.data.list) ? payload.data.list : [];
    const detail = payload && payload.data && payload.data.detail;

    list.forEach(item => {
        [item.posterUrl, item.backdropUrl].forEach(url => {
            if (url) {
                urls.push(url);
            }
        });
        (item.episodes || []).forEach(episode => {
            if (episode.stillUrl) {
                urls.push(episode.stillUrl);
            }
        });
    });

    if (detail) {
        [detail.posterUrl, detail.backdropUrl].forEach(url => {
            if (url) {
                urls.push(url);
            }
        });
    }

    return Array.from(new Set(urls)).slice(0, IMAGE_LIMIT_PER_ENDPOINT);
}

async function warmEndpoint(urlPath) {
    const payload = await requestJson(urlPath);
    const images = collectImages(payload);

    for (let i = 0; i < images.length; i++) {
        try {
            await requestUrl(images[i]);
        } catch (err) {
            console.error('[warm] image failed', images[i], err.message);
        }
    }

    console.log('[warm] ok', urlPath, 'images=' + images.length);
}

async function main() {
    const endpoints = [
        '/blogapi/ent/movies/trending?window=day',
        '/blogapi/ent/movies/trending?window=week',
        '/blogapi/ent/tv/airing-today?timezone=' + encodeURIComponent(TIMEZONE),
        '/blogapi/ent/tv/on-air?timezone=' + encodeURIComponent(TIMEZONE)
    ];

    REGIONS.forEach(region => {
        endpoints.push('/blogapi/ent/movies/now-playing?region=' + encodeURIComponent(region));
        endpoints.push('/blogapi/ent/movies/upcoming?region=' + encodeURIComponent(region));
    });

    for (let i = 0; i < WARM_DAYS; i++) {
        const date = dateValue(i);

        endpoints.push('/blogapi/ent/tv/calendar?date=' + date + '&timezone=' + encodeURIComponent(TIMEZONE));
        endpoints.push('/blogapi/ent/tv/episode-calendar?date=' + date + '&timezone=' + encodeURIComponent(TIMEZONE) + '&episodeLimit=' + EPISODE_LIMIT);
    }

    const cleaned = await cleanupExpiredApiCache();
    console.log('[warm] expired api cache removed=' + cleaned);

    for (let i = 0; i < endpoints.length; i++) {
        try {
            await warmEndpoint(endpoints[i]);
        } catch (err) {
            console.error('[warm] endpoint failed', endpoints[i], err.message);
        }
    }
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('[warm] failed', err);
        process.exit(1);
    });
