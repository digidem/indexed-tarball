var fs = require('fs')
var RWLock = require('rwlock')
var through = require('through2')
var readonly = require('read-only-stream')
var pump = require('pump')
var tarHeader = require('tar-stream/headers')
var fromBuffer = require('./lib/util').fromBuffer
var cached = require('./lib/cached-value')
var tarUtil = require('./lib/tar')

module.exports = SingleTarball

function SingleTarball (filepath, opts) {
  this.filepath = filepath

  this.lock = new RWLock()

  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, '', 'utf8') // touch new file

  this.archive = cached(SingleTarball.prototype._lookupMeta.bind(this))
  this.archive.refresh()
}

// Append a file and update the index entry.
SingleTarball.prototype.append = function (filepath, size, cb) {
  if (!cb && typeof size === 'function') {
    cb = size
    size = null
  }
  size = 0

  var self = this
  cb = cb || noop

  var t = through(function (chunk, _, next) {
    size += chunk.length
    next(null, chunk)
  })

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

      // 4. Write tar header, without size info (yet).
      var header = tarHeader.encode({
        name: filepath,
        type: 'file',
        mode: parseInt('644', 8),
        uid: 0,
        gid: 0,
        mtime: new Date(),
        size: 0
      })
      appendStream.write(header)

      // 5. Write data.
      t.pipe(appendStream)
      t.on('end', function () {
        // 6. Pad the remaining bytes to fit a 512-byte block.
        var leftover = 512 - (size % 512)
        if (leftover === 512) leftover = 0

        fs.appendFile(self.filepath, Buffer.alloc(leftover), function (err) {
          // TODO: file left in a bad state! D:
          if (err) return done(err)

          // 7. Open file so we can update the header.
          withWritableFile(self.filepath, function (fd, done) {
            // TODO: file left in a bad state! D:
            if (err) return done(err)

            // 8. Read header.
            var header = Buffer.alloc(512)
            var headerStart = fsOpts.start || 0
            fs.read(fd, header, 0, 512, headerStart, function (err) {
              // TODO: file left in a bad state! D:
              if (err) return done(err)

              // 9. Update size field.
              var sizeStr = toPaddedOctal(size, 12)
              header.write(sizeStr, 124, 12, 'utf8')

              // 10. Update checksum field.
              var sum = cksum(header)
              var ck = toPaddedOctal(sum, 8)
              header.write(ck, 148, 8, 'utf8')

              // 11. Write new header.
              fs.write(fd, header, 0, 512, headerStart, function (err) {
                // TODO: file left in a bad state! D:
                if (err) return done(err)

                archive.index[filepath] = { offset: start, size: size }

                // 12. Write the new index to the end of the archive.
                appendMeta(fd, headerStart + 512 + size + leftover, archive.meta, done)
              })
            })
          }, function (err) {
            // TODO: file left in a bad state! D:
            if (err) return done(err)

            self.archive.refresh(done)
          })
        })
      })
    }
  })

  return t
}

SingleTarball.prototype.list = function (cb) {
  var self = this

  this.lock.readLock(function (release) {
    self.archive.value(function (err, archive) {
      release()
      cb(err, Object.keys(archive.index))
    })
  })
}

SingleTarball.prototype.read = function (filepath) {
  var self = this
  var t = through()

  this.lock.readLock(function (release) {
    self.archive.value(function (err, archive) {
      if (err) {
        release()
        t.emit('error', err)
        return
      }

      var entry = archive.index[filepath]
      if (!entry) {
        release()
        process.nextTick(function () {
          var err = new Error('that file does not exist in the archive')
          err.notFound = true
          t.emit('error', err)
        })
        return
      }

      if (entry.size === 0) return process.nextTick(release)

      pump(
        fs.createReadStream(self.filepath, { start: entry.offset + 512, end: entry.offset + 512 + entry.size - 1 }),
        t,
        function (err) {
          release()
        })
    })
  })

  return readonly(t)
}

