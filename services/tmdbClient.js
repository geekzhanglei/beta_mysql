const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = process.env.TMDB_DEFAULT_LANGUAGE || 'zh-CN';
const DEFAULT_REGION = process.env.TMDB_DEFAULT_REGION || 'CN';
const DEFAULT_TIMEZONE = process.env.TMDB_DEFAULT_TIMEZONE || 'Asia/Shanghai';
const IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';
const PUBLIC_API_BASE_URL = process.env.TMDB_PUBLIC_API_BASE_URL || 'https://blog.feroad.com';
const IMAGE_PROXY_BASE_URL = process.env.TMDB_IMAGE_PROXY_BASE_URL || PUBLIC_API_BASE_URL + '/blogapi/ent/image';
const REQUEST_TIMEOUT = Number(process.env.TMDB_REQUEST_TIMEOUT || 8000);
const IMAGE_CACHE_MAX_BYTES = Number(process.env.TMDB_IMAGE_CACHE_MAX_BYTES || 2 * 1024 * 1024 * 1024);
const IMAGE_CACHE_DIR = process.env.TMDB_IMAGE_CACHE_DIR || path.join(__dirname, '..', 'public', 'tmdb-image-cache');
const BASE_URL_HOSTNAME = new URL(BASE_URL).hostname;
let imageCacheCleanupTask = null;

function getCredential() {
    return {
        token: process.env.TMDB_ACCESS_TOKEN || '',
        apiKey: process.env.TMDB_API_KEY || ''
    };
}

function buildUrl(apiPath, params) {
    const url = new URL(BASE_URL + apiPath);
    const query = Object.assign({}, params || {});

    if (!query.language) {
        query.language = DEFAULT_LANGUAGE;
    }

    Object.keys(query).forEach(key => {
        if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
            url.searchParams.set(key, query[key]);
        }
    });

    return url;
}

function requestTmdb(apiPath, params) {
    const credential = getCredential();
    const requestParams = Object.assign({}, params || {});

    if (!credential.token && !credential.apiKey) {
        const error = new Error('TMDB credential is missing');
        error.publicMessage = 'TMDB 服务端凭证未配置';
        throw error;
    }

    if (!credential.token) {
        requestParams.api_key = credential.apiKey;
    }

    const url = buildUrl(apiPath, requestParams);
    const resolveIp = process.env.TMDB_API_RESOLVE_IP || '';
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json'
        },
        timeout: REQUEST_TIMEOUT
    };

    if (resolveIp && url.hostname === BASE_URL_HOSTNAME) {
        options.lookup = (hostname, lookupOptions, callback) => {
            callback(null, resolveIp, 4);
        };
    }

    if (credential.token) {
        options.headers.Authorization = 'Bearer ' + credential.token;
    }

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, res => {
            let body = '';

            res.on('data', chunk => {
                body += chunk;
            });

            res.on('end', () => {
                let parsed;

                try {
                    parsed = body ? JSON.parse(body) : {};
                } catch (err) {
                    err.publicMessage = 'TMDB 返回数据格式异常';
                    reject(err);
                    return;
                }

                if (res.statusCode >= 400) {
                    const error = new Error('TMDB request failed with status ' + res.statusCode);
                    error.statusCode = res.statusCode;
                    error.tmdbBody = parsed;
                    error.publicMessage = 'TMDB 数据请求失败';
                    reject(error);
                    return;
                }

                resolve(parsed);
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('TMDB request timeout'));
        });

        req.on('error', err => {
            err.publicMessage = 'TMDB 数据请求失败';
            reject(err);
        });

        req.end();
    });
}

function getImageUrl(path, size) {
    if (!path) {
        return '';
    }
    return IMAGE_PROXY_BASE_URL + '/' + (size || 'w342') + path;
}

