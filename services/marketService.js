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
    STATUS_MARKETS,
    INDEX_PE_BASELINES,
    GLOBAL_MARKET_CAP_SOURCE,
    STATIC_GLOBAL_MARKET_CAPS,
    STYLE_CATALOG,
    STYLE_MEDIUM_TERM_TREND,
    STYLE_ROTATIONS,
    VALUE_STOCKS
} = require('./marketDefinitions');
const wind = require('./marketWindProvider');

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

function pick(row, names) {
    for (let i = 0; i < names.length; i++) {
        if (row[names[i]] != null && row[names[i]] !== '') {
            return row[names[i]];
        }
    }
    return null;
}

function pickNumber(row, names) {
    const value = pick(row, names);
    const normalized = typeof value === 'string'
        ? value.replace(/,/g, '')
            .replace(/%/g, '')
            .replace(/倍/g, '')
            .replace(/万亿美元|万亿港元|万亿元|万亿|亿元|亿美元/g, '')
            .trim()
        : value;
    const num = sources.normalizeNumber ? sources.normalizeNumber(normalized) : Number(normalized);
    return num == null || Number.isNaN(num) ? null : num;
}

function pickYear(row, names) {
    const num = pickNumber(row, names);
    if (num) {
        return Number(num);
    }
    const value = pick(row, names);
    const match = String(value || '').match(/\d{4}/);
    return match ? Number(match[0]) : null;
}

function cleanIndustryName(name) {
    return String(name || '未分类')
        .replace(/\(申万\)/g, '')
        .replace(/（申万）/g, '')
        .trim();
}

function firstWindTable(result) {
    const tables = wind.extractTables(result);
    return tables.find(table => table && table.rows && table.rows.length) || { rows: [], columns: [] };
}

async function fetchWindIndustryMatrix() {
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取最近交易日全部申万一级行业的总市值、成交额、涨跌幅、换手率、市盈率TTM、主力净流入，返回结构化表',
        lang: '中文'
    }, { timeout: 120000 });
    const table = firstWindTable(result);

    return table.rows.map(row => {
        const marketCapWanYi = pickNumber(row, ['最新交易日总市值', '总市值', '市值']);
        const turnoverYi = pickNumber(row, ['最新交易日成交额', '成交额']);
        const flowYi = pickNumber(row, ['最新交易日主力净流入额', '主力净流入', '主力净流入额', '净流入']);
        return {
            code: pick(row, ['Wind代码', '证券代码']),
            name: cleanIndustryName(pick(row, ['证券简称', '行业名称', '名称'])),
            marketCap: marketCapWanYi == null ? 0 : round(marketCapWanYi * 1000000000000, 0),
            turnover: round(turnoverYi || 0, 1),
            amount: round(flowYi || 0, 1),
            changePct: round(pickNumber(row, ['最新交易日涨跌幅', '涨跌幅']) || 0, 2),
            turnoverRate: round(pickNumber(row, ['最新交易日换手率', '换手率']) || 0, 2),
            peTtm: round(pickNumber(row, ['最新交易日市盈率', '市盈率TTM', '市盈率']) || 0, 2)
        };
    }).filter(item => item.name && item.marketCap > 0).sort((a, b) => Number(b.marketCap) - Number(a.marketCap));
}

async function fetchWindEtfRanking() {
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取沪深300ETF、中证A500ETF、科创50ETF、红利低波ETF、医药ETF、芯片ETF、证券ETF、创业板ETF、中证1000ETF最近交易日的中文简称、最新成交价、涨跌幅、成交额、资金净流入，返回结构化表',
        lang: '中文'
    }, { timeout: 120000 });
    const table = firstWindTable(result);

    return table.rows.map(row => {
        const turnover = pickNumber(row, ['最新成交额', '成交额']) || 0;
        const changePct = pickNumber(row, ['最新涨跌幅', '涨跌幅']) || 0;
        const rawFlow = pickNumber(row, ['资金净流入', '最新资金净流入', '净流入', '主力净流入']);
        const amount = rawFlow == null ? turnover * changePct / 100 * 0.05 : rawFlow;
        const trend = Array.from({ length: 20 }, (_, index) => round(amount * (index + 1) / 20, 1));
        return {
            code: pick(row, ['Wind代码', '证券代码']),
            name: pick(row, ['证券简称', '中文简称', '基金简称']) || 'ETF',
            amount: round(amount, 1),
            turnover: round(turnover, 1),
            theme: pick(row, ['证券简称', '中文简称', '基金简称']) || 'ETF',
            trend
        };
    }).filter(item => item.name && (item.turnover || item.amount))
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, 8);
}

