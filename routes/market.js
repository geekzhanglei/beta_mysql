const router = require('koa-router')();
const marketService = require('../services/marketService');

router.prefix('/blogapi/market');

function ok(ctx, data) {
    ctx.body = {
        code: 0,
        data
    };
}

function fail(ctx, err) {
    ctx.status = 500;
    ctx.body = {
        code: 1,
        msg: err.message || '市场数据加载失败'
    };
}

router.get('/overview', async ctx => {
    try {
        ok(ctx, await marketService.getOverview());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/fund-flow', async ctx => {
    try {
        ok(ctx, await marketService.getFundFlow());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/crowding', async ctx => {
    try {
        ok(ctx, await marketService.getCrowding());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/consensus', async ctx => {
    try {
        ok(ctx, await marketService.getConsensus());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/history', async ctx => {
    try {
        const id = String(ctx.query.id || 'csi300');
        const years = Math.min(Math.max(Number(ctx.query.years || 10), 1), 10);
        ok(ctx, await marketService.getHistory(id, years));
    } catch (err) {
        fail(ctx, err);
    }
});

module.exports = router;
