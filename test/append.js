var Tarball = require('..')
var collect = require('collect-stream')
var fs = require('fs')
var path = require('path')
var tmp = require('tmp')
var Readable = require('stream').Readable
var tar = require('tar-stream')
var test = require('tape')

test('can append a file', function (t) {
  tmp.dir({unsafeCleanup:true}, function (err, dir, cleanup) {
    t.error(err, 'tmpdir setup')

    var tarball = new Tarball(path.join(dir, 'file.tar'))
    tarball.append('hello.txt', fromString('greetings!'), 10, function (err) {
      t.error(err, 'append ok')

      // TODO: helper func to check that tarball matches expected data
      var ex = tar.extract()
      fs.createReadStream(path.join(dir, 'file.tar'))
        .pipe(ex)
      var entries = 0
      ex.on('entry', function (header, stream, next) {
        entries++
        t.equals(entries, 1, 'one entry')
        t.equals(header.name, 'hello.txt', 'contents match')
        t.equals(header.type, 'file', 'type matches')
        collect(stream, function (err, data) {
          t.error(err)
          t.equals(data, 'greetings!')
          next()
        })
      })

      ex.once('finish', function () {
        cleanup()
        t.end()
      })
    })
  })
})

function fromString (str) {
  var data = new Readable()
  data._read = function (size) {
    if (str.length <= 0) return this.push(null)
    var push = str.slice(0, size)
    if (this.push(push)) str = str.slice(size)
  }
  return data
}
