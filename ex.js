var Tarball = require('.')
var through = require('through2')

var tarball = new Tarball('file.tar')

var t = through()
t.end('hello world')

tarball.append('hello.txt', t, 11, function () {
  tarball.list(function (err, files) {
    console.log('files', files)

    tarball.read('hello.txt')
      .on('data', function (buf) {
        console.log('data', buf.toString())
      })
  })
})

