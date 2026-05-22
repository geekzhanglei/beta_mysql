/*
 * Admin visit statistics endpoints.
 */
const router = require('koa-router')();

const { query } = require('../utils/query');

router.prefix('/blogapi/admin/');

const ALLOWED_DAYS = [7, 30, 90];

function asNumber(value) {
    return Number(value || 0);
}

async function hasAdminToken(token) {
    if (!token) return false;
    const rows = await query('SELECT id FROM blog_admin_user WHERE password=? LIMIT 1', [token]);
    return Array.isArray(rows) && rows.length > 0;
}

router.get('/visit/stats', async ctx => {
    const token = ctx.request.query.token;
    const requestedDays = Number(ctx.request.query.days || 30);
    const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 30;
    const interval = days - 1;

    try {
        if (!(await hasAdminToken(token))) {
            ctx.status = 401;
            ctx.body = {
                result: {
                    msg: '未登录',
                    status: 0
                }
            };
            return;
        }

        const [summaryRows, trendRows, topPages] = await Promise.all([
            query(
                `SELECT
                    SUM(visit_day = CURDATE()) AS todayPv,
                    COUNT(DISTINCT CASE WHEN visit_day = CURDATE() THEN visitor_id END) AS todayUv,
                    COUNT(*) AS rangePv,
                    COUNT(DISTINCT visitor_id) AS rangeUv
                FROM blog_page_views
                WHERE visit_day >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`
            ),
            query(
                `SELECT
                    DATE_FORMAT(visit_day, '%Y-%m-%d') AS date,
                    COUNT(*) AS pv,
                    COUNT(DISTINCT visitor_id) AS uv
                FROM blog_page_views
                WHERE visit_day >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)
                GROUP BY visit_day
                ORDER BY visit_day ASC`
            ),
            query(
                `SELECT
                    path,
                    article_id AS articleId,
                    COUNT(*) AS pv,
                    COUNT(DISTINCT visitor_id) AS uv
                FROM blog_page_views
                WHERE visit_day >= DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)
                GROUP BY path, article_id
                ORDER BY pv DESC, uv DESC
                LIMIT 10`
            )
        ]);

        const summary = summaryRows[0] || {};
        ctx.body = {
            result: {
                status: 1,
                msg: 'success',
                days,
                summary: {
                    todayPv: asNumber(summary.todayPv),
                    todayUv: asNumber(summary.todayUv),
                    rangePv: asNumber(summary.rangePv),
                    rangeUv: asNumber(summary.rangeUv)
                },
                trend: trendRows.map(row => ({
                    date: row.date,
                    pv: asNumber(row.pv),
                    uv: asNumber(row.uv)
                })),
                topPages: topPages.map(row => ({
                    path: row.path,
                    articleId: row.articleId === null ? null : asNumber(row.articleId),
                    pv: asNumber(row.pv),
                    uv: asNumber(row.uv)
                }))
            }
        };
    } catch (err) {
        ctx.status = 500;
        ctx.body = {
            result: {
                msg: err.sqlMessage || err.message || '访问统计查询失败',
                status: 0
            }
        };
    }
});

module.exports = router;
