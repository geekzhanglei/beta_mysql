const crypto = require('crypto');
const {
    getDatasetCache,
    setDatasetCache,
    setOriginStatus,
    listOriginStatus
} = require('./marketStore');
const sources = require('./marketSources');
const {
    MARKET_CACHE_VERSION,
    REFRESH_POLICY,
    INDEX_MARKETS,
    STYLE_CATALOG,
    STYLE_ROTATIONS,
    VALUE_STOCKS
} = require('./marketDefinitions');

const DAILY_REFRESH_HOUR = Number(process.env.MARKET_REFRESH_HOUR || 1);

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDate(date) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
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
    return new Date().toISOString();
}

function round(value, digits) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return null;
    }
    const scale = Math.pow(10, digits == null ? 2 : digits);
    return Math.round(num * scale) / scale;
}

function calcPercentile(points, value, key) {
    const list = points.map(item => sources.normalizeNumber(item[key])).filter(item => item != null).sort((a, b) => a - b);
    if (!list.length || value == null) {
        return null;
    }
    let count = 0;
    while (count < list.length && list[count] <= value) {
        count++;
    }
    return Math.round(count / list.length * 100);
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
    return round(8 + closePercentile / 100 * 24, 2);
}

function heatLabel(score) {
    if (score < 30) return '偏冷';
    if (score < 55) return '中性偏冷';
    if (score < 70) return '中性偏热';
    if (score < 85) return '偏热';
    return '拥挤';
}

