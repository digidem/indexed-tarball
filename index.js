var fs = require('fs')

module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)

  this.fd = fs.openSync(filepath, 'w+'/*, 0666?*/)
}
