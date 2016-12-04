/**
 * node-static-server
 * Node静态资源服务器的实现
 * Copyright(c) 2016 Sky <eshengsky@163.com>
 * MIT Licensed
 */

'use strict';
const http = require('http'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    {PassThrough} = require('stream'),
    zlib = require("zlib"),
    crypto = require("crypto"),
    mime = require('mime'),
    config = require('./config');

var port = config.port;
http.createServer((req, res) => {
    // 只允许GET请求方式
    if (req.method.toLowerCase() !== 'get') {
        return err403();
    }
    // 获取原始URL
    var originalUrl = req.url;
    // 从URL中获取路径名
    var pathName = url.parse(originalUrl).pathname;
    var pathNames = pathName.split(',');
    // 响应是否支持Gzip压缩
    var enableGzipHeader = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
    // 多文件请求（只支持js和css）
    if (pathNames.length > 1) {
        // 是否每个请求都是js或每个请求都是css
        let isAllJs = pathNames.every(function (item) {
                return path.extname(item) === '.js';
            }),
            isAllCss = pathNames.every(function (item) {
                return path.extname(item) === '.css';
            });
        if (!isAllJs && !isAllCss) {
            return err400();
        }
        let asyncCounter = 0;
        let data = [];
        pathNames.forEach(pathName => {
            getSingleFileStatus(pathName, (code, stats, fileName) => {
                asyncCounter++;
                data.push({code, stats, fileName});
                // 确保已拿到所有数据
                if (asyncCounter === pathNames.length) {
                    handleMultiFiles(data);
                }
            })
        })
    }
    // 单文件请求
    else {
        getSingleFileStatus(pathName, (code, stats, fileName) => {
            switch (code) {
                case 200:
                    setHeaders(stats, fileName);
                    let rs = fs.createReadStream(fileName);
                    let ext = path.extname(fileName);
                    var enableGzipFile = config.gzipTypes.test(ext);
                    // 如果文件支持gzip压缩则压缩后发给客户端
                    if (enableGzipFile && enableGzipHeader) {
                        res.setHeader('Content-Encoding', 'gzip');
                        res.writeHead(200);
                        rs.pipe(zlib.createGzip()).pipe(res);
                    }
                    // 否则读取未压缩文件给客户端
                    else {
                        res.writeHead(200);
                        rs.pipe(res);
                    }
                    break;
                case 304:
                    setHeaders(stats, fileName);
                    res.writeHead(304);
                    res.end();
                    break;
                case 403:
                    err403();
                    break;
                case 404:
                    err404();
                    break;
                case 500:
                    err500();
                    break;
            }
        })
    }

    /**
     * 处理多文件请求
     * @param data
     * @returns {*}
     */
    function handleMultiFiles(data) {
        // 包含了403错误
        if (data.some((item)=> {
                return item.code === 403
            })) {
            return err403();
        }
        // 包含了404错误
        if (data.some((item)=> {
                return item.code === 404
            })) {
            return err404();
        }
        // 包含了500错误
        if (data.some((item)=> {
                return item.code === 500
            })) {
            return err500();
        }

        // 得到一个stats数组
        let multiStats = data.map(item => item.stats);
        // 生成多文件情况下的ino, size
        let sumIno = 0,
            sumSize = 0;
        multiStats.forEach(item => {
            sumIno += item.ino;
            sumSize += item.size;
        });
        // mtime取最后修改的那个文件的
        let maxTime = Math.max.apply(null, multiStats.map(item => item.mtime));
        let mtime = new Date(maxTime);
        // ino取平均值
        let ino = sumIno / data.length;
        // size取所有文件相加的
        let size = sumSize;

        // 生成Etag
        let etagStr = [ino, mtime.toUTCString(), size].join('-');
        let etag = crypto.createHash('sha1').update(etagStr).digest('base64');

        // 设置报文头
        setHeaders({mtime, ino, size}, data[0].fileName);

        // 如果文件未修改则返回304
        if (req.headers['if-modified-since'] === mtime.toUTCString() && req.headers['if-none-match'] === etag) {
            res.writeHead(304);
            res.end();
            return;
        }

        // 判断是否支持Gzip
        let ext = isAllJs ? '.js' : '.css';
        let enableGzipFile = config.gzipTypes.test(ext);

        // 合并多文件的可读流到PT
        let streamArray = data.map(item => fs.createReadStream(item.fileName));
        let passThrough = new PassThrough();
        let waiting = streamArray.length;
        for (let stream of streamArray) {
            passThrough = stream.pipe(passThrough, {end: false});
            stream.once('end', () => --waiting === 0 && passThrough.emit('end'))
        }

        // 如果文件支持gzip压缩则压缩后发给客户端
        if (enableGzipFile && enableGzipHeader) {
            res.setHeader('Content-Encoding', 'gzip');
            res.writeHead(200);
            passThrough.pipe(zlib.createGzip()).pipe(res);
        }
        // 否则读取未压缩文件给客户端
        else {
            res.writeHead(200);
            passThrough.pipe(res);
        }
    }

    /**
     * 获取文件的状态
     * @param pathName
     * @param callback
     */
    function getSingleFileStatus(pathName, callback) {
        // 根据路径名得到将要读取的本地文件名
        var fileName = path.join(config.assets, pathName);
        // 获取文件信息
        fs.stat(fileName, (err, stats) => {
            if (err) {
                // 文件不存在
                if (err.code === 'ENOENT') {
                    console.warn('404 文件不存在：', fileName);
                    return callback(404);
                }
                // 其它错误
                else {
                    console.error('500 服务器错误：', fileName);
                    return callback(500);
                }
            } else {
                // 是一个文件
                if (stats.isFile()) {
                    // 上次修改时间
                    let lastModified = stats.mtime.toUTCString();
                    // 生成Etag
                    let etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
                    let etag = crypto.createHash('sha1').update(etagStr).digest('base64');
                    // 如果文件未修改则返回304
                    if (req.headers['if-modified-since'] === lastModified && req.headers['if-none-match'] === etag) {
                        return callback(304, stats, fileName);
                    }
                    return callback(200, stats, fileName);
                }
                // 不是文件，是目录或者别的
                else {
                    console.error('403 非法访问：', fileName);
                    return callback(403);
                }
            }
        });
    }

    function setHeaders(stats, fileName) {
        // 设置浏览器缓存过期时间
        var expires = new Date();
        expires.setTime(expires.getTime() + config.maxAge * 1000);
        res.setHeader("Expires", expires.toUTCString());
        res.setHeader("Cache-Control", "max-age=" + config.maxAge);
        // 设置上次修改时间
        var lastModified = stats.mtime.toUTCString();
        res.setHeader("Last-Modified", lastModified);
        // 生成Etag
        var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
        var etag = crypto.createHash('sha1').update(etagStr).digest('base64');
        res.setHeader('ETag', etag);
        // 设置MIME类型
        var ext = path.extname(fileName);
        res.setHeader("Content-Type", mime.lookup(ext));
    }

    /**
     * 400错误处理
     */
    function err400() {
        res.writeHead(400, {
            'Content-Type': 'text/plain'
        });
        res.end('400 Bad Request');
    }

    /**
     * 403错误处理
     */
    function err403() {
        res.writeHead(403, {
            'Content-Type': 'text/plain'
        });
        res.end('403 Forbidden');
    }

    /**
     * 404错误处理
     */
    function err404() {
        res.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        res.end('404 Not Found');
    }

    /**
     * 500错误处理
     */
    function err500() {
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('500 Internal Server Error');
    }
}).listen(port);

console.info(`Static server is running at http://127.0.0.1:${port}`);