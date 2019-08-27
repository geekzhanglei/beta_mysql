/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-08-27 20:00:23
 * @Description:
 */
const router = require('koa-router')()
const { query } = require('../utils/query');
const { CREATE_TABLE, QUERY_TABLE } = require('../utils/sql');

router.get('/', async (ctx, next) => {
  await ctx.render('index', {
    user: { name: 'Hello Koa 2!' }
  })
    // ctx.body = "<h1 style='color:red;'>hello world!</h1>";
})

router.get('/string', async (ctx, next) => {
  ctx.body = 'koa2 string'
})

router.get('/json', async (ctx, next) => {
  ctx.body = {
    title: 'koa2 json'
  }
})

// 显示数据库
router.get('/show_database',async(ctx, next) => {
    let sql = 'SHOW DATABASES;';
    let data = await query(sql).then(res=>res).catch(err => err);
    ctx.body = data;
});
// 删除数据库
router.get('/delete_database',async(ctx, next) => {
    let sql = 'DROP DATABASE test;';
    let data = await query(sql).then(res=>res).catch(err => err);
    ctx.body = data;
})
// 使用数据库
router.get('/use_database',async(ctx, next) => {
    let sql = 'USE nodemysql;';
    let data = await query(sql).then(res=>res).catch(err => err);
    ctx.body = data;
})

// 查询数据
router.get('/mysql', async(ctx,next)=>{
    let data = await query(QUERY_TABLE('blog_message_board_mark')).then(res => res).catch(err => err);
     ctx.body = data;
 })
 // 添加数据
 router.post('/add', async(ctx,next)=>{
     let data = await query(INSERT_TABLE('my_item')).then(res => res).catch(err => err);
      ctx.body = data;
  })


module.exports = router
