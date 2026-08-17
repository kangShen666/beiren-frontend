import * as Cesium from "cesium";

interface SelectFeature {
  feature: Cesium.Entity | null;
  originColor: Cesium.Color | null;
  type: string;
}

interface PointCoordinate {
  lon: number;
  lat: number;
  height: number;
}

function click_draw_polygon(
  viewer: Cesium.Viewer,
  polygonStore: any,
  emits: (event: string) => void,
  options: {
    enableModelPicking?: boolean;
    pickDepth?: number;
    debugMode?: boolean;
  } = {}
) {
  //自定义裁剪区域
  // 启用深度测试，确保裁剪效果正确
  viewer.scene.globe.depthTestAgainstTerrain = true;

  // 初始化裁剪平面集合
  let clippingPlanes = new Cesium.ClippingPlaneCollection({
    planes: [],
    edgeWidth: 2.0,
    edgeColor: Cesium.Color.WHITE,
    unionClippingRegions: false,
    enabled: false, // 初始状态下裁剪平面不启用
  });
  // 应用裁剪平面到地形
  viewer.scene.globe.clippingPlanes = clippingPlanes;
  // 初始化裁剪区域经纬度数组
  let clippingAreaCoordinates = [];
  let isClippingActive = false;
  let clippingPolygon;

  // 裁剪按钮
  const clippingButton = document.getElementById("clippingButton");
  clippingButton.addEventListener("click", function () {
    if (isClippingActive) {
      isClippingActive = false;
      clippingButton.textContent = "开始裁剪";
      // 创建裁剪区域
      toggleClippingButton.disabled = false;
    } else {
      isClippingActive = true;
      clippingButton.textContent = "保存位置";
      clippingAreaCoordinates = []; // 清空之前的坐标
      toggleClippingButton.disabled = true;
    }
  });
  // 切换裁剪显示按钮
  const toggleClippingButton = document.getElementById("toggleClipping");
  toggleClippingButton.addEventListener("click", function () {
    clippingPlanes.enabled = !clippingPlanes.enabled;
    // toggleClippingButton.textContent = clippingPlanes.enabled ? '隐藏裁剪区域' : '显示裁剪区域';

    if (clippingPlanes.enabled) {
      toggleClippingButton.textContent = "隐藏区域";
      createClippingArea();
      // 禁用"开始裁剪"按钮
      clippingButton.disabled = true;
    } else {
      toggleClippingButton.textContent = "显示区域";
      // 隐藏或移除裁剪区域多边形
      if (clippingPolygon) {
        viewer.entities.remove(clippingPolygon);
        clippingPolygon = null;
      }
      // 启用"开始裁剪"按钮
      clippingButton.disabled = false;
    }
  });

  // 监听鼠标点击事件
  viewer.screenSpaceEventHandler.setInputAction(function (movement) {
    if (!isClippingActive) return;

    try {
      const ray = viewer.camera.getPickRay(movement.position);
      const position = viewer.scene.globe.pick(ray, viewer.scene);

      if (!position) {
        console.warn(
          "No position picked at screen coordinates:",
          movement.position
        );
        return;
      }

      const cartographic = Cesium.Cartographic.fromCartesian(position);
      const longitude = Cesium.Math.toDegrees(cartographic.longitude);
      const latitude = Cesium.Math.toDegrees(cartographic.latitude);
      clippingAreaCoordinates.push([longitude, latitude]);
      console.log("裁剪区域经纬度:", clippingAreaCoordinates);
    } catch (error) {
      console.error("Error picking position:", error);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // 创建裁剪区域
  function createClippingArea() {
    if (clippingPolygon) {
      viewer.entities.remove(clippingPolygon);
    }

    // 将经纬度数组转换为Cesium的Cartesian3数组
    const positions = clippingAreaCoordinates.map((coord) =>
      Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
    );

    // 创建多边形实体
    clippingPolygon = viewer.entities.add({
      name: "Clipping Area",
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.BLACK.withAlpha(1),
        show: true,
      },
    });

    // 创建裁剪平面
    clippingPlanes.planes = [];
    clippingAreaCoordinates.forEach((coord, index) => {
      const position = Cesium.Cartesian3.fromDegrees(coord[0], coord[1]);
      const normal = new Cesium.Cartesian3(position.x, position.y, position.z);
      const plane = new Cesium.ClippingPlane(normal, 0);
      clippingPlanes.planes.push(plane);
    });
  }
}

export default click_draw_polygon;
