au BufEnter *.shared syn keyword sharedType int str float void color
au BufEnter *.shared syn keyword Keyword struct message union array dict flag enum duplicate
au BufEnter *.shared syn match Type "\["
au BufEnter *.shared syn match Type "\]"
au BufEnter *.shared syn match Comment "\/\/.*$"
hi link sharedType Type
au BufEnter *.shared setlocal ts=4 sw=4 sts=4 et foldmethod=indent
hi Enum cterm=bold gui=bold
