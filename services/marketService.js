const crypto = require('crypto');
const https = require('https');
const { getMarketCacheEntry, setMarketCache } = require('./marketStore');

const MARKET_CACHE_VERSION = 'v1';
const DAILY_REFRESH_HOUR = Number(process.env.MARKET_REFRESH_HOUR || 1);
const REQUEST_TIMEOUT = Number(process.env.MARKET_ORIGIN_TIMEOUT || 12000);

const MARKETS = [
    { id: 'csi300', code: '000300.SH', name: '沪深300', region: 'A股', currency: 'CNY', secid: '1.000300', history: true },
    { id: 'csi800', code: '000906.SH', name: '中证800', region: 'A股', currency: 'CNY', secid: '1.000906' },
    { id: 'csi1000', code: '000852.SH', name: '中证1000', region: 'A股', currency: 'CNY', secid: '1.000852' },
    { id: 'chinext', code: '399006.SZ', name: '创业板', region: 'A股', currency: 'CNY', secid: '0.399006' },
    { id: 'hsi', code: 'HSI.HK', name: '港股', region: '港股', currency: 'HKD' },
    { id: 'nasdaq', code: 'IXIC.US', name: '纳斯达克', region: '美股', currency: 'USD' },
    { id: 'sp500', code: 'SPX.US', name: '标普500', region: '美股', currency: 'USD' }
];

const FALLBACK_MARKETS = {
    hsi: { close: null, changePct: null, peTtm: null, pePercentile: null, marketCap: null, marketCapChangePct: null },
    nasdaq: { close: null, changePct: null, peTtm: null, pePercentile: null, marketCap: null, marketCapChangePct: null },
    sp500: { close: null, changePct: null, peTtm: null, pePercentile: null, marketCap: null, marketCapChangePct: null }
};

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDate(date) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

function formatCompactDate(date) {
    return formatDate(date).replace(/-/g, '');
}

function nextRefreshDate() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(DAILY_REFRESH_HOUR, 0, 0, 0);
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}

function updatedAtText() {
    const now = new Date();
    return now.toISOString();
}

function requestJson(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: REQUEST_TIMEOUT,
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0 (compatible; feroad-market-cache/1.0)',
                Accept: 'application/json,text/plain,*/*'
            }, headers || {})
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error('origin status ' + res.statusCode));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(new Error('origin json parse failed'));
                }
            });
        });

        req.on('timeout', () => req.destroy(new Error('origin timeout')));
        req.on('error', reject);
    });
}

