var check = require('../../lib/integrity').check
var path = require('path')
var test = require('tape')

test('good tarball', function (t) {
  check(path.join(__dirname, 'fixtures', 'good.tar'), function (err, res) {
    t.error(err)
    t.deepEquals(res, { state: 'good' })
    t.end()
  })
})

test('partial NUL trailer', function (t) {
  check(path.join(__dirname, 'fixtures', 'partial-trailer.tar'), function (err, res) {
    t.error(err)
    t.deepEquals(res, { indexMissing: false, state: 'partial-trailer', len: 512 })
    t.end()
  })
})

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

