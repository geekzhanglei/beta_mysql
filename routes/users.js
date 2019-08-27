/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-08-27 17:00:40
 * @Description:
 */
const router = require('koa-router')()

router.prefix('/users')    // 路由前缀，用来访问localhost:3000/users 这样的路径

router.get('/', function (ctx, next) {
  ctx.body = 'this is a users response!'
})

router.get('/bar', function (ctx, next) {
  ctx.body = 'this is a users/bar response'
})

module.exports = router
