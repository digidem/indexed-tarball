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

      self.index[filepath] = { offset: self.length }

      self._packIndex(pack, function (err) {
        if (err) return cb(err)
        pack.finalize()
      })
    }))

  eos(pack.pipe(fs.createWriteStream(this.filepath)), function (err) {
    if (err) return cb(err)
    self.length = fs.statSync(self.filepath).size
    cb()
  })
}

// Write the index file (JSON) to the tar pack stream.
IndexedTarball.prototype._packIndex = function (pack, cb) {
  var self = this

  if (!this.index) this._populateIndex(write)
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
IndexedTarball.prototype._populateIndex = function (cb) {
  var sector = new Buffer(512)  // tar uses 512-byte sectors

  var startOffset = this.length - 512 * 3  // last two sectors are NULs

  fs.open(this.filepath, 'r', function (err, fd) {
    if (err) return cb(err)

    ;(function next (offset) {
      if (offset <= 0) return cleanup(new Error('could not find index'))
      fs.read(fd, sector, 0, 512, offset, function (err, size, buf) {
        if (err) return cleanup(err)
        if (buf.readUInt8(0) === 0x0) return next(offset - 512)
        var index = parseIndexFromBuffer(buf)
        if (!index) return cb(new Error('could not parse index data'))
        cleanup()
      })
    })(startOffset)
  })

  function cleanup (err) {
    fs.close(fd, cb.bind(null, err))
  }
}

// Start reading a buffer from pos=0 and parse the text into JSON.
function parseIndexFromBuffer (buf) {
  for (var i=0; i < buf.length; i++) {
    if (buf.readUInt8(i) === 0x0) {
      var json = buf.slice(0, i).toString()
      try {
        var index = JSON.parse(json)
        return index
      } catch (e) {
        return null
      }
    }
  }
  return null
}
