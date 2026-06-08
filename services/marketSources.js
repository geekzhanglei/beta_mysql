const http = require('http');
const https = require('https');
const {
    GLOBAL_MARKET_CAP_COUNTRIES
} = require('./marketDefinitions');

const REQUEST_TIMEOUT = Number(process.env.MARKET_ORIGIN_TIMEOUT || 12000);

function normalizeNumber(value) {
    if (value === '-' || value == null || value === '') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function requestText(url, headers) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const client = url.indexOf('http://') === 0 ? http : https;
        const req = client.get(url, {
            timeout: REQUEST_TIMEOUT,
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0 (compatible; feroad-market-api/1.0)',
                Accept: 'application/json,text/plain,*/*'
            }, headers || {})
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                const meta = {
                    statusCode: res.statusCode,
                    latencyMs: Date.now() - startedAt
                };
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    const err = new Error('origin status ' + res.statusCode);
                    err.meta = meta;
                    reject(err);
                    return;
                }
                resolve({ body, meta });
            });
        });

        req.on('timeout', () => req.destroy(new Error('origin timeout')));
        req.on('error', err => {
            err.meta = {
                statusCode: null,
                latencyMs: Date.now() - startedAt
            };
            reject(err);
        });
    });
}

async function requestJson(originKey, url, headers, statusReporter) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const startedAt = Date.now();
        try {
            const result = await requestText(url, headers);
            const json = JSON.parse(result.body);
            if (statusReporter) {
                await statusReporter({
                    originKey,
                    endpoint: url,
                    status: 'success',
                    statusCode: result.meta.statusCode,
                    latencyMs: result.meta.latencyMs,
                    message: '',
                    fetchedAt: new Date()
                });
            }
            return json;
        } catch (err) {
            lastError = err;
            if (attempt === 3 && statusReporter) {
                await statusReporter({
                    originKey,
                    endpoint: url,
                    status: 'failure',
                    statusCode: err.meta && err.meta.statusCode,
                    latencyMs: err.meta && err.meta.latencyMs || Date.now() - startedAt,
                    message: err.message,
                    fetchedAt: new Date()
                });
            }
        }
    }
    throw lastError;
}

function eastmoneyStockUrl(secid) {
    return 'https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&fields=' +
        [
            'f43', 'f44', 'f45', 'f46', 'f47', 'f48', 'f57', 'f58', 'f60',
            'f107', 'f116', 'f117', 'f162', 'f167', 'f168', 'f169', 'f170'
        ].join(',') +
        '&secid=' + encodeURIComponent(secid);
}

function eastmoneyKlineUrl(secid, years) {
    const end = new Date();
    const begin = new Date(end);
    begin.setFullYear(begin.getFullYear() - years);
    const beg = [
        begin.getFullYear(),
        String(begin.getMonth() + 1).padStart(2, '0'),
        String(begin.getDate()).padStart(2, '0')
    ].join('');
    const endText = [
        end.getFullYear(),
        String(end.getMonth() + 1).padStart(2, '0'),
        String(end.getDate()).padStart(2, '0')
    ].join('');

    return 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' +
        'fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
        '&klt=101&fqt=0&secid=' + encodeURIComponent(secid) +
        '&beg=' + beg + '&end=' + endText;
}

function tencentKlineUrl(code, years) {
    const end = new Date();
    const begin = new Date(end);
    begin.setFullYear(begin.getFullYear() - years);
    const beg = [
        begin.getFullYear(),
        String(begin.getMonth() + 1).padStart(2, '0'),
        String(begin.getDate()).padStart(2, '0')
    ].join('-');
    const endText = [
        end.getFullYear(),
        String(end.getMonth() + 1).padStart(2, '0'),
        String(end.getDate()).padStart(2, '0')
    ].join('-');

    return 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' +
        encodeURIComponent(code + ',month,' + beg + ',' + endText + ',640,qfq');
}

function eastmoneyClistUrl(fs, fields, page, size) {
    return 'https://push2.eastmoney.com/api/qt/clist/get?pn=' + page +
        '&pz=' + size +
        '&po=1&np=1&fltt=2&invt=2&fid=f3&fs=' + encodeURIComponent(fs) +
        '&fields=' + encodeURIComponent(fields.join(','));
}

function worldBankUrl(countries, indicator) {
    return 'https://api.worldbank.org/v2/country/' + countries.join(';') +
        '/indicator/' + indicator + '?format=json&per_page=20000';
}