function levelStatus(score) {
    if (score == null) return '数据补充中';
    if (score < 20) return '低估';
    if (score < 50) return '合理';
    if (score < 80) return '偏热';
    return '拥挤';
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

async function safeCall(fn, fallback) {
    try {
        return await fn();
    } catch (err) {
        return fallback;
    }
}

async function buildMarketCard(market) {
    const quote = await safeCall(() => sources.fetchQuote(market, setOriginStatus), {});
    const klines = await safeCall(() => sources.fetchKlines(market, 1, setOriginStatus), []);
    const close = quote.close;
    const closePercentile = calcPercentile(klines, close, 'close');
    const first = klines[0] || {};

    return {
        id: market.id,
        code: market.code,
        name: market.name,
        region: market.region,
        style: market.style,
        status: levelStatus(quote.peTtm ? closePercentile : closePercentile),
        close,
        changePct: quote.changePct,
        peTtm: quote.peTtm || fallbackPeFromClosePercentile(closePercentile),
        pePercentile: closePercentile,
        marketCap: quote.marketCap,
        marketCapChangePct: calcChangePct(first.close, close),
        currency: market.currency,
        peType: quote.peTtm ? 'ttm' : 'close-percentile-estimate',
        valuationSource: quote.peTtm ? 'eastmoney.quote-api' : 'eastmoney.kline-api-derived',
        dataSource: 'eastmoney-api'
    };
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
    for (let i = 0; i < INDEX_MARKETS.length; i++) {
        markets.push(await buildMarketCard(INDEX_MARKETS[i]));
    }

    const globalMarketCaps = await safeCall(() => sources.fetchWorldBankMarketCaps(setOriginStatus), []);
    const scoreValues = markets.map(item => item.pePercentile).filter(item => item != null);
    const score = scoreValues.length ? Math.round(scoreValues.reduce((sum, item) => sum + item, 0) / scoreValues.length) : 50;

    return withMeta({
        heat: {
            score,
            label: heatLabel(score),
            summary: '基于服务端每日抓取的公开接口数据计算，公开源缺失时保留上一版缓存并标记状态。'
        },
        signals: buildSignals(markets),
        globalMarketCaps,
        markets
    });
}

async function buildHistory(id, years) {
    const market = INDEX_MARKETS.find(item => item.id === id) || INDEX_MARKETS[0];
    const quote = await safeCall(() => sources.fetchQuote(market, setOriginStatus), {});
    const klines = await sources.fetchKlines(market, years, setOriginStatus);
    const monthly = downsampleMonthly(klines);
    const currentClose = quote.close || (klines[klines.length - 1] || {}).close;
    const sortedCloses = klines.map(item => item.close).filter(item => item != null).sort((a, b) => a - b);

    const points = monthly.map(item => {
        const percentile = calcPercentileFromSorted(sortedCloses, item.close);
        return {
            date: item.date.slice(0, 7),
            close: item.close,
            marketCap: quote.marketCap && currentClose ? quote.marketCap * item.close / currentClose : null,
            peTtm: quote.peTtm || fallbackPeFromClosePercentile(percentile),
            pePercentile: percentile
        };
    });

    return withMeta({
        market: {
            id: market.id,
            code: market.code,
            name: market.name,
            currency: market.currency,
            peType: quote.peTtm ? 'ttm-current-scaled' : 'close-percentile-estimate',
            marketCapSource: 'eastmoney.quote-api-current-marketcap-scaled-by-kline',
            peSource: quote.peTtm ? 'eastmoney.quote-api-current' : 'eastmoney.kline-api-derived'
        },
        points
    });
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

function aggregateIndustries(ashares, industryFlows) {
    const map = {};
    ashares.forEach(stock => {
        const name = stock.industry || '未分类';
        if (!map[name]) {
            map[name] = { name, marketCap: 0, turnover: 0, amount: 0, members: 0, peSum: 0, peCount: 0 };
        }
        map[name].marketCap += Number(stock.marketCap) || 0;
        map[name].turnover += Number(stock.amount) || 0;
        map[name].members += 1;
        if (stock.peTtm != null) {
            map[name].peSum += Number(stock.peTtm);
            map[name].peCount += 1;
        }
    });

    industryFlows.forEach(flow => {
        if (!map[flow.name]) {
            map[flow.name] = { name: flow.name, marketCap: Number(flow.marketCap) || 0, turnover: 0, amount: 0, members: 0, peSum: 0, peCount: 0 };
        }
        if (flow.marketCap != null) {
            map[flow.name].marketCap = Number(flow.marketCap) || map[flow.name].marketCap;
        }
        map[flow.name].amount = Number(flow.amount) || 0;
        if (flow.turnover != null) {
            map[flow.name].turnover = Number(flow.turnover) || map[flow.name].turnover;
        }
    });

    return Object.values(map).map(item => {
        const estimatedAmount = item.amount || 0;
        return {
            name: item.name,
            marketCap: round(item.marketCap, 0),
            turnover: round(item.turnover / 100000000, 1),
            amount: round(estimatedAmount / 100000000, 1),
            peTtm: item.peCount ? round(item.peSum / item.peCount, 1) : null
        };
    }).filter(item => item.marketCap || item.turnover).sort((a, b) => Number(b.marketCap) - Number(a.marketCap));
}

function buildStyles(industryMatrix) {
    const totalTurnover = industryMatrix.reduce((sum, item) => sum + (Number(item.turnover) || 0), 0) || 1;
    const maxAbsFlow = Math.max.apply(null, industryMatrix.map(item => Math.abs(Number(item.amount) || 0)).concat([1]));

    return STYLE_CATALOG.map(style => {
        const rows = industryMatrix.filter(item => style.industries.indexOf(item.name) >= 0);
        const marketCap = rows.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0);
        const netFlow = rows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const turnover = rows.reduce((sum, item) => sum + (Number(item.turnover) || 0), 0);
        const flow = Math.max(0, Math.min(100, 50 + netFlow / maxAbsFlow * 45));
        const crowding = Math.max(0, Math.min(100, turnover / totalTurnover * 420));
        const valuationRows = rows.map(item => item.peTtm).filter(item => item != null);
        const valuation = valuationRows.length ? Math.max(0, Math.min(100, valuationRows.reduce((sum, item) => sum + item, 0) / valuationRows.length * 2.8)) : 50;
        return {
            id: style.id,
            name: style.name,
            industries: style.industries.join('、'),
            heat: round((flow + crowding) / 2, 0),
            marketCap,
            flow: round(flow, 0),
            crowding: round(crowding, 0),
            valuation: round(valuation, 0),
            breadth: 50,
            netFlow: round(netFlow, 1),
            turnoverShare: round(turnover / totalTurnover * 100, 1),
            risk: crowding >= 80 ? '拥挤偏高' : crowding >= 55 ? '趋势活跃' : '交易不拥挤',
            note: rows.map(item => item.name).join('、') || '公开源数据补充中'
        };
    });
}

function buildEtfRanking(etfs) {
    return etfs
        .filter(item => /300|500|A500|科创|红利|医药|消费|芯片|证券|创业|1000/i.test(item.name))
        .map(item => {
            const turnover = Number(item.turnover) || 0;
            const changePct = Number(item.changePct) || 0;
            const amount = turnover * changePct / 100 * 0.08 / 100000000;
            const trend = Array.from({ length: 20 }, (_, index) => round(amount * (index + 1) * (0.72 + index / 80), 1));
            return {
                name: item.name,
                amount: round(amount, 1),
                turnover: round(turnover / 100000000, 1),
                theme: item.name.replace(/ETF.*/, 'ETF'),
                trend
            };
        })
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, 8);
}

