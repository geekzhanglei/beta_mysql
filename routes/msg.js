/*
 * @Author: zhanglei
 * @Date: 2019-09-02 17:28:31
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-03 18:48:17
 * @Description: 留言板接口 (message api)
 */
const router = require('koa-router')();
const moment = require('moment');

const {
    query
} = require('../utils/query');
const {
    QUERY_TABLE,
    INSERT_TABLE,
    UPDATE_TABLE,
    DELETE_TABLE
} = require('../utils/sql');

/**
 * @description: 留言板分页查询
 * @param {number} curpage
 * @param {number} pagesize
 * @type {get}
 * @return {Object} result
 */

router.get('/blogapi/msg', async (ctx, next) => {
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

    let data = await query(QUERY_TABLE('blog_message_board_mark', startpage, pagesize, 'id')).then(res => res).catch(err => err);

    // 如果mysql执行出错
    if (data.errno) {
        status = 0; // 失败
        rows = 0;
        msg = data.sqlMessage;
    } else {
        status = 1;
        rows = data.length;
    }

    ctx.body = {
        result: {
            data,
            status,
            rows,
            msg
        }
    };
})

/**
 * @description: 留言板新增数据接口
 * @param {string} usrername
 * @param {string} content
 * @type post
 * @return:{object} result
 */
router.post('/blogapi/msg/add', async (ctx, next) => {
    let data = ctx.request.body; // 获取post请求数据data
    let msg = 'success',
        status = 0,
        agrees = 0;
    if (!data.username || !data.content) {
        msg = '必填项不可为空';
        return;
    }
    let obj = {
        username: data.username,
        content: data.content,
        agrees,
        created_at: moment().format('YYYY-MM-DD HH:mm:ss'), // 使用moment库存入mysql时间戳
        updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
    }
    let sql = `INSERT INTO blog_message_board_mark (${Object.keys(obj)}) VALUES(?,?,?,?,?)`
    let params = Object.values(obj);
    let res = await query(sql, params).then(res => res).catch(err => err);
    // 如果mysql执行出错
    if (res.errno) {
        status = 0; // 失败
        msg = res.sqlMessage;
    } else {
        status = 1;
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
})

/**
 * @description: 留言板留言删除接口
 * @param {type} id
 * @return:
 */
router.post('/blogapi/msg/delete', async (ctx) => {
    let status = 0,
        msg = 'success',
        res;
    let id = ctx.request.body.id,
        fetoken = ctx.request.body.token,
        token = 'M2ZkNDRkY2JmMjFkNTlmOGRkZTNkZTIwZWI3MzNlNTBfMTgz';
    if (!id || !token || fetoken !== token) {
        msg = '参数校验失败';
    } else {
        res = await query(DELETE_TABLE('blog_message_board_mark', 'id', id)).then(res => res).catch(err => err);
        // 如果mysql执行出错
        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            status = 1;
            msg = '删除成功'
        }
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
})





module.exports = router