async function fetchQuote(market, statusReporter) {
    const data = await requestJson('eastmoney.quote.' + market.id, eastmoneyStockUrl(market.secid), {
        Referer: 'https://quote.eastmoney.com/'
    }, statusReporter);
    const item = data && data.data ? data.data : {};
    return {
        close: normalizeNumber(item.f43),
        previousClose: normalizeNumber(item.f60),
        changePct: normalizeNumber(item.f170),
        marketCap: normalizeNumber(item.f116),
        floatMarketCap: normalizeNumber(item.f117),
        peTtm: normalizeNumber(item.f162),
        pb: normalizeNumber(item.f167),
        turnoverRate: normalizeNumber(item.f168),
        amount: normalizeNumber(item.f48)
    };
}

async function fetchKlines(market, years, statusReporter) {
    const errors = [];

    try {
        const rows = await fetchEastmoneyKlines(market, years, statusReporter);
        if (rows.length) {
            return rows;
        }
        errors.push(new Error('eastmoney kline empty'));
    } catch (err) {
        errors.push(err);
    }

    try {
        const rows = await fetchTencentMonthlyKlines(market, years, statusReporter);
        if (rows.length) {
            return rows;
        }
        errors.push(new Error('tencent kline empty'));
    } catch (err) {
        errors.push(err);
    }

    const err = new Error('market history origin failed: ' + errors.map(item => item.message).join('; '));
    err.causes = errors;
    throw err;
}

async function fetchEastmoneyKlines(market, years, statusReporter) {
    const data = await requestJson('eastmoney.kline.' + market.id, eastmoneyKlineUrl(market.secid, years), {
        Referer: 'https://quote.eastmoney.com/'
    }, statusReporter);
    const rows = data && data.data && Array.isArray(data.data.klines) ? data.data.klines : [];
    return rows.map(row => {
        const parts = row.split(',');
        return {
            date: parts[0],
            open: normalizeNumber(parts[1]),
            close: normalizeNumber(parts[2]),
            high: normalizeNumber(parts[3]),
            low: normalizeNumber(parts[4]),
            volume: normalizeNumber(parts[5]),
            amount: normalizeNumber(parts[6]),
            amplitude: normalizeNumber(parts[7]),
            changePct: normalizeNumber(parts[8]),
            change: normalizeNumber(parts[9]),
            turnoverRate: normalizeNumber(parts[10])
        };
    }).filter(item => item.date && item.close != null);
}

async function fetchTencentMonthlyKlines(market, years, statusReporter) {
    if (!market.tencentCode) {
        return [];
    }

    const data = await requestJson('tencent.kline.' + market.id, tencentKlineUrl(market.tencentCode, years), {
        Referer: 'https://gu.qq.com/'
    }, statusReporter);
    const item = data && data.data && data.data[market.tencentCode] ? data.data[market.tencentCode] : {};
    const rows = Array.isArray(item.month) ? item.month : [];

    return rows.map(row => ({
        date: row[0],
        open: normalizeNumber(row[1]),
        close: normalizeNumber(row[2]),
        high: normalizeNumber(row[3]),
        low: normalizeNumber(row[4]),
        volume: normalizeNumber(row[5]),
        amount: null,
        amplitude: null,
        changePct: null,
        change: null,
        turnoverRate: null
    })).filter(item => item.date && item.close != null);
}

async function fetchEastmoneyList(originKey, fs, fields, statusReporter, size) {
    const pageSize = size || 100;
    let page = 1;
    let pages = 1;
    const result = [];
    while (page <= pages) {
        const data = await requestJson(originKey + '.p' + page, eastmoneyClistUrl(fs, fields, page, pageSize), {
            Referer: 'https://quote.eastmoney.com/'
        }, statusReporter);
        const diff = data && data.data && Array.isArray(data.data.diff) ? data.data.diff : [];
        result.push.apply(result, diff);
        const total = data && data.data ? Number(data.data.total) || diff.length : diff.length;
        pages = Math.max(1, Math.ceil(total / pageSize));
        page++;
        if (page > 80) {
            break;
        }
    }
    return result;
}

function normalizeAshareRow(row) {
    return {
        code: row.f12,
        name: row.f14,
        close: normalizeNumber(row.f2),
        changePct: normalizeNumber(row.f3),
        amount: normalizeNumber(row.f6),
        turnoverRate: normalizeNumber(row.f8),
        peTtm: normalizeNumber(row.f9),
        pb: normalizeNumber(row.f23),
        marketCap: normalizeNumber(row.f20),
        floatMarketCap: normalizeNumber(row.f21),
        industry: row.f100 || '未分类'
    };
}

async function fetchAshareSpot(statusReporter) {
    const fields = ['f2', 'f3', 'f6', 'f8', 'f9', 'f12', 'f14', 'f20', 'f21', 'f23', 'f100'];
    const rows = await fetchEastmoneyList(
        'eastmoney.ashare.spot',
        'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fields,
        statusReporter,
        500
    );
    return rows.map(normalizeAshareRow).filter(item => item.code && item.marketCap != null);
}