async function requestJsonWithRetry(url, headers) {
    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            return await requestJson(url, headers);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

function eastmoneyStockUrl(secid) {
    return 'https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&fields=' +
        'f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f116,f117,f162,f167,f168,f169,f170' +
        '&secid=' + encodeURIComponent(secid);
}

function eastmoneyKlineUrl(secid, years) {
    const end = new Date();
    const begin = new Date(end);
    begin.setFullYear(begin.getFullYear() - years);

    return 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' +
        'fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
        '&klt=101&fqt=0&secid=' + encodeURIComponent(secid) +
        '&beg=' + formatCompactDate(begin) + '&end=' + formatCompactDate(end);
}

function normalizeNumber(value) {
    if (value === '-' || value == null || value === '') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

async function fetchEastmoneyStock(market) {
    const data = await requestJsonWithRetry(eastmoneyStockUrl(market.secid), {
        Referer: 'https://quote.eastmoney.com/'
    });
    const item = data && data.data ? data.data : {};
    return {
        close: normalizeNumber(item.f43),
        previousClose: normalizeNumber(item.f60),
        changePct: normalizeNumber(item.f170),
        marketCap: normalizeNumber(item.f116),
        floatMarketCap: normalizeNumber(item.f117),
        peTtm: normalizeNumber(item.f162),
        turnoverRate: normalizeNumber(item.f168),
        amount: normalizeNumber(item.f48)
    };
}

async function fetchEastmoneyKlines(secid, years) {
    const data = await requestJsonWithRetry(eastmoneyKlineUrl(secid, years), {
        Referer: 'https://quote.eastmoney.com/'
    });
    const rows = data && data.data && Array.isArray(data.data.klines) ? data.data.klines : [];
    return rows.map(row => {
        const parts = row.split(',');
        return {
            date: parts[0],
            close: normalizeNumber(parts[2]),
            high: normalizeNumber(parts[3]),
            low: normalizeNumber(parts[4]),
            volume: normalizeNumber(parts[5]),
            amount: normalizeNumber(parts[6]),
            changePct: normalizeNumber(parts[8])
        };
    }).filter(item => item.date && item.close != null);
}

function calcPercentile(points, value, key) {
    const list = points.map(item => normalizeNumber(item[key])).filter(item => item != null);
    if (!list.length || value == null) {
        return null;
    }
    const below = list.filter(item => item <= value).length;
    return Math.round(below / list.length * 100);
}

function calcChangePct(first, last) {
    if (!first || !last) {
        return null;
    }
    return (last - first) / first * 100;
}

function fallbackPeFromClosePercentile(closePercentile) {
    if (closePercentile == null) {
        return null;
    }
    return Math.round((8 + closePercentile / 100 * 18) * 100) / 100;
}

async function buildAshareMarket(market) {
    const stock = await fetchEastmoneyStock(market);
    const klines = await fetchEastmoneyKlines(market.secid, 1);
    const closePercentile = calcPercentile(klines, stock.close, 'close');
    const first = klines[0] || {};

    return {
        id: market.id,
        code: market.code,
        name: market.name,
        region: market.region,
        close: stock.close,
        changePct: stock.changePct,
        peTtm: stock.peTtm || fallbackPeFromClosePercentile(closePercentile),
        pePercentile: stock.peTtm ? null : closePercentile,
        marketCap: stock.marketCap,
        marketCapChangePct: calcChangePct(first.close, stock.close),
        currency: market.currency,
        peType: stock.peTtm ? 'ttm' : 'close-percentile-estimate',
        valuationSource: stock.peTtm ? 'eastmoney' : 'eastmoney-close-percentile',
        dataSource: 'eastmoney'
    };
}

function buildFallbackMarket(market) {
    const item = FALLBACK_MARKETS[market.id] || {};
    return Object.assign({
        id: market.id,
        code: market.code,
        name: market.name,
        region: market.region,
        currency: market.currency,
        peType: 'pending-origin',
        valuationSource: 'pending',
        dataSource: 'pending'
    }, item);
}

function heatLabel(score) {
    if (score < 30) {
        return '偏冷';
    }
    if (score < 55) {
        return '中性偏冷';
    }
    if (score < 70) {
        return '中性偏热';
    }
    if (score < 85) {
        return '偏热';
    }
    return '拥挤';
}

function buildSignals(markets) {
    const peValues = markets.map(item => item.pePercentile).filter(item => item != null);
    const capChanges = markets.map(item => item.marketCapChangePct).filter(item => item != null);
    const avgPe = peValues.length ? Math.round(peValues.reduce((sum, item) => sum + item, 0) / peValues.length) : null;
    const avgCap = capChanges.length ? capChanges.reduce((sum, item) => sum + item, 0) / capChanges.length : null;

    return [
        { id: 'valuation', label: '估值', value: avgPe == null ? '口径补充中' : heatLabel(avgPe) },
        { id: 'liquidity', label: '流动性', value: avgCap == null ? '观察中' : (avgCap >= 0 ? '市值扩张' : '市值收缩') },
        { id: 'update', label: '更新', value: '每日凌晨' }
    ];
}

async function buildOverview() {
    const markets = [];

    for (let i = 0; i < MARKETS.length; i++) {
        const market = MARKETS[i];
        if (market.secid) {
            try {
                markets.push(await buildAshareMarket(market));
            } catch (err) {
                markets.push(buildFallbackMarket(market));
            }
        } else {
            markets.push(buildFallbackMarket(market));
        }
    }

    const scoreValues = markets.map(item => item.pePercentile).filter(item => item != null);
    const score = scoreValues.length ? Math.round(scoreValues.reduce((sum, item) => sum + item, 0) / scoreValues.length) : 50;

    return {
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: 'daily-after-01:00-asia-shanghai',
        heat: {
            score,
            label: heatLabel(score),
            summary: '以自有后端每日缓存的公开行情和估值口径计算，缺失口径会明确标记。'
        },
        signals: buildSignals(markets),
        markets,
        marketCapSeries: await buildMarketCapSeries()
    };
}

async function buildMarketCapSeries() {
    const market = MARKETS[0];
    const stock = await fetchEastmoneyStock(market);
    const klines = await fetchEastmoneyKlines(market.secid, 1);
    const monthly = downsampleMonthly(klines);
    const currentClose = stock.close || (klines[klines.length - 1] || {}).close;

    return [{
        id: market.id,
        name: market.name,
        currency: market.currency,
        points: monthly.map(item => ({
            date: item.date.slice(0, 7),
            value: stock.marketCap && currentClose ? stock.marketCap * item.close / currentClose : null
        }))
    }];
}

function downsampleMonthly(points) {
    const result = [];
    let currentMonth = '';
    let currentPoint = null;

    points.forEach(point => {
        const month = point.date.slice(0, 7);
        if (currentMonth && month !== currentMonth && currentPoint) {
            result.push(currentPoint);
        }
        currentMonth = month;
        currentPoint = point;
    });

    if (currentPoint) {
        result.push(currentPoint);
    }
    return result;
}

async function buildCsi300History(years) {
    const market = MARKETS[0];
    const stock = await fetchEastmoneyStock(market);
    const klines = await fetchEastmoneyKlines(market.secid, years);
    const monthly = downsampleMonthly(klines);
    const currentClose = stock.close || (klines[klines.length - 1] || {}).close;
    const closePercentiles = klines.map(item => item.close).filter(item => item != null).sort((a, b) => a - b);

    const points = monthly.map(item => {
        const percentile = calcPercentileFromSorted(closePercentiles, item.close);
        return {
            date: item.date.slice(0, 7),
            close: item.close,
            marketCap: stock.marketCap && currentClose ? stock.marketCap * item.close / currentClose : null,
            peTtm: fallbackPeFromClosePercentile(percentile),
            pePercentile: percentile
        };
    });

    return {
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: 'daily-after-01:00-asia-shanghai',
        market: {
            id: market.id,
            code: market.code,
            name: market.name,
            currency: market.currency,
            peType: 'close-percentile-estimate',
            marketCapSource: 'eastmoney-current-marketcap-scaled-by-close',
            peSource: 'eastmoney-close-percentile-estimate'
        },
        points
    };
}

function calcPercentileFromSorted(sorted, value) {
    if (!sorted.length || value == null) {
        return null;
    }
    let count = 0;
    while (count < sorted.length && sorted[count] <= value) {
        count++;
    }
    return Math.round(count / sorted.length * 100);
}

function buildFundFlow() {
    return {
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: 'daily-after-01:00-asia-shanghai',
        summary: '资金流向第一版使用公开行情成交额和指数变化做方向性观察，后续接入更细资金源后扩展。',
        flows: [],
        industryFlows: []
    };
}

function buildCrowding() {
    return {
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: 'daily-after-01:00-asia-shanghai',
        calcVersion: 'crowding-v1-public-cache',
        score: {
            value: 50,
            label: '数据补充中',
            summary: '拥挤度需要资金、成交额和估值多维数据，当前仅保留接口口径。'
        },
        indicators: []
    };
}

function buildConsensus() {
    return {
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: 'daily-after-01:00-asia-shanghai',
        calcVersion: 'consensus-v1-public-cache',
        summary: '抱团方向需要行业资金和成交占比，当前接口已预留，等待公开源接入。',
        directions: []
    };
}

async function withDailyCache(cacheKey, builder) {
    const key = 'market:' + MARKET_CACHE_VERSION + ':' + cacheKey;
    const cached = await getMarketCacheEntry(key);

    if (cached && cached.isFresh) {
        return Object.assign({}, cached.payload, { source: 'cache' });
    }

    try {
        const payload = await builder();
        await setMarketCache(key, payload, nextRefreshDate());
        return payload;
    } catch (err) {
        if (cached && cached.payload) {
            return Object.assign({}, cached.payload, {
                source: 'stale-cache',
                staleReason: err.message
            });
        }
        throw err;
    }
}

function dailyToken() {
    return crypto.createHash('md5').update(formatDate(new Date())).digest('hex');
}

module.exports = {
    dailyToken,
    getOverview: () => withDailyCache('overview', buildOverview),
    getFundFlow: () => withDailyCache('fund-flow', buildFundFlow),
    getCrowding: () => withDailyCache('crowding', buildCrowding),
    getConsensus: () => withDailyCache('consensus', buildConsensus),
    getHistory: (id, years) => withDailyCache('history:' + id + ':' + years, () => {
        if (id !== 'csi300') {
            throw new Error('unsupported market history id');
        }
        return buildCsi300History(years);
    })
};
