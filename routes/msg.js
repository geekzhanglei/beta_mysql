/*
 * @Author: zhanglei
 * @Date: 2019-09-02 17:28:31
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-02 19:40:58
 * @Description: 留言板接口 (message api)
 */
const router = require('koa-router')();
const { query } = require('../utils/query');
const { CREATE_TABLE, QUERY_TABLE, INSERT_TABLE, UPDATE_TABLE, DELETE_TABLE } = require('../utils/sql');

router.get('/blogapi/msg',async(ctx, next) => {
    let data = await query(QUERY_TABLE('blog_message_board_mark')).then(res=>res).catch(err => err);
    ctx.body = data;
})

module.exports = router