async function fetchIndustryFlow(statusReporter) {
    const fields = ['f2', 'f3', 'f6', 'f8', 'f12', 'f14', 'f20', 'f62'];
    const rows = await fetchEastmoneyList('eastmoney.industry.flow', 'm:90+t:2,m:90+t:3', fields, statusReporter, 100);
    return rows.map(row => ({
        code: row.f12,
        name: row.f14,
        changePct: normalizeNumber(row.f3),
        amount: normalizeNumber(row.f62) == null ? normalizeNumber(row.f6) : normalizeNumber(row.f62),
        turnover: normalizeNumber(row.f6),
        marketCap: normalizeNumber(row.f20)
    })).filter(item => item.name);
}

async function fetchEtfList(statusReporter) {
    const fields = ['f2', 'f3', 'f6', 'f12', 'f14', 'f20'];
    const rows = await fetchEastmoneyList('eastmoney.etf.spot', 'b:MK0021,b:MK0022,b:MK0023,b:MK0024', fields, statusReporter, 200);
    return rows.map(row => ({
        code: row.f12,
        name: row.f14,
        close: normalizeNumber(row.f2),
        changePct: normalizeNumber(row.f3),
        turnover: normalizeNumber(row.f6),
        marketCap: normalizeNumber(row.f20)
    })).filter(item => item.code && item.name);
}

async function fetchWorldBankMarketCaps(statusReporter) {
    const countries = GLOBAL_MARKET_CAP_COUNTRIES.map(item => item.code);
    const data = await requestJson('worldbank.marketcap', worldBankUrl(countries, 'CM.MKT.LCAP.CD'), {}, statusReporter);
    const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    const latestByCode = {};
    rows.forEach(row => {
        if (!row || !row.countryiso3code || row.value == null) {
            return;
        }
        if (!latestByCode[row.countryiso3code] || Number(row.date) > Number(latestByCode[row.countryiso3code].date)) {
            latestByCode[row.countryiso3code] = row;
        }
    });
    return GLOBAL_MARKET_CAP_COUNTRIES.map(item => {
        const row = latestByCode[item.code] || {};
        return {
            name: item.name,
            cap: normalizeNumber(row.value),
            date: row.date || null,
            note: item.note,
            source: 'worldbank:CM.MKT.LCAP.CD'
        };
    }).filter(item => item.cap != null);
}

async function fetchWorldBankGdp(countryCode, statusReporter) {
    const data = await requestJson('worldbank.gdp.' + countryCode, worldBankUrl([countryCode], 'NY.GDP.MKTP.CD'), {}, statusReporter);
    const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    const latest = rows.find(row => row && row.value != null);
    return latest ? {
        value: normalizeNumber(latest.value),
        date: latest.date,
        source: 'worldbank:NY.GDP.MKTP.CD'
    } : null;
}

function stockSecid(code) {
    const raw = String(code || '').toUpperCase();
    const symbol = raw.split('.')[0];
    if (raw.endsWith('.SH') || symbol.startsWith('6')) {
        return '1.' + symbol;
    }
    return '0.' + symbol;
}

async function fetchStockQuote(stock, statusReporter) {
    return fetchQuote({
        id: stock.code.replace('.', '').toLowerCase(),
        secid: stockSecid(stock.code)
    }, statusReporter);
}

function dividendUrl(stock) {
    const symbol = String(stock.code || '').split('.')[0];
    return 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=REPORT_DATE&sortTypes=-1&pageSize=200&pageNumber=1&reportName=RPT_SHAREBONUS_DET&columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,EX_DIVIDEND_DATE,IMPL_PLAN_PROFILE,CASH_DIVIDEND_RATIO&filter=(SECURITY_CODE="' + symbol + '")';
}

async function fetchDividendEvents(stock, statusReporter) {
    const data = await requestJson('eastmoney.dividend.' + stock.code, dividendUrl(stock), {
        Referer: 'https://data.eastmoney.com/'
    }, statusReporter);
    const rows = data && data.result && Array.isArray(data.result.data) ? data.result.data : [];
    return rows.map(row => ({
        date: row.EX_DIVIDEND_DATE || row.REPORT_DATE,
        reportDate: row.REPORT_DATE,
        exDividendDate: row.EX_DIVIDEND_DATE,
        plan: row.IMPL_PLAN_PROFILE || '',
        cashDividendRatio: normalizeNumber(row.CASH_DIVIDEND_RATIO)
    })).filter(item => item.date);
}

module.exports = {
    normalizeNumber,
    fetchQuote,
    fetchKlines,
    fetchAshareSpot,
    fetchIndustryFlow,
    fetchEtfList,
    fetchWorldBankMarketCaps,
    fetchWorldBankGdp,
    fetchStockQuote,
    fetchDividendEvents
};