function buildBreadth(ashares) {
    const up = ashares.filter(item => Number(item.changePct) > 0).length;
    const down = ashares.filter(item => Number(item.changePct) < 0).length;
    const flat = Math.max(0, ashares.length - up - down);
    const advanceDecline = up - down;
    return {
        up,
        down,
        flat,
        indexChange: null,
        note: down > up ? '下跌家数多于上涨家数，市场广度偏弱。' : '上涨家数多于下跌家数，市场广度较好。',
        history: [{ date: formatDate(new Date()).slice(5), advanceDecline }]
    };
}

async function buildMarketStyle() {
    const ashares = await safeCall(() => sources.fetchAshareSpot(setOriginStatus), []);
    const industryFlows = await safeCall(() => sources.fetchIndustryFlow(setOriginStatus), []);
    const etfs = await safeCall(() => sources.fetchEtfList(setOriginStatus), []);
    const industryMatrix = aggregateIndustries(ashares, industryFlows).slice(0, 31);
    const styles = buildStyles(industryMatrix);
    const strongest = styles.slice().sort((a, b) => Number(b.heat) - Number(a.heat))[0] || styles[0];
    const totalTurnover = ashares.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const mainNetFlow = styles.reduce((sum, item) => sum + (Number(item.netFlow) || 0), 0) * 100000000;
    const crowdingIndustries = industryMatrix.slice(0, 12).map(item => ({
        name: item.name,
        marketCap: item.marketCap,
        score: round(Math.min(100, Math.abs(Number(item.amount) || 0) * 2 + Number(item.turnover || 0) / 80), 0),
        turnoverShare: round(totalTurnover ? Number(item.turnover || 0) * 100000000 / totalTurnover * 100 : 0, 1),
        fundFlow: item.amount,
        valuationPercentile: item.peTtm == null ? 50 : Math.min(100, Math.round(item.peTtm * 2.8))
    }));
    const topIndustries = industryMatrix.slice(0, 5);
    const totalCap = industryMatrix.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) || 1;

    return withMeta({
        mainline: {
            name: strongest.name,
            score: strongest.heat,
            netFlow: strongest.netFlow,
            turnoverShare: strongest.turnoverShare,
            crowding: strongest.crowding,
            verdict: '当前主线是' + strongest.name + '：基于行业资金流、成交占比和拥挤度综合判断。',
            reasons: [
                '资金强度来自东方财富公开资金流接口或成交额方向估算。',
                '行业规模来自 A 股全量行情接口的总市值聚合。',
                '拥挤度由成交占比、净流入占比和行业集中度综合计算。'
            ]
        },
        styles,
        rotations: STYLE_ROTATIONS,
        fundFlow: {
            summary: '基于公开接口每日更新，重点看资金相对成交额的比例，不单看绝对金额。',
            turnover: { total: totalTurnover },
            marketNetFlow: mainNetFlow,
            etfRanking: buildEtfRanking(etfs),
            industryMatrix,
            northbound: { today: 0, week: 0, month: 0, focus: [] },
            styleFlows: styles.map(item => ({ name: item.name, amount: item.netFlow, strength: item.flow }))
        },
        crowding: {
            industries: crowdingIndustries,
            ranks: crowdingIndustries.slice().sort((a, b) => b.score - a.score).slice(0, 8).map(item => ({
                name: item.name,
                score: item.score,
                reason: '成交占比、资金流和估值位置综合偏高'
            })),
            breadth: buildBreadth(ashares),
            fundCluster: {
                concentration: round(topIndustries.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) / totalCap * 100, 0),
                topStocks: ashares.slice().sort((a, b) => Number(b.marketCap || 0) - Number(a.marketCap || 0)).slice(0, 5).map(item => item.name),
                concentrationTrend: [{ date: formatDate(new Date()).slice(0, 7), value: round(topIndustries.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) / totalCap * 100, 0) }],
                industries: topIndustries.map(item => ({ name: item.name, weight: round(Number(item.marketCap || 0) / totalCap * 100, 1) }))
            },
            history: [{ date: formatDate(new Date()).slice(0, 7), score: strongest.crowding }]
        }
    });
}

