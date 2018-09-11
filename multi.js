var fs = require('fs')
var path = require('path')
var pump = require('pump')
var RWLock = require('rwlock')
var through = require('through2')
var readonly = require('read-only-stream')
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

MultiTarball.prototype.append = function (filepath, size, cb) {
  if (!cb && typeof size === 'function') {
    cb = size
    size = null
  }
  var self = this

  var t = through()

  this.lock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    // Find the last tarball in the set.
    self._getLastTarball(function (err, tarball, index) {
      if (err) return done(err)

      // Check if the new file to be added will cause the tarball to exceed its
      // maximum size.
      tarball.archive.value(function (err, archive) {
        if (err) return done(err)
        var totalAddedSize = 512 + roundUp(size, 512)

        // Overflow into a brand new tarball
        if (archive.fileSize + totalAddedSize > self.maxFileSize) {
          var newFilepath = self.filepath + '.' + (index + 1)
          tarball = new IndexedTarball(newFilepath)
          self.tarballs.push(tarball)
        }

        var ws = tarball.append(filepath, done)
        t.pipe(ws)
      })
    })
  })

  return t
}

MultiTarball.prototype.list = function (cb) {
  var self = this
  this.lock.readLock(function (release) {
    var error
    var pending = self.tarballs.length
    var res = {}

    self.tarballs.forEach(list)

    function done (err) {
      error = err || error
      pending--
      if (!pending) {
        release()
        cb(error, error ? undefined : Object.keys(res))
      }
    }

    function list (tarball) {
      tarball.list(function (err, files) {
        if (err) return done(err)
        for (var idx in files) {
          res[files[idx]] = true
        }
        done()
      })
    }
  })
}

MultiTarball.prototype.read = function (filepath) {
  var self = this
  var stream = through()

  this.lock.readLock(function (release) {
    self._getFullIndex(function (err, index) {
      if (err) stream.emit('error', err)
      else if (!index[filepath]) stream.emit('error', new Error('not found'))
      else {
        pump(index[filepath].tarball.read(filepath), stream, function (err) {
          if (err) stream.emit('error', err)
        })
      }
      release()
    })
  })

  return readonly(stream)
}

MultiTarball.prototype.pop = function (cb) {
  var self = this

  this.lock.writeLock(function (release) {
    function done (err) {
      release()
      cb(err)
    }

    self._getLastPopulatedTarball(function (err, tarball) {
      if (err) return done(err)
      else if (!tarball) return done()
      tarball.pop(done)
    })
  })
}

MultiTarball.prototype.userdata = function (data, cb) {
  if (data && !cb && typeof data === 'function') {
    cb = data
    data = null
  }
  var self = this

  this.lock.writeLock(function (release) {
    function done (err, res) {
      release()
      cb(err, res)
    }

    self._getLastPopulatedTarball(function (err, tarball) {
      if (err) return done(err)
      else if (!tarball) return done()
      tarball.userdata(data, done)
    })
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
      // TODO: test that the sort function is working & these are in order
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

// Returns the final *populated* tarball in the set. Returns 'null' if none are
// populated.
MultiTarball.prototype._getLastPopulatedTarball = function (cb) {
  cb = cb || noop
  var self = this
  var tarball

  ;(function checkPrevious (idx) {
    if (idx < 0) return cb(null) // all empty tarballs!
    tarball = self.tarballs[idx]
    tarball.archive.value(function (err, meta) {
      if (err) return cb(err)
      if (meta && meta.index && Object.keys(meta.index).length > 0) {
        var index = parseIndexFromFilename(tarball.filepath)
        cb(null, tarball, index)
      } else {
        checkPrevious(idx - 1)
      }
    })
  })(this.tarballs.length - 1)
}

// Read the index of *all* tarballs to build a full index.
MultiTarball.prototype._getFullIndex = function (cb) {
  var self = this
  var index = {}

  // Process tarballs *in order*. This is necessary to avoid earlier duplicate
  // filenames overwriting newer ones.
  ;(function next (idx) {
    if (idx >= self.tarballs.length) return cb(null, index)

    var tarball = self.tarballs[idx]
    tarball.archive.value(function (err, _meta) {
      if (err) return cb(err)
      var _index = _meta.index
      for (var key in _index) {
        index[key] = Object.assign({}, _index[key])
        index[key].tarball = tarball
      }
      next(idx + 1)
    })
  })(0)
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
