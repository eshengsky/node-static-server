# node-static-server

基于Node.js的静态资源服务器，支持浏览器缓存，支持多文件合并请求。

[![Build Status](https://travis-ci.org/eshengsky/node-static-server.svg?branch=master)](https://travis-ci.org/eshengsky/node-static-server)

## 快速开始

#### 下载源码
点击右上角 Clone or download - Download ZIP 下载压缩包，或者使用 Git 进行下载：
```bash
$ git clone https://github.com/eshengsky/node-static-server.git
```

#### 安装依赖

```bash
$ npm install
```

#### 启动服务器

在启动服务器之前，你可以修改项目根目录下的 config.js 文件进行自定义配置。

```bash
$ npm start
```

如果一切顺利，服务器已经可以通过 http://127.0.0.1:8080 进行访问。

#### 运行测试

*如果你事先没有全局安装过 [Mocha](http://mochajs.org/)，请先使用 `$ npm install -g mocha` 进行安装。*
```bash
$ npm test
```

## 许可协议
MIT License

Copyright (c) 2016 Sky

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
