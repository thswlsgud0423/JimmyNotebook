const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c) => (...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  vault: {
    info: inv('vault:info'), list: inv('vault:list'), read: inv('vault:read'), write: inv('vault:write'),
    exists: inv('vault:exists'), mkdir: inv('vault:mkdir'), rename: inv('vault:rename'), trash: inv('vault:trash'),
    saveAsset: inv('vault:saveAsset'), backup: inv('vault:backup'), openPath: inv('vault:revealPath'), choose: inv('vault:choose'), reveal: inv('vault:reveal'),
    onChanged: (cb) => ipcRenderer.on('vault:changed', (_e, n) => cb(n))
  },
  history: { list: inv('history:list'), read: inv('history:read'), restore: inv('history:restore') },
  ai: { models: inv('ai:models'), chat: inv('ai:chat'), stop: inv('ai:stop'), pickFile: inv('ai:pickFile'), pathOf: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } }, onChunk: (cb) => { const f = (_e, id, t) => cb(id, t); ipcRenderer.on('ai:chunk', f); return () => ipcRenderer.removeListener('ai:chunk', f); } },
  doc: { import: inv('doc:import') },
  pathOf: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } },
  importPick: inv('import:pick'),
  trash: { list: inv('trash:list'), restore: inv('trash:restore'), remove: inv('trash:delete'), empty: inv('trash:empty') },
  find: { run: inv('find:run'), stop: inv('find:stop'), onResult: (cb) => ipcRenderer.on('find:result', (_e, r) => cb(r)) },
  exportPdf: inv('export:pdf'),
  exportFile: inv('export:file'),
  openExternal: inv('app:openExternal'),
  copyImage: inv('clipboard:copyImage'),
  file: { pick: inv('file:pick'), open: inv('file:open'), reveal: inv('file:reveal') },
  price: { quotes: inv('price:quotes'), search: inv('price:search'), history: inv('price:history'), chart: inv('price:chart'), detail: inv('price:detail'), news: inv('price:news') }
});
