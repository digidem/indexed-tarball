var fs = require('fs')
var tar = require('./tar')
var tarStream = require('tar-stream')
var tarHeader = require('tar-stream/headers')

var USTAR = Buffer.from('7573746172003030', 'hex') // "ustar<NUL>00"
var NUL_SECTOR = Buffer.alloc(512).fill(0)

module.exports = {
  check: checkTarball,
  repair: repairTarball
}

// === POSSIBLE "CHECK" RESULTS ===
// good                : { state: 'good' }
// empty || garbage    : { state: 'unknown-file' }
// partial trailer     : { state: 'partial-trailer', len: 317 }
// malformed index     : { state: 'malformed-index', offset: 122 }
// malformed final file: { state: 'malformed-final-file', offset: 32 }

// scan backwards from the end of the tarball (only works if ___index.json is present)
function checkTarball (filepath, cb) {
  var fileLen
  var fileLen512
  var trailer = Buffer.alloc(1024)

  fs.stat(filepath, function (err, stat) {
    if (err) return cb(err)
    fileLen = stat.size
    fileLen512 = fileLen - (stat.size % 512)
    checkFinalFile()
  })

  function checkFinalFile () {
    fs.open(filepath, 'r', function (err, fd) {
      if (err) return cb(err)
      tar.readFinalFile(fd, fileLen512 + 1024, function (err, buf, offset, name) {
        if (err && err instanceof Error) return endWithClose(fd, err)
        if (err && err.noFiles) return endWithClose(fd, null, { state: 'unknown file' })
        if (err && err.malformed) {
          if (err.name === '___index.json') return endWithClose(fd, null, { state: 'malformed-index', offset: offset })
          return endWithClose(fd, null, { state: 'malformed-final-file', offset: offset })
        }

        var indexMissing = false
        if (name !== '___index.json') indexMissing = true

        // check if there is a partial header
        var leftover = fileLen - (offset + 512 + buf.length + (512 - buf.length % 512))
        if (leftover === 1024) return endWithClose(fd, null, { state: 'good' })
        else if (leftover >= 0 && leftover < 1024) return endWithClose(fd, null, { state: 'partial-trailer', len: leftover, indexMissing: indexMissing })
        else if (leftover < 0) return endWithClose(fd, null, { state: 'malformed-final-file', offset: offset, indexMissing: indexMissing })
        else throw new Error('ooops')
      })
    })
  }

  function endWithClose (fd, err, res) {
    fs.close(fd, function () {
      cb(err, res)
    })
  }

  function checkTrailer () {
    fs.open(filepath, 'r', function (err, fd) {
      if (err) return cb(err)
      fs.read(fd, trailer, 0, 1024, fileLen - 1024, function (err) {
        if (err) return endWithClose(fd, err)
        var res = checkNulTrailer(trailer)
        if (res.state === 'partial') {
          endWithClose(fd, null, { state: 'partial-trailer', len: res.len })
        } else if (res.state === 'missing') {
          endWithClose(fd, new Error('not impl'))
        } else if (res.state === 'good') {
          endWithClose(fd, null, { state: 'good' })
        } else {
          endWithClose(fd, new Error('unknown state from checking nul trailer'))
        }
      })
    })
  }
}

function repairTarball (filepath, cb) {
  checkTarball(filepath, function (err, res) {
    if (err) return cb(err)

    // good                : { state: 'good' }
    // empty || garbage    : { state: 'unknown-file' }
    // partial trailer     : { state: 'partial-trailer', len: 317 }
    // malformed index     : { state: 'malformed-index', offset: 122 }
    // malformed final file: { state: 'malformed-final-file', offset: 32 }

    switch (res.state) {
      case 'good':
        cb(null, res)
        return
      case 'unknown-file':
        cb(null, {state: 'unknown-file'})
        return
      case 'partial-trailer':
        break
      case 'malformed-index':
        break
      case 'malformed-final-file':
        break
    }
  })
  var steps = -1
  var nulSectorsFound = 0
  var unknownSectorsFound = 0
  var truncated = false
  var fileLen
  var trailer = Buffer.alloc(1024)

  function errWithClose (fd, err) {
    fs.close(fd, function () {
      cb(err)
    })
  }

  fs.stat(filepath, function (err, stat) {
    if (err) return cb(err)

    // truncate if needed
    if (stat.size % 512 > 0) {
      var newSize = stat.size - (stat.size % 512)
      fs.truncate(filepath, newSize, function (err) {
        if (err) return cb(err)
        fileLen = newSize
        checkTrailer()
      })
    } else {
      fileLen = stat.size
      checkTrailer()
    }
  })

  function checkTrailer () {
    // by this point, the file is of a length aligned with 512-byte sectors
    fs.open(filepath, 'r+', function (err, fd) {
      if (err) return cb(err)

      fs.read(fd, trailer, 0, 1024, fileLen - 1024, function (err) {
        if (err) return errWithClose(fd, err)

        var res = checkNulTrailer(trailer)
        if (res.state === 'partial') {
          padRemainingBytes(fd, res.len, function (err) {
            if (err) return errWithClose(fd, err)
            fs.close(fd, function (err) {
              if (err) cb(err)
              else cb(null, {state: 'repaired'})
            })
          })
        } else if (res.state === 'missing') {
          repairIndexJson(filepath, fd, fileLen, function (err) {
            if (err) cb(err)
            else cb(null, {state: 'repaired'})
          })
        } else if (res.state === 'good') {
          fs.close(fd, function (err) {
            if (err) cb(err)
            else cb(null, {state: 'good'})
          })
        } else {
          cb(new Error('unknown state from checking nul trailer'))
        }
      })
    })
  }

  function padRemainingBytes (fd, len, done) {
    var zeros = Buffer.alloc(len).fill(0)
    fs.write(fd, zeros, 0, len, fileLen, done)
  }
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