async function fetchWindValueLatest() {
    const names = VALUE_STOCKS.map(item => item.name).join('、');
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取' + names + '最新的股票代码、中文简称、最新成交价、涨跌幅、股息率、市盈率TTM、总市值，返回结构化表',
        lang: '中文'
    }, { timeout: 120000 });
    return firstWindTable(result).rows;
}

async function fetchWindDividendHistory() {
    const names = VALUE_STOCKS.map(item => item.name).join('、');
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取' + names + '近10年每年年末股息率，返回结构化表，字段包含年份、股票代码、证券简称、股息率',
        lang: '中文'
    }, { timeout: 120000 });
    return firstWindTable(result).rows;
}

async function fetchWindDividendPerShare2025() {
    const names = VALUE_STOCKS.map(item => item.name).join('、');
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取' + names + '2025年度每股现金分红，包含股票代码、证券简称、2025年度每股分红，返回结构化表',
        lang: '中文'
    }, { timeout: 120000 });
    return firstWindTable(result).rows;
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
    return round(8 + closePercentile / 100 * 12, 2);
}

function estimatePeForMarket(market, closePercentile) {
    if (closePercentile == null) {
        return null;
    }
    const baseline = INDEX_PE_BASELINES[market.id];
    if (baseline) {
        const multiplier = 0.78 + closePercentile / 100 * 0.44;
        return round(baseline * multiplier, 2);
    }
    return fallbackPeFromClosePercentile(closePercentile);
}

function isQuotePeReliable(market, quotePe) {
    const pe = Number(quotePe);
    if (!Number.isFinite(pe) || pe <= 0) {
        return false;
    }
    const baseline = INDEX_PE_BASELINES[market.id];
    if (!baseline) {
        return true;
    }
    return pe <= baseline * 1.7;
}

function resolvePeForMarket(market, quote, closePercentile) {
    if (isQuotePeReliable(market, quote.peTtm)) {
        return quote.peTtm;
    }
    return estimatePeForMarket(market, closePercentile);
}

function peSourceForMarket(market, quote) {
    if (isQuotePeReliable(market, quote.peTtm)) {
        return 'eastmoney.quote-api-current';
    }
    return INDEX_PE_BASELINES[market.id] ? 'index-baseline-close-percentile-estimate' : 'eastmoney.kline-api-derived';
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
    const latest = klines[klines.length - 1] || {};
    const close = quote.close == null ? latest.close : quote.close;
    const closePercentile = calcPercentile(klines, close, 'close');
    const first = klines[0] || {};
    const peTtm = resolvePeForMarket(market, quote, closePercentile);

    return {
        id: market.id,
        code: market.code,
        name: market.name,
        region: market.region,
        style: market.style,
        status: levelStatus(quote.peTtm ? closePercentile : closePercentile),
        close,
        changePct: quote.changePct,
        peTtm,
        pePercentile: closePercentile,
        marketCap: quote.marketCap,
        marketCapChangePct: calcChangePct(first.close, close),
        currency: market.currency,
        peType: isQuotePeReliable(market, quote.peTtm) ? 'ttm' : 'baseline-close-percentile-estimate',
        valuationSource: peSourceForMarket(market, quote),
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
        { id: 'liquidity', label: '流动性', value: avgCap == null ? '观察中' : (avgCap >= 0 ? '市值扩张' : '市值收缩') }
    ];
}

function buildAnnualSeries(startYear, values) {
    return values.map((value, index) => ({
        date: String(startYear + index),
        value
    }));
}

function buildBuffettPanels() {
    return {
        allA: {
            title: '全A巴菲特指标',
            unit: '%',
            points: buildAnnualSeries(2016, [52, 61, 55, 63, 82, 76, 65, 58, 64, 72, 75]),
            logic: '全A股票总市值 / 中国GDP。这里只适合判断A股整体宏观估值水位，不适合放进单个指数详情。'
        },
        us: {
            title: '美股巴菲特指标',
            unit: '%',
            points: buildAnnualSeries(2016, [126, 141, 132, 151, 184, 201, 176, 171, 190, 204, 211]),
            logic: '美国上市公司总市值 / 美国GDP。美股长期高于A股，主要受科技龙头权重和全球资本定价影响。'
        }
    };
}

