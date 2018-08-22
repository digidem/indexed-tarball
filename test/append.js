var Tarball = require('..')
var from = require('from2')
var path = require('path')
var tmp = require('tmp')
var test = require('tape')

test('can append a file', function (t) {
  tmp.dir({unsafeCleanup:true}, function (err, dir, cleanup) {
    var tarball = new Tarball(path.join(dir, 'file.tar'))

    tarball.append('hello.txt', fromString('greetings'), function (err) {
      t.error(err)
      cleanup()
      t.end()
    })
  })
})

function fromString (string) {
  return from(function(size, next) {
    if (string.length <= 0) return next(null, null)
    var chunk = string.slice(0, size)
    string = string.slice(size)
    next(null, chunk)
  })
}
