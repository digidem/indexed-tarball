# indexed-tarball

> a tarball with constant-time reads and modifications

A small extension to the [tar archive format](https://en.wikipedia.org/wiki/Tar_%28computing%29) to support some additional features:

1. Constant time random access reads
2. Constant time writes (appends)
3. Constant time deletions (truncation)
4. Multi-file support

This is done by generating a special "index file" that is always appended to the end of the tar achive, which maps file paths within the archive to byte offsets.

## Compatibility

Tarballs created with this module are still plain old tar files, and will work with existing utilities.

## Usage

```js
var Tarball = require('indexed-tarball')
var through = require('through2')

var tarball = new Tarball('file.tar')

var t = through()
var ws = tarball.append('hello.txt', done)

t.pipe(ws)
t.end('hello world')

function done ()
  tarball.list(function (err, files) {
    console.log('files', files)

    tarball.read('hello.txt')
      .on('data', function (buf) {
        console.log('data', buf.toString())
      })
  })
})
```

outputs

```
files [ 'hello.txt' ]
data hello world
```

## API

```js
var Tarball = require('indexed-tarball')
```

## var tarball = new Tarball('/path/to/file.tar'[, opts])

Creates or opens an indexed tarball. These are compatible with regular tarballs, so no special extension or archiving software is needed.

If `opts.multifile` is set, further tarballs will be searched for an opened as well. If `opts.maxFileSize` is set as well, this will be used to decide when to "overflow" to a new tarball. See the "Multi-file support" section below for more details. Defaults to 4 gigabytes.

## var ws = tarball.append(filepath, cb)

Returns a writable stream that will be appended to the end of the tarball.

`cb` is called when the write has been completely persisted to disk.

## var rs = tarball.read(filepath)

Returns a readable stream of the data within the archive named by `filepath`. If
the file doesn't exist in the archive, the stream `rs` will emit an error `err`
with `err.notFound` set to `true`.

## tarball.pop(cb)

Truncates the syncfile such that the last file of the archive is dropped. `cb` is called once the change is persisted to disk.

## var rs = tarball.read(filepath)

Returns a readable stream of the file at `filepath`.

## tarball.list(cb)

Calls `cb` with a list of the paths and metadata (byte offsets) of the files within the archive.

## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install indexed-tarball
```

## Multi-file support

### How does it work?

Once a file (e.g. `file.tar`) reaches `opts.maxFileSize` or 4 gigabytes (default), the next file appended will be written to `file.tar.1`. Once it fills, `file.tar.2`, and so forth. Each tarball has its own index file, which are unioned (think set theory) together to allow all files across all tarballs be read and listed without any file scanning.

### Caveats?

If there are multiple files with the same name across the multiple tarballs, the file that comes *latest* in the tarball set wins; the earlier one(s) are ignored. (e.g. if `foo.tar.3` and `foo.tar.7` both contain a file with path `bar/bax/quux.txt`, the one from `foo.tar.7` will always be returned & used.

Also, currently new appends are always made to the *final* tarball in the set. So if you wrote a lot of files and ended up with `file.tar` and `file.tar.1`, and then `pop`d all of the files until none were left, future `append`s would go to `file.tar.1`, not `file.tar`. Fixing this [is a TODO](https://github.com/noffle/indexed-tarball/issues/1).

## License

MIT

