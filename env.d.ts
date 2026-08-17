/// <reference types="vite/client" />
declare var $: any;
declare let Cesium: any;
declare let wialon: any;
// global.d.ts
// export { };

declare global {
  interface Window {
    JSPlugin: any; // 这里假设 JSPlugin 类型为 any，如果有具体的类型定义，可以替换为更精确的类型
  }
}
declare class JSPlugin {
  constructor(options: {
    szId: string;
    szBasePath: string;
    iMaxSplit: number;
    iCurrentSplit?: number;
    openDebug?: boolean;
    bWndFull?: boolean;
    iPackageType?: number,
    iDecodeType?: number,
    bHardDecode: boolean, // 启用硬件解码
    oStyle?: {
      border?: string;
      borderSelect?: string;
      background?: string
    };
  });

  JS_Play(
    playURL: string,
    options: { playURL: string; mode: string },
    windowIndex?: number,
    startTime?: string,
    endTime?: string
  ): Promise<void>;

  JS_Resize(): void;

  // 声明其他可能的方法
}
declare const JSPlugin: any;
declare class JSPplugin {
  constructor(options: {
    szId: string; // 播放器容器的 ID
    szBasePath: string; // 基础路径
    iMaxSplit: number; // 最大分屏数
    iCurrentSplit?: number; // 当前分屏模式
    openDebug?: boolean; // 是否开启调试模式
    oStyle?: {
      border?: string; // 边框颜色
      borderSelect?: string; // 选中边框颜色
      background?: string; // 背景颜色
    };
  });

  JS_Play(
    playURL: string,
    options: { playURL: string; mode: string },
    windowIndex: number
  ): Promise<void>;

  JS_Resize(): void;

  JS_Stop(): void;

  JS_ArrangeWindow(splitNum: number): Promise<void>;

  // 根据需要补充其他方法和属性
}
declare module 'lodash' {
  export function debounce(func: Function, wait: number): Function;
  export function throttle(func: Function, wait: number): Function;
  // 其他 lodash 方法的声明
}


declare class CircleScanSystem {
  constructor(
    viewer: any,
    options: {
      type: string
      lon: number
      lat: number
      radius: string
      scanColor?: any
      interval?: string
    },
  )

  remove(): void
}
