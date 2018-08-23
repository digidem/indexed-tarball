var fs = require('fs')
var eos = require('end-of-stream')
var tar = require('tar-stream')
var rwlock = require('rwlock')
var fromBuffer = require('./util').fromBuffer
var cached = require('./lib/cached-value')

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.filepath = filepath

  this.lock = new rwlock()

  try {
    // exists
    var stat = fs.statSync(filepath)
  } catch (e) {
    // new archive
    fs.writeFileSync(filepath, '', 'utf8')  // touch new file
  }

  this.archive = cached(IndexedTarball.prototype._lookupIndex.bind(this))
  this.archive.refresh()
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
    self.archive.value(function (err, archive) {
      if (err) return done(err)

      if (typeof archive.indexOffset === 'number') {
        // 2. Truncate the file to remove the old index.
        fs.truncate(self.filepath, archive.indexOffset, function (err) {
          if (err) return done(err)
          write(archive, archive.indexOffset)
        })
      } else {
        write(archive, undefined)
      }
    })

    function write (archive, start) {
      // 3. Prepare the tar archive for appending.
      var fsOpts = {
        flags: 'r+',
        start: start !== undefined ? start : 0
      }
      if (fsOpts.start < 0) fsOpts.start = 0
      var appendStream = fs.createWriteStream(self.filepath, fsOpts)

      var pack = tar.pack()

      // 4. Append the new file & index.
      readable.pipe(
        pack.entry({ name: filepath, size: size }, function (err) {
          if (err) return done(err)

          archive.index[filepath] = { offset: start }

          // Write the new index to the end of the archive.
          self._packIndex(pack, archive.index, function (err) {
            if (err) return done(err)
            pack.finalize()
          })
        }))

      // 5. Do the writes & cleanup.
      eos(pack.pipe(appendStream), function (err) {
        if (err) return done(err)

        // Refresh the archive info in memory
        self.archive.refresh(done)
      })
    }
  })
}

IndexedTarball.prototype.list = function (cb) {
  var self = this

  this.lock.readLock(function (release) {
    self.archive.value(function (err, archive) {
      release()
      cb(err, Object.keys(archive.index))
    })
  })
}

IndexedTarball.prototype.read = function (filepath) {
  this.lock.readLock(function (release) {
  })
}

// Write the index file (JSON) to the tar pack stream.
IndexedTarball.prototype._packIndex = function (pack, newIndex, cb) {
  var indexData = Buffer.from(JSON.stringify(newIndex), 'utf8')
  fromBuffer(indexData).pipe(
    pack.entry({ name: '___index.json', size: indexData.length }, cb)
  )
}

// Search the tar archive backwards for the index file.
// TODO: won't this break if the index grows larger than 512 bytes? (write test!)
IndexedTarball.prototype._lookupIndex = function (cb) {
  var self = this
  var sector = Buffer.alloc(512)  // tar uses 512-byte sectors

  fs.stat(this.filepath, function (err, stat) {
    if (err) return cb(err)
    var size = stat.size

    // Archive is fresh & empty
    if (size < 1024) {
      return cb(null, { index: {}, indexOffset: 0, fileSize: size })
    }

    fs.open(self.filepath, 'r', function (err, fd) {
      if (err) return cb(err)

      tar_readFinalFile(fd, size, function (err, buf, offset) {
        if (err) return cb(err)
        var index
        try {
          index = JSON.parse(buf.toString())
        } catch (e) {
          return cb(e)
        }
        fs.close(fd, function (err) {
          if (err) return cb(err)
          cb(null, { index: index, indexOffset: offset, fileSize: size })
        })
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
        // get the final file's size (octal)
        var fileSize = parseInt(buf.slice(124, 124 + 12).toString(), 8)
        if (isNaN(fileSize)) return cb(new Error('could not parse file header'))

        var fileBuf = Buffer.alloc(fileSize)
        fs.read(fd, fileBuf, 0, fileSize, offset + 512, function (err, readSize) {
          if (err) return cb(err)
          if (fileSize !== readSize) console.error('WARNING: read size !== expected size (' + readSize + ' vs ' + fileSize + ')')
          cb(null, fileBuf, offset)
        })
      } else {
        next(offset - 512)
      }
    })
  }
}
