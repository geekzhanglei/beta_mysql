#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const serverEnvPath = '/opt/config/.env';

if (fs.existsSync(serverEnvPath)) {
    require('dotenv').config({ path: serverEnvPath });
} else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const { callWind, tableFromWindData } = require('../services/marketWindProvider');

function pad(value) {
    return String(value).padStart(2, '0');
}

function yyyymmdd(date) {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('');
}

function tenYearsAgoMonthStart() {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 10);
    date.setMonth(date.getMonth(), 1);
    return date;
}

function previewText(value, length) {
    return String(value || '').replace(/\s+/g, ' ').slice(0, length || 400);
}

function summarizeTable(data) {
    const table = tableFromWindData(data);
    return {
        columns: table.columns,
        rowCount: table.total,
        sampleRows: table.rows.slice(0, 3)
    };
}

function summarizePayload(result) {
    const data = result.data;

    if (data && Array.isArray(data.columns) && Array.isArray(data.rows)) {
        return summarizeTable(data);
    }

    if (data && Array.isArray(data.data)) {
        const groups = data.data.map(group => {
            if (group && Array.isArray(group.columns) && Array.isArray(group.rows)) {
                const table = summarizeTable(group);
                return Object.assign({
                    resolvedQuestion: group.resolved_question || '',
                    step: group.step || ''
                }, table);
            }
            return {
                sample: previewText(JSON.stringify(group), 600)
            };
        });
        return {
            groupCount: groups.length,
            groups: groups.slice(0, 3)
        };
    }

    if (Array.isArray(data)) {
        return {
            rowCount: data.length,
            sampleRows: data.slice(0, 3)
        };
    }

    if (data && typeof data === 'object') {
        return {
            keys: Object.keys(data).slice(0, 20),
            sample: previewText(JSON.stringify(data), 600)
        };
    }

    return {
        sample: previewText(result.text || result.payload, 600)
    };
}

const today = new Date();
const begin10y = yyyymmdd(tenYearsAgoMonthStart());
const endToday = yyyymmdd(today);

