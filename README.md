# 重构后端接口服务

基于 node(koa2)+mysql 重构 blog 后端接口

# 接口文档

## 留言板

### 1. 查询留言

```
GET： /blogapi/msg?curpage=1
```

#### 请求参数

| 字段名  | 类型 | 说明   |
| ------- | ---- | ------ |
| curpage | int  | 当前页 |

#### 响应

```
{
"result": {
"data": [
        {
            "id": 143,
            "username": "你好x",
            "content": "conet",
            "status": 1,
            "agrees": 0,
            "created_at": 1567505231,
            "updated_at": 1567505231
        },
        {
            "id": 142,
            "username": "xx",
            "content": "conet",
            "status": 1,
            "agrees": 0,
            "created_at": 1567505231,
            "updated_at": 1567505231
        }
    ],
    "status": 1,
    "rows": 2,
    "msg": "success"
    }
}
```

### 2. 新增留言

```
POST: /blogapi/msg/add
```

#### 请求参数

| 字段名   | 类型 | 说明   |
| -------- | ---- | ------ |
| username | str  | 用户名 |
| content  | str  | 内容   |

#### 响应

```
result: {
    "msg":'success',
    "status": 1
}
```

### 3. 删除留言

```
POST: /blogapi/msg/delete
```

#### 请求参数

| 字段名 | 类型 | 说明                   |
| ------ | ---- | ---------------------- |
| id     | str  | 留言 id                |
| token  | str  | 用户 token，识别操作者 |

#### 响应

```
{
    "result": {
        "msg": "删除成功",
        "status": 1
    }
}
```

### 4. 回复留言

```
POST: /blogapi/msg/replyadd
```

#### 请求参数

| 字段名     | 类型 | 说明       |
| ---------- | ---- | ---------- |
| comment_id | str  | 留言 id    |
| username   | str  | 回复者名字 |
| comtent    | str  | 回复内容   |

#### 响应

```
{
    "result": {
        "msg": "删除成功",
        "status": 1
    }
}
```

### 5. 点赞留言

```
GET: /blogapi/msg/agree
```

#### 请求参数

| 字段名 | 类型 | 说明             |
| ------ | ---- | ---------------- |
| id     | str  | 留言 id          |
| isAdd  | str  | 点赞还说取消点赞 |

#### 响应

```
{
    "result": {
        "msg": "删除成功",
        "status": 1
    }
}
```

## 文章

### 1. 查询文章

```
GET: blogapi/article
```

#### 请求参数

| 字段名  | 类型 | 说明   |
| ------- | ---- | ------ |
| curpage | int  | 当前页 |

不写参数表示不分页

#### 响应

```
{
    "result": {
        "data": [
            {
                "id": 75,
                "created_at": 1563321084,
                "introduction": "对于前端，nginx常用来起web服务，配置代理转发到本地或者线上。配置代理过程中，有location匹配规则、proxy_pass末尾斜杠问题等需要注意。",
                "title": "nginx常用代理转发配置总结",
                "username": "浇水"
            },
            {
                "id": 74,
                "created_at": 1560478158,
                "introduction": "主要记录6月8日尤雨溪的vue3.0进展介绍与vue工具链维护者蒋豪群的介绍",
                "title": "vue3.0进展之第三届vue-conf笔记",
                "username": "浇水"
            }
        ],
        "status": 1,
        "rows": 2,
        "isPagination": false,
        "msg": "success"
    }
}
```

### 2. 删除文章

```
POST: /blogapi/article/delete
```

#### 请求参数

| 字段名 | 类型 | 说明                   |
| ------ | ---- | ---------------------- |
| id     | str  | 文章 id                |
| token  | str  | 用户 token，识别操作者 |

#### 响应

```
{
    "result": {
        "msg": "删除成功",
        "status": 1
    }
}
```

### 3. 文章详情

```
GET: /blogapi/article/detail
```

#### 请求参数

| 字段名 | 类型 | 说明                   |
| ------ | ---- | ---------------------- |
| id     | str  | 文章 id                |
| token  | str  | 用户 token，识别操作者 |

#### 响应

```
{
    "result": {
        "data": {
            "id": 75,
            "username": "浇水",
            "title": "nginx常用代理转发配置总结",
            "introduction": "对于前端...",
            "content": "content",
            "created_at": 1563321084
        },
        "comments": [
            {
                "id": 61,
                "article_id": 75,
                "nickname": "zhang",
                "email": "nihao@she.com",
                "website": "www.baidu.com",
                "content": "ceshizhong",
                "agrees": 0,
                "status": 1,
                "create_time": null
            }
        ],
        "status": 1,
        "msg": "success"
    }
}
```

### 4. 添加文章评论

```
POST: /blogapi/article/marks/add
```

#### 请求参数

