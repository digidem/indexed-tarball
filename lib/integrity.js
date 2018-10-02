var fs = require('fs')
var tar = require('./tar')
var tarHeader = require('tar-stream/headers')

var USTAR = Buffer.from('7573746172003030', 'hex') // "ustar<NUL>00"
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

        // Last file is corrupt/missing/not-the-index
        if ((err && err.malformed) || name !== '___index.json') {
          return regen(fd, offset, function (err) {
            if (err) return cb(err)
            if (err && err.malformed && name === '___index.json') {
              cb(null, {state: 'repaired', regenIndex: true, dataloss: false})
            } else if (name !== '___index.json') {
              cb(null, {state: 'repaired', regenIndex: true, dataloss: true})
            }
          })
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
      buildIndex(fd, offset, function (err, index) {
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

function buildIndex (fd, fileLen512, cb) {
  var index = {}
  ;(function next (pos) {
    checkFile(fd, pos, function (err, header) {
      if (err) return cb(err)
      if (header === null) return cb(null, index)
      var leftover = 512 - header.size % 512
      if (leftover === 512) leftover = 0
      pos += header.size + leftover + 512
      next(pos)
    })
  })(0)
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

// Buffer[1024] -> { state, len }
function checkNulTrailer (buf) {
  if (buf.length < 1024) return { state: 'error', msg: 'file too short' }
  var start = findBeginningOfNulTrailer(buf)
  if (start === undefined) return { state: 'missing' }
  if (start === 0) return { state: 'good' }
  return { state: 'partial', offset: start, len: 1024 - start }
}

// fileLen should be set to be the length of the file MINUS the 1024 nul
// trailer. fileLen should be a factor of 512.
function checkIndexJson (fd, fileLen, cb) {
  tar.readFinalFile(fd, fileLen + 1024, function (err, buf, offset, name) {
    if (err && err instanceof Error) return cb(null, err)
    if (err && err.noFiles) return cb(null, { state: 'empty' })
    if (err && err.malformed) return cb(null, { state: 'malformed', start: offset })
    if (name !== '___index.json') return cb(null, { state: 'missing', size: buf.length, start: offset })

    try {
      var json = JSON.parse(buf.toString())
      if (!json || !json.index || !json.meta) {
        throw new Error('unexpected format')
      } else {
        cb(null, { state: 'good', size: buf.length, start: offset })
      }
    } catch (e) {
      cb(null, { state: 'malformed', start: offset, size: buf.length })
    }
  })
}

function repairIndexJson (filepath, fd, fileLen, cb) {
  checkIndexJson(fd, fileLen, function (err, res) {
    if (err) return cb(err)
    switch (res.state) {
      case 'missing':
        truncateIfNeeded(fd, res.offset, res.size, fileLen, function (err, newLen) {
          if (err) cb(err)
          fileLen = newLen
          fs.close(fd, function () {
            buildIndex(filepath, fileLen, function (err, index, fd) {
              if (err) return fs.close(fd, function () { cb(err) })
              writeIndexAndTrailer(fd, fileLen, index, cb)
            })
          })
        })
        break
      case 'empty':
        cb(new Error('empty file'))
        break
      case 'malformed':
        fs.ftruncate(fd, res.offset, function (err) {
          if (err) return cb(err)
          fileLen = res.offset
          fs.close(fd, function () {
            buildIndex(filepath, fileLen, function (err, index) {
              if (err) return fs.close(fd, function () { cb(err) })
              writeIndexAndTrailer(fd, fileLen, index, cb)
            })
          })
        })
        break
      case 'good':
        truncateIfNeeded(fd, res.offset, res.size, fileLen, function (err) {
          if (err) cb(err)
          else cb()
        })
        break
      default:
        return cb(new Error('unknown index.json state'))
    }
  })
}

function writeIndexAndTrailer (fd, offset, index, cb) {
  var json = JSON.stringify({index: index})
  var header = tarHeader.encode({
    name: '___index.json',
    type: 'file',
    mode: parseInt('644', 8),
    uid: 0,
    gid: 0,
    mtime: new Date(),
    size: json.length
  })

  var leftover = 512 - (json.length % 512)
  var paddingAndTrailer = Buffer.alloc(leftover + 1024).fill(0)
  var toWrite = Buffer.concat([header, paddingAndTrailer])

  fs.write(fd, toWrite, 0, toWrite.length, offset, function (err) {
    if (err) cb(err)
    else cb()
  })
}

// scan tarball and build index data structure
function buildIndex (filepath, fileLen, cb) {
  var index = {}

  fs.open(filepath, 'w+', function (err, fd) {
    if (err) return cb(err)
    ;(function next (at) {
      nextTarHeader(fd, at, function (err, filename, size, offset) {
        if (err) return cb(err)
        if (!filename) return cb(null, index, fd)
        index[filename] = offset
        var realSize = size + (512 - (size % 512))
        next(at + realSize)
      })
    })(0)
  })
}

function nextTarHeader (fd, offset, cb) {
  var header = Buffer.alloc(512)
  ;(function next (offset) {
    fs.read(fd, header, 0, 512, offset, function (err) {
      if (err) return cb(err)
      if (USTAR.equals(buf.slice(257, 257 + 8))) {
        var fileName = unNulTerminateString(buf.slice(0, 100))
        var fileSize = parseInt(buf.slice(124, 124 + 12).toString(), 8)
        cb(null, fileName, fileSize, offset)
      } else {
        next(offset + 512)
      }
    })
  })(offset)
}

function truncateIfNeeded (fd, offset, len, fileLen, cb) {
  var padding = 512 - (len % 512)
  if (offset + len + padding < fileLen) {
    fs.ftruncate(fd, offset + len + padding, cb)
  } else {
    process.nextTick(cb, null)
  }
}

function findBeginningOfNulTrailer (buf) {
  var start
  for (var i = 0; i < buf.length; i++) {
    var val = buf.readUInt8(i)
    if (val === 0 && start === undefined) {
      start = i
    } else if (val !== 0 && start !== undefined) {
      start = undefined
    }
  }
  return start
}

function unNulTerminateString (buf) {
  for (var i = 0; i < buf.length; i++) {
    if (buf.readUInt8(i) === 0) return buf.slice(0, i).toString()
  }
  return buf.toString()
}
