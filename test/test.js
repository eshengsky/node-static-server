/**
 * Created by Sky on 2016/12/6.
 */

const assert = require('assert'),
    {spawn} = require('child_process'),
    request = require('request'),
    fs = require('fs'),
    path = require('path'),
    mime = require('mime'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    {config} = require('./configForTest'),
    website = `http://${config.host}:${config.port}`;

describe('node-static-server tests', () => {
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
                assert.equal(data, `Static server is running at ${website}\n`);
                done();
            });
        });

        it('要能正常显示欢迎页面，当进入网站根路径时', done => {
            request(website, (err, res, body) => {
                assert.ifError(err);
                assert.equal(body, config.welcome);
                done();
            })
        });
    });

    describe('单文件请求', () => {
        var url = `${website}/js/test1.js`;
        describe('正常情况', () => {
            var file = path.join(__dirname, './assetsForTest/js/test1.js');
            var fileContent = fs.readFileSync(path.join(__dirname, './assetsForTest/js/test1.js'));
            var stats = fs.statSync(file);
            var lastModified = stats.mtime.toUTCString();
            var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
            var etag = crypto.createHash('sha1').update(etagStr).digest('base64');

            it('应该返回200，当没有缓存时', done => {
                request(url, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    done();
                })
            });

            it('应该返回原始文件内容，当没有缓存，且浏览器不支持gzip压缩', done => {
                request(url, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(body, fileContent);
                    done();
                })
            });

            it('应该返回压缩后内容，当没有缓存，且浏览器支持gzip压缩', done => {
                request({
                    url: url,
                    headers: {
                        'accept-encoding': 'gzip, deflate, sdch, br'
                    }
                }, (err, res, body) => {
                    assert.ifError(err);
                    zlib.gzip(fileContent, (err, data) => {
                        assert.equal(body, data);
                        done();
                    })
                })
            });

            it('应该返回304，当浏览器有缓存时', done => {
                request({
                    url: url,
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 304);
                    done();
                })
            });

            it('应该返回0字节内容，当浏览器有缓存时', done => {
                request({
                    url: url,
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(body, '');
                    done();
                })
            });

            it('要能获取到正确的消息头', done => {
                request(url, (err, res) => {
                    var expires = new Date();
                    expires.setTime(expires.getTime() + config.maxAge * 1000);
                    assert.ifError(err);
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
                request.post(url, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示404错误，当文件不存在', done => {
                var url = `${website}/js/test0.js`;
                request(url, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 404);
                    done();
                })
            });

            it('应该显示403错误，当尝试访问的资源不是文件', done => {
                var url = `${website}/js/`;
                request(url, (err, res) => {
                    assert.ifError(err);
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
                request(url, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    done();
                })
            });

            it('应该返回原始文件内容，当没有缓存，且浏览器不支持gzip压缩', done => {
                request(url, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(body, file1Content + file2Content);
                    done();
                })
            });

            it('应该返回压缩后内容，当没有缓存，且浏览器支持gzip压缩', done => {
                request({
                    url: url,
                    headers: {
                        'accept-encoding': 'gzip, deflate, sdch, br'
                    }
                }, (err, res, body) => {
                    assert.ifError(err);
                    zlib.gzip(file1Content + file2Content, (err, data) => {
                        assert.equal(body, data);
                        done();
                    })
                })
            });

            it('应该返回304，当浏览器有缓存时', done => {
                request({
                    url: url,
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 304);
                    done();
                })
            });

            it('应该返回0字节内容，当浏览器有缓存时', done => {
                request({
                    url: url,
                    headers: {
                        'if-modified-since': lastModified,
                        'if-none-match': etag
                    }
                }, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(body, '');
                    done();
                })
            });

            it('要能获取到正确的消息头', done => {
                request(url, (err, res) => {
                    var expires = new Date();
                    expires.setTime(expires.getTime() + config.maxAge * 1000);
                    assert.ifError(err);
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
                request.post(url, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示400错误，当不全是.js或不全是.css文件', done => {
                var url = `${website}/js/test1.js,css/test1.css`;
                request(url, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.equal(body, '400 Bad Request');
                    done();
                })
            });

            it('应该显示404错误，当至少一个文件不存在', done => {
                var url = `${website}/js/test1.js,js/test0.js`;
                request(url, (err, res) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 404);
                    done();
                })
            });
        });
    });
});