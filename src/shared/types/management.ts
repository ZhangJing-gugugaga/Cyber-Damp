/** 护理台、托盘与胶囊的窗口状态；旧场景快照和工具转发已退役。 */
export interface SceneStatus {
  paused: boolean;
  shortcut: string;
  shortcutError?: string;
  capsuleHidden?: boolean;
}
export interface ManagementCommand {
  action: 'window-close' | 'window-minimize' | 'shortcut';
  value?: string;
}
