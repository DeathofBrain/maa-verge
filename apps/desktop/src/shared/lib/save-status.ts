export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export const autoSaveLabel = (status: SaveStatus) =>
  status === 'saved'
    ? ''
    : status === 'error'
      ? '保存失败，修改已保留'
      : status === 'pending'
        ? '等待保存…'
        : '正在保存…';
