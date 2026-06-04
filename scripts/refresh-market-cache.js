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

const { INDEX_MARKETS } = require('../services/marketDefinitions');

const API_BASE_URL = process.env.MARKET_WARM_API_BASE_URL || 'http://127.0.0.1:3000';
const REQUEST_TIMEOUT = Number(process.env.MARKET_WARM_REQUEST_TIMEOUT || 120000);

function requestJson(urlPath) {
    const url = API_BASE_URL.replace(/\/$/, '') + urlPath;
    const client = url.indexOf('https://') === 0 ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(url, {
            timeout: REQUEST_TIMEOUT,
            headers: {
                Accept: 'application/json'
            }
        }, res => {
            const chunks = [];

            res.on('data', chunk => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const bodyText = Buffer.concat(chunks).toString('utf8');
                let body;

                try {
                    body = JSON.parse(bodyText);
                } catch (err) {
                    reject(new Error('invalid json ' + urlPath));
                    return;
                }

                if (res.statusCode >= 400 || body.code !== 0) {
                    reject(new Error('HTTP ' + res.statusCode + ' ' + (body.msg || urlPath)));
                    return;
                }

                resolve(body.data);
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('timeout ' + urlPath));
        });

        req.on('error', reject);
    });
}

async function warmEndpoint(urlPath) {
    const data = await requestJson(urlPath);
    console.log('[market-refresh] ok', urlPath, 'source=' + (data && data.source || 'unknown'));
}

async function main() {
    const endpoints = [
        '/blogapi/market/overview',
        '/blogapi/market/style',
        '/blogapi/market/value'
    ];

    INDEX_MARKETS.forEach(market => {
        endpoints.push('/blogapi/market/history?id=' + encodeURIComponent(market.id) + '&years=10');
    });

    for (let i = 0; i < endpoints.length; i++) {
        try {
            await warmEndpoint(endpoints[i]);
        } catch (err) {
            console.error('[market-refresh] failed', endpoints[i], err.message);
            process.exitCode = 1;
        }
    }
}

main().catch(err => {
    console.error('[market-refresh] failed', err);
    process.exit(1);
});
