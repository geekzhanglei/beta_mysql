/*
 * @Author: zhanglei
 * @Date: 2019-09-11 15:32:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-12 18:42:53
 * @Description: 后台动态管理接口
 */
const router = require('koa-router')();
const blogConfig = require('../config/option_config');
const { QUERY_TABLE } = require('../utils/sql');

const { query } = require('../utils/query');

router.prefix('/blogapi/admin/');

/**
 * @description: 带评论的留言板分页查询
 * @param {number} curpage
 * @param {number} pagesize
 * @type {get}
 * @return {Object} result
 */

router.get('/msgwithmarks', async (ctx, next) => {
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

    let data = await query(
        QUERY_TABLE('blog_message_board_mark', startpage, pagesize, 'id')
    )
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
            id: e.id,
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
            perpage: pagesize,  // 根据前端参数
            total: Math.ceil(data3[0]['COUNT(*)'] / blogConfig.msgPerPage),
            msg
        }
    };
});

module.exports = router;
