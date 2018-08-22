module.exports = IndexedTarball

function IndexedTarball (filepath) {
  if (!(this instanceof IndexedTarball)) return new IndexedTarball(filepath)
}
