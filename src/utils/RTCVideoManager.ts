import * as Cesium from "cesium"

// 类型定义
interface VideoFusionConfig {
  id: string
  coordinates: number[][]
  streamUrl: string
  rotation?: number
  stRotation?: number
  opacity?: number
}

interface RTCVideoConnection {
  video: HTMLVideoElement
  webrtc: RTCPeerConnection
  dataChannel: RTCDataChannel
  interval?: NodeJS.Timeout | number
}

// 简化的RTC视频融合管理器
export class RTCVideoManager {
  private viewer: Cesium.Viewer
  private connections = new Map<string, RTCVideoConnection>()

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  // 创建单个视频融合
  async create(config: VideoFusionConfig): Promise<boolean> {
    try {
      const video = document.createElement("video")
      video.autoplay = true
      video.muted = true
      video.style.display = "none"
      document.body.appendChild(video)

      // 先创建WebRTC连接
      const connection = await this.createRTCConnection(
        video,
        config.streamUrl,
      )

      // 连接成功后才创建Cesium实体
      this.viewer.entities.add({
        id: config.id,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(config.coordinates.flat()),
          ),
          material: video,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          rotation: Cesium.Math.toRadians(config.rotation ?? -70),
          stRotation: Cesium.Math.toRadians(config.stRotation ?? 240),
        },
      } as any)

      // 保存连接信息 - 关键步骤
      this.connections.set(config.id, {
        video,
        webrtc: connection.webrtc,
        dataChannel: connection.dataChannel,
        interval: connection.interval,
      })

      return true
    }
    catch (error) {
      console.error(`❌ 创建 ${config.id} 失败:`, error)
      // 创建失败时清理已创建的元素
      const video = document.querySelector(
        `video[data-id="${config.id}"]`,
      ) as HTMLVideoElement
      if (video) {
        video.remove()
      }
      this.viewer.entities.removeById(config.id)
      return false
    }
  }

  // 创建 WebRTC 连接
  private createRTCConnection(
    video: HTMLVideoElement,
    url: string,
  ): Promise<{
      webrtc: RTCPeerConnection
      dataChannel: RTCDataChannel
      interval?: NodeJS.Timeout | number
    }> {
    return new Promise((resolve, reject) => {
      const webrtc: any = new RTCPeerConnection({
        sdpSemantics: "unified-plan",
      } as any)
      let webrtcSendChannel: RTCDataChannel
      let webrtcSendChannelInterval: NodeJS.Timeout | number | undefined

      webrtc.onnegotiationneeded = async () => {
        try {
          const offer = await webrtc.createOffer()
          await webrtc.setLocalDescription(offer)

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `data=${btoa(webrtc.localDescription!.sdp)}`,
          })

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const data = await response.text()
          await webrtc.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp: atob(data),
            }),
          )
        }
        catch (error) {
          console.error("协商失败:", error)
          reject(error)
        }
      }

      webrtc.ontrack = (event: RTCTrackEvent) => {
        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0]
          video
            .play()
            .then(() => {
              resolve({
                webrtc,
                dataChannel: webrtcSendChannel,
                interval: webrtcSendChannelInterval,
              })
            })
            .catch(reject)
        }
      }

      webrtc.onconnectionstatechange = () => {}

      webrtc.addTransceiver("video", { direction: "sendrecv" })
      webrtcSendChannel = webrtc.createDataChannel("foo")

      webrtcSendChannel.onopen = () => {
        webrtcSendChannel.send("ping")
        webrtcSendChannelInterval = setInterval(() => {
          if (webrtcSendChannel.readyState === "open") {
            webrtcSendChannel.send("ping")
          }
        }, 1000)
      }

      webrtcSendChannel.onclose = () => {
        if (webrtcSendChannelInterval) {
          clearInterval(webrtcSendChannelInterval as number)
        }
      }

      // 15秒超时
      const timeout = setTimeout(() => {
        console.log("WebRTC连接超时")
        reject(new Error("连接超时"))
      }, 15000)

      // 成功时清除超时
      const originalResolve = resolve
      resolve = (value) => {
        clearTimeout(timeout)
        originalResolve(value)
      }
    })
  }

  // 批量创建
  async createMultiple(configs: VideoFusionConfig[]): Promise<void> {
    const results = await Promise.allSettled(
      configs.map(config => this.create(config)),
    )

    const successCount = results.filter(
      result => result.status === "fulfilled" && result.value === true,
    ).length

    if (successCount > 0) {
      this.viewer.zoomTo(this.viewer.entities)
    }
  }

  // 清理所有视频融合和WebRTC连接
  clear(): void {
    if (this.connections.size === 0) {
      // 备用清理：尝试清理所有可能的视频元素和实体
      this.emergencyCleanup()
      return
    }

    let cleanedCount = 0

    this.connections.forEach((connection, id) => {
      try {
        // 1. 清理定时器
        if (connection.interval) {
          clearInterval(connection.interval as number)
        }

        // 2. 关闭数据通道
        if (connection.dataChannel) {
          if (connection.dataChannel.readyState === "open") {
            connection.dataChannel.close()
          }
        }

        // 3. 停止所有视频轨道
        if (connection.video.srcObject) {
          const stream = connection.video.srcObject as MediaStream
          stream.getTracks().forEach((track) => {
            track.stop()
          })
          connection.video.srcObject = null
        }

        // 4. 移除视频元素
        connection.video.pause()
        if (connection.video.parentNode) {
          connection.video.remove()
        }

        // 5. 关闭 WebRTC 连接
        if (
          connection.webrtc
          && connection.webrtc.connectionState !== "closed"
        ) {
          connection.webrtc.close()
        }

        // 6. 移除 Cesium 实体
        if (this.viewer.entities.getById(id)) {
          this.viewer.entities.removeById(id)
        }

        cleanedCount++
      }
      catch (error) {
        console.error(`❌ 清理 ${id} 时出错:`, error)
      }
    })

    // 清空所有连接
    this.connections.clear()
    console.log(`🎉 清理完成！成功清理 ${cleanedCount} 个连接`)
  }

  // 紧急清理 - 当connections为空但可能还有残留资源时
  private emergencyCleanup(): void {
    console.log("🚨 执行紧急清理...")

    // 清理所有video元素
    const videos = document.querySelectorAll('video[style*="display: none"]')
    videos.forEach((video) => {
      const videoElement = video as HTMLVideoElement
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
      }
      videoElement.remove()
    })

    // 清理所有Cesium实体
    this.viewer.entities.values.length
    this.viewer.entities.removeAll()
  }

  // 获取当前连接数量
  getConnectionCount(): number {
    return this.connections.size
  }

  // 列出所有连接ID
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys())
  }
}

// Vue组件中的使用
export const useRTCVideo = (viewer: Cesium.Viewer) => {
  const manager = new RTCVideoManager(viewer)

  const createVideoFusion = (configs: VideoFusionConfig[]) => {
    return manager.createMultiple(configs)
  }

  const cleanup = () => {
    manager.clear()
  }

  return {
    createVideoFusion,
    cleanup,
    getConnectionCount: () => manager.getConnectionCount(),
    getConnectionIds: () => manager.getConnectionIds(),
  }
}
