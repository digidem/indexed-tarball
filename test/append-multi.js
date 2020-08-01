var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString
var parseTarball = require('./util').parseTarball
var rimraf = require('rimraf')

test('can append to a new file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
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

        rimraf.sync(filepath)
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
    var tarball = new Tarball(filepath, {multifile: true})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')

      data = '# beep boop'
      fromString(data).pipe(tarball.append('beep.md', data.length, function (err) {
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

          rimraf.sync(filepath)
          cleanup()
          t.end()
        })
      }))
    }))
  })
})

test('second append overflows into second tarball', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 3072})
    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')

      data = '# beep boop'
      fromString(data).pipe(tarball.append('beep.md', data.length, function (err) {
        t.error(err, 'append ok')

        parseTarball(filepath, function (err, res, index) {
          t.error(err, 'parsed tarball ok')
          t.equals(res.length, 2, '2 entries')
          t.equals(res[0].name, 'hello.txt', 'name matches')
          t.equals(res[0].type, 'file', 'type matches')
          t.equals(res[0].data.toString(), 'greetings friend!', 'content matches')
          t.equals(res[1].name, '___index.json', 'contents match')
          t.equals(res[1].type, 'file', 'type matches')
          t.deepEquals(index, { 'hello.txt': { offset: 0, size: 17 } })

          parseTarball(filepath + '.1', function (err, res, index) {
            t.error(err, 'parsed tarball ok')
            t.equals(res.length, 2, '2 entries')
            t.equals(res[0].name, 'beep.md', 'name matches')
            t.equals(res[0].type, 'file', 'type matches')
            t.equals(res[0].data.toString(), '# beep boop', 'content matches')
            t.equals(res[1].name, '___index.json', 'contents match')
            t.equals(res[1].type, 'file', 'type matches')
            t.deepEquals(index, { 'beep.md': { offset: 0, size: 11 } })

            rimraf.sync(filepath)
            cleanup()
            t.end()
          })
        })
      }))
    }))
  })
})

test('two concurrent writes succeed as expected', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    var pending = 2

    var data1 = 'greetings friend!'
    fromString(data1).pipe(tarball.append('hello.txt', data1.length, function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    var data2 = '# beep boop'
    fromString(data2).pipe(tarball.append('beep.md', data2.length, function (err) {
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

        rimraf.sync(filepath)
        cleanup()
        t.end()
      })
    }
  })
})

test('two concurrent writes causing overflow succeed as expected', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 4096})
    var pending = 3

    var data1 = Buffer.alloc(600).fill('t').toString()
    fromString(data1).pipe(tarball.append('hello.txt', data1.length, function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    var data2 = '# beep boop'
    fromString(data2).pipe(tarball.append('beep.md', data2.length, function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    var data3 = '# deep doop'
    fromString(data3).pipe(tarball.append('deep.md', data3.length, function (err) {
      t.error(err, 'append ok')
      if (!--pending) check()
    }))

    function check () {
      // 1st tarball
      parseTarball(filepath, function (err, res, index) {
        t.error(err, 'parsed 1st tarball ok')
        t.equals(res.length, 2, '2 entries')
        t.equals(res[0].name, 'hello.txt', 'name matches')
        t.equals(res[0].type, 'file', 'type matches')
        t.equals(res[0].data.toString(), data1, 'content matches')
        t.equals(res[1].name, '___index.json', 'contents match')
        t.equals(res[1].type, 'file', 'type matches')
        t.deepEquals(index, { 'hello.txt': { offset: 0, size: 600 } })

        // 2nd tarball
        parseTarball(filepath + '.1', function (err, res, index) {
          t.error(err, 'parsed 2nd tarball ok')
          t.equals(res.length, 3, '3 entries')
          t.equals(res[0].name, 'beep.md', 'name matches')
          t.equals(res[0].type, 'file', 'type matches')
          t.equals(res[0].data.toString(), '# beep boop', 'content matches')
          t.equals(res[1].name, 'deep.md', 'name matches')
          t.equals(res[1].type, 'file', 'type matches')
          t.equals(res[1].data.toString(), '# deep doop', 'content matches')
          t.deepEquals(index, {
            'beep.md': { offset: 0, size: 11 },
            'deep.md': { offset: 1024, size: 11 }
          })

          rimraf.sync(filepath)
          cleanup()
          t.end()
        })
      })
    }
  })
})

test('can append to the 1st file of an empty two-file archive', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 3072})

    var data = 'greetings friend!'
    fromString(data).pipe(tarball.append('hello.txt', data.length, function (err) {
      t.error(err, 'append ok')
    }))

    var data2 = '# beep boop'
    fromString(data2).pipe(tarball.append('beep.md', data2.length, function (err) {
      t.error(err, 'append ok')
    }))

    tarball.pop(function (err) {
      t.error(err, 'pop ok')

      tarball.pop(function (err) {
        t.error(err, 'pop ok')

        fromString(data2).pipe(tarball.append('foo/bax.js', data2.length, function (err) {
          t.error(err, 'append ok')

          parseTarball(filepath, function (err, res, index) {
            t.error(err, 'parsed tarball ok')
            t.equals(res.length, 1, '1 entry')
            t.equals(res[0].name, '___index.json', 'contents match')
            t.equals(res[0].type, 'file', 'type matches')
            t.deepEquals(index, {})

            parseTarball(filepath + '.1', function (err, res, index) {
              t.error(err, 'parsed tarball ok')
              t.equals(res.length, 2, '2 entries')
              t.equals(res[0].name, 'foo/bax.js', 'name matches')
              t.equals(res[0].type, 'file', 'type matches')
              t.equals(res[0].data.toString(), '# beep boop', 'content matches')
              t.equals(res[1].name, '___index.json', 'contents match')
              t.equals(res[1].type, 'file', 'type matches')
              t.deepEquals(index, { 'foo/bax.js': { offset: 0, size: 11 } })

              cleanup()
              t.end()
            })
          })
        }))
      })
    })
  })
})
