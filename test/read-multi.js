var Tarball = require('..')
var collect = require('collect-stream')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString

test('can read an archive with one file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')

      collect(tarball.read('hello.txt'), function (err, data) {
        t.error(err, 'read ok')
        t.deepEquals(data.toString(), 'greetings friend!')

        cleanup()
        t.end()
      })
    }))
  })
})

test('cannot read nonexistant file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    collect(tarball.read('hello.txt'), function (err, data) {
      t.ok(err instanceof Error, 'read failed')

      cleanup()
      t.end()
    })
  })
})

test('can two files across two archives', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 1024})

    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    data = 'how about a nice game of chess'
    fromString(data).pipe(tarball.append('games/chess', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    collect(tarball.read('hello.txt'), function (err, data) {
      t.error(err, 'read ok')
      t.deepEquals(data.toString(), 'greetings friend!')

      collect(tarball.read('games/chess'), function (err, data) {
        t.error(err, 'read ok')
        t.deepEquals(data.toString(), 'how about a nice game of chess')

        collect(tarball.read('foo/bar/baz'), function (err, data) {
          t.error(!err, 'read failed ok')

          cleanup()
          t.end()
        })
      })
    })
  })
})

test('can read all files in an archive with many files', function (t) {
  t.plan(301)

  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 3072})

    var n = 0
    for (var i = 0; i < 100; i++) {
      n++
      var data = 'this is message #' + i
      fromString(data).pipe(tarball.append('hello_' + i + '.txt', data.length, function (err) {
        t.error(err, 'append ok')
      }))
    }

    for (var i = 0; i < n; i++) {
      ;(function (x) {
        collect(tarball.read('hello_' + i + '.txt'), function (err, data) {
          t.error(err, 'read ok')
          t.equals(data.toString(), 'this is message #' + x)
        })
      })(i)
    }
  })
})
