au BufEnter *.shared syn keyword sharedType int str float flag array union struct dict enum void msg message color
au BufEnter *.shared syn match Type "\["
au BufEnter *.shared syn match Type "\]"
au BufEnter *.shared syn match Comment "\/\/.*$"
hi link sharedType Type
au BufEnter *.shared setlocal ts=4 sw=4 sts=4 et foldmethod=indent
