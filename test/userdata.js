var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString
var parseTarball = require('./util').parseTarball

test('get empty userdata', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      tarball.userdata(function (err, userdata) {
        t.error(err, 'got userdata ok')
        t.deepEquals(userdata, {})

        parseTarball(filepath, function (err, res, index, meta) {
          t.error(err, 'parsed tarball ok')

          t.equals(res.length, 2, 'two entries')

          t.equals(res[0].name, 'hello.txt', 'contents match')
          t.equals(res[0].type, 'file', 'type matches')
          t.equals(res[0].data.toString(), 'greetings friend!')

          t.equals(res[1].name, '___index.json', 'contents match')
          t.equals(res[1].type, 'file', 'type matches')
          t.deepEquals(meta, { index: { 'hello.txt': { offset: 0, size: data.length } } })

          cleanup()
          t.end()
        })
      })
    }))
  })
})

test('set + get userdata', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      tarball.userdata('hello world', function (err) {
        t.error(err, 'set userdata ok')

        tarball.userdata(function (err, userdata) {
          t.error(err, 'got userdata ok')
          t.deepEquals(userdata, 'hello world')

          parseTarball(filepath, function (err, res, index, meta) {
            t.error(err, 'parsed tarball ok')

            t.equals(res.length, 2, 'two entries')

            t.equals(res[0].name, 'hello.txt', 'contents match')
            t.equals(res[0].type, 'file', 'type matches')
            t.equals(res[0].data.toString(), 'greetings friend!')

            t.equals(res[1].name, '___index.json', 'contents match')
            t.equals(res[1].type, 'file', 'type matches')
            t.deepEquals(meta, { index: { 'hello.txt': { offset: 0, size: data.length } }, userdata: 'hello world' })

            cleanup()
            t.end()
          })
        })
      })
    }))
  })
})

test('set userdata, reopen + get', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      tarball.userdata('hello world', function (err) {
        t.error(err, 'set userdata ok')

        var tball = new Tarball(filepath)
        tball.userdata(function (err, userdata) {
          t.error(err, 'got userdata ok')
          t.deepEquals(userdata, 'hello world')

          parseTarball(filepath, function (err, res, index, meta) {
            t.error(err, 'parsed tarball ok')

            t.equals(res.length, 2, 'two entries')

            t.equals(res[0].name, 'hello.txt', 'contents match')
            t.equals(res[0].type, 'file', 'type matches')
            t.equals(res[0].data.toString(), 'greetings friend!')

            t.equals(res[1].name, '___index.json', 'contents match')
            t.equals(res[1].type, 'file', 'type matches')
            t.deepEquals(meta, { index: { 'hello.txt': { offset: 0, size: data.length } }, userdata: 'hello world' })

            cleanup()
            t.end()
          })
        })
      })
    }))
  })
})
