const MARKET_CACHE_VERSION = 'v11';

const REFRESH_POLICY = 'daily-after-01:00-asia-shanghai';

const INDEX_MARKETS = [
    { id: 'csi300', code: '000300.SH', name: '沪深300', region: 'A股', style: '大盘价值', currency: 'CNY', secid: '1.000300', csindex: '000300', tencentCode: 'sh000300' },
    { id: 'csi800', code: '000906.SH', name: '中证800', region: 'A股', style: '中大盘均衡', currency: 'CNY', secid: '1.000906', csindex: '000906', tencentCode: 'sh000906' },
    { id: 'csi1000', code: '000852.SH', name: '中证1000', region: 'A股', style: '小盘成长', currency: 'CNY', secid: '1.000852', csindex: '000852', tencentCode: 'sh000852' },
    { id: 'star50', code: '000688.SH', name: '科创50', region: 'A股', style: '硬科技', currency: 'CNY', secid: '1.000688', csindex: '000688', tencentCode: 'sh000688' },
    { id: 'nasdaq', code: 'IXIC.US', name: '纳斯达克', region: '美股', style: '科技成长', currency: 'USD', secid: '100.IXIC', tencentCode: 'us.IXIC' },
    { id: 'sp500', code: 'SPX.US', name: '标普500', region: '美股', style: '大盘核心', currency: 'USD', secid: '100.SPX', tencentCode: 'us.INX' },
    { id: 'hsi', code: 'HSI.HK', name: '恒生指数', region: '港股', style: '低估值', currency: 'HKD', secid: '100.HSI', tencentCode: 'hkHSI' },
    { id: 'hstech', code: 'HSTECH.HK', name: '恒生科技', region: '港股', style: '港股科技', currency: 'HKD', secid: '100.HSTECH', tencentCode: 'hkHSTECH' }
];

const STATUS_MARKETS = [
    { id: 'sh000001', code: '000001.SH', name: '上证指数', region: 'A股', style: '大盘综合', currency: 'CNY', secid: '1.000001', tencentCode: 'sh000001' },
    { id: 'sz399001', code: '399001.SZ', name: '深证成指', region: 'A股', style: '深市综合', currency: 'CNY', secid: '0.399001', tencentCode: 'sz399001' },
    { id: 'sz399006', code: '399006.SZ', name: '创业板指', region: 'A股', style: '成长风险偏好', currency: 'CNY', secid: '0.399006', tencentCode: 'sz399006' }
];

const INDEX_PE_BASELINES = {
    csi300: 13.2,
    csi800: 15.8,
    csi1000: 29.5,
    star50: 48,
    nasdaq: 30,
    sp500: 22,
    hsi: 11.2,
    hstech: 24
};

const STYLE_MEDIUM_TERM_TREND = {
    'financial-dividend': 76,
    'consumer-bluechip': 46,
    'tech-growth': 91,
    'semiconductor-hardtech': 78,
    'new-energy': 36,
    healthcare: 34,
    'property-chain': 28,
    'cyclical-resources': 55,
    'export-manufacturing': 61,
    'smallcap-growth': 48
};

const GLOBAL_MARKET_CAP_COUNTRIES = [
    { code: 'USA', name: '美国', note: '全球最大权益市场，科技与消费龙头集中' },
    { code: 'CHN', name: '中国A股', note: '中国大陆权益资产核心市场，政策和产业周期影响大' },
    { code: 'JPN', name: '日本', note: '制造业、金融和股东回报改革主导' },
    { code: 'IND', name: '印度', note: '高增长新兴市场，估值长期偏高' },
    { code: 'GBR', name: '英国', note: '金融、能源和防御型资产占比较高' },
    { code: 'CAN', name: '加拿大', note: '资源、金融和周期行业权重大' },
    { code: 'FRA', name: '法国', note: '奢侈品、工业和金融权重高' },
    { code: 'DEU', name: '德国', note: '制造业和出口链代表性强' },
    { code: 'CHE', name: '瑞士', note: '医药、消费和金融防御属性强' },
    { code: 'HKG', name: '中国香港', note: '中国资产离岸定价核心市场，科技与金融权重高' }
];

const GLOBAL_MARKET_CAP_SOURCE = {
    title: 'Visual Capitalist - Ranked: The World’s Largest Stock Markets',
    url: 'https://www.visualcapitalist.com/ranked-the-worlds-largest-stock-markets/',
    originalSource: 'Bloomberg calculations of domestically listed companies across each country’s major exchanges',
    publishedAt: '2026-05-26T00:00:00.000Z',
    dataAsOf: '2026-04-30T00:00:00.000Z'
};

