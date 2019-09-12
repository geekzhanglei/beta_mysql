/*
 * @Author: zhanglei
 * @Date: 2019-09-02 17:28:31
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-12 18:46:49
 * @Description: 留言板接口 (message api)
 */
const router = require('koa-router')();
const blogConfig = require('../config/option_config');

const { query } = require('../utils/query');
const { DELETE_TABLE } = require('../utils/sql');

router.prefix('/blogapi/msg'); // 路由前缀，用来访问localhost:3000/blogapi/msg 这样的路径

/**
 * @description: 留言板分页查询
 * @param {number} curpage
 * @type {get}
 * @return {Object} result
 */

router.get('/', async (ctx, next) => {
    let startpage = 0;
    let curpage = ctx.request.query.curpage,
        pagesize = blogConfig.msgPerPage;
    let status = 1,
        msg = 'success';
    let rows = 0; // 数据条数
    // 参数校验
    if (parseInt(curpage) > 0 && parseInt(curpage) == curpage) {
        startpage = (curpage - 1) * pagesize;
    } else {
        curpage = 1;
        startpage = 0;
    }

    let sql;
    if (blogConfig.msgIsPage) {
        // 分页
        sql = `SELECT * FROM blog_message_board_mark  ORDER BY id DESC LIMIT ${startpage},${pagesize}`;
    } else {
        // 不分页
        sql = `SELECT * FROM blog_message_board_mark  ORDER BY id DESC`;
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
        `SELECT * FROM blog_message_board_reply WHERE comment_id in(${queryid})`
    )
        .then(res => res)
        .catch(err => err);

    let countsql = `SELECT COUNT(*) FROM blog_message_board_mark`;
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
            commentId: e.comment_id,
            replyUserName: e.username,
            content: e.content,
            createTime: Date.parse(e.created_at) / 1000
        };
        if (data2res[e.commentId]) {
            data2res[e.commentId].push(e);
        } else {
            data2res[e.commentId] = [];
            data2res[e.commentId].push(e);
        }
    });

    let res = data.map(e => {
        e.created_at = Date.parse(e.created_at) / 1000;
        e.updated_at = Date.parse(e.updated_at) / 1000;
        e.reply = data2res[e.id] || [];
        return e;
    });
    ctx.body = {
        result: {
            data: res,
            status,
            rows: data3[0]['COUNT(*)'],
            total: Math.ceil(data3[0]['COUNT(*)'] / blogConfig.msgPerPage),
            perpage: blogConfig.msgPerPage,
            isPagination: blogConfig.msgIsPage,
            msg
        }
    };
});

/**
 * @description: 留言板新增数据接口
 * @param {string} usrername 可选
 * @param {string} content
 * @type post
 * @return:{object} result
 */
router.post('/add', async (ctx, next) => {
    let data = ctx.request.body; // 获取post请求数据data
    let msg = 'success',
        status = 0,
        obj = {},
        sql,
        params,
        res;
    if (!data.content) {
        msg = '必填项不可为空';
    } else {
        obj = {
            username: data.username || blogConfig.msgName,
            content: data.content
        };
        sql = `INSERT INTO blog_message_board_mark (${Object.keys(
            obj
        )}) VALUES(?,?)`;
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

/**
 * @description: 留言板留言删除接口
 * @param {type} id
 * @return:
 */
router.post('/delete', async ctx => {
    let status = 0,
        msg = 'success',
        res;
    let id = ctx.request.body.id,
        token = ctx.request.body.token;
    if (!id || !token) {
        msg = '参数校验失败';
    } else {
        res = await query(DELETE_TABLE('blog_message_board_mark', 'id', id))
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
 * @description: 回复留言
 * @param {string} username 可选
 * @param {string} content
 * @param {string} comment_id
 * @return: {obj} result
 */
router.post('/replyadd', async (ctx, next) => {
    let req = ctx.request.body; // 获取post请求数据req
    let msg = 'success',
        status = 0,
        obj = {},
        sql,
        params,
        data;
    if (!req.content || !req.comment_id) {
        msg = '必填项不可为空';
    } else {
        obj = {
            username: req.username || blogConfig.msgReplyName,
            content: req.content,
            comment_id: req.comment_id
        };
        sql = `INSERT INTO blog_message_board_reply (${Object.keys(
            obj
        )}) VALUES(?,?,?)`;
        params = Object.values(obj);
        data = await query(sql, params)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (data.errno) {
            status = 0; // 失败
            msg = data.sqlMessage;
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
/**
 * @description: 点赞留言
 * @param {string} id
 * @return: {obj} result
 */
router.get('/agree', async (ctx, next) => {
    let req = ctx.request.query; // 获取post请求数据req
    let msg = 'success',
        status = 0,
        obj = {},
        sql,
        data;
    if (!req.id || !req.isAdd) {
        msg = '必填项不可为空';
    } else {
        obj = {
            id: req.id
        };

        sql = `UPDATE blog_message_board_mark SET agrees=agrees+${
            req.isAdd == 1 ? 1 : -1
        } where id = ${obj.id}`;
        data = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (data.errno) {
            status = 0; // 失败
            msg = data.sqlMessage;
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

module.exports = router;