function getContentType(file) {
    const ext = path.extname(file).toLowerCase();

    if (ext === '.png') {
        return 'image/png';
    }
    if (ext === '.webp') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function getImageCachePath(size, file) {
    return path.join(IMAGE_CACHE_DIR, size, file);
}

async function readCachedImage(size, file) {
    const cachePath = getImageCachePath(size, file);
    const body = await fs.promises.readFile(cachePath);
    const now = new Date();

    fs.promises.utimes(cachePath, now, now).catch(() => {});

    return {
        contentType: getContentType(file),
        cacheControl: 'public, max-age=31536000',
        body
    };
}

async function listCachedFiles(dir) {
    let files = [];
    let entries = [];

    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return files;
        }
        throw err;
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files = files.concat(await listCachedFiles(fullPath));
            continue;
        }

        if (entry.isFile()) {
            if (entry.name.indexOf('.tmp-') !== -1) {
                continue;
            }

            let stat;

            try {
                stat = await fs.promises.stat(fullPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    continue;
                }
                throw err;
            }

            files.push({
                path: fullPath,
                size: stat.size,
                time: Math.min(stat.atimeMs, stat.mtimeMs)
            });
        }
    }

    return files;
}

async function enforceImageCacheLimit() {
    if (!IMAGE_CACHE_MAX_BYTES || IMAGE_CACHE_MAX_BYTES < 1) {
        return;
    }

    const files = await listCachedFiles(IMAGE_CACHE_DIR);
    let total = files.reduce((sum, item) => sum + item.size, 0);

    if (total <= IMAGE_CACHE_MAX_BYTES) {
        return;
    }

    files.sort((a, b) => a.time - b.time);

    for (let i = 0; i < files.length && total > IMAGE_CACHE_MAX_BYTES; i++) {
        try {
            await fs.promises.unlink(files[i].path);
            total -= files[i].size;
        } catch (err) {
            if (err.code === 'ENOENT') {
                continue;
            }
            console.error('[tmdb-image-cache] remove failed', files[i].path, err.message);
        }
    }
}

function triggerImageCacheCleanup() {
    if (imageCacheCleanupTask) {
        return;
    }

    imageCacheCleanupTask = enforceImageCacheLimit()
        .catch(err => {
            console.error('[tmdb-image-cache] cleanup failed', err.message);
        })
        .finally(() => {
            imageCacheCleanupTask = null;
        });
}

async function writeCachedImage(size, file, image) {
    const cachePath = getImageCachePath(size, file);
    const tmpPath = cachePath + '.tmp-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);

    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.promises.writeFile(tmpPath, image.body);
    await fs.promises.rename(tmpPath, cachePath);
    triggerImageCacheCleanup();
}

function fetchTmdbImage(size, file) {
    const url = new URL(IMAGE_BASE_URL + '/' + size + '/' + file);

    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'GET', timeout: REQUEST_TIMEOUT }, res => {
            const chunks = [];

            res.on('data', chunk => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                if (res.statusCode >= 400) {
                    const error = new Error('TMDB image request failed with status ' + res.statusCode);
                    error.statusCode = res.statusCode;
                    error.publicMessage = '图片暂时不可用';
                    reject(error);
                    return;
                }

                resolve({
                    contentType: res.headers['content-type'] || 'image/jpeg',
                    cacheControl: res.headers['cache-control'] || 'public, max-age=604800',
                    body: Buffer.concat(chunks)
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('TMDB image request timeout'));
        });

        req.on('error', err => {
            err.publicMessage = '图片暂时不可用';
            reject(err);
        });

        req.end();
    });
}

async function requestTmdbImage(size, file) {
    try {
        return await readCachedImage(size, file);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('[tmdb-image-cache] read failed', err.message);
        }
    }

    const image = await fetchTmdbImage(size, file);
    await writeCachedImage(size, file, image);
    return image;
}

module.exports = {
    DEFAULT_LANGUAGE,
    DEFAULT_REGION,
    DEFAULT_TIMEZONE,
    requestTmdb,
    requestTmdbImage,
    getImageUrl
};
