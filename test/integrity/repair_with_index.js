var repair = require('../../lib/integrity').repair
var path = require('path')
var test = require('tape')
var ncp = require('ncp')
var mkdirp = require('mkdirp')
var os = require('os')
var md5 = require('md5')
var parseTarball = require('../util.js').parseTarball

var testdir = path.join(os.tmpdir(), 'test-indexed-tarball-' + Math.random().toString().substring(2))
mkdirp.sync(testdir)

function testFixture (name, filepath, expected) {
  test(name, function (t) {
    var src = path.join(__dirname, 'fixtures', filepath)
    var dst = path.join(testdir, filepath)
    ncp(src, dst, function (err) {
      t.error(err, 'copy fixture')
      repair(dst, function (err, res) {
        t.error(err, 'repair tarball')
        parseTarball(dst, function (err, res) {
          t.error(err, 'parse tarball')
          t.equals(res.length, Object.keys(expected).length, 'same # of files')
          res.forEach(function (entry) {
            t.ok(expected[entry.name], 'filename as expected (' + entry.name + ')')
            t.equals(entry.data.length, expected[entry.name].size, 'size as expected')
            t.equals(md5(entry.data), expected[entry.name].md5, 'hash matches')
          })
          t.end()
        })
      })
    })
  })
}

testFixture('good tarball', 'good.tar', {
  'osm-p2p-db.tar': {
    size: 10240,
    md5: '4751d44c06370befaa629c791a34245c'
  },
  '___index.json': {
    size: 99,
    md5: '9c5043fb568e4310839f0dddeefe007d'
  }
})

testFixture('partial NUL trailer', 'partial-trailer.tar', {
  'osm-p2p-db.tar': {
    size: 10240,
    md5: '4751d44c06370befaa629c791a34245c'
  },
  '___index.json': {
    size: 54,
    md5: 'c18f94481449e80d580269bd159dea96'
  }
})

testFixture('no NUL trailer', 'no-trailer.tar', {
  'osm-p2p-db.tar': {
    size: 10240,
    md5: '4751d44c06370befaa629c791a34245c'
  },
  '___index.json': {
    size: 54,
    md5: 'c18f94481449e80d580269bd159dea96'
  }
})

return

test('no NUL trailer', function (t) {
  check(path.join(__dirname, 'fixtures', 'no-trailer.tar'), function (err, res) {
    t.error(err)
    t.deepEquals(res, { indexMissing: false, state: 'partial-trailer', len: 0 })
    t.end()
  })
})

test('partial index', function (t) {
  check(path.join(__dirname, 'fixtures', 'partial-index.tar'), function (err, res) {
    t.error(err)
    t.deepEquals(res, { indexMissing: false, state: 'malformed-final-file', offset: 26624 })
    t.end()
  })
})


