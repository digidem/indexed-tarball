var check = require('../../lib/integrity').check
var repair = require('../../lib/integrity').repair
var path = require('path')
var test = require('tape')
var ncp = require('ncp')
var mkdirp = require('mkdirp')
var os = require('os')

var testdir = path.join(os.tmpdir(), 'test-indexed-tarball-' + Math.random().toString().substring(2))
mkdirp.sync(testdir)

function testFixture (name, filepath) {
  test(name, function (t) {
    var src = path.join(__dirname, 'fixtures', filepath)
    var dst = path.join(testdir, filepath)
    ncp(src, dst, function (err) {
      t.error(err)
      repair(dst, function (err, res) {
        t.error(err)
        check(dst, function (err, res) {
          t.error(err)
          t.deepEquals(res, { state: 'good' })
          t.end()
        })
      })
    })
  })
}

testFixture('good tarball', 'good.tar')

testFixture('partial NUL trailer', 'partial-trailer.tar')

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


