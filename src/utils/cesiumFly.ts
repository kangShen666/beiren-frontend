import { useViewportStore } from '@/stores/module/viewportStore';
import * as Cesium from "cesium";

// 视口类型枚举
type ViewportType = 'big' | 'small' | 'san' | 'middle' | 'center';

// 飞行参数接口
interface FlyToConfig {
  destination: { x: number; y: number; z: number };
  orientation: {
    heading: number;
    pitch: number;
    roll?: number;
  };
  duration?: number;
  maximumHeight?: number;
}

// 视口值 → 视口类型 映射表
const VIEWPORT_TYPE_MAP: Record<string, ViewportType> = {
  'true': 'big',
  'false': 'small',
  '1': 'san',
  '3': 'middle',
  '4': 'center',
};

/**
 * 飞行配置字典
 * 维护方式：只需在这里新增/修改对应点位的配置即可
 */
const FLY_CONFIGS: Record<string, Partial<Record<ViewportType, FlyToConfig>>> = {
  xuting: {
    big:   { destination: { x: -2191871.9873331613, y: 4391858.154635156, z: 4059189.7051673406 }, orientation: { pitch: -0.13210296444420178, heading: 3.978323984439869, roll: 0.0 } },
    small: { destination: { x: -2191874.9881703043, y: 4391857.545383535, z: 4059191.676812438 }, orientation: { pitch: -0.2736152758198662, heading: 4.174016118084943, roll: 0.0 } },
    san:   { destination: { x: -2191871.9873331613, y: 4391858.154635156, z: 4059189.7051673406 }, orientation: { pitch: -0.13210296444420178, heading: 3.978323984439869, roll: 0.0 } },
  },
  xutingyilou: {
    big:   { destination: { x: -2191865.7060670736, y: 4391857.067578937, z: 4059182.294626689 }, orientation: { pitch: -0.10211924908560444, heading: 3.833160953474144, roll: 0.0 } },
    small: { destination: { x: -2191865.560423731, y: 4391856.574464647, z: 4059180.894753303 }, orientation: { pitch: -0.26680060602608213, heading: 4.163045401688904, roll: 0.0 } },
  },
  dengluting: {
    big:   { destination: { x: -2191819.066044863, y: 4392023.5225752685, z: 4059225.523272099 }, orientation: { pitch: -0.7877577338289514, heading: 4.122138675496304, roll: 0.0 } },
    san:   { destination: { x: -2191831.7328243772, y: 4392021.584229738, z: 4059215.75077741 }, orientation: { pitch: -0.7539006977946783, heading: 4.101402316782472, roll: 0.0 } },
    small: { destination: { x: -2191756.324081106, y: 4392022.14576318, z: 4059146.416615525 }, orientation: { pitch: -0.8310856602008414, heading: 4.128616957963097, roll: 0.0 } },
  },
  dating: {
    big:   { destination: { x: -2191722.273334163, y: 4392068.477296571, z: 4059228.583873463 }, orientation: { pitch: -1.4039139847524233, heading: 4.1189770972257005, roll: 0.0 } },
    small: { destination: { x: -2191675.234808641, y: 4391999.656825012, z: 4059189.241195805 }, orientation: { pitch: -1.011953179722982, heading: 4.141188101470657, roll: 0.0 } },
  },
  shengtailianlang: {
    big:   { destination: { x: -2191609.563920239, y: 4391954.019581999, z: 4059211.800107714 }, orientation: { pitch: -0.05223811043976556, heading: 2.4547294631336065, roll: 0.0 } },
    small: { destination: { x: -2191626.3409828995, y: 4391958.258608755, z: 4059199.5447252337 }, orientation: { pitch: -0.22259103150468995, heading: 2.621236359497433, roll: 0.0 } },
  },
  Aguannei: {
    big:   { destination: { x: -2191754.929845766, y: 4392044.597399739, z: 4059402.27628674 }, orientation: { pitch: -0.9551560669703392, heading: 2.566767868210063, roll: 0.0 } },
    small: { destination: { x: -2191773.382724459, y: 4391979.36304998, z: 4059279.1015899694 }, orientation: { pitch: -0.9551560644871291, heading: 2.566767870484196, roll: 0.0 } },
    san:   { destination: { x: -2191769.3017378477, y: 4392004.948745722, z: 4059350.458073908 }, orientation: { pitch: -0.9860474659524856, heading: 2.586916626704422, roll: 0.0 } },
  },
  Bguannei: {
    big:   { destination: { x: -2191703.95308627, y: 4391979.8399913525, z: 4059385.312306449 }, orientation: { pitch: -0.9421037514174815, heading: 2.5587037346329247, roll: 0.0 } },
    small: { destination: { x: -2191724.2570063905, y: 4391959.080766884, z: 4059328.6006266926 }, orientation: { pitch: -1.019332521800579, heading: 2.570815595457847, roll: 0.0 } },
    san:   { destination: { x: -2191702.2003192166, y: 4391997.539540619, z: 4059394.7037824634 }, orientation: { pitch: -0.9860474754515951, heading: 2.586916617814014, roll: 0.0 } },
  },
  Cguannei: {
    big:   { destination: { x: -2191673.5525984466, y: 4391977.860945423, z: 4059430.808706615 }, orientation: { pitch: -1.3309745439037828, heading: 2.585703823802162, roll: 0.0 } },
    small: { destination: { x: -2191673.5525984466, y: 4391977.860945423, z: 4059430.808706615 }, orientation: { pitch: -1.3309745439037828, heading: 2.585703823802162, roll: 0.0 } },
    san:   { destination: { x: -2191784.176437815, y: 4392200.335311995, z: 4059667.1954730963 }, orientation: { pitch: -1.4401477077800346, heading: 2.55638663197383, roll: 0.0 } },
  },
  ABlianlang: {
    small: { destination: { x: -2191824.0634073704, y: 4391835.782166819, z: 4059237.6056591473 }, orientation: { pitch: -0.2528161816516681, heading: 4.119397549186182, roll: 0.0 } },
  },
  beihui: {
    big:   { destination: { x: -2191526.567577822, y: 4392091.659490352, z: 4059237.1305910945 }, orientation: { pitch: -0.6986306560699496, heading: 1.029713186672386, roll: 0.0 }, duration: 3 },
    small: { destination: { x: -2191526.567577822, y: 4392091.659490352, z: 4059237.1305910945 }, orientation: { pitch: -0.6986306560699496, heading: 1.029713186672386, roll: 0.0 }, duration: 3 },
  },
  waiwei: {
    big:   { destination: { x: -2192071.5345584922, y: 4391848.491066969, z: 4059190.7394617787 }, orientation: { pitch: -0.3018831365594834, heading: 4.891699137455037, roll: 0.0 } },
    small: { destination: { x: -2192059.038351901, y: 4391877.505759474, z: 4059208.1273751687 }, orientation: { pitch: -0.43476565828639746, heading: 4.961726147018309, roll: 0.0 } },
  },
  Qguannei: {
    big:   { destination: { x: -2191636.5104259043, y: 4392560.046771221, z: 4058821.997722278 }, orientation: { pitch: -0.24936876418225218, heading: 0.3816129574690388, roll: 0 }, duration: 3 },
    small: { destination: { x: -2191696.636244873, y: 4392209.281509875, z: 4058994.2914847224 }, orientation: { pitch: -0.24936875863887709, heading: 0.3816129569025355, roll: 0.0 } },
    san:   { destination: { x: -2191682.4608273576, y: 4392443.805805932, z: 4058867.8177311732 }, orientation: { pitch: -0.2364970179878283, heading: 0.3922481473302266, roll: 0 }, duration: 3 },
  },
  ximian: {
    big:    { destination: { x: -2191504.645466858, y: 4392277.609431442, z: 4059124.6065828544 }, orientation: { pitch: -0.3602316488728903, heading: 0.9903128512517148, roll: 0.0 } },
    middle: { destination: { x: -2191278.303675688, y: 4392812.229852682, z: 4059046.6684551355 }, orientation: { pitch: -0.3602316656650504, heading: 0.9903128608956218, roll: 0.0 } },
    center: { destination: { x: -2191429.2318405136, y: 4392402.677917658, z: 4059057.0870158547 }, orientation: { pitch: -0.25977283196887346, heading: 0.9282659528178412, roll: 0.0 } },
  },
  nanmian: {
    big:    { destination: { x: -2191980.717291153, y: 4392073.91878765, z: 4059030.1045064195 }, orientation: { pitch: -0.3427254793876944, heading: 5.739680860526109, roll: 0.0 } },
    middle: { destination: { x: -2192368.586490291, y: 4392286.581656654, z: 4058850.4721331527 }, orientation: { pitch: -0.28609261202493097, heading: 5.729919095424682, roll: 0.0 } },
    center: { destination: { x: -2192163.523579332, y: 4392180.858116286, z: 4058982.7348784995 }, orientation: { pitch: -0.36331991629482285, heading: 5.696281913720732, roll: 0.0 } },
  },
  dongmian: {
    big:    { destination: { x: -2191963.218424804, y: 4391743.878426999, z: 4059427.959953717 }, orientation: { pitch: -0.3718993524373517, heading: 4.155138807719275, roll: 0.0 } },
    middle: { destination: { x: -2192239.719333582, y: 4391595.066665006, z: 4059748.415913824 }, orientation: { pitch: -0.37189936147065494, heading: 4.15513881337373, roll: 0.0 } },
    center: { destination: { x: -2192052.741121822, y: 4391686.46812191, z: 4059548.083350213 }, orientation: { pitch: -0.3667508269403976, heading: 4.111676304063763, roll: 0.0 } },
  },
  shangmian: {
    big:    { destination: { x: -2191936.278289121, y: 4392393.403596916, z: 4059667.471697014 }, orientation: { pitch: -1.5618061318015073, heading: 0.9919419658575439, roll: 0.0 } },
    middle: { destination: { x: -2192124.014526871, y: 4393363.1629918935, z: 4060182.492908292 }, orientation: { pitch: -1.3814758036472923, heading: 0.9814547467032746, roll: 0.0 } },
    center: { destination: { x: -2192036.5583549114, y: 4392733.370418103, z: 4060084.578781242 }, orientation: { pitch: -1.5618061318015193, heading: 0.9919419658575537, roll: 0.0 } },
  },
  // 后续新增点位继续在这里追加 ...
};

