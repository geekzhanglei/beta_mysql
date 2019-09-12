/*
 * @Author: zhanglei
 * @Date: 2019-09-11 15:32:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-12 18:51:47
 * @Description: 后台评论管理页接口
 */
const router = require('koa-router')();
const { query } = require('../utils/query');
const blogConfig = require('../config/option_config');
const { DELETE_TABLE } = require('../utils/sql');

router.prefix('/blogapi/admin/');

/**
 * @description: 带评论的文章分页查询
 * @param {curpage} 当前页
 * @param {pagesize} 每页条数
 * @type {get}
 * @return {Object} result
 */

router.get('/articlesWithMarks', async (ctx, next) => {
    let startpage = 0;
    let curpage = ctx.request.query.curpage,
        pagesize = ctx.request.query.pagesize;

    let status = 1,
        msg = 'success';
    let rows = 0; // 数据条数

    // 参数校验
    if (parseInt(curpage) > 0 && parseInt(curpage) == curpage) {
        startpage = (curpage - 1) * pagesize;
    }
    if (parseInt(pagesize) < 0 || parseInt(pagesize) != pagesize) {
        pagesize = 10;
    }
    let sql;
    if (!ctx.request.query.curpage && !ctx.request.query.pagesize) {
        sql = `SELECT id,created_at,introduction,title,username FROM blog_articles  ORDER BY id DESC`;
    } else {
        sql = `SELECT id,created_at,introduction,title,username FROM blog_articles  ORDER BY id DESC LIMIT ${startpage},${pagesize}`;
    }
    let data = await query(sql)
        .then(res => res)
        .catch(err => err);
    // 根据queryid查询reply数据
    let queryid = [];
    data.forEach(e => {
        queryid.push(e.id);
    });

    let data2 = await query(
        `SELECT * FROM blog_article_marks WHERE article_id in(${queryid})`
    )
        .then(res => res)
        .catch(err => err);

    let countsql = `SELECT COUNT(*) FROM blog_articles`;
    let data3 = await query(countsql)
        .then(res => res)
        .catch(err => err);

    // 如果mysql执行出错
    if (data.errno || data2.error || data3.error) {
        status = 0; // 失败
        rows = 0;
        msg = data.sqlMessage || data2.sqlMessage || data3.sqlMessage;
    } else {
        status = 1;
        rows = data.length;
    }

    // 整理data2返回数据
    let data2res = {};
    data2.forEach(e => {
        e = {
            id: e.id,
            articleId: e.article_id,
            nickname: e.nickname,
            email: e.email,
            website: e.website,
            content: e.content,
            create_time: Date.parse(e.create_time) / 1000
        };
        if (data2res[e.articleId]) {
            data2res[e.articleId].push(e);
        } else {
            data2res[e.articleId] = [];
            data2res[e.articleId].push(e);
        }
    });

    let res = data.map(e => {
        e.created_at = Date.parse(e.created_at) / 1000;
        e.marks = data2res[e.id] || [];
        return e;
    });
    ctx.body = {
        result: {
            data: res,
            status,
            rows: data3[0]['COUNT(*)'],
            perpage: pagesize, // 根据前端参数
            total: Math.ceil(data3[0]['COUNT(*)'] / blogConfig.articleIsPage),
            msg
        }
    };
});

/**
 * @description: 删除文章评论
 * @param {id} 评论id
 * @param {token} 鉴权
 * @type {get}
 * @return {Object} result
 */

router.get('/deleteMark', async ctx => {
    let status = 0,
        msg = 'success',
        res;
    let id = ctx.request.query.id,
        token = ctx.request.query.token;
    if (!id || !token) {
        msg = '参数校验失败';
    } else {
        res = await query(DELETE_TABLE('blog_article_marks', 'id', id))
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            status = 1;
            msg = '删除成功';
        }
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
});

module.exports = router;