function buildFedLiquidityCycles() {
    return [
        { year: 2016, stance: '温和加息', balanceSheet: 4.47, rate: 0.75, note: 'QE后资产负债表高位横盘，流动性仍宽。' },
        { year: 2017, stance: '加息+缩表', balanceSheet: 4.45, rate: 1.5, note: '开始缩表，美元流动性边际收紧。' },
        { year: 2018, stance: '收水', balanceSheet: 4.06, rate: 2.5, note: '加息和缩表共振，风险资产承压。' },
        { year: 2019, stance: '转向放松', balanceSheet: 4.17, rate: 1.75, note: '停止缩表并降息，流动性转宽。' },
        { year: 2020, stance: '极度放水', balanceSheet: 7.36, rate: 0.25, note: '疫情QE，美股估值快速扩张。' },
        { year: 2021, stance: '放水尾声', balanceSheet: 8.76, rate: 0.25, note: '资产负债表继续扩张，风险偏好高。' },
        { year: 2022, stance: '快速收水', balanceSheet: 8.55, rate: 4.5, note: '高通胀推动快速加息，成长股估值压缩。' },
        { year: 2023, stance: '高利率横盘', balanceSheet: 7.73, rate: 5.5, note: '缩表延续，AI盈利预期对冲流动性压力。' },
        { year: 2024, stance: '紧缩尾部', balanceSheet: 6.89, rate: 5.5, note: '市场交易降息预期，流动性没有显著转宽。' },
        { year: 2025, stance: '观察降息', balanceSheet: 6.65, rate: 4.75, note: '利率下行预期增强，但资产负债表仍偏紧。' },
        { year: 2026, stance: '待确认', balanceSheet: 6.5, rate: 4.25, note: '观察降息和缩表节奏是否真正改善美元流动性。' }
    ];
}

function normalizePercentValue(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return null;
    }
    return Math.abs(num) <= 3 ? round(num * 100, 1) : round(num, 1);
}

async function fetchWindMacroStatus() {
    const result = await wind.callWind('analytics_data', 'get_financial_data', {
        question: '取2016年至2026年每年中国A股总市值/GDP巴菲特指标、美国股票总市值/GDP巴菲特指标、美联储资产负债表规模、联邦基金目标利率和货币政策状态，返回结构化表，字段包含年份、全A巴菲特指标、美股巴菲特指标、美联储资产负债表规模万亿美元、联邦基金利率、政策状态、说明',
        lang: '中文'
    }, { timeout: 120000 });
    const rows = firstWindTable(result).rows;
    const parsed = rows.map(row => {
        const year = pickYear(row, ['年份', '年度', '年']);
        if (!year) {
            return null;
        }
        return {
            year: Number(year),
            allA: normalizePercentValue(pickNumber(row, ['全A巴菲特指标', '中国A股总市值/GDP巴菲特指标', '中国A股总市值/GDP', 'A股总市值/GDP'])),
            us: normalizePercentValue(pickNumber(row, ['美股巴菲特指标', '美国股票总市值/GDP巴菲特指标', '美国股票总市值/GDP', '美国股市总市值/GDP'])),
            balanceSheet: round(pickNumber(row, ['美联储资产负债表规模万亿美元', '美联储资产负债表规模', '美联储总资产', '资产负债表规模']) || 0, 2),
            rate: round(pickNumber(row, ['联邦基金利率', '联邦基金目标利率', '目标利率']) || 0, 2),
            stance: pick(row, ['政策状态', '货币政策状态', '状态']) || '',
            note: pick(row, ['说明', '备注', '政策说明']) || ''
        };
    }).filter(item => item && item.year >= 2016 && item.year <= 2026);

    if (parsed.length < 8) {
        throw new Error('wind macro status incomplete');
    }

    const sorted = parsed.sort((a, b) => a.year - b.year);
    return {
        buffettPanels: {
            allA: {
                title: '全A巴菲特指标',
                unit: '%',
                points: sorted.filter(item => item.allA != null).map(item => ({ date: String(item.year), value: item.allA })),
                logic: '全A股票总市值 / 中国GDP。优先来自万得结构化宏观与市场容量数据。'
            },
            us: {
                title: '美股巴菲特指标',
                unit: '%',
                points: sorted.filter(item => item.us != null).map(item => ({ date: String(item.year), value: item.us })),
                logic: '美国股票总市值 / 美国GDP。优先来自万得结构化宏观与市场容量数据。'
            }
        },
        fedLiquidity: sorted.map(item => ({
            year: item.year,
            stance: item.stance || (item.rate >= 4 ? '高利率/偏收水' : item.balanceSheet >= 7 ? '偏放水' : '中性'),
            balanceSheet: item.balanceSheet,
            rate: item.rate,
            note: item.note || '万得结构化取数，按资产负债表规模和政策利率辅助判断流动性状态。'
        }))
    };
}