const STATIC_GLOBAL_MARKET_CAPS = [
    { name: '美国', cap: 75.04e12, note: '全球最大权益市场，科技与消费龙头集中' },
    { name: '中国A股', cap: 14.84e12, note: '中国大陆权益资产核心市场，政策和产业周期影响大' },
    { name: '日本', cap: 8.19e12, note: '制造业、金融和股东回报改革主导' },
    { name: '中国香港', cap: 7.41e12, note: '中国资产离岸定价核心市场，科技与金融权重高' },
    { name: '印度', cap: 4.97e12, note: '高增长新兴市场，估值长期偏高' },
    { name: '加拿大', cap: 4.49e12, note: '资源、金融和周期行业权重大' },
    { name: '中国台湾', cap: 4.48e12, note: '半导体和AI硬件供应链权重高' },
    { name: '韩国', cap: 4.04e12, note: '半导体、电子和出口制造占比较高' },
    { name: '英国', cap: 3.99e12, note: '金融、能源和防御型资产占比较高' },
    { name: '法国', cap: 3.45e12, note: '奢侈品、工业和金融权重高' }
].map(item => Object.assign({
    date: '2026-04',
    source: 'visualcapitalist:bloomberg-apr-2026'
}, item));

const STYLE_CATALOG = [
    { id: 'financial-dividend', name: '金融红利', displayIndustries: '银行、保险、券商、运营商、高股息央企', industries: ['银行', '非银金融', '通信', '公用事业', '交通运输', '煤炭'] },
    { id: 'consumer-bluechip', name: '消费白马', displayIndustries: '白酒、食品饮料、家电、消费服务', industries: ['食品饮料', '家用电器', '商贸零售', '社会服务', '美容护理'] },
    { id: 'tech-growth', name: '科技成长', displayIndustries: 'AI、软件、互联网、计算机、通信', industries: ['计算机', '通信', '传媒'] },
    { id: 'semiconductor-hardtech', name: '半导体硬科技', displayIndustries: '芯片、设备、材料、科创50', industries: ['电子', '国防军工', '机械设备'] },
    { id: 'new-energy', name: '新能源', displayIndustries: '光伏、锂电、储能、新能源车', industries: ['电力设备', '汽车'] },
    { id: 'healthcare', name: '医药医疗', displayIndustries: '创新药、医疗器械、CXO、医疗服务', industries: ['医药生物'] },
    { id: 'property-chain', name: '地产链', displayIndustries: '房地产、建材、建筑、家居、物业', industries: ['房地产', '建筑材料', '建筑装饰', '轻工制造'] },
    { id: 'cyclical-resources', name: '周期资源', displayIndustries: '煤炭、石油、有色、钢铁、化工', industries: ['煤炭', '石油石化', '有色金属', '钢铁', '基础化工'] },
    { id: 'export-manufacturing', name: '出海制造', displayIndustries: '汽车、家电、机械、电网设备、船舶', industries: ['汽车', '家用电器', '机械设备', '电力设备', '国防军工'] },
    { id: 'smallcap-growth', name: '中小盘成长', displayIndustries: '创业板、中证1000、专精特新、小微盘', industries: ['计算机', '传媒', '机械设备', '环保', '综合'] }
];

const STYLE_ROTATIONS = [
    { start: 2006, end: 2007, style: '地产链' },
    { start: 2009, end: 2010, style: '周期资源' },
    { start: 2013, end: 2015, style: '科技成长' },
    { start: 2016, end: 2017, style: '消费白马' },
    { start: 2020, end: 2021, style: '新能源' },
    { start: 2021, end: 2022, style: '周期资源' },
    { start: 2023, end: 2024, style: '科技成长(AI)' },
    { start: 2024, end: 2024, style: '金融红利' },
    { start: 2025, end: 2026, style: '科技成长(AI)' }
];

const VALUE_STOCKS = [
    { code: '601398.SH', name: '工商银行', issueRisk: '低' },
    { code: '601288.SH', name: '农业银行', issueRisk: '低' },
    { code: '601939.SH', name: '建设银行', issueRisk: '低' },
    { code: '601988.SH', name: '中国银行', issueRisk: '低' },
    { code: '600036.SH', name: '招商银行', issueRisk: '低' },
    { code: '600519.SH', name: '贵州茅台', issueRisk: '低' },
    { code: '600900.SH', name: '长江电力', issueRisk: '低' },
    { code: '601088.SH', name: '中国神华', issueRisk: '低' },
    { code: '600941.SH', name: '中国移动', issueRisk: '低' }
];

module.exports = {
    MARKET_CACHE_VERSION,
    REFRESH_POLICY,
    INDEX_MARKETS,
    STATUS_MARKETS,
    INDEX_PE_BASELINES,
    GLOBAL_MARKET_CAP_COUNTRIES,
    GLOBAL_MARKET_CAP_SOURCE,
    STATIC_GLOBAL_MARKET_CAPS,
    STYLE_CATALOG,
    STYLE_MEDIUM_TERM_TREND,
    STYLE_ROTATIONS,
    VALUE_STOCKS
};
