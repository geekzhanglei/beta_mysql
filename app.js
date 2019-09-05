/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-05 17:13:41
 * @Description: 首页
 */
const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')

const index = require('./routes/index')
const article = require('./routes/article')
const msg = require('./routes/msg')

// error handler
onerror(app)

// middlewares
app.use(bodyparser({
    enableTypes: ['json', 'form', 'text']
}))
app.use(json())
app.use(logger())
app.use(require('koa-static')(__dirname + '/public'))

app.use(views(__dirname + '/views', {
    extension: 'ejs'
}))

// logger 控制台打印当前调用的方法、url、耗时
app.use(async (ctx, next) => {
    const start = new Date()
    await next()
    const ms = new Date() - start
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

// routes
app.use(index.routes(), index.allowedMethods()) // allowedMethods是路由方法，用来丰富http hedaer的信息
app.use(article.routes(), article.allowedMethods())
app.use(msg.routes(), msg.allowedMethods())

// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err, ctx)
});

module.exports = app
