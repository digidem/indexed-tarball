var fs = require('fs')
var eos = require('end-of-stream')
var tar = require('tar-stream')
var RWLock = require('rwlock')
var through = require('through2')
var readonly = require('read-only-stream')
var fromBuffer = require('./lib/util').fromBuffer
var cached = require('./lib/cached-value')
var tarUtil = require('./lib/tar')

module.exports = MultiTarball

function MultiTarball (filepath, opts) {
}

MultiTarball.prototype.append = function (filepath, readable, size, cb) {
}

MultiTarball.prototype.list = function (cb) {
}

MultiTarball.prototype.read = function (filepath) {
}

MultiTarball.prototype.pop = function (cb) {
}

MultiTarball.prototype._writeNewIndex = function (newIndex, offset, cb) {
}