/**
 * 组合式函数：创建并返回绑定当前组件上下文的飞行方法
 * @param getViewer 获取 viewer 实例的函数 (由于 viewer 在 onMounted 才初始化，所以传入函数)
 */
export function useCameraFly(getViewer: () => Cesium.Viewer | undefined) {
  const viewportStore = useViewportStore();

  // 获取当前视口类型
  const getViewportType = (): ViewportType => {
    const key = String(viewportStore.isSpecialViewport);
    return VIEWPORT_TYPE_MAP[key] ?? 'small';
  };

  /**
   * 通用飞行方法
   * @param viewKey  飞行ID（对应 FLY_CONFIGS 的 key）
   * @param duration 可选，覆盖配置中的 duration
   * @returns true=飞行成功，false=未找到配置
   */
  const flyToView = (viewKey: string, duration?: number): boolean => {
    const viewer = getViewer();
    if (!viewer) {
      console.warn('[flyToView] viewer 未初始化');
      return false;
    }

    const viewportType = getViewportType();
    const cfgGroup = FLY_CONFIGS[viewKey];
    if (!cfgGroup) {
      console.warn(`[flyToView] 未找到飞行ID "${viewKey}" 的配置`);
      return false;
    }

    // 优先取当前视口配置，没有则降级到 small 兜底
    let cfg: FlyToConfig | undefined = cfgGroup[viewportType];
    if (!cfg) {
      cfg = cfgGroup['small'];
      if (cfg) {
        console.warn(`[flyToView] ${viewKey} 在视口 ${viewportType} 下无配置，已降级使用 small 配置`);
      }
    }
    if (!cfg) {
      console.error(`[flyToView] ${viewKey} 无任何可用配置`);
      return false;
    }

    viewer.camera.flyTo({
      destination: new Cesium.Cartesian3(
        cfg.destination.x,
        cfg.destination.y,
        cfg.destination.z,
      ),
      orientation: {
        heading: cfg.orientation.heading,
        pitch:   cfg.orientation.pitch,
        roll:    cfg.orientation.roll ?? 0,
      },
      duration:      duration ?? cfg.duration ?? 3,
      maximumHeight: cfg.maximumHeight,
    });
    return true;
  };

  return { flyToView };
}
