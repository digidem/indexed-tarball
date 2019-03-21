var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fs = require('fs')
var fromString = require('../lib/util').fromString
var parseTarball = require('./util').parseTarball

test('can append to a new file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      parseTarball(filepath, function (err, res, index) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 2, 'two entries')

        t.equals(res[0].name, 'hello.txt', 'contents match')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!')

        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: data.length } })

        cleanup()
        t.end()
      })
    }))
  })
})

test('can append to an existing file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      data = '# beep boop'
      fromString(data).pipe(tarball.append('beep.md', function (err) {
        t.error(err, 'append ok')

        parseTarball(filepath, function (err, res, index) {
          t.error(err, 'parsed tarball ok')

          t.equals(res.length, 3, '3 entries')

          t.equals(res[0].name, 'hello.txt', 'name matches')
          t.equals(res[0].type, 'file', 'type matches')
          t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')

          t.equals(res[1].name, 'beep.md', 'name matches')
          t.equals(res[1].type, 'file', 'type matches')
          t.equals(res[1].data.toString(), '# beep boop', 'content matches')

          t.equals(res[2].name, '___index.json', 'contents match')
          t.equals(res[2].type, 'file', 'type matches')
          t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 }, 'beep.md': { offset: 1024, size: 11 } })

          cleanup()
          t.end()
        })
      }))
    }))
  })
})

test('two concurrent writes succeed as expected', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var pending = 2

    var data1 = 'greetings friend!'
    fromString(data1).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    var data2 = '# beep boop'
    fromString(data2).pipe(tarball.append('beep.md', function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    function check () {
      parseTarball(filepath, function (err, res, index) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 3, '3 entries')

        t.equals(res[0].name, 'hello.txt', 'name matches')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')

        t.equals(res[1].name, 'beep.md', 'name matches')
        t.equals(res[1].type, 'file', 'type matches')
        t.equals(res[1].data.toString(), '# beep boop', 'content matches')

        t.equals(res[2].name, '___index.json', 'contents match')
        t.equals(res[2].type, 'file', 'type matches')
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 }, 'beep.md': { offset: 1024, size: 11 } })

        cleanup()
        t.end()
      })
    }
  })
})

test('REGRESSION: check that writing a size=512 file doesn\'t add an extra NUL sector', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = Buffer.alloc(512).fill(32)
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      var stat = fs.statSync(filepath)
      t.equals(stat.size, 512 * 6, 'tar archive is 6 sectors')
      cleanup()
      t.end()
    }))
  })
})

test('REGRESSION: check that writing a size=0 file doesn\'t fail', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = Buffer.alloc(0)
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      var stat = fs.statSync(filepath)
      t.equals(stat.size, 512 * 5, 'tar archive is 5 sectors')
      cleanup()
      t.end()
    }))
  })
})
