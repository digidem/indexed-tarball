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
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')
    }))

    data = '# beep boop'
    fromString(data).pipe(tarball.append('beep.md', function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      parseTarball(filepath, function (err, res, index) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 2, '2 entries')

        t.equals(res[0].name, 'hello.txt', 'name matches')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')

        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
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
    var tarball = new Tarball(filepath)
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      parseTarball(filepath, function (err, res, index) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 1, '1 entry')

        t.equals(res[0].name, '___index.json', 'contents match')
        t.equals(res[0].type, 'file', 'type matches')
        t.deepEquals(index, {})

        cleanup()
        t.end()
      })
    })
  })
})
