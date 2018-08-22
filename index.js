var fs = require('fs')
var eos = require('end-of-stream')
var tar = require('tar-stream')
var rwlock = require('rwlock')
var fromBuffer = require('./util').fromBuffer

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.filepath = filepath

  this.lock = new rwlock()

  try {
    // exists
    var stat = fs.statSync(filepath)
    this.index = null  // index not looked up yet
    this.length = stat.size
  } catch (e) {
    // new archive
    this.index = {}
    this.length = 0
    fs.writeFileSync(filepath, '', 'utf8')  // touch new file
  }
}

// Append a file and update the index entry.
IndexedTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this

  this.lock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    // 1. Refresh the index & its byte offset.
    // TODO: cache this info for future appends
    self._populateIndex(function (err, offset) {
      if (err) return done(err)

      if (typeof offset === 'number') {
        // 2. Truncate the file to remove the old index.
        fs.truncate(self.filepath, offset, function (err) {
          if (err) return done(err)
          write(offset)
        })
      } else {
        write()
      }
    })

    function write (start) {
      // 3. Prepare the tar archive for appending.
      var fsOpts = {
        flags: 'r+',
        start: start !== undefined ? start : self.length - 512 * 2
      }
      if (fsOpts.start < 0) fsOpts.start = 0
      var appendStream = fs.createWriteStream(self.filepath, fsOpts)

      var pack = tar.pack()

      // 4. Append the new file & index.
      readable.pipe(
        pack.entry({ name: filepath, size: size }, function (err) {
          if (err) return done(err)

          // Update the in-memory index.
          self.index[filepath] = { offset: self.length }

          // Write the new index to the end of the archive.
          self._packIndex(pack, function (err) {
            if (err) return done(err)
            pack.finalize()
          })
        }))

      // 5. Do the writes & cleanup.
      eos(pack.pipe(appendStream), function (err) {
        if (err) return done(err)
        self.length = fs.statSync(self.filepath).size
        done()
      })
    }
  })
}

IndexedTarball.prototype.list = function (cb) {
  var self = this

  this.lock.readLock(function (release) {
    release()
    process.nextTick(cb, null, Object.keys(self.index))
  })
}

// Write the index file (JSON) to the tar pack stream.
IndexedTarball.prototype._packIndex = function (pack, cb) {
  var self = this

  if (!this.index) this._populateIndex(write)
  else write()

  function write (err) {
    if (err) return cb(err)

    var indexData = Buffer.from(JSON.stringify(self.index), 'utf8')
    fromBuffer(indexData).pipe(
      pack.entry({ name: '___index.json', size: indexData.length }, cb)
    )
  }
}

// Search the tar archive backwards for the index file.
// TODO: won't this break if the index grows larger than 512 bytes? (write test!)
IndexedTarball.prototype._populateIndex = function (cb) {
  if (this.index && Object.keys(this.index).length === 0) return process.nextTick(cb)

  var self = this
  var sector = Buffer.alloc(512)  // tar uses 512-byte sectors
  var startOffset = this.length - 512 * 3  // last two sectors are NULs

  fs.open(this.filepath, 'r', function (err, fd) {
    if (err) return cb(err)

    tar_readFinalFile(fd, self.length, function (err, buf, offset) {
      if (err) return cb(err)
      var index = parseIndexFromBuffer(buf)
      if (!index) return cb(new Error('could not parse index data'))
      fs.close(fd, function () {
        cb(err, offset)
      })
    })
  })
}

// Scans a tar archive from the end backwards until it finds the last entry.
// Returns the raw buffer of the last file, and its byte offset where it begins.
function tar_readFinalFile (fd, size, cb) {
  var header = Buffer.alloc(512)
  var ustarExpected = Buffer.from('7573746172003030', 'hex')

  next(size - 512 * 3)

  function next (offset) {
    if (offset <= 0) return cb(new Error('could not find index'))

    // read file header
    fs.read(fd, header, 0, 512, offset, function (err, size, buf) {
      if (err) return cb(err)
      // look for 'ustar<NUL>00' pattern at the expected offset
      if (ustarExpected.equals(buf.slice(257, 257 + 8))) {
        // get the final file's size
        var fileSize = parseInt(buf.slice(124, 124 + 12).toString())
        if (isNaN(fileSize)) return cb(new Error('could not parse file header'))

        var fileBuf = Buffer.alloc(fileSize)
        fs.read(fd, fileBuf, 0, fileSize, offset + 512, function (err, readSize) {
          if (err) return cb(err)
          if (fileSize !== readSize) console.error('WARNING: read size !== expected size (' + fileSize + ' vs ' + readSize + ')')
          cb(null, fileBuf, offset)
        })
      } else {
        next(offset - 512)
      }
    })
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
