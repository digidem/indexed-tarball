var fs = require('fs')

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.fd = fs.openSync(filepath, 'w+'/*, 0666?*/)
}

IndexedTarball.prototype.append = function (filepath, readable, cb) {
  process.nextTick(cb.bind(null, new Error('not implemented')))
}
