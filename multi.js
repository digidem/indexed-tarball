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
var IndexedTarball = require('./single')

module.exports = MultiTarball

function MultiTarball (filepath, opts) {
  opts = opts || {}

  this.filepath = filepath
  this.tarballs = []
  this.maxFileSize = opts.maxFileSize || (Math.pow(2, 32) - 1)

  this.loadLock = new RWLock()

  this._setupTarballs()
}

MultiTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this
  // TODO: do I need a different locking mechanism on APIs that modify self.tarballs?
  this.loadLock.readLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    self._getLastTarball(function (err, tarball, index) {
      if (err) return done(err)
      console.log('glt', tarball.filepath, index)
      var totalAddedSize = 2 * 512 + roundUp(size, 512)
      tarball.archive.value(function (err, archive) {
        if (err) return done(err)
        if (archive.fileSize + totalAddedSize > self.maxFileSize) {
          tarball = new IndexedTarball(self.filepath + '.' + (index+1))
          self.tarballs.push(tarball)
          tarball.append(filepath, readable, size, done)
        } else {
          tarball.append(filepath, readable, size, done)
        }
      })
    })
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
      self.tarballs = contents
        .filter(function (name) { return parseIndexFromFilename(name) !== null })
        .map(function (name) { return new IndexedTarball(name) })
        .sort(tarballCmp)
      done()
    })
  })
}

// Returns the final tarball in the set. A new one will be created if it doesn't exist.
MultiTarball.prototype._getLastTarball = function (cb) {
  var self = this
  cb = cb || noop

  this.loadLock.readLock(function (release) {
    function done (err, res, idx) {
      release()
      cb(err, res, idx)
    }

    if (!self.tarballs.length) {
      var tarball = new IndexedTarball(self.filepath)
      self.tarballs.push(tarball)
      done(null, tarball, 0)
    } else {
      var tarball = self.tarballs[self.tarballs.length - 1]
      var index = parseIndexFromFilename(tarball.filepath)
      done(null, tarball, index)
    }
  })
}

function noop () {}

// Compares two IndexedTarball instances; sorting them so that the biggest indexed tarball filename comes last.
function tarballCmp (a, b) {
  var an = parseIndexFromFilename(a.filepath)
  var bn = parseIndexFromFilename(b.filepath)
  if (an === null || bn === null) return 0
  if (an < bn) return -1
  else if (an > bn) return 1
  else return 0
}

// "foobar.tar.2"  => 2
// "foobar.tar.3"  => 3
// "foobar.tar"    => 0
// "foobar.tar.hi" => null
function parseIndexFromFilename (filename) {
  if (/\.tar\.[0-9]+$/.test(filename)) {
    try {
      return parseInt(filename.match(/\.tar\.([0-9]+)$/)[1])
    } catch (e) {
      return null
    }
  } else {
    return 0
  }
}

// thanks https://stackoverflow.com/questions/2593637/how-to-escape-regular-expression-in-javascript#2593661
function quoteRegex (str) {
  return (str + '').replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&')
};

function roundUp (n, nearest) {
  var more = 512 - (n % nearest)
  return n + more
}
