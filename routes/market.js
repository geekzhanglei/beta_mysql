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

function isLocalRequest(ctx) {
    const ip = String(ctx.ip || ctx.request.ip || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function cacheOptions(ctx) {
    const token = String(ctx.query.token || '');
    return {
        forceRefresh: ctx.query.refresh === '1' && isLocalRequest(ctx) && token === marketService.dailyToken()
    };
}

router.get('/overview', async ctx => {
    try {
        ok(ctx, await marketService.getOverview(cacheOptions(ctx)));
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/fund-flow', async ctx => {
    try {
        const data = await marketService.getFundFlow(cacheOptions(ctx));
        ok(ctx, data.fundFlow || data);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/crowding', async ctx => {
    try {
        const data = await marketService.getCrowding(cacheOptions(ctx));
        ok(ctx, data.crowding || data);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/consensus', async ctx => {
    try {
        const data = await marketService.getStyle(cacheOptions(ctx));
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
        ok(ctx, await marketService.getStyle(cacheOptions(ctx)));
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/value', async ctx => {
    try {
        ok(ctx, await marketService.getValue(cacheOptions(ctx)));
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
        ok(ctx, await marketService.getHistory(id, years, cacheOptions(ctx)));
    } catch (err) {
        fail(ctx, err);
    }
});

module.exports = router;
