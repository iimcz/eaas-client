#!/bin/sh -xeu

cd -- "$(dirname -- "$0")"

delete_files() {
  find "$1" '!' -type d -and '!' '(' \
    -name '*.js' \
    -o -name '*.css' \
    -o -name '*.map' \
    -o -iname 'LICENSE' \
    -o -iname 'LICENSE.md' \
    -o -iname 'COPYING' \
    -o -iname 'COPYING.md' \
    -o -iname 'AUTHORS' \
    -o -iname 'AUTHORS.md' \
    -o -iname 'README' \
    -o -iname 'README.md' \
  ')' -print -delete
  find "$1" -type d -empty -print -delete
}

delete_files xpra/xpra-html5
delete_files guacamole/guacamole-client-eaas
rm -rf contrib/

set +x

cat << EOF
You can restore the deleted files by running:

git checkout; git submodule update --init
EOF
