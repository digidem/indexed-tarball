var Tarball = require('.')
var through = require('through2')
var pump = require('pump')

var tarball = new Tarball('file.tar')

var t = through()
t.end('hello world')

pump(t, tarball.append('hello.txt', 11, function (err) {
  if (err) throw err
  tarball.list(function (err, files) {
    if (err) throw err
    console.log('files', files)

    tarball.read('hello.txt')
      .on('data', function (buf) {
        console.log('data', buf.toString())
      })
  })
}))

