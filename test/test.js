/**
 * node-static-server 测试脚本
 * 执行：npm test
 */

'use strict';
const assert = require('assert'),
    {spawn} = require('child_process'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    mime = require('mime'),
    {config} = require('./configForTest'),
    website = `http://${config.host}:${config.port}`;

var request = options => {
    return new Promise((resolve, reject) => {
        var req = http.request(options, res => {
            var buffers = [];
            res.on('data', chunk => {
                buffers.push(chunk);
            });
            res.on('end', () => {
                resolve({
                    res: res,
                    body: Buffer.concat(buffers)
                })
            });
        });
        req.on('error', (e) => {
            reject(e);
        });
        req.end();
    });
};

describe('node-static-server测试脚本', () => {
    var child;
    before(() => {
        var configPath = path.join(__dirname, './configForTest.js')
        child = spawn('node', ['server.js', configPath]);
        child.stderr.on('data', err => console.error(err.toString()));
    });

    after(() => {
        if (child) {
            child.kill();
        }
    });

    describe('创建服务器与显示欢迎页面', () => {
        it('要能正常创建服务器', done => {
            child.stdout.on('data', data => {
                assert.equal(data.toString(), `Static server is running at ${website}\n`);
                done();
            });
        });

        it('要能正常显示欢迎页面，当进入网站根路径时', done => {
            request(website).then(({res, body}) => {
                assert.equal(body, config.welcome);
                done();
            });
        });
    });

    describe('单文件请求', () => {
        var url = `${website}/js/test1.js`;
        describe('正常情况', () => {
            var file = path.join(__dirname, './assetsForTest/js/test1.js');
            var fileContent = fs.readFileSync(path.join(__dirname, './assetsForTest/js/test1.js')).toString();
            var stats = fs.statSync(file);
            var lastModified = stats.mtime.toUTCString();
            var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
            var etag = crypto.createHash('sha1').update(etagStr).digest('base64');

            it('应该返回200，当没有缓存时', done => {
                request(url).then(({res}) => {
                    assert.equal(res.statusCode, 200);
                    done();
                })
            });

            it('应该返回原始文件内容，当没有缓存，且浏览器不支持gzip压缩', done => {
                request(url).then(({res, body}) => {
                    /**
                     * body是一个Buffer实例，fileContent是string类型，可以直接判断相等
                     * 但要注意：2个Buffer之间不能判断相等，buffer1 == buffer2总是返回false
                     */
                    assert.equal(body, fileContent);
                    done();
                })
            });

            it('应该返回压缩后内容，当没有缓存，且浏览器支持gzip压缩', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js',
                    headers: {
                        'accept-encoding': 'gzip, deflate, sdch, br'
                    }
                }).then(({res, body}) => {
                    zlib.gzip(fileContent, (err, data) => {
                        assert.equal(body, data.toString());
                        done();
                    })
                })
            });

            it('应该返回304，当浏览器有缓存时', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js',
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }).then(({res}) => {
                    assert.equal(res.statusCode, 304);
                    done();
                })
            });

            it('应该返回0字节内容，当浏览器有缓存时', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js',
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }).then(({res, body}) => {
                    assert.equal(body, '');
                    done();
                })
            });

            it('要能获取到正确的消息头', done => {
                request(url).then(({res}) => {
                    var expires = new Date();
                    expires.setTime(expires.getTime() + config.maxAge * 1000);
                    assert.equal(res.headers['content-type'], mime.lookup('.js'));
                    assert.equal(res.headers['expires'], expires.toUTCString());
                    assert.equal(res.headers['cache-control'], "max-age=" + config.maxAge);
                    assert.equal(res.headers['last-modified'], lastModified);
                    assert.equal(res.headers['etag'], etag);
                    done();
                })
            });
        });

        describe('异常情况', () => {
            it('应该显示400错误，当使用非GET请求', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js',
                    method: 'POST'
                }).then(({res, body}) => {
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示404错误，当文件不存在', done => {
                var url = `${website}/js/test0.js`;
                request(url).then(({res}) => {
                    assert.equal(res.statusCode, 404);
                    done();
                })
            });

            it('应该显示403错误，当尝试访问的资源不是文件', done => {
                var url = `${website}/js/`;
                request(url).then(({res}) => {
                    assert.equal(res.statusCode, 403);
                    done();
                })
            });
        });
    });

    describe('多文件合并请求', () => {
        var url = `${website}/js/test1.js,/js/test2.js`;
        describe('正常情况', () => {
            var file1 = path.join(__dirname, './assetsForTest/js/test1.js');
            var file2 = path.join(__dirname, './assetsForTest/js/test2.js');
            var file1Content = fs.readFileSync(path.join(__dirname, './assetsForTest/js/test1.js'));
            var file2Content = fs.readFileSync(path.join(__dirname, './assetsForTest/js/test2.js'));
            var stats1 = fs.statSync(file1);
            var stats2 = fs.statSync(file2);
            var mtime = new Date(Math.max(stats1.mtime, stats2.mtime));
            var ino = (stats1.ino + stats2.ino) / 2;
            var size = stats1.size + stats2.size;
            var lastModified = mtime.toUTCString();
            var etagStr = [ino, mtime.toUTCString(), size].join('-');
            var etag = crypto.createHash('sha1').update(etagStr).digest('base64');

            it('应该返回200，当没有缓存时', done => {
                request(url).then(({err, res}) => {
                    assert.equal(res.statusCode, 200);
                    done();
                })
            });

            it('应该返回原始文件内容，当没有缓存，且浏览器不支持gzip压缩', done => {
                request(url).then(({res, body}) => {
                    assert.equal(body, file1Content + file2Content);
                    done();
                })
            });

            it('应该返回压缩后内容，当没有缓存，且浏览器支持gzip压缩', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js,/js/test2.js',
                    headers: {
                        'accept-encoding': 'gzip, deflate, sdch, br'
                    }
                }).then(({res, body}) => {
                    zlib.gzip(file1Content + file2Content, (err, data) => {
                        assert.equal(body, data.toString());
                        done();
                    })
                })
            });

            it('应该返回304，当浏览器有缓存时', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js,/js/test2.js',
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }).then(({res}) => {
                    assert.equal(res.statusCode, 304);
                    done();
                })
            });

            it('应该返回0字节内容，当浏览器有缓存时', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js,/js/test2.js',
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }).then(({res, body}) => {
                    assert.equal(body, '');
                    done();
                })
            });

            it('要能获取到正确的消息头', done => {
                request(url).then(({res}) => {
                    var expires = new Date();
                    expires.setTime(expires.getTime() + config.maxAge * 1000);
                    assert.equal(res.headers['content-type'], mime.lookup('.js'));
                    assert.equal(res.headers['expires'], expires.toUTCString());
                    assert.equal(res.headers['cache-control'], "max-age=" + config.maxAge);
                    assert.equal(res.headers['last-modified'], lastModified);
                    assert.equal(res.headers['etag'], etag);
                    done();
                })
            });
        });

        describe('异常情况', () => {
            it('应该显示400错误，当使用非GET请求', done => {
                request({
                    host: config.host,
                    port: config.port,
                    path: '/js/test1.js,/js/test2.js',
                    method: 'POST'
                }).then(({res, body}) => {
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示400错误，当不全是.js或不全是.css文件', done => {
                var url = `${website}/js/test1.js,css/test1.css`;
                request(url).then(({res, body}) => {
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示404错误，当至少一个文件不存在', done => {
                var url = `${website}/js/test1.js,js/test0.js`;
                request(url).then(({res}) => {
                    assert.equal(res.statusCode, 404);
                    done();
                })
            });
        });
    });
});