| 字段名    | 类型 | 说明     | 备注 |
| --------- | ---- | -------- | ---- |
| articleId | str  | 文章 id  |
| nickname  | str  | 用户昵称 |
| content   | str  | 内容     |
| email     | str  | 邮件     |
| website   | str  | 网址     | 可选 |

### 5. 增加文章

```
POST: /blogapi/article/release
```

#### 请求参数

| 字段名       | 类型 | 说明 | 备注 |
| ------------ | ---- | ---- | ---- |
| token        | str  | 鉴权 |
| title        | str  | 题目 |
| content      | str  | 内容 |
| introduction | str  | 摘要 |

## 登录相关

### 1. 登录

```
POST: blogapi/admin/login
```

#### 请求参数

| 字段名   | 类型 | 说明   |
| -------- | ---- | ------ |
| username | str  | 用户名 |
| password | str  | 密码   |

### 2. 是否登录

```
GET: blogapi/admin/isLogin
```

#### 请求参数

| 字段名 | 类型  | 说明 |
| ------ | ----- | ---- |
| token  | token | 鉴权 |

### 3. 登出

```
GET: blogapi/admin/loginout
```

#### 请求参数

| 字段名 | 类型  | 说明 |
| ------ | ----- | ---- |
| token  | token | 鉴权 |

## 用户信息相关

### 1. 获取用户信息

```
GET: blogapi/admin/adminInfo
```

### 2. 修改用户密码

```
POST: blogapi/admin/modifypw
```

#### 请求参数

| 字段名      | 类型 | 说明   |
| ----------- | ---- | ------ |
| password    | str  | 旧密码 |
| newpassword | str  | 新密码 |
| token       | str  | 鉴权   |

### 3. 修改用户信息

```
POST: blogapi/admin/modifyAdminInfo
```

#### 请求参数

| 字段名   | 类型 | 说明     |
| -------- | ---- | -------- |
| nickname | str  | 用户昵称 |
| headimg  | file | 头像     |
| token    | str  | 鉴权     |

## 其他接口

### 1. 带评论的文章分页查询

```
GET: /blogapi/admin/articlesWithMarks
```

#### 请求参数

| 字段名   | 类型 | 说明     |
| -------- | ---- | -------- |
| curpage  | str  | 当前页   |
| pagesize | str  | 每页条数 |

### 2. 带评论的留言板分页查询

```
GET: /blogapi/admin/msgwithmarks
```

#### 请求参数

| 字段名   | 类型 | 说明     |
| -------- | ---- | -------- |
| curpage  | str  | 当前页   |
| pagesize | str  | 每页条数 |

## GitHub CI/CD 部署集成

本项目使用 GitHub Actions 实现自动化部署流程，支持代码提交、构建、测试和自动部署到生产环境。

### 工作流配置

项目在 `.github/workflows/` 目录下配置 CI/CD 工作流，主要工作流包括：

#### 1. 自动部署工作流 (deploy.yml)

**触发条件：**
- 代码 push 到 main 或 master 分支
- 手动触发 workflow_dispatch

**流程步骤：**
1. 检出代码
2. 配置 Node.js 环境
3. 安装依赖：`npm install` 或 `yarn install`
4. 运行测试：`npm test`
5. 构建应用（如需要）
6. 部署到服务器

#### 2. 环境配置

在 GitHub 仓库 Settings > Secrets and variables > Actions 中配置以下环境变量：

- `DEPLOY_HOST` - 部署服务器地址
- `DEPLOY_USER` - 服务器用户名
- `DEPLOY_KEY` - SSH 私钥
- `DEPLOY_PATH` - 部署路径
- `DB_HOST` - 数据库主机
- `DB_USER` - 数据库用户
- `DB_PASSWORD` - 数据库密码
- `DB_NAME` - 数据库名称

#### 3. 部署流程

```yaml
# 示例工作流
name: Deploy to Production

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd ${{ secrets.DEPLOY_PATH }}
            git pull origin master
            npm install
            npm run build
            pm2 restart beta_mysql || pm2 start app.js --name "beta_mysql"
```

### 本地测试

在提交代码前，建议本地测试：

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 启动应用
npm start
```

### 监控和调试

- 在 GitHub Actions 页面查看工作流执行状态
- 查看每个步骤的详细日志
- 部署失败时，检查 Secrets 配置和服务器连接
- 查看服务器日志：`pm2 logs beta_mysql`

### 常见问题

**Q: 部署失败，提示权限拒绝？**
A: 检查 SSH 私钥配置是否正确，确保服务器已添加对应的公钥。

**Q: 依赖安装失败？**
A: 确保 Node.js 版本兼容，检查 package.json 依赖配置。

**Q: 数据库连接失败？**
A: 确认 Secrets 中的数据库连接信息正确，服务器防火墙已开放相应端口。
