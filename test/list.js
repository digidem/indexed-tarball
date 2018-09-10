var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString

test('can list an archive with one file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')

      tarball.list(function (err, files) {
        t.error(err, 'list ok')
        t.deepEquals(files, ['hello.txt'])

        cleanup()
        t.end()
      })
    }))
  })
})

test('can list an archive with one file (concurrent)', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')
    }))

    tarball.list(function (err, files) {
      t.error(err, 'list ok')
      t.deepEquals(files, ['hello.txt'])

      cleanup()
      t.end()
    })
  })
})

test('can list an archive with many files (concurrent)', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath)

    var n = 0
    for (var i = 0; i < 100; i++) {
      n++
      var data = 'this is message #' + i
      fromString(data).pipe(tarball.append('hello_' + i + '.txt', function (err) {
        t.error(err, 'append ok')
      }))
    }

    tarball.list(function (err, files) {
      t.error(err, 'list ok')
      t.equals(files.length, n)

      cleanup()
      t.end()
    })
  })
})
