var rwlock = require('rwlock')

module.exports = function (fetch) {
  var value = undefined
  var error = undefined
  var lock = false
  var waiting = []

  var output = {}

  output.value = function (cb) {
    if (value) return process.nextTick(cb, error, value)
    if (lock) return waiting.push(cb)
    lock = true

    fetch(function (err, res) {
      if (err) { error = err; value = undefined }
      else { value = res; error = undefined }
      lock = false
      waiting.forEach(function (f) { f(error, value) })
      waiting = []
      cb(error, value)
    })
  }

  output.invalidate = function () {
    value = undefined
    error = undefined
  }

  output.refresh = function (cb) {
    this.invalidate()
    this.value(cb || noop)
  }

  return output
}

function noop () {}
