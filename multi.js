var fs = require('fs')
var path = require('path')
var RWLock = require('rwlock')
var IndexedTarball = require('./single')

module.exports = MultiTarball

function MultiTarball (filepath, opts) {
  opts = opts || {}

  this.filepath = filepath
  this.tarballs = []
  this.maxFileSize = opts.maxFileSize || (Math.pow(2, 32) - 1)

  this.lock = new RWLock()

  // Find all of the tarballs belonging to the set.
  this._setupTarballs()
}

MultiTarball.prototype.append = function (filepath, readable, size, cb) {
  var self = this
  this.lock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    // Find the last tarball in the set.
    self._getLastTarball(function (err, tarball, index) {
      if (err) return done(err)

      // Check if the new file to be added will cause the tarball to exceed its maximum size.
      tarball.archive.value(function (err, archive) {
        if (err) return done(err)
        var totalAddedSize = 2 * 512 + roundUp(size, 512)

        // Overflow into a brand new tarball
        if (archive.fileSize + totalAddedSize > self.maxFileSize) {
          tarball = new IndexedTarball(self.filepath + '.' + (index + 1))
          self.tarballs.push(tarball)
        }

        tarball.append(filepath, readable, size, done)
      })
    })
  })
}

MultiTarball.prototype.list = function (cb) {
  var self = this
  this.lock.readLock(function (release) {
  })
}

MultiTarball.prototype.read = function (filepath) {
  var self = this
  this.lock.readLock(function (release) {
  })
}

MultiTarball.prototype.pop = function (cb) {
  var self = this
  this.lock.writeLock(function (release) {
  })
}

MultiTarball.prototype._setupTarballs = function (cb) {
  var self = this
  cb = cb || noop

  this.lock.writeLock(function (release) {
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
  cb = cb || noop
  var tarball

  if (!this.tarballs.length) {
    tarball = new IndexedTarball(this.filepath)
    this.tarballs.push(tarball)
    cb(null, tarball, 0)
  } else {
    tarball = this.tarballs[this.tarballs.length - 1]
    var index = parseIndexFromFilename(tarball.filepath)
    cb(null, tarball, index)
  }
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

function roundUp (n, nearest) {
  var more = 512 - (n % nearest)
  return n + more
}
