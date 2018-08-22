var fs = require('fs')
var eos = require('end-of-stream')
var tar = require('tar-stream')
var fromBuffer = require('./util').fromBuffer

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.filepath = filepath

  try {
    // exists
    var stat = fs.statSync(filepath)
    this.index = null  // index not looked up yet
    this.length = stat.size
  } catch (e) {
    // new archive
    this.index = {}
    this.length = 0
  }
}

// Append a file and update the index entry.
IndexedTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this
  var pack = tar.pack()

  readable.pipe(
    pack.entry({ name: filepath, size: size }, function (err) {
      if (err) return cb(err)
      self._packIndex(pack, function (err) {
        if (err) return cb(err)
        pack.finalize()
      })
    }))

  eos(pack.pipe(fs.createWriteStream(this.filepath)), cb)
}

// Write the index file (JSON) to the tar pack stream.
IndexedTarball.prototype._packIndex = function (pack, cb) {
  var self = this

  if (!this.index) this._lookupIndex(write)
  else write()

  function write (err) {
    if (err) return cb(err)

    var indexData = new Buffer(JSON.stringify(self.index), 'utf8')
    fromBuffer(indexData).pipe(
      pack.entry({ name: '___index.json', size: indexData.length }, cb)
    )
  }
}

// Search the tar archive backwards for the index file.
IndexedTarball.prototype._lookupIndex = function (cb) {
}
