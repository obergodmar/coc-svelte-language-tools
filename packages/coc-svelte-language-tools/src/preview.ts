import { workspace } from 'coc.nvim';

// One native editor operation creates and initializes the scratch buffer. No
// URI provider, document attachment or asynchronous current-buffer assumptions.
const createPreview = `
function! CocSvelteOpenCompiled(source, filetype, lines) abort
  noautocmd keepalt botright new
  let preview = bufnr('%')
  setlocal buftype=nofile bufhidden=wipe noswapfile nobuflisted
  call setline(1, a:lines)
  let suffix = a:filetype ==# 'css' ? 'css' : 'js'
  let title = '[Svelte compiled] ' . fnamemodify(a:source, ':t') . '.' . suffix . ' [' . preview . ']'
  noautocmd execute 'file ' . fnameescape(title)
  setlocal nomodified nomodifiable readonly
  let &l:syntax = a:filetype
  if !exists('b:current_syntax')
    execute 'runtime! syntax/' . a:filetype . '.vim'
  endif
  " Fire FileType only after contents and scratch options are ready. Editor
  " integrations (including Tree-sitter) can attach to the completed buffer.
  let &l:filetype = a:filetype
  return preview
endfunction
`;

export async function openCompiledPreview(
    source: string,
    filetype: 'javascript' | 'css',
    code: string
) {
    await workspace.nvim.call('execute', [createPreview]);
    return workspace.nvim.call('CocSvelteOpenCompiled', [source, filetype, code.split(/\r?\n/)]);
}
