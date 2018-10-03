var fs = require('fs')

module.exports = {
  readFinalFile: readFinalFile
}

// Scans a tar archive from the end backwards until it finds the last entry.
// Returns the raw buffer of the last file, and its byte offset where it begins.
function readFinalFile (fd, size, cb) {
  var header = Buffer.alloc(512)
  var ustarExpected = Buffer.from('7573746172003030', 'hex')

  next(size - 512 * 3)

  function next (offset) {
    if (offset < 0) return cb(new Error('could not find index'))

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