async function buildStatusIndex(market) {
    const quote = await safeCall(() => sources.fetchQuote(market, setOriginStatus), {});
    const recentKlines = await safeCall(() => sources.fetchKlines(market, 1, setOriginStatus), []);
    const klines = await safeCall(() => sources.fetchKlines(market, 10, setOriginStatus), []);
    const monthly = downsampleMonthly(klines).slice(-120);
    const latest = monthly[monthly.length - 1] || {};
    const latestDaily = recentKlines[recentKlines.length - 1] || {};
    const close = quote.close == null ? (latestDaily.close == null ? latest.close : latestDaily.close) : quote.close;
    const changePct = quote.changePct == null ? latestDaily.changePct : quote.changePct;
    const amount = quote.amount == null ? (latestDaily.amount == null ? latest.amount : latestDaily.amount) : quote.amount;
    const first = monthly[0] || {};
    return {
        id: market.id,
        code: market.code,
        name: market.name,
        style: market.style,
        close,
        changePct,
        amount: amount || 0,
        amountSource: quote.amount == null && latestDaily.amount != null ? 'eastmoney.daily-kline' : 'eastmoney.quote',
        tenYearChangePct: calcChangePct(first.close, close),
        points: monthly.map(item => ({
            date: item.date.slice(0, 7),
            close: item.close,
            amount: item.amount,
            changePct: item.changePct
        }))
    };
}

async function buildMarketStatus() {
    const items = [];
    for (let i = 0; i < STATUS_MARKETS.length; i++) {
        items.push(await buildStatusIndex(STATUS_MARKETS[i]));
    }
    const ashares = await safeCall(() => sources.fetchAshareSpot(setOriginStatus), []);
    const breadth = ashares.length > 1000 ? buildBreadth(ashares) : {
        up: 0,
        down: 0,
        flat: 0,
        indexChange: items[0] && items[0].changePct,
        note: '全A涨跌家数暂未取到，等待下次回源补齐。',
        history: []
    };
    const sh = items.find(item => item.id === 'sh000001') || {};
    const sz = items.find(item => item.id === 'sz399001') || {};
    const growth = items.find(item => item.id === 'sz399006') || {};
    const totalTurnover = (Number(sh.amount) || 0) + (Number(sz.amount) || 0);
    const totalBreadth = Number(breadth.up || 0) + Number(breadth.down || 0) + Number(breadth.flat || 0);
    const activeBreadth = Number(breadth.up || 0) + Number(breadth.down || 0);
    const downRatio = totalBreadth && activeBreadth ? Number(breadth.down || 0) / totalBreadth * 100 : null;
    const macro = await safeCall(fetchWindMacroStatus, null);

    return {
        items,
        breadth,
        totalTurnover,
        summary: [
            '上证' + (sh.changePct == null ? '--' : round(sh.changePct, 2) + '%'),
            '深成' + (sz.changePct == null ? '--' : round(sz.changePct, 2) + '%'),
            '创业板' + (growth.changePct == null ? '--' : round(growth.changePct, 2) + '%'),
            totalTurnover ? '两市成交约' + round(totalTurnover / 1000000000000, 2) + '万亿' : '成交额待补齐',
            downRatio == null ? '涨跌家数待补齐' : '下跌占比' + round(downRatio, 0) + '%'
        ].join('，'),
        buffettPanels: macro && macro.buffettPanels ? macro.buffettPanels : buildBuffettPanels(),
        fedLiquidity: macro && macro.fedLiquidity ? macro.fedLiquidity : buildFedLiquidityCycles(),
        logic: '市场状态综合上证指数、深证成指、创业板指、两市成交额和全A涨跌家数；点击后展示指数十年月线、全A/美股巴菲特指标及美联储十年流动性周期。'
    };
}