// TODO: might be nice if this also returned the final file, but we don't want
// to buffer the entire contents, and can't really stream it if it's being
// truncated from the archive file..
SingleTarball.prototype.pop = function (name, cb) {
  if (typeof name === 'function' && !cb) {
    cb = name
    name = null
  }
  var self = this

  this.lock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    self.archive.value(function (err, archive) {
      if (err) return done(err)

      // Get the last file in the archive.
      var fname = getFileLargestOffset(archive.index)
      if (name && name !== fname) {
        return cb(null, new Error('the last file doesnt match the filename given'))
      }
      var offset = archive.index[fname].offset

      fs.truncate(self.filepath, offset, function (err) {
        if (err) return done(err)
        delete archive.index[fname]

        withWritableFile(self.filepath, function (fd, done) {
          appendMeta(fd, offset, archive.meta, done)
        }, function (err) {
          if (err) return done(err)
          self.archive.refresh(done)
        })
      })
    })
  })
}

SingleTarball.prototype.userdata = function (data, cb) {
  if (data && !cb && typeof data === 'function') {
    cb = data
    data = null
  }
  var self = this

  if (!data) {
    // get
    this.lock.readLock(function (release) {
      function done (err, res) {
        release()
        cb(err, res)
      }

      self.archive.value(function (err, archive) {
        if (err) return done(err)
        done(null, archive.meta.userdata || {})
      })
    })
  } else {
    // set
    this.lock.writeLock(function (release) {
      function done (err) {
        release()
        cb(err)
      }

      self.archive.value(function (err, archive) {
        if (err) return done(err)

        var offset = archive.indexOffset
        fs.truncate(self.filepath, offset, function (err) {
          if (err) return done(err)

          withWritableFile(self.filepath, function (fd, done) {
            archive.meta.userdata = data
            appendMeta(fd, offset, archive.meta, done)
          }, function (err) {
            if (err) return done(err)
            self.archive.refresh(done)
          })
        })
      })
    })
  }
}

// Search the tar archive backwards for the index file.
SingleTarball.prototype._lookupMeta = function (cb) {
  var self = this

  fs.stat(this.filepath, function (err, stat) {
    if (err) return cb(err)
    var size = stat.size

    // Archive is fresh & empty
    if (size < 1024) {
      var index = {}
      return cb(null, { index: index, indexOffset: 0, fileSize: size, meta: {index: index} })
    }

    fs.open(self.filepath, 'r', function (err, fd) {
      if (err) return cb(err)

      tarUtil.readFinalFile(fd, size, function (err, buf, offset) {
        if (err) return cb(err)
        var meta
        try {
          meta = JSON.parse(buf.toString())
        } catch (e) {
          return cb(e)
        }
        fs.close(fd, function (err) {
          if (err) return cb(err)
          // if in old format (2.x.x), upgrade to new format (3.x.x and [hopefully] later)
          if (!meta.index) {
            var newMeta = { index: meta }
            cb(null, { index: newMeta.index, indexOffset: offset, fileSize: size, meta: newMeta })
          } else {
            cb(null, { index: meta.index, indexOffset: offset, fileSize: size, meta: meta })
          }
        })
      })
    })
  })
}

// Returns the entry nearest the end of the index.
function getFileLargestOffset (index) {
  var key
  for (var name in index) {
    var entry = index[name]
    if (!key || entry.offset > index[key].offset) key = name
  }
  return key
}

function noop () {}

// tar checksum algorithm (from mafintosh/tar-stream)
var cksum = function (block) {
  var sum = 8 * 32
  for (var i = 0; i < 148; i++) sum += block[i]
  for (var j = 156; j < 512; j++) sum += block[j]
  return sum
}

function toPaddedOctal (number, length) {
  var octal = number.toString(8)
  var leftover = length - octal.length
  var padding = new Array(leftover).fill('0').join('')
  return padding + octal
}

function appendMeta (fd, pos, meta, cb) {
  var data = Buffer.from(JSON.stringify(meta), 'utf8')

  var header = tarHeader.encode({
    name: '___index.json',
    type: 'file',
    mode: parseInt('644', 8),
    uid: 0,
    gid: 0,
    mtime: new Date(),
    size: data.length
  })

  // leftover bytes to reach 512 block boundary, plus another 512 * 2 = 1024 to mark the end-of-file
  var padding = Buffer.alloc(512 - (data.length % 512) + 512 + 512).fill(0)

  var buf = Buffer.concat([header, data, padding])

  fs.write(fd, buf, 0, buf.length, pos, cb)
}

function withWritableFile (filepath, cb, done) {
  fs.open(filepath, 'r+', function (err, fd) {
    if (err) return cb(err)
    cb(fd, function () {
      fs.close(fd, done)
    })
  })
}
