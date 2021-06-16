set path=.,,WebDnD,Bugs,ResolvedBugs,WontFixBugs/
au BufEnter *.ts,*.js setlocal ts=4 sw=4 sts=4 et foldmethod=indent
au BufEnter *.ts setlocal errorformat=%+A\ %#%f\ %#(%l\\\,%c):\ %m,%C%m
