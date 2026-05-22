/*
 * @Author: zhanglei
 * @Date: 2019-07-15 15:50:39
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-16 14:56:09
 * @Description: 首页
 */
const Koa = require('koa');
const app = new Koa();
const path = require('path');
const fs = require('fs');
const views = require('koa-views');
const json = require('koa-json');
const onerror = require('koa-onerror');
const koaBody = require('koa-body');
const logger = require('koa-logger');

const index = require('./routes/index');
const user = require('./routes/user');
const article = require('./routes/article');
const msg = require('./routes/msg');
const login = require('./routes/login');
const admincomments = require('./routes/admincomments');
const adminmsg = require('./routes/adminmsg');
const adminoption = require('./routes/adminoption');

// error handler
onerror(app);

// middlewares
app.use(
    koaBody({
        multipart: true,
        formidable: {
            uploadDir: path.join(__dirname, 'public/upload/'), // 设置文件上传目录
            keepExtensions: true, // 保持文件扩展名
            maxFieldsSize: 2 * 1024 * 1024, // 文件上传大小，缺省2M
            onFileBegin: (name, file) => {
                console.log(file.name);
                // 文件上传前的设置
                const fp = path.join(__dirname, 'public/upload/');
                if (!fs.existsSync(fp)) {
                    // 检查是否有“public/upload/”文件夹
                    fs.mkdirSync(fp); // 没有就创建
                }
            }
        }
    })
);
// app.use(
//     bodyparser({
//         enableTypes: ['json', 'form', 'text']
//     })
// );
app.use(json());
app.use(logger());
app.use(require('koa-static')(__dirname + '/public')); // 这里生成静态资源目录，浏览器访问时http://localhost:3000/upload/*.png 即可，不需要写public

app.use(async (ctx, next) => {
    const token = ctx.cookies.get('blog_admin_token');
    if (token) {
        if (ctx.request.query && !ctx.request.query.token) {
            ctx.request.query.token = token;
        }
        if (ctx.query && !ctx.query.token) {
            ctx.query.token = token;
        }
        if (ctx.request.body && typeof ctx.request.body === 'object' && !ctx.request.body.token) {
            ctx.request.body.token = token;
        }
    }
    await next();
});

app.use(
    views(__dirname + '/views', {
        extension: 'ejs'
    })
);

// CORS middleware
app.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', ctx.headers.origin || '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With');
    ctx.set('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    ctx.set('Access-Control-Allow-Credentials', 'true');
    if (ctx.method === 'OPTIONS') {
        ctx.status = 204;
    } else {
        await next();
    }
});

// logger 控制台打印当前调用的方法、url、耗时
app.use(async (ctx, next) => {
    const start = new Date();
    await next();
    const ms = new Date() - start;
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

// routes
app.use(index.routes(), index.allowedMethods()); // allowedMethods是路由方法，用来丰富http hedaer的信息
app.use(article.routes(), article.allowedMethods());
app.use(user.routes(), user.allowedMethods());
app.use(msg.routes(), msg.allowedMethods());
app.use(login.routes(), login.allowedMethods());
app.use(admincomments.routes(), admincomments.allowedMethods());
app.use(adminmsg.routes(), adminmsg.allowedMethods());
app.use(adminoption.routes(), adminoption.allowedMethods());

// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err, ctx);
});

module.exports = app;
