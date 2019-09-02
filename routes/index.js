/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-08-29 17:51:54
 * @Description:
 */
const router = require('koa-router')()
const { query } = require('../utils/query');
const { CREATE_TABLE, QUERY_TABLE, INSERT_TABLE, UPDATE_TABLE, DELETE_TABLE } = require('../utils/sql');

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

// 创建表
router.get('/create_table',async(ctx, next) => {
    let data = await query(CREATE_TABLE).then(res=>res).catch(err => err);
    ctx.body = data;
})

// 查询数据
router.get('/mysql', async(ctx,next)=>{
    let data = await query(QUERY_TABLE('blog_message_board_mark')).then(res => res).catch(err => err);
     ctx.body = data;
 })
 // 添加数据
router.post('/add', async(ctx,next)=>{
    let data = ctx.request.body;  // 获取post请求数据data
    let res = await query(INSERT_TABLE('test', 'Name', data.name)).then(res => res).catch(err => err);
    ctx.body = ctx.request.body;
})

// 更改数据
router.post('/edit', async(ctx,next)=>{
    let data = ctx.request.body;  // 获取post请求数据data
    let res = await query(UPDATE_TABLE('test', `id`, 20, 'Name', data.name)).then(res => res).catch(err => err);
    ctx.body = ctx.request.body;
})

// 删除数据
router.get('/delete', async(ctx,next)=>{
    let delid = 20;
    let res = await query(DELETE_TABLE('test', `id`, delid)).then(res => res).catch(err => err);
    ctx.body = res;
})

module.exports = router
