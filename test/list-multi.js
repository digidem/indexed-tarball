var Tarball = require('..')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')
var fromString = require('../lib/util').fromString

test('can list an archive with one file', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true})
    append(tarball, 'hello.txt', 'greetings friend', function (err) {
      t.error(err, 'append ok')

      tarball.list(function (err, files) {
        t.error(err, 'list ok')
        t.deepEquals(files, ['hello.txt'])

        cleanup()
        t.end()
      })
    })
  })
})

test('can list files in three archives', function (t) {
  tmp.dir({unsafeCleanup: true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var filepath = path.join(dir, 'file.tar')
    var tarball = new Tarball(filepath, {multifile: true, maxFileSize: 1024})

    append(tarball, 'first.txt', '1st', function (err) {
      t.error(err, 'append ok')
    })

    append(tarball, 'second.txt', '2nd', function (err) {
      t.error(err, 'append ok')
    })

    append(tarball, 'third.txt', '3rd', function (err) {
      t.error(err, 'append ok')
    })

    tarball.list(function (err, files) {
      t.error(err, 'list ok')
      t.deepEquals(files.sort(), ['first.txt', 'second.txt', 'third.txt'])

      cleanup()
      t.end()
    })
  })
})

function append (tarball, filename, string, cb) {
  tarball.append(filename, fromString(string), string.length, cb)
}
