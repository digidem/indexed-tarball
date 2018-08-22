var fs = require('fs')
var eos = require('end-of-stream')
var tar = require('tar-stream')

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.filepath = filepath
}

IndexedTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this
  var pack = tar.pack()

  readable.pipe(
    pack.entry({ name: filepath, size: size }, function (err) {
      if (err) return cb(err)
      pack.finalize()
    }))

  eos(pack.pipe(fs.createWriteStream(this.filepath)), cb)
}
    if (err) return cb(err)
}

