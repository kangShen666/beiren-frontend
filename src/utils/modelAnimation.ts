import * as Cesium from "cesium";

// 定义模型配置的类型，根据你原有的代码结构提取
export interface ModelConfig {
  id: number;
  height?: number;
  uri: string;
  scale?: number;
  modelx: number;
  modely: number;
}

// 定义默认位置类型
export interface ModelPosition {
  longitude: number;
  latitude: number;
  height: number;
}

/**
 * 核心动效方法：平滑过渡模型高度
 */
const animateEntityHeight = (
  viewer: Cesium.Viewer,
  entity: Cesium.Entity,
  startHeight: number,
  endHeight: number,
  duration: number,
  lon: number,
  lat: number,
  onComplete?: () => void
) => {
  if (!viewer || !entity) return;

  // 如果存在未完成的动画，先取消
  if ((entity as any)._animFrameId) {
    cancelAnimationFrame((entity as any)._animFrameId);
    (entity as any)._animFrameId = null;
  }

  const startTime = performance.now();

  const step = (currentTime: number) => {
    // 如果实体已经被移除，停止动画
    if (!viewer.entities.contains(entity)) {
      (entity as any)._animFrameId = null;
      return;
    }

    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);
    // 缓动函数：easeOutCubic，让动画有先快后慢的自然效果
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    // 计算当前高度并更新位置
    const currentHeight = startHeight + (endHeight - startHeight) * easedProgress;
    entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, currentHeight);

    if (progress < 1) {
      // 继续下一帧
      (entity as any)._animFrameId = requestAnimationFrame(step);
    } else {
      // 动画完成
      (entity as any)._animFrameId = null;
      if (onComplete && typeof onComplete === "function") {
        onComplete();
      }
    }
  };

  (entity as any)._animFrameId = requestAnimationFrame(step);
};

/**
 * 创建模型动画控制器的工厂函数
 * @param viewer Cesium Viewer 实例
 * @param modelConfigs 模型配置数组
 * @param loadedModels 当前已加载的模型字典对象
 * @param defaultPosition 默认位置配置
 */
export const createModelAnimator = (
  viewer: Cesium.Viewer,
  modelConfigs: ModelConfig[],
  loadedModels: Record<number, Cesium.Entity>,
  defaultPosition: ModelPosition
) => {
  return {
    /**
     * 带动画效果的加载模型（从高处缓慢降落到现有位置）
     */
    loadModelWithAnimation: (
      modelId: number,
      options?: { dropHeight?: number; duration?: number }
    ) => {
      const { dropHeight = 50, duration = 1500 } = options || {};

      // 如果模型已经存在（可能正处于移除动画中）
      if (loadedModels[modelId]) {
        const entity = loadedModels[modelId];
        const cartesian = entity.position?.getValue(Cesium.JulianDate.now());
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const currentHeight = carto.height;
          const modelConfig = modelConfigs.find((c) => c.id === modelId);
          const targetH = modelConfig?.height ?? defaultPosition.height;
          const lon = modelConfig?.modelx ?? defaultPosition.longitude;
          const lat = modelConfig?.modely ?? defaultPosition.latitude;

          // 中断上升动画，执行降落
          animateEntityHeight(
            viewer,
            entity,
            currentHeight,
            targetH,
            duration,
            lon,
            lat
          );
        }
        return;
      }

      // 正常加载流程
      const modelConfig = modelConfigs.find((config) => config.id === modelId);
      if (!modelConfig) {
        console.warn(`未找到 ID 为 ${modelId} 的模型配置。`);
        return;
      }

      const heading = Cesium.Math.toRadians(65);
      const pitch = Cesium.Math.toRadians(50);
      const roll = Cesium.Math.toRadians(1);
      const orientation = Cesium.Quaternion.fromHeadingPitchRoll(
        new Cesium.HeadingPitchRoll(heading, pitch, roll)
      );

      const baseHeight = modelConfig.height ?? defaultPosition.height;
      const startHeight = baseHeight + dropHeight; // 从高处开始
      const lon = modelConfig.modelx || defaultPosition.longitude;
      const lat = modelConfig.modely || defaultPosition.latitude;

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, startHeight),
        model: {
          uri: modelConfig.uri,
          scale: modelConfig.scale,
          silhouetteSize: 1,
          shadows: Cesium.ShadowMode.ENABLED,
        },
        orientation: new Cesium.ConstantProperty(orientation),
        properties: { modelId: modelId },
      });

      loadedModels[modelId] = entity;

      // 执行降落动画
      animateEntityHeight(
        viewer,
        entity,
        startHeight,
        baseHeight,
        duration,
        lon,
        lat,
        () => {
          console.log(`模型 ID ${modelId} 降落动画完成`);
        }
      );
    },

    /**
     * 带动画效果的移除模型（从现有位置缓慢升高然后移除）
     */
    removeModelWithAnimation: (
      modelId: number,
      options?: { raiseHeight?: number; duration?: number }
    ) => {
      const { raiseHeight = 50, duration = 1500 } = options || {};
      const entity = loadedModels[modelId];

      if (!entity) {
        console.warn(`无法动画移除模型 ID ${modelId}，因为它未被加载。`);
        return;
      }

      const cartesian = entity.position?.getValue(Cesium.JulianDate.now());
      if (!cartesian) {
        viewer.entities.remove(entity);
        delete loadedModels[modelId];
        return;
      }

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const currentHeight = carto.height;
      const targetHeight = currentHeight + raiseHeight; // 升高后的目标高度

      const modelConfig = modelConfigs.find((c) => c.id === modelId);
      const lon = modelConfig?.modelx ?? defaultPosition.longitude;
      const lat = modelConfig?.modely ?? defaultPosition.latitude;

      // 执行升空动画，完成后移除实体
      animateEntityHeight(
        viewer,
        entity,
        currentHeight,
        targetHeight,
        duration,
        lon,
        lat,
        () => {
          // 确保动画期间没有被其他逻辑提前销毁
          if (viewer.entities.contains(entity)) {
            viewer.entities.remove(entity);
            delete loadedModels[modelId];
            console.log(`模型 ID ${modelId} 升空后已移除`);
          }
        }
      );
    },
  };
};
