var test = require('tape')
var tmp = require('tmp')
var path = require('path')
var Syncfile = require('..')

test('cannot open the same syncfile twice at the same time', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    if (err) throw err
    var file = path.join(dir, 'file.sync')
    var syncfile1 = new Syncfile(file)

    t.throws(function () {
      new Syncfile(file)
    }, /already open/, 'creating a second syncfile throws')

    cleanup()
    t.end()
  })
})
