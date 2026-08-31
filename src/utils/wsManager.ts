/**
 * wsManager.ts —— Cesium 场景动态目标 WebSocket 统一管理器
 *
 * 设计要点：
 * 1. 以「通道 key」为维度管理连接，connect 天然幂等：
 *    - 已有 OPEN 连接 → 直接复用（满足"连接了不重复连"）
 *    - 存在残留连接（CONNECTING/CLOSING）→ 先销毁再重开（满足"关旧开新"）
 * 2. 断线自动重连（可配次数/间隔），主动关闭不触发重连。
 * 3. 模型实例懒创建：收到第一条有效数据时才实例化，空连接不占内存。
 * 4. destroyChannel / destroyAll 负责统一清理 ws + 模型 + 重连定时器，
 *    供组件卸载、场景切换时调用，杜绝内存泄漏与僵尸连接。
 */

import * as Cesium from "cesium";

/** 模型实例的最小接口约定（与 ModelCol / ModelColQiao / ModelColCarbaogao / ModelColCarxuting 兼容） */
export interface ISceneModelInstance {
  update: (data: any[]) => void;
  removeAll: () => void;
}

/** 模型工厂：由调用方注入具体模型类，管理器不依赖任何具体实现 */
export type ModelFactory = (viewer: Cesium.Viewer) => ISceneModelInstance;

/** 单个通道的配置 */
export interface WsChannelConfig {
  url: string;
  createModel: ModelFactory;
  /** 断线最大重连次数，默认 3 */
  maxRetries?: number;
  /** 重连间隔（毫秒），默认 3000 */
  retryDelay?: number;
}

interface ChannelState {
  ws: WebSocket | null;
  model: ISceneModelInstance | null;
  config: Required<Pick<WsChannelConfig, "url">> & WsChannelConfig;
  retryCount: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  manuallyClosed: boolean;
}

export class WsManager {
  /** 通道注册表：key → 连接状态 */
  private channels = new Map<string, ChannelState>();

  constructor(private getViewer: () => Cesium.Viewer | undefined) {}

  /* ---------------- 对外 API ---------------- */

  /**
   * 连接指定通道（幂等）
   * - 已连接：直接复用，返回现有 ws
   * - 有残留旧连接：先销毁再重新打开
   */
  connect(key: string, config: WsChannelConfig): WebSocket | null {
    const viewer = this.getViewer();
    if (!viewer) {
      console.warn(`[WsManager] viewer 未初始化，无法连接通道 "${key}"`);
      return null;
    }

    const existing = this.channels.get(key);

    // ① 已有可用连接 → 复用，绝不重复建立
    if (existing?.ws && existing.ws.readyState === WebSocket.OPEN) {
      return existing.ws;
    }
    // ② 有残留（CLOSING / CONNECTING / 半死状态）→ 先清理再重开
    if (existing) {
      this.destroyChannel(key);
    }

    const state: ChannelState = {
      ws: null,
      model: null,
      config: { maxRetries: 3, retryDelay: 3000, ...config },
      retryCount: 0,
      reconnectTimer: null,
      manuallyClosed: false,
    };
    this.channels.set(key, state);
    this.openChannel(key, state);
    return state.ws;
  }

  /** 查询某通道当前是否处于连接状态 */
  isConnected(key: string): boolean {
    return this.channels.get(key)?.ws?.readyState === WebSocket.OPEN;
  }

  /** 关闭单个通道：关 ws + 清模型 + 清重连定时器 */
  destroyChannel(key: string): void {
    const state = this.channels.get(key);
    if (!state) return;
    this.teardown(state);
    this.channels.delete(key);
  }

  /** 关闭全部通道（组件卸载 / 退出全景时调用） */
  destroyAll(): void {
    this.channels.forEach((state) => this.teardown(state));
    this.channels.clear();
  }

  /* ---------------- 内部实现 ---------------- */

  private openChannel(key: string, state: ChannelState): void {
    const viewer = this.getViewer();
    if (!viewer) return;

    try {
      state.ws = new WebSocket(state.config.url);
    } catch (e) {
      console.error(`[WsManager] "${key}" 创建 WebSocket 失败:`, e);
      return;
    }
    const ws = state.ws;

    ws.onopen = () => {
      state.retryCount = 0; // 连接成功后重置重试计数
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        if (!Array.isArray(data)) return;
        // 懒创建：第一条有效数据到达时才实例化模型
        if (!state.model) {
          state.model = state.config.createModel(viewer);
        }
        state.model.update(data);
      } catch (e) {
        console.error(`[WsManager] "${key}" 消息解析失败:`, e);
      }
    };

    ws.onerror = () => {
      console.warn(`[WsManager] "${key}" 连接发生错误`);
    };

    ws.onclose = () => {
      if (state.manuallyClosed) return; // 主动关闭不重连
      this.scheduleReconnect(key, state);
    };
  }

  private scheduleReconnect(key: string, state: ChannelState): void {
    const { maxRetries, retryDelay } = state.config;
    if (state.retryCount >= maxRetries!) {
      console.warn(`[WsManager] "${key}" 重试 ${maxRetries} 次仍失败，停止重连`);
      return;
    }
    state.retryCount++;
    state.reconnectTimer = setTimeout(() => {
      // 二次确认：等待期间可能已被 destroy / destroyAll
      if (state.manuallyClosed || !this.channels.has(key)) return;
      console.info(`[WsManager] "${key}" 第 ${state.retryCount} 次重连...`);
      this.openChannel(key, state);
    }, retryDelay);
  }

  /** 真正的清理动作（不删注册表条目，供 destroy 复用） */
  private teardown(state: ChannelState): void {
    state.manuallyClosed = true;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.close();
      } catch { /* 忽略关闭异常 */ }
      state.ws = null;
    }
    try {
      state.model?.removeAll(); // 同步移除场景中该通道产生的所有模型
    } catch (e) {
      console.warn("[WsManager] 模型清理失败:", e);
    }
    state.model = null;
  }
}
