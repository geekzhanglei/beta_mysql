/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-08-26 19:15:17
 * @Description:
 */
const router = require('koa-router')()
const { query } = require('../utils/query');
const { CREATE_TABLE, QUERY_TABLE } = require('../utils/sql');

router.get('/', async (ctx, next) => {
//   await ctx.render('index', {
//     title: 'Hello Koa 2!'
//   })
    ctx.body = "<h1 style='color:red;'>hello world!</h1>";
})

router.get('/string', async (ctx, next) => {
  ctx.body = 'koa2 string'
})

router.get('/json', async (ctx, next) => {
  ctx.body = {
    title: 'koa2 json'
  }
})
router.get('/mysql', async(ctx,next)=>{
   let data = await query(QUERY_TABLE('blog_message_board_mark')).then(res => {
        return res;
    }).catch(err => {
        return err;
    });
    ctx.body = data;
})
// 创建数据库
router.get('/create_database',(ctx, next) => {
    let sql = 'CREATE DATABASE nodemysql';
    let data = query(sql).then(res=>res).catch(err => err);
    ctx.body = data;
})

module.exports = router
