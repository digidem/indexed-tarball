var tar = require('tar-stream')
var fs = require('fs')
var collect = require('collect-stream')

module.exports = {
  parseTarball: parseTarball
}

function parseTarball (filepath, cb) {
  var res = []
  var error

  var ex = tar.extract()
  fs.createReadStream(filepath).pipe(ex)

  ex.on('entry', function (header, stream, next) {
    var e = {
      name: header.name,
      type: header.type
    }
    res.push(e)
    collect(stream, function (err, data) {
      error = err || error
      e.data = data
      next()
    })
  })

  ex.once('finish', function () {
    try {
      var meta = JSON.parse(res[res.length - 1].data.toString())
      cb(error, res, meta.index, meta)
    } catch (e) {
      cb(e)
    }
  })
}
