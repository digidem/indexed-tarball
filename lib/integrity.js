var fs = require('fs')
var tar = require('./tar')
var tarHeader = require('tar-stream/headers')

var NUL_TRAILER = Buffer.alloc(1024).fill(0)

module.exports = {
  repairTarball: repairTarball
}

// scan backwards from the end of the tarball
function repairTarball (filepath, cb) {
  var fileLen
  var fileLen512

  fs.stat(filepath, function (err, stat) {
    if (err) return cb(err)
    fileLen = stat.size
    fileLen512 = fileLen - (stat.size % 512)
    if (fileLen !== fileLen512) {
      fs.truncate(filepath, fileLen512, function (err) {
        if (err) return cb(err)
        checkFinalFile()
      })
    } else {
      checkFinalFile()
    }
  })

  function checkFinalFile () {
    fs.open(filepath, 'r', function (err, fd) {
      if (err) return cb(err)
      tar.readFinalFile(fd, fileLen512 + 1024, function (err, buf, offset, name) {
        // Critical failures
        if (err && err instanceof Error) return endWithClose(fd, err)
        if (err && err.noFiles) return endWithClose(fd, err)

        // Last file is corrupted index
        if (err && err.malformed && name === '___index.json') {
          regen(fd, offset, function (err) {
            if (err) cb(err)
            else cb(null, {state: 'repaired', regenIndex: true, dataloss: false})
          })
          return
        }

        if (name !== '___index.json') {
          // Do full scan + regen index!
          fullScanRepair(fd, fileLen512, function (err, dataloss) {
            if (err) cb(err)
            else cb(null, {state: 'repaired', regenIndex: true, dataloss: dataloss})
          })
          return
        }

        // Check that full file + padding is present
        var endOfIndex = offset + buf.length + (512 - buf.length % 512)
        if (endOfIndex > fileLen512) {
          // index is corrupt; regen
          regen(fd, offset, function (err) {
            if (err) return cb(err)
            else cb(null, {state: 'repaired', regenIndex: true, dataloss: false})
          })
          return
        }

        try {
          // TODO(noffle): check actual json content too!
          JSON.parse(buf.toString())
          writeTrailer(fd, endOfIndex, function (err, wasNeeded) {
            if (err) return cb(err)
            if (!wasNeeded) cb(null, {state: 'good'})
            else cb(null, {state: 'repaired', regenIndex: false, dataloss: false})
          })
        } catch (e) {
          regen(fd, offset, function (err) {
            if (err) cb(err)
            else cb(null, {state: 'repaired', regenIndex: true, dataloss: false})
          })
        }
      })
    })
  }

  function regen (fd, offset, cb) {
    fs.ftruncate(fd, offset, function (err) {
      if (err) return cb(err)
      buildIndex(fd, offset, function (err, safeLength, index) {
        if (err) return cb(err)
        writeIndex(fd, offset, index, cb)
      })
    })
  }

  function writeTrailer (fd, offset, cb) {
    // TODO(noffle): what if offset + 1024 < fileLen512?
    var trailer = Buffer.alloc(1024)
    fs.read(fd, trailer, 0, 1024, offset, function (err) {
      if (err) return cb(err)
      if (trailer.equals(NUL_TRAILER)) return cb()
      fs.write(fd, NUL_TRAILER, 0, 1024, offset, function (err, bytesWritten) {
        if (err) cb(err)
        else if (bytesWritten < 1024) cb(new Error('failed to fully write NUL trailer'))
        else cb()
      })
    })
  }

  function endWithClose (fd, err, res) {
    fs.close(fd, function () {
      cb(err, res)
    })
  }
}

function fullScanRepair (fd, fileLen, cb) {
  buildIndex(fd, fileLen, function (err, safeLength, index) {
    if (err) return cb(err)
    if (safeLength < fileLen) {
      fs.ftruncate(fd, safeLength, function (err) {
        if (err) return cb(err)
        writeIndex(fd, safeLength, index, cb)
      })
    }
  })
}

function buildIndex (fd, fileLen, cb) {
  var index = {}

  ;(function next (pos) {
    checkFile(fd, pos, function (err, header) {
      if (err) return cb(err)
      if (header === null) return cb(null, fileLen, index)
      index[header.name] = { offset: pos, size: header.size }
      var leftover = (512 - header.size % 512) % 512
      var newPos = header.size + leftover + 512
      if (newPos >= fileLen) return cb(null, pos, index)
      else next(newPos)
    })
  })(0)
}

function writeIndex (fd, offset, index, cb) {
  var meta = { index: index }
  try {
    var json = Buffer.from(JSON.stringify(meta), 'utf8')
    var header = tarHeader.encode({
      name: '___index.json',
      type: 'file',
      mode: parseInt('644', 8),
      uid: 0,
      gid: 0,
      mtime: new Date(),
      size: json.length
    })
    var leftover = json.length % 512 === 0 ? 0 : 512 - json.length % 512
    var padding = Buffer.alloc(leftover).fill(0)
    var finalBuf = Buffer.concat([header, json, padding])
    fs.write(fd, finalBuf, 0, finalBuf.length, offset, function (err, bytesWritten) {
      if (err) cb(err)
      else if (bytesWritten < finalBuf.length) cb(new Error('failed to fully write index'))
      else cb()
    })
  } catch (e) {
    cb(e)
  }
}

function checkFile (fd, position, cb) {
  var sector = Buffer.alloc(512)
  fs.read(fd, sector, 0, 512, position, function (err, bytesRead) {
    if (err) return cb(err)
    if (bytesRead < 512) return cb(new Error('read < 512 bytes'))
    try {
      var header = tarHeader.decode(sector)
      cb(null, header)
    } catch (e) {
      return cb(e)
    }
  })
}