const probes = [
    {
        id: 'index.snapshot.csi300',
        purpose: '首页指数卡片：点位、涨跌幅、成交额、市场广度',
        cadence: 'daily-after-close',
        serverType: 'index_data',
        toolName: 'get_index_price_indicators',
        params: {
            windcode: '000300.SH',
            indexes: '最新成交价,涨跌幅,成交额,上涨家数,下跌家数,平盘家数'
        }
    },
    {
        id: 'index.monthly-kline.csi300',
        purpose: '指数详情：10年月度历史冷启动；后续每月补最新月',
        cadence: 'monthly-incremental',
        serverType: 'index_data',
        toolName: 'get_index_kline',
        params: {
            windcode: '000300.SH',
            begin_date: begin10y,
            end_date: endToday,
            period: '12'
        }
    },
    {
        id: 'index.fundamentals.csi300',
        purpose: '指数详情：PE/PB/总市值月度历史，冷启动一次取10年',
        cadence: 'monthly-incremental',
        serverType: 'analytics_data',
        toolName: 'get_financial_data',
        params: {
            question: '取沪深300指数过去10年每个月月末的市盈率(TTM)、市净率(LF)、总市值，返回结构化表',
            lang: '中文'
        }
    },
    {
        id: 'index.revenue.csi300',
        purpose: '指数详情：营收TTM和净利润TTM报告期历史；月图中按季度点或阶梯填充',
        cadence: 'quarterly-incremental',
        serverType: 'analytics_data',
        toolName: 'get_financial_data',
        params: {
            question: '取沪深300指数过去10年每个报告期的报告期日期、营业收入TTM和净利润TTM，返回结构化表',
            lang: '中文'
        }
    },
    {
        id: 'index.snapshot.hsi',
        purpose: '首页港股指数卡片：验证海外指数代码和快照字段',
        cadence: 'daily-after-close',
        serverType: 'index_data',
        toolName: 'get_index_price_indicators',
        params: {
            windcode: 'HSI.HI',
            indexes: '最新成交价,涨跌幅,成交额'
        }
    },
    {
        id: 'industry.wind-level1',
        purpose: '资金流向/拥挤度：Wind一级行业市值、成交、估值、涨跌批量取数',
        cadence: 'daily-after-close',
        serverType: 'analytics_data',
        toolName: 'get_financial_data',
        params: {
            question: '取最近交易日全部Wind一级行业的总市值、成交额、涨跌幅、换手率、市盈率(TTM)，返回结构化表',
            lang: '中文'
        }
    },
    {
        id: 'etf.snapshot.csi300',
        purpose: 'ETF资金流：用成交额、份额和规模估算净流入',
        cadence: 'daily-after-close',
        serverType: 'fund_data',
        toolName: 'get_fund_price_indicators',
        params: {
            windcode: '510300.SH',
            indexes: '中文简称,最新成交价,涨跌幅,成交额,基金最新份额,基金规模'
        }
    },
    {
        id: 'value.stock.snapshot.kweichow-moutai',
        purpose: '价值投资卡片：股息率、PE、市值最新点',
        cadence: 'monthly-snapshot',
        serverType: 'stock_data',
        toolName: 'get_stock_price_indicators',
        params: {
            windcode: '600519.SH',
            indexes: '中文简称,最新成交价,股息率,市盈率(TTM),总市值1'
        }
    },
    {
        id: 'value.stock.events.kweichow-moutai',
        purpose: '价值投资详情：分红、增发、配股、重大风险事件',
        cadence: 'monthly-or-weekly-events',
        serverType: 'stock_data',
        toolName: 'get_stock_events',
        params: {
            question: '600519.SH近10年分红、增发、配股和重大风险事件，返回结构化表',
            lang: '中文'
        }
    },
    {
        id: 'macro.china-gdp',
        purpose: '巴菲特指标：GDP宏观分母，月图按最近季度/年度值填充',
        cadence: 'monthly-check-quarterly-data',
        serverType: 'economic_data',
        toolName: 'get_economic_data',
        params: {
            metricIdsStr: '中国GDP现价季度累计值',
            beginDate: begin10y,
            endDate: endToday,
            freq: '季',
            magnitude: '万亿',
            currency: 'CNY'
        }
    },
    {
        id: 'fund.cluster.active-equity',
        purpose: '拥挤度：主动权益基金重仓股和行业集中度',
        cadence: 'quarterly-after-fund-disclosure',
        serverType: 'analytics_data',
        toolName: 'get_financial_data',
        params: {
            question: '取最新一期主动权益公募基金前十大重仓股和Wind一级行业配置集中度，返回结构化表',
            lang: '中文'
        }
    }
];

async function runProbe(probe) {
    const startedAt = Date.now();
    try {
        const result = await callWind(probe.serverType, probe.toolName, probe.params);
        return {
            id: probe.id,
            ok: true,
            purpose: probe.purpose,
            cadence: probe.cadence,
            serverType: probe.serverType,
            toolName: probe.toolName,
            latencyMs: Date.now() - startedAt,
            summary: summarizePayload(result)
        };
    } catch (err) {
        return {
            id: probe.id,
            ok: false,
            purpose: probe.purpose,
            cadence: probe.cadence,
            serverType: probe.serverType,
            toolName: probe.toolName,
            latencyMs: Date.now() - startedAt,
            error: err.message,
            meta: err.meta || {}
        };
    }
}

async function main() {
    const selectedIds = process.argv.slice(2).filter(item => item !== '--strict');
    const strict = process.argv.includes('--strict');
    const selected = selectedIds.length ? probes.filter(probe => selectedIds.includes(probe.id)) : probes;
    const results = [];

    for (let i = 0; i < selected.length; i++) {
        const probe = selected[i];
        process.stderr.write('[wind-probe] ' + (i + 1) + '/' + selected.length + ' ' + probe.id + '\n');
        const result = await runProbe(probe);
        results.push(result);
        process.stderr.write('[wind-probe] ' + (result.ok ? 'ok ' : 'fail ') + probe.id + ' ' + result.latencyMs + 'ms\n');
    }

    const failed = results.filter(item => !item.ok);
    const report = {
        generatedAt: new Date().toISOString(),
        requestCount: selected.length,
        successCount: results.length - failed.length,
        failedCount: failed.length,
        results
    };

    console.log(JSON.stringify(report, null, 2));

    if (strict && failed.length) {
        process.exitCode = 1;
    }
}

main().catch(err => {
    console.error('[wind-probe] fatal', err);
    process.exit(1);
});
