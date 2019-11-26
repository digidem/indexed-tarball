var fs = require('fs')

module.exports = {
  readFinalFile: readFinalFile
}

// Scans a tar archive from the end backwards until it finds the last entry.
// Returns the raw buffer of the last file, and its byte offset where it begins.
function readFinalFile (fd, size, cb) {
  var header = Buffer.alloc(512)
  var ustarExpected = Buffer.from('7573746172', 'hex') // "ustar"

  next(size - 512 * 3)

  function next (offset) {
    if (offset < 0) return cb({noFiles: true})

    // read file header
    fs.read(fd, header, 0, 512, offset, function (err, size, buf) {
      if (err) return cb(err)
      // look for 'ustar<NUL>00' pattern at the expected offset
      if (ustarExpected.equals(buf.slice(257, 257 + 5))) {
        // get the final file's size (octal)
        var fileName = unNulTerminateString(buf.slice(0, 100))
        var fileSize = parseInt(buf.slice(124, 124 + 12).toString(), 8)
        if (isNaN(fileSize)) return cb({malformed: true}, null, offset, fileName)
        var fileBuf = Buffer.alloc(fileSize)
        fs.read(fd, fileBuf, 0, fileSize, offset + 512, function (err, readSize) {
          if (err) return cb(err)
          // if (fileSize !== readSize) console.error('WARNING: read size !== expected size (' + readSize + ' vs ' + fileSize + ')')
          cb(null, fileBuf, offset, fileName)
        })
      } else {
        next(offset - 512)
      }
    })
  }
}

function unNulTerminateString (buf) {
  for (var i = 0; i < buf.length; i++) {
    if (buf.readUInt8(i) === 0) return buf.slice(0, i).toString()
  }
  return buf.toString()
}
