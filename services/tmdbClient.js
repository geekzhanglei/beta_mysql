const https = require('https');

const BASE_URL = process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = process.env.TMDB_DEFAULT_LANGUAGE || 'zh-CN';
const DEFAULT_REGION = process.env.TMDB_DEFAULT_REGION || 'CN';
const DEFAULT_TIMEZONE = process.env.TMDB_DEFAULT_TIMEZONE || 'Asia/Shanghai';
const IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';
const REQUEST_TIMEOUT = Number(process.env.TMDB_REQUEST_TIMEOUT || 8000);

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
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json'
        },
        timeout: REQUEST_TIMEOUT
    };

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
    return IMAGE_BASE_URL + '/' + (size || 'w342') + path;
}

module.exports = {
    DEFAULT_LANGUAGE,
    DEFAULT_REGION,
    DEFAULT_TIMEZONE,
    requestTmdb,
    getImageUrl
};