async function buildOverview() {
    const markets = [];
    for (let i = 0; i < INDEX_MARKETS.length; i++) {
        markets.push(await buildMarketCard(INDEX_MARKETS[i]));
    }
    const marketStatus = await safeCall(buildMarketStatus, null);

    const globalMarketCaps = STATIC_GLOBAL_MARKET_CAPS;
    const scoreValues = markets.map(item => item.pePercentile).filter(item => item != null);
    const score = scoreValues.length ? Math.round(scoreValues.reduce((sum, item) => sum + item, 0) / scoreValues.length) : 50;

    return withMeta({
        heat: {
            score,
            label: heatLabel(score),
            summary: marketStatus && marketStatus.summary
                ? marketStatus.summary
                : '基于服务端每日抓取的公开接口数据计算，公开源缺失时保留上一版缓存并标记状态。'
        },
        signals: buildSignals(markets),
        marketStatus,
        globalMarketCapMeta: GLOBAL_MARKET_CAP_SOURCE,
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
        const peTtm = resolvePeForMarket(market, quote, percentile);
        return {
            date: item.date.slice(0, 7),
            close: item.close,
            marketCap: quote.marketCap && currentClose ? quote.marketCap * item.close / currentClose : null,
            peTtm,
            pePercentile: percentile
        };
    });

    return withMeta({
        market: {
            id: market.id,
            code: market.code,
            name: market.name,
            currency: market.currency,
            peType: isQuotePeReliable(market, quote.peTtm) ? 'ttm-current-scaled' : 'baseline-close-percentile-estimate',
            marketCapSource: 'eastmoney.quote-api-current-marketcap-scaled-by-kline',
            peSource: peSourceForMarket(market, quote)
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
        const trendScore = STYLE_MEDIUM_TERM_TREND[style.id] == null ? 50 : STYLE_MEDIUM_TERM_TREND[style.id];
        const breadth = rows.length
            ? Math.max(0, Math.min(100, 50 + rows.reduce((sum, item) => sum + (Number(item.changePct) || 0), 0) / rows.length * 8))
            : 50;
        const mainlineScore = trendScore * 0.45 + flow * 0.25 + Math.min(crowding, 85) * 0.18 + breadth * 0.12;
        return {
            id: style.id,
            name: style.name,
            industries: style.displayIndustries || style.industries.join('、'),
            heat: round(mainlineScore, 0),
            trendScore: round(trendScore, 0),
            dailyFlowScore: round(flow, 0),
            marketCap,
            flow: round(flow, 0),
            crowding: round(crowding, 0),
            valuation: round(valuation, 0),
            breadth: round(breadth, 0),
            netFlow: round(netFlow, 1),
            turnoverShare: round(turnover / totalTurnover * 100, 1),
            risk: crowding >= 80 ? '拥挤偏高' : crowding >= 55 ? '趋势活跃' : '交易不拥挤',
            note: rows.map(item => item.name).join('、') || '数据补充中',
            method: '主线评分 = 中期趋势45% + 单日资金强度25% + 成交拥挤18% + 行业广度12%'
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

function buildDerivedEtfRanking(styles) {
    const etfMap = {
        'financial-dividend': '红利低波ETF',
        'consumer-bluechip': '消费ETF',
        'tech-growth': '人工智能ETF',
        'semiconductor-hardtech': '科创50ETF',
        'new-energy': '新能源ETF',
        healthcare: '医药ETF',
        'property-chain': '房地产ETF',
        'cyclical-resources': '资源ETF',
        'export-manufacturing': '高端制造ETF',
        'smallcap-growth': '中证1000ETF'
    };
    return styles
        .map(style => {
            const amount = round(Number(style.netFlow || 0) * 0.18, 1);
            const turnover = round(Math.max(Number(style.turnoverShare || 0) * 18, Math.abs(amount) * 12, 20), 1);
            const drift = Number(style.trendScore || 50) >= 60 ? 1 : -0.2;
            const trend = Array.from({ length: 20 }, (_, index) => round(amount * (index + 1) / 20 + drift * index, 1));
            return {
                code: '',
                name: etfMap[style.id] || style.name + 'ETF',
                amount,
                turnover,
                theme: style.name + '代理',
                source: 'wind-style-derived',
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
    const total = up + down + flat;
    const downRatio = total ? down / total * 100 : 0;
    return {
        up,
        down,
        flat,
        indexChange: null,
        note: down > up
            ? '下跌家数多于上涨家数，下跌占比约' + round(downRatio, 0) + '%，市场广度偏弱。'
            : '上涨家数多于下跌家数，市场广度较好。',
        history: [{ date: formatDate(new Date()).slice(5), advanceDecline }]
    };
}

async function buildWindMarketStyle() {
    const industryMatrix = await fetchWindIndustryMatrix();
    if (industryMatrix.length < 25) {
        throw new Error('wind industry matrix incomplete');
    }

    const rawEtfRanking = await safeCall(fetchWindEtfRanking, []);
    const styles = buildStyles(industryMatrix);
    const strongest = styles.slice().sort((a, b) => Number(b.heat) - Number(a.heat))[0] || styles[0];
    const etfRanking = rawEtfRanking.length ? rawEtfRanking : buildDerivedEtfRanking(styles);
    const ashares = await safeCall(() => sources.fetchAshareSpot(setOriginStatus), []);
    const totalTurnoverYi = industryMatrix.reduce((sum, item) => sum + (Number(item.turnover) || 0), 0);
    const totalTurnover = totalTurnoverYi * 100000000;
    const mainNetFlowYi = Number(strongest.netFlow) || 0;
    const totalCap = industryMatrix.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) || 1;
    const topIndustries = industryMatrix.slice(0, 5);
    const maxTurnoverShare = Math.max.apply(null, industryMatrix.map(item => totalTurnoverYi ? Number(item.turnover || 0) / totalTurnoverYi * 100 : 0).concat([1]));
    const maxAbsFlow = Math.max.apply(null, industryMatrix.map(item => Math.abs(Number(item.amount) || 0)).concat([1]));
    const crowdingIndustries = industryMatrix.map(item => {
        const turnoverShare = totalTurnoverYi ? Number(item.turnover || 0) / totalTurnoverYi * 100 : 0;
        const flowScore = Math.abs(Number(item.amount) || 0) / maxAbsFlow * 38;
        const turnoverScore = turnoverShare / maxTurnoverShare * 34;
        const valuationScore = item.peTtm == null ? 18 : Math.min(28, Number(item.peTtm) / 90 * 28);
        return {
            name: item.name,
            marketCap: item.marketCap,
            score: round(Math.min(100, flowScore + turnoverScore + valuationScore), 0),
            turnoverShare: round(turnoverShare, 1),
            fundFlow: item.amount,
            valuationPercentile: item.peTtm == null ? 50 : Math.min(100, Math.round(Number(item.peTtm) / 90 * 100))
        };
    });

    return withMeta({
        source: 'wind',
        mainline: {
            name: strongest.name,
            score: strongest.heat,
            netFlow: strongest.netFlow,
            turnoverShare: strongest.turnoverShare,
            crowding: strongest.crowding,
            trendScore: strongest.trendScore,
            verdict: '当前主线是' + strongest.name + '：主线判断按近几个月持续性优先，单日资金流只作为确认信号。',
            reasons: [
                '中期趋势权重最高：参考历史轮动阶段、近几个月产业叙事和风格持续性，避免把单日资金误判为主线。',
                '资金强度来自万得申万一级行业最近交易日主力净流入，用来判断主线是否正在被资金确认。',
                '行业规模和成交额来自万得申万一级行业总市值与成交额。',
                '拥挤度由成交占比、资金流入强度和估值位置综合计算，分数高说明回撤风险更大。'
            ],
            method: strongest.method
        },
        styles,
        rotations: STYLE_ROTATIONS,
        fundFlow: {
            source: 'wind',
            summary: '基于万得申万一级行业数据：今日全市场成交约' + round(totalTurnoverYi / 10000, 2) + '万亿元。主线判断不看单日第一名，而看中期趋势、近几个月资金持续性、成交占比和拥挤度。',
            turnover: { total: totalTurnover },
            marketNetFlow: mainNetFlowYi * 100000000,
            etfRanking,
            industryMatrix,
            northbound: { today: 0, week: 0, month: 0, focus: [] },
            styleFlows: styles.map(item => ({ name: item.name, amount: item.netFlow, strength: item.flow, trendScore: item.trendScore, crowding: item.crowding, valuation: item.valuation, turnoverShare: item.turnoverShare, risk: item.risk }))
        },
        crowding: {
            industries: crowdingIndustries,
            styles: styles.map(item => ({
                name: item.name,
                score: item.crowding,
                marketCap: item.marketCap,
                fundFlow: item.netFlow,
                turnoverShare: item.turnoverShare
            })),
            ranks: crowdingIndustries.slice().sort((a, b) => b.score - a.score).slice(0, 10).map(item => ({
                name: item.name,
                score: item.score,
                reason: '万得行业成交占比、主力净流入和估值位置综合偏高'
            })),
            breadth: ashares.length > 1000
                ? Object.assign(buildBreadth(ashares), { source: 'eastmoney.ashare.spot' })
                : {
                    up: industryMatrix.filter(item => Number(item.changePct) > 0).length,
                    down: industryMatrix.filter(item => Number(item.changePct) < 0).length,
                    flat: industryMatrix.filter(item => Number(item.changePct) === 0).length,
                    indexChange: null,
                    source: 'wind.sw-industry-level1',
                    note: '全A涨跌家数暂未取到，这里临时使用申万一级行业涨跌数量；若指数上涨但多数行业下跌，说明权重抱团明显。',
                    history: [{ date: formatDate(new Date()).slice(5), advanceDecline: industryMatrix.filter(item => Number(item.changePct) > 0).length - industryMatrix.filter(item => Number(item.changePct) < 0).length }]
                },
            fundCluster: {
                concentration: round(topIndustries.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) / totalCap * 100, 0),
                topStocks: topIndustries.map(item => item.name),
                concentrationTrend: [{ date: formatDate(new Date()).slice(0, 7), value: round(topIndustries.reduce((sum, item) => sum + (Number(item.marketCap) || 0), 0) / totalCap * 100, 0) }],
                industries: topIndustries.map(item => ({ name: item.name, weight: round(Number(item.marketCap || 0) / totalCap * 100, 1) }))
            },
            history: [{ date: formatDate(new Date()).slice(0, 7), score: strongest.crowding, name: strongest.name }]
        }
    });
}

async function buildPublicMarketStyle() {
    const ashares = await safeCall(() => sources.fetchAshareSpot(setOriginStatus), []);
    const industryFlows = await safeCall(() => sources.fetchIndustryFlow(setOriginStatus), []);
    const etfs = await safeCall(() => sources.fetchEtfList(setOriginStatus), []);
    const industryMatrix = aggregateIndustries(ashares, industryFlows).slice(0, 31);
    const styles = buildStyles(industryMatrix);
    const strongest = styles.slice().sort((a, b) => Number(b.heat) - Number(a.heat))[0] || styles[0];
    const etfRanking = buildEtfRanking(etfs);
    const totalTurnover = ashares.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const mainNetFlow = (Number(strongest.netFlow) || 0) * 100000000;
    const crowdingIndustries = industryMatrix.map(item => ({
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
            trendScore: strongest.trendScore,
            verdict: '当前主线是' + strongest.name + '：主线判断按近几个月持续性优先，单日资金流只作为确认信号。',
            reasons: [
                '中期趋势权重最高：参考历史轮动阶段、近几个月产业叙事和风格持续性。',
                '资金强度来自东方财富公开资金流接口或成交额方向估算。',
                '行业规模来自 A 股全量行情接口的总市值聚合。',
                '拥挤度由成交占比、净流入占比和行业集中度综合计算。'
            ],
            method: strongest.method
        },
        styles,
        rotations: STYLE_ROTATIONS,
        fundFlow: {
            summary: '基于公开接口每日更新，重点看资金相对成交额的比例，不单看绝对金额。',
            turnover: { total: totalTurnover },
            marketNetFlow: mainNetFlow,
            etfRanking: etfRanking.length ? etfRanking : buildDerivedEtfRanking(styles),
            industryMatrix,
            northbound: { today: 0, week: 0, month: 0, focus: [] },
            styleFlows: styles.map(item => ({ name: item.name, amount: item.netFlow, strength: item.flow, trendScore: item.trendScore, crowding: item.crowding, valuation: item.valuation, turnoverShare: item.turnoverShare, risk: item.risk }))
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
            history: [{ date: formatDate(new Date()).slice(0, 7), score: strongest.crowding, name: strongest.name }]
        }
    });
}

async function buildMarketStyle() {
    const windPayload = await safeCall(buildWindMarketStyle, null);
    if (windPayload) {
        return windPayload;
    }
    return buildPublicMarketStyle();
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

function buildDividendPerShare(events, targetYear) {
    const totalPerTenShares = events.reduce((sum, event) => {
        const year = Number(String(event.reportDate || event.date || '').slice(0, 4));
        if (year !== targetYear) {
            return sum;
        }
        return sum + (Number(event.cashDividendRatio) || 0);
    }, 0);
    return totalPerTenShares ? round(totalPerTenShares / 10, 4) : null;
}

async function buildValue() {
    const windPayload = await safeCall(buildWindValue, null);
    if (windPayload) {
        return windPayload;
    }

    const stocks = [];
    for (let i = 0; i < VALUE_STOCKS.length; i++) {
        const stock = VALUE_STOCKS[i];
        const quote = await safeCall(() => sources.fetchStockQuote(stock, setOriginStatus), {});
        const events = await safeCall(() => sources.fetchDividendEvents(stock, setOriginStatus), []);
        const trend = buildDividendTrend(events, quote.close);
        const dividendYield = trend[trend.length - 1] || 0;
        const dividendPerShare2025 = buildDividendPerShare(events, 2025);
        stocks.push({
            code: stock.code,
            name: stock.name,
            dividendYield,
            dividendPerShare2025,
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

async function buildWindValue() {
    const latestRows = await fetchWindValueLatest();
    const historyRows = await fetchWindDividendHistory();
    const dividendRows = await fetchWindDividendPerShare2025();
    if (latestRows.length < VALUE_STOCKS.length || historyRows.length < VALUE_STOCKS.length * 8 || dividendRows.length < VALUE_STOCKS.length) {
        throw new Error('wind value dataset incomplete');
    }

    const latestByCode = {};
    latestRows.forEach(row => {
        const code = pick(row, ['Wind代码', '股票代码', '证券代码']);
        if (code) latestByCode[String(code).toUpperCase()] = row;
    });

    const dividendPerShareByCode = {};
    dividendRows.forEach(row => {
        const code = pick(row, ['Wind代码', '股票代码', '证券代码']);
        const value = pickNumber(row, ['2025年每股现金分红', '2025年度每股现金分红', '2025年度每股分红', '2025年每股分红', '每股现金分红']);
        if (code && value != null) {
            dividendPerShareByCode[String(code).toUpperCase()] = round(value, 4);
        }
    });

    const trendByCode = {};
    historyRows.forEach(row => {
        const code = pick(row, ['Wind代码', '股票代码', '证券代码']);
        const year = pickNumber(row, ['年份']);
        const value = pickNumber(row, ['近10年每年末股息率', '股息率', '年末股息率']);
        if (!code || year == null || value == null) {
            return;
        }
        const key = String(code).toUpperCase();
        if (!trendByCode[key]) trendByCode[key] = [];
        trendByCode[key].push({ year, value: round(value, 2) });
    });

    const stocks = VALUE_STOCKS.map(stock => {
        const row = latestByCode[stock.code] || {};
        const dividendYield = pickNumber(row, ['最新股息率', '股息率']) || 0;
        const pe = pickNumber(row, ['最新市盈率', '市盈率TTM', '市盈率']);
        const marketCapWanYi = pickNumber(row, ['最新总市值', '总市值']);
        const trend = (trendByCode[stock.code] || [])
            .sort((a, b) => Number(a.year) - Number(b.year))
            .map(item => item.value);
        const currentYear = new Date().getFullYear();
        const latestHistoryYear = Math.max.apply(null, (trendByCode[stock.code] || []).map(item => Number(item.year)).concat([0]));
        const trendWithCurrent = currentYear > latestHistoryYear && dividendYield
            ? trend.concat([round(dividendYield, 2)]).slice(-10)
            : trend.slice(-10);
        return {
            code: stock.code,
            name: pick(row, ['证券简称', '中文简称']) || stock.name,
            close: round(pickNumber(row, ['最新成交价']) || 0, 2),
            changePct: round(pickNumber(row, ['最新涨跌幅', '涨跌幅']) || 0, 2),
            marketCap: marketCapWanYi == null ? null : round(marketCapWanYi * 1000000000000, 0),
            dividendYield: round(dividendYield, 2),
            dividendPerShare2025: dividendPerShareByCode[stock.code] == null ? null : dividendPerShareByCode[stock.code],
            payout: pe && dividendYield ? round(pe * dividendYield, 1) : null,
            pe: round(pe, 2),
            issueRisk: stock.issueRisk,
            badNews: '万得当前行情与股息率口径；重大利空与公告监控后续单独接入。',
            trend: trendWithCurrent
        };
    });

    return withMeta({
        source: 'wind',
        summary: '固定观察四大行、招商银行、贵州茅台、长江电力、中国神华、中国移动、中国海油。当前估值和股息率来自万得最新行情，股息率曲线来自万得近10年年末股息率，2025分红来自万得年度每股现金分红口径。',
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

function isDatasetComplete(cacheKey, payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    if (cacheKey === 'overview') {
        const markets = Array.isArray(payload.markets) ? payload.markets : [];
        const caps = Array.isArray(payload.globalMarketCaps) ? payload.globalMarketCaps : [];
        const hasUsCap = caps.some(item => item.name === '美国' && item.cap != null);
        const hasChinaCap = caps.some(item => item.name === '中国A股' && item.cap != null);
        return markets.length >= INDEX_MARKETS.length && markets.some(item => item.close != null) && hasUsCap && hasChinaCap;
    }

    if (cacheKey === 'style') {
        const styles = Array.isArray(payload.styles) ? payload.styles : [];
        const industries = Array.isArray(payload.fundFlow && payload.fundFlow.industryMatrix)
            ? payload.fundFlow.industryMatrix
            : [];
        return styles.length >= STYLE_CATALOG.length && industries.length > 0;
    }

    if (cacheKey === 'value') {
        const stocks = Array.isArray(payload.stocks) ? payload.stocks : [];
        return stocks.length >= Math.min(10, VALUE_STOCKS.length);
    }

    if (cacheKey.indexOf('history:') === 0) {
        const points = Array.isArray(payload.points) ? payload.points : [];
        return points.length > 0;
    }

    return true;
}

async function withDailyCache(cacheKey, builder) {
    const key = 'market:' + MARKET_CACHE_VERSION + ':' + cacheKey;
    const cached = await getDatasetCache(key);
    const cachedComplete = cached && isDatasetComplete(cacheKey, cached.payload);

    if (cached && cached.isFresh && cachedComplete) {
        return Object.assign({}, cached.payload, { source: 'cache' });
    }

    try {
        const payload = await builder();
        if (!isDatasetComplete(cacheKey, payload)) {
            throw new Error('market dataset incomplete after origin refresh: ' + cacheKey);
        }
        await setDatasetCache(key, payload, nextRefreshDate());
        return payload;
    } catch (err) {
        if (cachedComplete) {
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
