/*
 * Public visit tracking endpoints.
 */
const router = require('koa-router')();

const { query } = require('../utils/query');

router.prefix('/blogapi/visit');

function normalizePath(rawPath) {
    if (typeof rawPath !== 'string') return null;
    let path = rawPath.trim().split(/[?#]/)[0];
    if (!path || path.length > 255 || path[0] !== '/') return null;
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '/' || path === '/about' || path === '/msg') return { path, articleId: null };

    const articleMatch = path.match(/^\/article\/(\d+)$/);
    if (!articleMatch) return null;
    const articleId = Number(articleMatch[1]);
    if (!Number.isSafeInteger(articleId) || articleId < 1 || articleId > 4294967295) return null;

    return {
        path,
        articleId
    };
}

function normalizeId(value) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return null;
    return id;
}

router.post('/pageview', async ctx => {
    const body = ctx.request.body || {};
    const page = normalizePath(body.path);
    const visitorId = normalizeId(body.visitorId);
    const sessionId = normalizeId(body.sessionId);

    if (!page || !visitorId || !sessionId) {
        ctx.status = 400;
        ctx.body = {
            result: {
                msg: '统计参数不合法',
                status: 0
            }
        };
        return;
    }

    try {
        await query(
            'INSERT INTO blog_page_views (visit_day, path, article_id, visitor_id, session_id) VALUES (CURDATE(), ?, ?, ?, ?)',
            [page.path, page.articleId, visitorId, sessionId]
        );
        ctx.body = {
            result: {
                msg: 'success',
                status: 1
            }
        };
    } catch (err) {
        console.error('visit pageview insert failed', err);
        ctx.status = 500;
        ctx.body = {
            result: {
                msg: '访问统计写入失败',
                status: 0
            }
        };
    }
});

module.exports = router;
