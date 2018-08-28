var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString
var parseTarball = require('./util').parseTarball

test('can append to a new file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    var data = 'greetings friend!'
    tarball.append('hello.txt', fromString(data), data.length, function (err) {
      t.error(err, 'append ok')

      parseTarball(filepath, function (err, res) {
        t.error(err, 'parsed tarball ok')

        t.equals(res.length, 2, 'two entries')

        t.equals(res[0].name, 'hello.txt', 'contents match')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), 'greetings friend!')

        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
        var index = JSON.parse(res[1].data.toString())
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: data.length } })

        cleanup()
        t.end()
      })
    })
  })
})

test('can append to an existing file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    var data = 'greetings friend!'
    tarball.append('hello.txt', fromString(data), data.length, function (err) {
      t.error(err, 'append ok')

      data = '# beep boop'
      tarball.append('beep.md', fromString(data), data.length, function (err) {
        t.error(err, 'append ok')

        parseTarball(filepath, function (err, res) {
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
          var index = JSON.parse(res[2].data.toString())
          t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 }, 'beep.md': { offset: 1024, size: 11 } })

          cleanup()
          t.end()
        })
      })
    })
  })
})

test('second append overflows into second tarball', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 2048})
    var data = 'greetings friend!'
    tarball.append('hello.txt', fromString(data), data.length, function (err) {
      t.error(err, 'append ok')

      data = '# beep boop'
      tarball.append('beep.md', fromString(data), data.length, function (err) {
        t.error(err, 'append ok')

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
            t.equals(res.length, 2, '2 entries')
            t.equals(res[0].name, 'beep.md', 'name matches')
            t.equals(res[0].type, 'file', 'type matches')
            t.equals(res[0].data.toString(), '# beep boop', 'content matches')
            t.equals(res[1].name, '___index.json', 'contents match')
            t.equals(res[1].type, 'file', 'type matches')
            var index = JSON.parse(res[1].data.toString())
            t.deepEquals(index, { 'beep.md': { offset: 0, size: 11 } })

            cleanup()
            t.end()
          })
        })
      })
    })
  })
})