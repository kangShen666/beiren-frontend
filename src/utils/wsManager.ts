/**
 * wsManager.ts —— Cesium 场景动态目标 WebSocket 统一管理器（增强版）
 *
 * 相比旧版新增：
 * 1. 消息节流合并（throttleMs）：高频通道的连续全量帧按 id 合并成「最新快照」，
 *    每个窗口只喂给模型层一次，从源头降低 update 频率与 CPU/内存开销。
 * 2. createModel 注入 channelKey：模型层用 `${key}:${id}` 做实体命名空间，
 *    避免多通道共用 viewer.entities 时的 id 冲突与互相误删。
 * 3. teardown 同时清理 flushTimer / buffer，杜绝定时器泄漏。
 * 4. applyUpdate 包 try/catch：模型层异常不再影响 ws 生命周期。
 */
import type * as Cesium from "cesium"

/** 模型实例的最小接口约定 */
export interface ISceneModelInstance {
  update: (data: any[]) => void
  removeAll: () => void
}

/** 模型工厂：注入 viewer 与通道 key（用于实体 id 命名空间，防止跨通道冲突） */
export type ModelFactory = (
  viewer: Cesium.Viewer,
  channelKey: string
) => ISceneModelInstance

/** 单个通道的配置 */
export interface WsChannelConfig {
  url: string
  createModel: ModelFactory
  /** 消息合并窗口（ms）。0=逐条透传；高频通道建议 200~500 */
  throttleMs?: number
  /** 断线最大重连次数，默认 3 */
  maxRetries?: number
  /** 重连间隔（毫秒），默认 3000 */
  retryDelay?: number
}

interface ChannelState {
  ws: WebSocket | null
  model: ISceneModelInstance | null
  config: Required<
    Pick<WsChannelConfig, "url" | "throttleMs" | "maxRetries" | "retryDelay">
  > &
  WsChannelConfig
  retryCount: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  manuallyClosed: boolean
  /** 合并缓冲：id -> 最新一帧目标数据 */
  buffer: Map<PropertyKey, any>
  flushTimer: ReturnType<typeof setTimeout> | null
}

export class WsManager {
  /** 通道注册表：key → 连接状态 */
  private channels = new Map<string, ChannelState>()

  constructor(private getViewer: () => Cesium.Viewer | undefined) {}

  /* ---------------- 对外 API ---------------- */

  /** 连接指定通道（幂等）：已连接复用；有残留先销毁再重开 */
  connect(key: string, config: WsChannelConfig): WebSocket | null {
    const viewer = this.getViewer()
    if (!viewer) {
      console.warn(`[WsManager] viewer 未初始化，无法连接通道 "${key}"`)
      return null
    }
    const existing = this.channels.get(key)
    if (existing?.ws && existing.ws.readyState === WebSocket.OPEN) {
      return existing.ws
    }
    if (existing) { this.destroyChannel(key) }

    const state: ChannelState = {
      ws: null,
      model: null,
      config: { throttleMs: 300, maxRetries: 3, retryDelay: 3000, ...config },
      retryCount: 0,
      reconnectTimer: null,
      manuallyClosed: false,
      buffer: new Map(),
      flushTimer: null,
    }
    this.channels.set(key, state)
    this.openChannel(key, state)
    return state.ws
  }

  isConnected(key: string): boolean {
    return this.channels.get(key)?.ws?.readyState === WebSocket.OPEN
  }

  destroyChannel(key: string): void {
    const state = this.channels.get(key)
    if (!state) { return }
    this.teardown(state)
    this.channels.delete(key)
  }

  destroyAll(): void {
    this.channels.forEach(state => this.teardown(state))
    this.channels.clear()
  }

  /* ---------------- 内部实现 ---------------- */

  private openChannel(key: string, state: ChannelState): void {
    const viewer = this.getViewer()
    if (!viewer) { return }
    try {
      state.ws = new WebSocket(state.config.url)
    }
    catch (e) {
      console.error(`[WsManager] "${key}" 创建 WebSocket 失败:`, e)
      return
    }
    const ws = state.ws

    ws.onopen = () => {
      state.retryCount = 0
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string)
        if (!Array.isArray(data)) { return }
        if (state.config.throttleMs > 0) {
          this.bufferMessage(key, state, viewer, data)
        }
        else {
          this.applyUpdate(key, state, viewer, data)
        }
      }
      catch (e) {
        console.error(`[WsManager] "${key}" 消息解析失败:`, e)
      }
    }

    ws.onerror = () => {
      console.warn(`[WsManager] "${key}" 连接发生错误`)
    }

    ws.onclose = () => {
      if (state.manuallyClosed) { return }
      this.scheduleReconnect(key, state)
    }
  }

  /** 高频消息合并：同 id 后到覆盖先到，窗口到期统一刷新（空帧不会产生 update） */
  private bufferMessage(
    key: string,
    state: ChannelState,
    viewer: Cesium.Viewer,
    data: any[],
  ): void {
    for (let i = 0; i < data.length; i++) {
      const item = data[i]
      if (item && item.id !== undefined && item.id !== null) {
        state.buffer.set(item.id, item)
      }
    }
    if (state.flushTimer === null) {
      state.flushTimer = setTimeout(() => {
        state.flushTimer = null
        this.flush(key, state, viewer)
      }, state.config.throttleMs)
    }
  }

  private flush(
    key: string,
    state: ChannelState,
    viewer: Cesium.Viewer,
  ): void {
    if (state.buffer.size === 0) { return } // 空帧（无有效目标）直接忽略
    const snapshot = Array.from(state.buffer.values())
    state.buffer.clear()
    this.applyUpdate(key, state, viewer, snapshot)
  }

  private applyUpdate(
    key: string,
    state: ChannelState,
    viewer: Cesium.Viewer,
    data: any[],
  ): void {
    try {
      // 懒创建：第一条有效数据时实例化；channelKey 传入模型层做实体命名空间
      if (!state.model) {
        state.model = state.config.createModel(viewer, key)
      }
      state.model.update(data)
    }
    catch (e) {
      console.error(`[WsManager] "${key}" 模型更新异常:`, e)
    }
  }

  private scheduleReconnect(key: string, state: ChannelState): void {
    const { maxRetries, retryDelay } = state.config
    if (state.retryCount >= maxRetries) {
      console.warn(`[WsManager] "${key}" 重试 ${maxRetries} 次仍失败，停止重连`)
      return
    }
    state.retryCount++
    state.reconnectTimer = setTimeout(() => {
      // 二次确认：等待期间可能已被 destroy / destroyAll
      if (state.manuallyClosed || !this.channels.has(key)) { return }
      console.info(`[WsManager] "${key}" 第 ${state.retryCount} 次重连...`)
      this.openChannel(key, state)
    }, retryDelay)
  }

  private teardown(state: ChannelState): void {
    state.manuallyClosed = true
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    if (state.flushTimer) {
      clearTimeout(state.flushTimer)
      state.flushTimer = null
    }
    state.buffer.clear()
    if (state.ws) {
      try {
        state.ws.close()
      }
      catch {
        /* 忽略关闭异常 */
      }
      state.ws = null
    }
    try {
      state.model?.removeAll()
    }
    catch (e) {
      console.warn("[WsManager] 模型清理失败:", e)
    }
    state.model = null
  }
}
