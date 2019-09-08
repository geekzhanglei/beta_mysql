const router = require('koa-router')()
const {
    query
} = require('../utils/query');

router.prefix('/blogapi/login');

/**
 * @description: 登录接口
 * @param {username} 用户名
 * @param {password} 密码
 * @return {} result 
 */
router.post('/', async ctx => {
    let status = 0,
        msg = 'success',
        res,
        token;
    let username = ctx.request.body.username,
        password = ctx.request.body.password;
    if (!username || !password) {
        msg = '必填项不可为空';
    } else {
        let sql = `SELECT * FROM blog_admin_user`;
        res = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            // password
            password = Buffer.from(password).toString('base64');
            res = res[0];
            if(res.username===username&&res.password === password) {
                status = 1;
                msg = '登录成功';
                token = res.password;
            } else {
                status = 0;
                msg = '用户名或密码错误';
            }
        }
    }

    ctx.body = {
        result: {
            msg,
            status,
            token
        }
    };
});

/**
 * @description: 判断是否登录
 * @param {token} token
 * @type {get}
 * @return {} result 
 */

 router.get('/isLogin', async ctx => {
    let token = ctx.request.query.token; // 获取post请求数据req
    let msg = 'success',
        status = 0,
        sql,
        data;
    if (!token) {
        msg = '必填项不可为空';
    } else {
        sql = `SELECT * FROM blog_admin_user`;
        data = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (data.errno) {
            status = 0; // 失败
            msg = data.sqlMessage;
        } else {
            data = data[0];
            if(data.password === token) {
                status = 1;
                msg = '已登录'
            } else {
                status = 0;
                msg = '未登录';
            }
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
 * @description: 获取用户信息
 * @type {get}
 * @return {} result 
 */

router.get('/adminInfo', async ctx => {
    let msg = 'success',
        status = 0,
        sql = `SELECT * FROM blog_admin_user`,
        data;
    
        data = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (data.errno) {
            status = 0; // 失败
            msg = data.sqlMessage;
        } else {
            data = data[0];
            status = 1;
        }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
 });

module.exports = router;
