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
        const data = await marketService.getFundFlow();
        ok(ctx, data.fundFlow || data);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/crowding', async ctx => {
    try {
        const data = await marketService.getCrowding();
        ok(ctx, data.crowding || data);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/consensus', async ctx => {
    try {
        const data = await marketService.getStyle();
        ok(ctx, {
            source: data.source,
            updatedAt: data.updatedAt,
            mainline: data.mainline,
            styles: data.styles
        });
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/style', async ctx => {
    try {
        ok(ctx, await marketService.getStyle());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/value', async ctx => {
    try {
        ok(ctx, await marketService.getValue());
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/status', async ctx => {
    try {
        ok(ctx, await marketService.getOriginStatus());
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
