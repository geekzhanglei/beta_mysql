<!--
 * @Author: zhanglei
 * @Date: 2019-09-04 15:10:02
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-05 18:46:22
 * @Description:
 -->

# 重构后端接口服务

基于 node(koa2)+mysql 重构 blog 后端接口

# 接口文档

## 留言板

### 1. 查询留言

```
GET： /blogapi/msg?curpage=1&pagesize=2
```

#### 请求参数

| 字段名   | 类型 | 说明     |
| -------- | ---- | -------- |
| curpage  | int  | 当前页   |
| pagesize | int  | 每页条数 |

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

| 字段名     | 类型 | 说明    |
| ---------- | ---- | ------- |
| comment_id | str  | 留言 id |

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

| 字段名   | 类型 | 说明     |
| -------- | ---- | -------- |
| curpage  | int  | 当前页   |
| pagesize | int  | 每页条数 |

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