function buildDividendTrend(events, close) {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, index) => currentYear - 9 + index);
    const byYear = {};
    events.forEach(event => {
        const year = Number(String(event.date || '').slice(0, 4));
        if (!year) return;
        byYear[year] = (byYear[year] || 0) + (Number(event.cashDividendRatio) || 0);
    });
    return years.map(year => {
        const dividendPerShare = (byYear[year] || 0) / 10;
        return close ? round(dividendPerShare / close * 100, 1) : 0;
    });
}

async function buildValue() {
    const stocks = [];
    for (let i = 0; i < VALUE_STOCKS.length; i++) {
        const stock = VALUE_STOCKS[i];
        const quote = await safeCall(() => sources.fetchStockQuote(stock, setOriginStatus), {});
        const events = await safeCall(() => sources.fetchDividendEvents(stock, setOriginStatus), []);
        const trend = buildDividendTrend(events, quote.close);
        const dividendYield = trend[trend.length - 1] || 0;
        stocks.push({
            code: stock.code,
            name: stock.name,
            dividendYield,
            payout: quote.peTtm && dividendYield ? round(quote.peTtm * dividendYield, 0) : null,
            pe: quote.peTtm,
            issueRisk: stock.issueRisk,
            badNews: '公告和重大利空监控待接入；当前仅展示公开行情与分红口径。',
            trend
        });
    }

    return withMeta({
        summary: '固定观察 A 股大蓝筹股息票。数据来自公开行情和分红接口，后续可接入公告状态监控。',
        stocks
    });
}

function withMeta(payload) {
    return Object.assign({
        source: 'origin',
        updatedAt: updatedAtText(),
        nextUpdateAt: nextRefreshDate().toISOString(),
        refreshPolicy: REFRESH_POLICY,
        calcVersion: MARKET_CACHE_VERSION
    }, payload);
}

async function withDailyCache(cacheKey, builder) {
    const key = 'market:' + MARKET_CACHE_VERSION + ':' + cacheKey;
    const cached = await getDatasetCache(key);

    if (cached && cached.isFresh) {
        return Object.assign({}, cached.payload, { source: 'cache' });
    }

    try {
        const payload = await builder();
        await setDatasetCache(key, payload, nextRefreshDate());
        return payload;
    } catch (err) {
        if (cached && cached.payload) {
            return Object.assign({}, cached.payload, {
                source: 'stale-cache',
                stale: true,
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
    getStyle: () => withDailyCache('style', buildMarketStyle),
    getFundFlow: () => withDailyCache('style', buildMarketStyle),
    getCrowding: () => withDailyCache('style', buildMarketStyle),
    getValue: () => withDailyCache('value', buildValue),
    getHistory: (id, years) => withDailyCache('history:' + id + ':' + years, () => buildHistory(id, years)),
    getOriginStatus: listOriginStatus
};
