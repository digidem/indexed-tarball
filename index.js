var SingleTarball = require('./single')
var MultiTarball = require('./multi')

module.exports = IndexedTarball

function IndexedTarball (filepath, opts) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath, opts)
  opts = opts || {}

  var impl
  if (opts.multifile) impl = new MultiTarball(filepath, opts)
  else impl = new SingleTarball(filepath, opts)

  this.impl = impl
}

IndexedTarball.prototype.append = function (filepath, size, cb) {
  return this.impl.append(filepath, size, cb)
}

IndexedTarball.prototype.list = function (cb) {
  this.impl.list(cb)
}

IndexedTarball.prototype.read = function (filepath) {
  return this.impl.read(filepath)
}

IndexedTarball.prototype.pop = function (cb) {
  this.impl.pop(cb)
}
