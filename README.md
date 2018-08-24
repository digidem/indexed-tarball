# indexed-tarball

> a tarball with constant-time reads and modifications

A small extension to the [tar archive format](https://en.wikipedia.org/wiki/Tar_%28computing%29) to support some additional features:

1. Constant time random access reads
2. Constant time writes (appends)
3. Constant time deletions (truncation)
4. Multi-file support

This is done by generating a special "index file" that is always appended to the end of the tar achive, which maps file paths within the archive to byte offsets.

## Status

> implemented except multi-file

## Usage

```js
var Tarball = require('indexed-tarball')
var through = require('through2')

var tarball = new Tarball('file.tar')

var t = through()
t.end('hello world')

tarball.append('hello.txt', t, 11, function () {
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

If `opts.multifile` is set, further syncfiles will be searched for an opened as well.

## tarball.append(filepath, readStream, size, cb)

Writes the contents of the readable stream `readStream` of byte length `size` to the archive under the path `filepath`. `cb` is called when the write has been persisted to disk.

## var rs = tarball.read(filepath)

Returns a readable stream of the data within the archive named by `filepath`. If
the file doesn't exist in the archive, the stream `rs` will emit an error.

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

**TODO**

## License

MIT

