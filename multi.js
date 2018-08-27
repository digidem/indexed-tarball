var fs = require('fs')
var path = require('path')
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
  this.tarballs = []

  this.loadLock = new RWLock()

  this._setupTarballs()
}

MultiTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this
  this.loadLock.readLock(function (release) {
  })
}

MultiTarball.prototype.list = function (cb) {
  var self = this
  this.loadLock.readLock(function (release) {
  })
}

MultiTarball.prototype.read = function (filepath) {
  var self = this
  this.loadLock.readLock(function (release) {
  })
}

MultiTarball.prototype.pop = function (cb) {
  var self = this
  this.loadLock.readLock(function (release) {
  })
}

MultiTarball.prototype._setupTarballs = function (cb) {
  var self = this
  cb = cb || noop

  this.loadLock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    var dir = path.dirname(self.filepath)
    fs.readdir(dir, function (err, contents) {
      if (err) return done(err)
      self.tarballs = contents.filter(function (name) { return name.startsWith(self.filepath) })
      done()
    })
  })
}

function noop () {}
