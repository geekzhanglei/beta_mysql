/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-11 17:04:51
 * @Description: 文章接口
 */
const router = require('koa-router')()
const blogConfig = require('../config/option_config');

const {
    query
} = require('../utils/query');

router.prefix('/blogapi/article') // 路由前缀，用来访问localhost:3000/users 这样的路径

/**
 * @description: 文章分页查询
 * @param {curpage} 当前页
 * @param {pagesize} 每页条数
 * @type {get}
 * @return {Object} result
 */

router.get('/', async (ctx, next) => {
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
    if (!ctx.request.query.curpage || !ctx.request.query.pagesize) {
        sql = `SELECT id,created_at,introduction,title,username FROM blog_articles  ORDER BY id DESC`;
    } else {
        sql = `SELECT id,created_at,introduction,title,username FROM blog_articles  ORDER BY id DESC LIMIT ${startpage},${pagesize}`;
    }
    let data = await query(sql)
        .then(res => res)
        .catch(err => err);

    // 如果mysql执行出错
    if (data.errno) {
        status = 0; // 失败
        rows = 0;
        msg = data.sqlMessage;
    } else {
        status = 1;
        rows = data.length;
    }
    let res = data.map(e => {
        e.created_at = Date.parse(e.created_at) / 1000;
        return e;
    });
    ctx.body = {
        result: {
            data: res,
            status,
            rows,
            msg
        }
    };
});

/**
 * @description: 删除文章
 * @param {id} 文章id
 * @return {obj} result
 */
router.post('/delete', async ctx => {
    let status = 0,
        msg = 'success',
        res;
    let id = ctx.request.body.id,
        fetoken = ctx.request.body.token,
        token = 'M2ZkNDRkY2JmMjFkNTlmOGRkZTNkZTIwZWI3MzNlNTBfMTgz';
    if (!id || !token || fetoken !== token) {
        msg = '参数校验失败';
    } else {
        res = await query(DELETE_TABLE('blog_articles', 'id', id))
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

/**
 * @description: 文章详情
 * @param {id}  文章id
 * @return: {obj} result
 */
router.get('/detail', async ctx => {
    let status = 1,
        msg = 'success';
    let id = ctx.request.query.id;
    let sql = `SELECT id,username,title,introduction,content,created_at FROM blog_articles WHERE id=${id}`
    let data = await query(sql)
        .then(res => res)
        .catch(err => err);
    let commentSql = `SELECT * FROM blog_article_marks WHERE article_id=${id}`;
    let data2 = await query(commentSql)
        .then(res => res)
        .catch(err => err);

    // 如果mysql执行出错
    if (data.errno) {
        status = 0; // 失败
        msg = data.sqlMessage;
    } else {
        status = 1;
        rows = data.length;
    }

    ctx.body = {
        result: {
            data: data.map(e => {
                e.created_at = Date.parse(e.created_at) / 1000;
                return e;
            })[0],
            comments: data2,
            status,
            msg
        }
    };
})

/**
 * @description: 文章评论上传
 * @param {articleId} 文章id
 * @param {nickname} 昵称
 * @param {email}
 * @param {website} 个人网址
 * @param {content} 留言内容
 * @return {obj} result
 */
router.post('/marks/add', async ctx => {
    let status = 0,
        msg = 'success',
        res, obj;

    let article_id = ctx.request.body.articleId,
        nickname = ctx.request.body.nickname,
        email = ctx.request.body.email,
        website = ctx.request.body.website,
        content = ctx.request.body.content;

    if (!article_id || !nickname || !email || !content) {
        msg = '参数校验失败';
    } else {
        obj = {
            article_id,
            content,
            nickname,
            email,
            website
        };
        sql = `INSERT INTO blog_article_marks (${Object.keys(
            obj
        )}) VALUES(?,?,?,?,?)`;
        params = Object.values(obj);
        res = await query(sql, params)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            status = 1;
        }
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
});


module.exports = router
