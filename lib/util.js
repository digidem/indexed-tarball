var Readable = require('stream').Readable

function fromString (str) {
  var data = new Readable()
  data._read = function (size) {
    if (str.length <= 0) return this.push(null)
    var push = str.slice(0, size)
    if (this.push(push)) str = str.slice(size)
  }
  return data
}

function fromBuffer (buf) {
  var data = new Readable()
  data._read = function (size) {
    if (buf.length <= 0) return this.push(null)
    var push = buf.slice(0, size)
    if (this.push(push)) buf = buf.slice(size)
  }
  return data
}

module.exports = {
  fromString: fromString,
  fromBuffer: fromBuffer
}
