var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString
var parseTarball = require('./util').parseTarball

test('can pop an archive with two files', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 512 * 100})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    data = '# beep boop'
    fromString(data).pipe(tarball.append('beep.md', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      parseTarball(filepath, function (err, res) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 2, '2 entries')

        t.equals(res[0].name, 'hello.txt', 'name matches')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')

        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
        var index = JSON.parse(res[1].data.toString())
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 } })

        cleanup()
        t.end()
      })
    })
  })
})

test('can pop an archive with one file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 512 * 10})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      parseTarball(filepath, function (err, res) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 1, '1 entry')

        t.equals(res[0].name, '___index.json', 'contents match')
        t.equals(res[0].type, 'file', 'type matches')
        var index = JSON.parse(res[0].data.toString())
        t.deepEquals(index, {})

        cleanup()
        t.end()
      })
    })
  })
})

test('can pop the last file in the 2nd archive of a multi-file archive', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 3072})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    data = '# beep boop'
    fromString(data).pipe(tarball.append('beep.md', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      parseTarball(filepath, function (err, res) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 2, '2 entries')
        t.equals(res[0].name, 'hello.txt', 'name matches')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')
        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
        var index = JSON.parse(res[1].data.toString())
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 } })

        parseTarball(filepath + '.1', function (err, res) {
          t.error(err, 'parsed tarball ok')

          t.equals(res.length, 1, '1 entry')
          t.equals(res[0].name, '___index.json', 'contents match')
          t.equals(res[0].type, 'file', 'type matches')
          var index = JSON.parse(res[0].data.toString())
          t.deepEquals(index, {})

          cleanup()
          t.end()
        })
      })
    })
  })
})

test('can pop the file in the 1st archive of a multi-file archive', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 3072})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    data = '# beep boop'
    fromString(data).pipe(tarball.append('beep.md', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      tarball.pop(function (err) {
        t.error(err, 'pop ok')

        parseTarball(filepath, function (err, res) {
          t.error(err, 'parsed tarball ok')
          t.equals(res.length, 1, '1 entry')
          t.equals(res[0].name, '___index.json', 'contents match')
          t.equals(res[0].type, 'file', 'type matches')
          var index = JSON.parse(res[0].data.toString())
          t.deepEquals(index, {})

          parseTarball(filepath + '.1', function (err, res) {
            t.error(err, 'parsed tarball ok')
            t.equals(res.length, 1, '1 entry')
            t.equals(res[0].name, '___index.json', 'contents match')
            t.equals(res[0].type, 'file', 'type matches')
            var index = JSON.parse(res[0].data.toString())
            t.deepEquals(index, {})

            cleanup()
            t.end()
          })
        })
      })
    })
  })
})
