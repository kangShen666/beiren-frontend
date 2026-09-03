<script setup lang="ts">
import ModelCol from "@/assets/js/modelColCar.js";
import ModelColCarbaogao from "@/assets/js/ModelColCarbaogao.js";
import ModelColCarxuting from "@/assets/js/ModelColCarxuting.js";
import ModelColQiao from "@/assets/js/ModelColQiao.js";
import { useViewportStore } from '@/stores/module/viewportStore';
import type { HotspotEntity, TreePoint } from "@/type/vMap";
import { useCameraFly } from '@/utils/cesiumFly'; //引入飞行
import { CruiseController, REGION_META, SCENE_FLY_ONLY_CONFIG, SCENE_MODEL_TO_CRUISE_ID } from '@/utils/cruiseFly'; //巡航
import { createModelAnimator } from "@/utils/modelAnimation.ts"; //模型动画
import axios from "axios";
import * as Cesium from "cesium";
import { defineEmits, onMounted, onUnmounted, ref } from "vue";
// ============ WebSocket 统一管理（新增） ============
import { WsManager, type WsChannelConfig } from "@/utils/wsManager";
// 引入底图
import videoFrameUrl from "@/assets/img/video.png";
// 获取状态
const viewportStore = useViewportStore();
// 初始化飞行控制器，传入获取 viewer 的方法
const { flyToView } = useCameraFly(() => viewer);
const isSpecialViewport = computed(() => viewportStore.isSpecialViewport);

// 子传父
const emits = defineEmits([
  "playVideoFusion",
  "pointName",
  "close-video",
  "flytotingzhi",
  "cruiseRegion",
  "cruiseStart",
  "cruiseFinished"
]);

const wsManager = new WsManager(() => viewer);

// 28 外围 、 27 生态 、 24 序厅 、 26 报告厅连廊
/** 场景动态目标 WebSocket 通道配置（url + 模型工厂，一处集中维护） */
const WS_CHANNEL_CONFIG: Record<string, WsChannelConfig> = {
  // 外围 r6
  radar: { url: "ws://172.160.114.20:8123", createModel: (v) => new ModelCol(v) },
  // 生态连廊、会客厅 r9、西广场 r13  q33
  qiao: { url: "ws://172.160.114.20:12327", createModel: (v) => new ModelColQiao(v) },
  // 报告厅 r10、AB连廊  q34
  baogao: { url: "ws://172.160.114.20:12323", createModel: (v) => new ModelColCarbaogao(v) },
  // 序厅一楼、二楼  q30 q31
  xuting: { url: "ws://172.160.114.20:12324", createModel: (v) => new ModelColCarxuting(v) },
};

// 四个业务入口退化为「一行配置调用」，对外 API 保持不变（父组件无需改动）
const getRadarDatarc = () => wsManager.connect("radar", WS_CHANNEL_CONFIG.radar);
const getshengtailianlang = () => wsManager.connect("qiao", WS_CHANNEL_CONFIG.qiao);
const getbaogaoting = () => wsManager.connect("baogao", WS_CHANNEL_CONFIG.baogao);
const getxuting = () => wsManager.connect("xuting", WS_CHANNEL_CONFIG.xuting);

const closeAllWebSockets = () => wsManager.destroyAll();

/* ---------- 巡航控制器 ---------- */
const cruiseCtl = new CruiseController(
  () => viewer,
  () => {
    const v = viewportStore.isSpecialViewport;
    return v === true ? "san"
      : v === 1 ? "big"
        : v === 3 ? "middle"
          : v === 4 ? "center"
            : "small";
  },
);

// 区域变化 → 上报父组件做高亮/tip；整条结束 → 上报父组件隐藏停止按钮
cruiseCtl.setCallbacks({
  onRegionChange: (key, name) => {
    emits("pointName", name);                      // 顶部 tip 文案
    emits("cruiseRegion", REGION_META[key].uiValue); // ✅ 之前漏发，导致高亮失效
  },
  onFinish: () => emits("cruiseFinished"),
});

const cruiseStart = (id: string) => cruiseCtl.start(id);
const cruisePause = () => cruiseCtl.pause();
const cruiseResume = () => cruiseCtl.resume();
const cruiseToggle = (): "running" | "paused" | null => cruiseCtl.toggle();
const cruiseStop = () => cruiseCtl.stop();

// 每个 r 点位需要伴随的全景动作（仅保留确实需要的）
const ridPanoramaAction: Record<string, string[]> = {
  r1: ["q1"], r2: ["q2"], r3: ["q7", "q5"], r4: ["q3", "q9"], r5: ["q6", "q4"],
  r7: ["q30"], r8: ["q31"], r11: ["q33"], r12: ["q32"],
  r14: ["q41"], r15: ["q42"], r16: ["q43"],
};

// 设置Cesium的静态资源路径
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

// 定义响应式引用
const cesiumContainer = ref<HTMLElement>();
let viewer: Cesium.Viewer;
// 全局变量来保存事件处理器
let clickHandler: Cesium.ScreenSpaceEventHandler | null = null;
// 初始化Cesium
let modelAnimator: ReturnType<typeof createModelAnimator> | null = null;

const bingMap1 = new Cesium.UrlTemplateImageryProvider({
  url: "http://172.160.114.20:8080/map/{z}/{x}/{y}.png",
  maximumLevel: 19,
  fileExtension: "png",
  enablePickFeatures: false,
} as any);

//创建箭头方法 参数 viewer，startLnt,startLat,endLnt,endLat
const createArrowLine = (
  viewer: any,
  id: any,
  startLnt: any,
  startLat: any,
  endLnt: any,
  endLat: any,
  width: any = 20,
  height: number = 0,
  color: Cesium.Color = Cesium.Color.BLUE,
) => {
  return viewer.entities.add({
    id: id,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights([
        // 起点和终点的经纬度及高度数组
        startLnt,
        startLat,
        height,
        endLnt,
        endLat,
        height,
      ]),
      width: width, // 线条宽度
      material: new Cesium.PolylineArrowMaterialProperty(color), // 箭头线材质
    },
  });
};

// 箭头数组
let arrowList = [
  { id: 'a1', startLnt: 116.52203704085817, startLat: 39.780542378197985, endLnt: 116.52214910735538, endLat: 39.78058891721192, color: Cesium.Color.GREEN },
  { id: 'a2', startLnt: 116.52206368731508, startLat: 39.78069262886435, endLnt: 116.52194412458348, endLat: 39.78064638890595, color: Cesium.Color.RED },
  { id: 'a3', startLnt: 116.52264862569028, startLat: 39.77863347823575, endLnt: 116.52271978688813, endLat: 39.77854975489632, color: Cesium.Color.GREEN },
  { id: 'a4', startLnt: 116.518679, startLat: 39.778910, endLnt: 116.518541, endLat: 39.778836, color: Cesium.Color.GREEN },
  { id: 'a5', startLnt: 116.519110, startLat: 39.778386, endLnt: 116.518979, endLat: 39.778319, color: Cesium.Color.GREEN },
  { id: 'a6', startLnt: 116.519020, startLat: 39.778287, endLnt: 116.519143, endLat: 39.778347, color: Cesium.Color.RED },
  { id: 'a7', startLnt: 116.52209633256813, startLat: 39.77826967173626, endLnt: 116.52205234106658, endLat: 39.778325823416495 },
  { id: 'a8', startLnt: 116.52118693233727, startLat: 39.77784171149632, endLnt: 116.52113900971192, endLat: 39.777898452955895 },
  { id: 'a9', startLnt: 116.519006, startLat: 39.780468, endLnt: 116.518922, endLat: 39.780565, height: 22, color: Cesium.Color.GREEN },
  { id: 'a10', startLnt: 116.519366, startLat: 39.780809, endLnt: 116.519463, endLat: 39.780698, height: 22 },
  //最外层箭头
  { id: 'a11', startLnt: 116.516958, startLat: 39.780566, endLnt: 116.517396, endLat: 39.780049, },
  { id: 'a12', startLnt: 116.518454, startLat: 39.778818, endLnt: 116.518762, endLat: 39.778461, },
  { id: 'a13', startLnt: 116.520748, startLat: 39.777501, endLnt: 116.520950, endLat: 39.777602 },
  { id: 'a14', startLnt: 116.522726, startLat: 39.778511, endLnt: 116.522991, endLat: 39.778648 },
  { id: 'a15', startLnt: 116.523353, startLat: 39.779640, endLnt: 116.522969, endLat: 39.780089 },
  { id: 'a16', startLnt: 116.522228, startLat: 39.781007, endLnt: 116.521902, endLat: 39.781394 },
  { id: 'a17', startLnt: 116.519957, startLat: 39.782632, endLnt: 116.519304, endLat: 39.782298 },
  { id: 'a18', startLnt: 116.518348, startLat: 39.781809, endLnt: 116.517699, endLat: 39.781474, },
  { id: 'a19', startLnt: 116.517552, startLat: 39.779944, endLnt: 116.517699, endLat: 39.779772, color: Cesium.Color.RED },
  { id: 'a20', startLnt: 116.518209, startLat: 39.779173, endLnt: 116.518358, endLat: 39.778998, color: Cesium.Color.RED },
  //入口线路箭头
  { id: 'a21', startLnt: 116.521816, startLat: 39.780780, endLnt: 116.521711, endLat: 39.780911, color: Cesium.Color.RED },
  { id: 'a23', startLnt: 116.521523, startLat: 39.781141, endLnt: 116.521469, endLat: 39.781109, color: Cesium.Color.RED },
  { id: 'a24', startLnt: 116.521340, startLat: 39.781720, endLnt: 116.521201, endLat: 39.781657, color: Cesium.Color.RED },
  { id: 'a25', startLnt: 116.51803624826384, startLat: 39.78124751456565, endLnt: 116.51808056179615, endLat: 39.7811805841536, color: Cesium.Color.RED },
  //左侧图片蓝箭头
  { id: 'a26', startLnt: 116.518793, startLat: 39.778539, endLnt: 116.518917, endLat: 39.778592, },

];
//创建虚线方法 参数 viewer，startLnt,startLat,endLnt,endLat
const createPolyLine = (
  viewer: any,
  id: any,
  startLnt: any,
  startLat: any,
  endLnt: any,
  endLat: any,
  width: number = 3,
  color: Cesium.Color = Cesium.Color.BLUE,
) => {
  return viewer.entities.add({
    id: id,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray([
        // 起点和终点的经纬度及高度数组
        startLnt,
        startLat,
        endLnt,
        endLat,
      ]),
      width: width, // 线条宽度
      material: new Cesium.PolylineDashMaterialProperty({
        color: color,
        dashLength: 20, //短划线长度
      }), // 箭头线材质
    },
  });
};
let polyList = [
  // 外框蓝色虚线（四条） 
  { id: 'p1', startLnt: 116.520543, startLat: 39.782997, endLnt: 116.523971, endLat: 39.779051, },
  { id: 'p2', startLnt: 116.523971, startLat: 39.779051, endLnt: 116.519944, endLat: 39.777012, },
  { id: 'p3', startLnt: 116.519944, startLat: 39.777012, endLnt: 116.516523, endLat: 39.780969, },
  { id: 'p4', startLnt: 116.516523, startLat: 39.780969, endLnt: 116.520543, endLat: 39.782997, },

  //红色虚线（1条）
  { id: 'p5', startLnt: 116.517038, startLat: 39.780551, endLnt: 116.518972, endLat: 39.778280, color: Cesium.Color.RED },
  { id: 'p6', startLnt: 116.521916, startLat: 39.780657, endLnt: 116.521523, endLat: 39.781142, color: Cesium.Color.RED },
  { id: 'p7', startLnt: 116.521523, startLat: 39.781142, endLnt: 116.521462, endLat: 39.781105, color: Cesium.Color.RED }
];
//创建文字方法 参数
const createWord = (
  viewer: any,
  id: any,
  startLng: any,
  startLat: any,
  height: number = 2,
  text: any,
  font: String = "Bold 16px sans-serif",
  color: Cesium.Color = Cesium.Color.BLACK,
  isVertical: Boolean = false,
) => {
  return viewer.entities.add({
    id: id,
    position: Cesium.Cartesian3.fromDegrees(startLng, startLat, height),
    label: {
      text: text, // 标签文本
      font: font,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: isVertical
        ? new Cesium.Cartesian2(0, -10)
        : new Cesium.Cartesian2(0, 0),
      horizontalOrigin: isVertical
        ? Cesium.HorizontalOrigin.LEFT
        : Cesium.HorizontalOrigin.CENTER, // 控制水平对齐
      fillColor: color,
      // 旋转角度（纵向时旋转90度）
      billboard: {
        rotation: isVertical ? Cesium.Math.toRadians(90) : 0,
      },
    },
  });
};
let wordList = [
  { id: '序厅', startLng: 116.52175649721367, startlat: 39.7787196855439, text: '序厅' },
  { id: 'A馆', startLng: 116.52160816218358, startlat: 39.77898762394732, text: 'A馆' },
  { id: 'B馆', startLng: 116.52107818986636, startlat: 39.77963510682674, text: 'B馆' },
  { id: 'C馆', startLng: 116.52048145879036, height: 22, startlat: 39.780437712098326, text: 'C馆' },
  { id: 'VIP', startLng: 116.520215, height: 20, startlat: 39.781190, text: 'VVIP临停和VIP停车场', color: Cesium.Color.RED },
  { id: '北门入', startLng: 116.519446, height: 20, startlat: 39.780683, text: '北门人员入口', color: Cesium.Color.RED },
  { id: '北门出', startLng: 116.519000, height: 23, startlat: 39.780462, text: '北门人员出口', color: Cesium.Color.GREEN },
  { id: '会客厅', startLng: 116.51964743497997, startlat: 39.77899443046679, text: '会客厅' },
  { id: '会议楼', startLng: 116.51979802628519, startlat: 39.7781284057038, text: '会议楼(南)' },
  { id: '报告厅', startLng: 116.52022934878445, startlat: 39.778318381210774, text: '报告厅', isVertical: true },
  { id: 'VVIP', startLng: 116.520492, startlat: 39.777555, text: 'VVIP驻留停车场', color: Cesium.Color.RED },
  { id: '安全', startLng: 116.522853, startlat: 39.779672, text: '安全保障车辆停车场', color: Cesium.Color.RED, isVertical: true },
  { id: '永昌', startLng: 116.52236251314567, startlat: 39.78087691915114, text: '永昌南路', isVertical: true, font: 'Bold 20px sans-serif' },
  { id: '宏达', startLng: 116.518580, startlat: 39.778502, text: '宏达南路', isVertical: true, font: 'Bold 20px sans-serif' },
  { id: '东门入', startLng: 116.52187174928771, startlat: 39.78062511139602, text: '东门车辆入口', color: Cesium.Color.RED, font: '14px sans-serif' },
  { id: '东门出', startLng: 116.52196509014368, startlat: 39.78050877997081, text: '东门车辆出口', color: Cesium.Color.GREEN, font: '14px sans-serif' },
  { id: '景园街', startLng: 116.52197621375868, startlat: 39.778061830885086, text: '景园街封路', font: 'Bold 20px sans-serif' },
  { id: '南一门', startLng: 116.52273528607962, startlat: 39.77851914307262, text: '南一门人员入口', font: 'Bold 14px sans-serif', color: Cesium.Color.GREEN },
  { id: '西门出', startLng: 116.518607, startlat: 39.778929, text: '西门人员出口', color: Cesium.Color.GREEN },
  { id: '西门入', startLng: 116.518703, startlat: 39.778808, text: '西门人员入口', color: Cesium.Color.RED },

  { id: 'VVIP出', startLng: 116.519004, startlat: 39.778409, text: 'VVIP车辆出口', color: Cesium.Color.GREEN },
  { id: 'VVIP入', startLng: 116.519108, startlat: 39.778273, text: 'VVIP车辆入口', color: Cesium.Color.RED },
  { id: '南二门', startLng: 116.52211865616572, startlat: 39.778245744533564, text: '南二门人员入口', font: 'Bold 14px sans-serif', color: Cesium.Color.RED },
  { id: '南三门', startLng: 116.52120098433342, startlat: 39.77781844549598, text: '南三门人员入口', font: 'Bold 14px sans-serif', color: Cesium.Color.RED },
  { id: '荣昌', startLng: 116.5189725333931, startlat: 39.78170265994373, text: '荣昌东街', font: 'Bold 20px sans-serif' },
  { id: '安检机1', startLng: 116.518948, startlat: 39.778703, text: '6闸机3安检机', font: '14px sans-serif' },
  { id: '嘉宾', startLng: 116.51918030932954, startlat: 39.77874474506386, text: '嘉宾、听众', font: '14px sans-serif', color: Cesium.Color.RED, height: 5 },
  { id: '展商', startLng: 116.5191942550459, startlat: 39.77873058260084, text: '展商、工作人员', font: '14px sans-serif', color: Cesium.Color.RED },
  { id: '安检机2', startLng: 116.52199302778578, startlat: 39.77840781294485, text: '6闸机3安检机', font: '14px sans-serif' },
  { id: '安检机3', startLng: 116.52108220998224, startlat: 39.77796702868903, text: '6闸机3安检机', font: '14px sans-serif' },
  { id: '安检机北口', startLng: 116.518512, startlat: 39.781013, text: '2闸机1安检机', font: '14px sans-serif', height: 3 },
]
//创建图片方法   horizontalOrigin: any = Cesium.HorizontalOrigin.CENTER,
const createImg = (
  viewer: any,
  id: any,
  imgUrl: any,
  startLnt1: any,
  startLat1: any,
  startLnt2: any,
  startLat2: any,
  startLnt3: any,
  startLat3: any,
  startLnt4: any,
  startLat4: any,
  height: number = 1,
  rote: number = 0,
  strote: number = 0,
) => {
  return viewer.entities.add({
    id: id,
    polygon: {
      height: height,
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        startLnt1,
        startLat1,
        startLnt2,
        startLat2,
        startLnt3,
        startLat3,
        startLnt4,
        startLat4,
      ]),
      rotation: Cesium.Math.toRadians(rote), //    整体旋转entity的角度，围绕中心点
      stRotation: Cesium.Math.toRadians(strote), // 旋转entity上的材质信息
      material: new Cesium.ImageMaterialProperty({ image: imgUrl }),
    },
  });
};
let imgList = [
  // 西1
  {
    id: 'i1',
    imgUrl: './public/img/222.png',
    startLnt1: 116.518955, startLat1: 39.778661,
    startLnt2: 116.51901257365573, startLat2: 39.77859518594504,
    startLnt3: 116.518946, startLat3: 39.778561,
    startLnt4: 116.5188862646933, startLat4: 39.77862666778118,
    rote: 60, strote: 60
  },
  // {
  //   id: 'i2',
  //   imgUrl: './public/img/222.png',
  //   startLnt1: 116.51906923128672, startLat1: 39.77880227736619,
  //   startLnt2: 116.51911382450024, startLat2: 39.77882417796261,
  //   startLnt3: 116.51908649839241, startLat3: 39.778862001320164,
  //   startLnt4: 116.51903999575174, startLat4: 39.77884055894652,
  //   rote: 60, strote: 60
  // },
  {

    id: 'i3',
    imgUrl: './public/img/111.png',
    startLnt1: 116.519012, startLat1: 39.778689,
    startLnt2: 116.519069, startLat2: 39.778621,
    startLnt3: 116.51901257365573, startLat3: 39.77859518594504,
    startLnt4: 116.518955, startLat4: 39.778661,
    rote: 60, strote: 60
  },
  // {
  //   id: 'i4',
  //   imgUrl: './public/img/111.png',
  //   startLnt1: 116.51914152033116, startLat1: 39.778788232542496,
  //   startLnt2: 116.51918468811526, startLat2: 39.77880837773822,
  //   startLnt3: 116.51915466826084, startLat3: 39.77884318374862,
  //   startLnt4: 116.51911382450024, startLat4: 39.77882417796261,
  //   rote: 60, strote: 60
  // },



  // 南1
  {
    id: 'i5',
    imgUrl: './public/img/111.png',
    startLnt1: 116.52108742196226, startLat1: 39.77795701842022,
    startLnt2: 116.52119330370945, startLat2: 39.77800761702931,
    startLnt3: 116.52123692947193, startLat3: 39.77795460211267,
    startLnt4: 116.52113242856868, startLat4: 39.77790391441666,
    rote: -30, strote: -30
  },
  {
    id: 'i6',
    imgUrl: './public/img/111.png',
    startLnt1: 116.5211930190762, startLat1: 39.778007407145786,
    startLnt2: 116.52128909150268, startLat2: 39.77805383351373,
    startLnt3: 116.52132734335534, startLat3: 39.77799829594331,
    startLnt4: 116.52123543881095, startLat4: 39.77795421858285,
    rote: -30, strote: -30
  },
  {
    id: 'i7',
    imgUrl: './public/img/222.png',
    startLnt1: 116.52113494245344, startLat1: 39.777905237859414,
    startLnt2: 116.5212318554277, startLat2: 39.77795242388284,
    startLnt3: 116.52128567658136, startLat3: 39.77787734103089,
    startLnt4: 116.5211926979105, startLat4: 39.77783323437208,
    rote: -30, strote: -30
  },
  {
    id: 'i8',
    imgUrl: './public/img/222.png',
    startLnt1: 116.52132739384494, startLat1: 39.77799836124578,
    startLnt2: 116.5212318554277, startLat2: 39.77795242388284,
    startLnt3: 116.52128580487773, startLat3: 39.77787706301688,
    startLnt4: 116.52138086364472, startLat4: 39.777921619197365,
    rote: -30, strote: -210
  },
  // 南二
  {
    id: 'i9',
    imgUrl: './public/img/222.png',
    startLnt1: 116.5219565859897, startLat1: 39.778343874133014,
    startLnt2: 116.52201553333472, startLat2: 39.77837127629255,
    startLnt3: 116.5220468046828, startLat3: 39.77833026956581,
    startLnt4: 116.52198765672762, startLat4: 39.77830267283545,
    rote: -30, strote: -30
  },
  {
    id: 'i10',
    imgUrl: './public/img/222.png',
    startLnt1: 116.52207729454875, startLat1: 39.778398533970574,
    startLnt2: 116.52201553333472, startLat2: 39.77837127629255,
    startLnt3: 116.5220468046828, startLat3: 39.77833026956581,
    startLnt4: 116.52210567477267, startLat4: 39.77835749831773,
    rote: -30, strote: -30
  },
  {
    id: 'i11',
    imgUrl: './public/img/111.png',
    startLnt1: 116.5219565859897, startLat1: 39.778343874133014,
    startLnt2: 116.52201553333472, startLat2: 39.77837127629255,
    startLnt3: 116.52198554862942, startLat3: 39.77841721693552,
    startLnt4: 116.5219259620304, startLat4: 39.77839079422769,
    rote: -30, strote: -30
  },
  {
    id: 'i12',
    imgUrl: './public/img/111.png',
    startLnt1: 116.52201553333472, startLat1: 39.77837127629255,
    startLnt2: 116.52207729454875, startLat2: 39.778398533970574,
    startLnt3: 116.52204287099939, startLat3: 39.778442628760274,
    startLnt4: 116.52198554862942, startLat4: 39.77841721693552,
    rote: -30, strote: -30
  },
  // 北门
  {
    id: 'i13',
    imgUrl: './public/img/222.png',
    startLnt1: 116.51846192833295, startLat1: 39.78119697340168,
    startLnt2: 116.51826122197473, startLat2: 39.78109403846232,
    startLnt3: 116.51817369927403, startLat3: 39.78119622766197,
    startLnt4: 116.51837596299556, startLat4: 39.78129844864408,
    rote: 150, strote: 150, height: 3
  },
  {
    id: 'i14',
    imgUrl: './public/img/111.png',
    startLnt1: 116.5185484460368, startLat1: 39.78108838706317,
    startLnt2: 116.5183416168613, startLat2: 39.78098899341698,
    startLnt3: 116.51826066966835, startLat3: 39.781094445873435,
    startLnt4: 116.51846097247095, startLat4: 39.78119788868953,
    rote: 150, strote: 150, height: 3
  },
];
const ids = ref([]);
const changeMark = (e) => {
  if (e) {
    if (ids.value.length > 0) {
      ids.value.forEach((id) => {
        viewer.entities.removeById(id);
      });
      ids.value = [];
      return;
    }
  }

  //批量创建虚线
  polyList.forEach((poly) => {
    createPolyLine(
      viewer,
      poly.id,
      poly.startLnt,
      poly.startLat,
      poly.endLnt,
      poly.endLat,
      poly.width,
      poly.color,
    );
    ids.value.push(poly.id);
  });
  // 批量创建文字
  wordList.forEach((word) => {
    createWord(
      viewer,
      word.id,
      word.startLng,
      word.startlat,
      word.height,
      word.text,
      word.font,
      word.color,
      word.isVertical,
    );
    ids.value.push(word.id);
  });
  // 批量创建箭头
  arrowList.forEach((arrow) => {
    createArrowLine(
      viewer,
      arrow.id,
      arrow.startLnt,
      arrow.startLat,
      arrow.endLnt,
      arrow.endLat,
      arrow.width,
      arrow.height,
      arrow.color,
    );
    ids.value.push(arrow.id);
  });
  //创建图片
  imgList.forEach((img) => {
    createImg(
      viewer,
      img.id,
      img.imgUrl,
      img.startLnt1,
      img.startLat1,
      img.startLnt2,
      img.startLat2,
      img.startLnt3,
      img.startLat3,
      img.startLnt4,
      img.startLat4,
      img.height,
      img.rote,
      img.strote,
    );
    ids.value.push(img.id);
  });
};

/**
 * 显示所有动态区域（封装 addDynamicAreasAndLabels，供父组件调用）
 */
const showDynamicAreas = async () => {
  if (!viewer) {
    console.warn("viewer 未初始化，无法显示动态区域");
    return;
  }
  // 先清除已存在的动态区域，避免重复添加
  removeDynamicAreas();
  // 调用原有方法添加区域和标签
  const response = await fetch('/dynamic-areas.json');
  const data = await response.json();
  addDynamicAreasAndLabels(viewer, data);
  console.log("动态区域已显示");
};

// 新增：用于缓存动态创建的区域和标签实体引用，提升清除性能
let dynamicEntitiesCache: Cesium.Entity[] = [];

/**
 * 批量添加测试区域（多边形）和标签
 * @param {Cesium.Viewer} viewer - Cesium viewer 实例
 * @param {Array} dataList - 数据数组，包含多边形和标签信息
 */
function addDynamicAreasAndLabels(viewer: Cesium.Viewer, dataList: any[]) {
  if (!Array.isArray(dataList) || dataList.length === 0) {
    console.warn("数据为空或格式不正确");
    return;
  }

  // 核心优化：每次添加前先清空旧缓存，避免重复堆积
  removeDynamicAreas();

  dataList.forEach((item, index) => {
    // 1. 数据预处理与默认值设置
    const areaId = `dynamic_area_${item.id}` || `dynamic_area_${index}`;
    const points = item.points;
    const labelPos = item.labelPosition;

    const height = item.height !== undefined ? item.height : 10;
    const labelText = item.name || "未命名区域";
    const polygonColor = item.color ? Cesium.Color.fromCssColorString(item.color).withAlpha(item.alpha || 0.1) : Cesium.Color.ORANGE.withAlpha(0.7);
    const bgColor = item.backgroundColor ? Cesium.Color.fromCssColorString(item.backgroundColor).withAlpha(0.8) : Cesium.Color.fromCssColorString("#333333").withAlpha(0.8);

    // 2. 创建多边形区域并缓存引用
    const polygonEntity = viewer.entities.add({
      id: areaId,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(points),
        material: polygonColor,
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        height: height,
        classificationType: Cesium.ClassificationType.BOTH
      }
    });
    dynamicEntitiesCache.push(polygonEntity);

    // 3. 创建文字标签并缓存引用
    const labelEntity = viewer.entities.add({
      id: `${areaId}_label`,
      position: Cesium.Cartesian3.fromDegrees(labelPos.lon, labelPos.lat, labelPos.height),
      label: {
        text: labelText,
        font: "bold 8px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5),
        showBackground: true,
        backgroundColor: bgColor,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    dynamicEntitiesCache.push(labelEntity);
  });
}

/**
 * 高效清除所有动态区域
 * 直接通过缓存的实体引用进行删除，无需遍历全部场景实体
 */
const removeDynamicAreas = () => {
  if (!viewer) {
    console.warn("viewer 未初始化，无法清除动态区域");
    return;
  }

  // 仅遍历缓存数组，性能消耗极小
  dynamicEntitiesCache.forEach((entity) => {
    // 安全校验：确保实体未被其他全局方法（如 removeAll）清空过
    if (entity && viewer.entities.contains(entity)) {
      viewer.entities.remove(entity);
    }
  });

  // 清空缓存引用
  dynamicEntitiesCache = [];
  console.log("动态区域已高效清除");
};

const initCesium = () => {
  if (!cesiumContainer.value) {
    return;
  }
  viewer = new Cesium.Viewer(cesiumContainer.value, {
    animation: false, // 不显示动画控件
    shouldAnimate: true,
    baseLayerPicker: false, // 不显示图层选择器
    fullscreenButton: false, // 不显示全屏按钮
    geocoder: false, // 不显示地名搜索
    homeButton: false, // 不显示主页按钮
    infoBox: false, // 不显示信息框
    sceneModePicker: false, // 不显示场景模式选择器
    selectionIndicator: false, // 不显示选择指示器
    timeline: false, // 不显示时间轴
    navigationHelpButton: false, // 不显示导航帮助按钮
    // 场景配置
    scene3DOnly: true,
    orderIndependentTranslucency: false,
    contextOptions: {
      webgl: {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: true,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
      },
    },
    // imageryProvider: bingMap1,
  });
  // 新增：初始化模型动画控制器
  modelAnimator = createModelAnimator(viewer, modelConfigs, loadedModels, MODEL_POSITION);

  (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = "none"; // 隐藏版本号
  // 右键旋转
  viewer.scene.screenSpaceCameraController.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
  ];
  viewer.scene.screenSpaceCameraController.tiltEventTypes = [
    Cesium.CameraEventType.PINCH,
    Cesium.CameraEventType.RIGHT_DRAG,
  ];
  // 核心：禁用Cesium默认的双击事件
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
    Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK, // 移除左键双击事件
  );
  //点击事件
  var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(function (click: { position: any }) {
    // 获取当前相机高度
    var cameraHeight = viewer.camera.positionCartographic.height;
    if (cameraHeight >= 100000) return;
    // 设置高度限制（例如1000米）
    var pick = viewer.scene.pick(click.position);

    const rid = pick?.id?.id;
    // if (rid === "r6") {                       // 外围鹰眼：保持原特殊逻辑
    //   flyToView("waiwei");
    //   getRadarDatarc();
    //   removeModelById(3);
    //   return;
    // }

    // ✅ 新增：只飞不巡航模型（会客厅/报告厅/西广场）
    const flyCfg = SCENE_FLY_ONLY_CONFIG[rid];
    if (flyCfg) {
      cruiseStop(); // 互斥：先停掉进行中的巡航，释放 preRender 对相机的接管
      removeModelById(3);
      flyToView(flyCfg.flyKey); // 飞到对应视角
      // 复用已连接的 ws；有残留旧连接则自动关旧开新
      wsManager.connect(flyCfg.wsChannel, WS_CHANNEL_CONFIG[flyCfg.wsChannel]);
      emits("cruiseStart", rid);              // 让父组件打开底部智能展示面板
      emits("cruiseRegion", flyCfg.uiValue);  // 高亮对应 item 并滚动居中
      return;
    }

    const cruiseId = SCENE_MODEL_TO_CRUISE_ID[rid];   // ✅ 一个映射替代全部 else-if
    if (!cruiseId) return;

    removeModelById(3);
    const pv = ridPanoramaAction[rid];
    if (pv) QuanJing(false, pv);

    cruiseStop();                              // 互斥：停掉正在进行的其它巡航
    setTimeout(() => cruiseStart(cruiseId), 800);
    emits("cruiseStart", cruiseId);            // 让父组件打开面板 + 高亮 + 显示停止键
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  viewer.scene.globe.enableLighting = false;

  // 1. 提高光照强度（核心：整体提亮）
  const sunLight = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(2.0, -1.0, -1.0),
    color: Cesium.Color.WHITE, // 取消透明度，用纯色保证亮度
    intensity: 0.8, // 从0.4提升至0.8，大幅提高直射光强度（按需可微调至1.0）
    specularColor: Cesium.Color.BLACK, // 关键：高光颜色设为黑色，彻底关闭高光反射
  });

  viewer.scene.light = sunLight;

  viewer.scene.sun.show = true;
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
    "2025-09-08T13:00:00Z",
  );
  viewer.clock.shouldAnimate = true;

  // 2. 关闭阴影（核心修改：直接禁用阴影渲染）
  // 优化阴影配置（替换你代码中的shadowMap相关部分）
  viewer.scene.shadowMap.enabled = true; // 先确保阴影开启
  viewer.scene.shadowMap.size = 4096; // 提高阴影贴图分辨率（建议2048→4096，根据性能调整）
  viewer.scene.shadowMap.softShadows = false; // 关闭软阴影（避免过度模糊）
  viewer.scene.shadowMap.maximumDistance = 10000; // 缩小阴影最大距离（适配会展中心的范围）
  viewer.scene.shadowMap.frustumSize = 5000; // 缩小视锥范围（提高局部采样精度）
  viewer.scene.shadowMap.darkness = 0.6; // 适当加深阴影，减少边缘模糊感
  // 关闭抗锯齿
  viewer.scene.postProcessStages.fxaa.enabled = true;
  // 让渲染分辨率匹配屏幕物理像素
  viewer.resolutionScale = window.devicePixelRatio;

  // 3. 地球基色：保持浅灰，避免过亮反光
  viewer.scene.globe.baseColor = new Cesium.Color(0.95, 0.95, 0.95, 1.0); // 浅灰不刺眼，同时配合光照提亮

  // 4. Bloom后期处理：关闭泛光（核心：避免亮部反光/发白）
  const bloom = viewer.scene.postProcessStages.bloom;
  if (bloom) {
    bloom.enabled = false; // 直接关闭泛光，彻底消除亮部溢出反光
  }

  // 5. 饱和度调整：保持适度，不影响提亮效果
  const saturation = viewer.scene.postProcessStages.saturation;
  if (saturation) {
    saturation.enabled = true;
    saturation.uniforms.saturation = 1; // 从0.8微调至0.9，更接近自然色，配合提亮
  }

  // 6. 彻底禁用高光相关配置（双重保障：关闭所有反光来源）
  // 禁用地球镜面反射（避免地面反光）
  viewer.scene.globe.specularIntensity = 0.0; // 完全关闭地面高光
  // 禁用环境光中的高光成分（若开启环境光）
  if (viewer.scene.lightingPipeline) {
    viewer.scene.lightingPipeline.environmentLightIntensity = 0.3; // 适度环境光填充暗部（不影响高光）
    viewer.scene.lightingPipeline.specularEnvironmentLightIntensity = 0.0; // 关闭环境光高光
  }

  // 7. 优化HDR：保证提亮不刺眼，控制亮度范围
  viewer.scene.highDynamicRange = {
    enabled: true,
    brightness: 1.0, // 配合光照强度最大化提亮
    contrast: 1.0,
    gamma: 1.05, // 轻微gamma校正，避免亮部过曝
  };

  // 8. 模型全局高光禁用（针对3D模型/tileset，双重保障不反光）
  viewer.scene.postUpdate.addEventListener(() => {
    const primitives = viewer.scene.primitives;
    for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives.get(i);
      // 处理3D Tiles模型
      if (primitive instanceof Cesium.Cesium3DTileset) {
        primitive.style = new Cesium.Cesium3DTileStyle({
          specular: 0.0, // 模型高光强度为0
          shininess: 0.0, // 模型光泽度为0
        });
      }
      // 处理普通Primitive模型
      else if (primitive.appearance?.material) {
        primitive.appearance.material.uniforms.specular = Cesium.Color.BLACK;
        primitive.appearance.material.uniforms.shininess = 0.0;
      }
    }
  });

  // 根据分辨率飞向不同初始视角
  flyToView("initStart");

  viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
    clickHandlers,
    Cesium.ScreenSpaceEventType.LEFT_CLICK,
  );

  viewer.entities.add({
    id: "云层",
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      height: 1,
      outline: false,
      material: new Cesium.ImageMaterialProperty({
        image: "/world.jpg",
        transparent: true, // 别忘了把允许透明打开
        color: Cesium.Color.WHITE.withAlpha(0.0),
      }),
    },
  });
};

// ✅ 新增缓存数组（放在 addHotspot 函数上方）
const legacyHotspotEntities: Cesium.Entity[] = [];
// 热点连接
const addHotspot = (hotspotList: HotspotEntity[]) => {
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }
  hotspotList.forEach((hotspot) => {
    const { id, lon, lat, name } = hotspot;
    try {
      if (!viewer) {
        return;
      }
      // 先移除同 id 旧实体，防止重复点击堆积
      viewer.entities.removeById(`hot_${id}`);
      // 1. 添加 Billboard（广告牌）
      const entity = viewer.entities.add({
        id: `hot_${id}`,
        // 使用 properties 来存储自定义数据
        properties: {
          hotspot: hotspot as HotspotEntity, // 强制类型转换
        },
        position: Cesium.Cartesian3.fromDegrees(Number(lon), Number(lat), 0),
        label: {
          text: name,
          font: "bold 17px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          // showBackground: true,
          scale: 1.0,
          // horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          pixelOffset: new Cesium.Cartesian2(0, -100),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300), // 广告牌在距离视点 0 到 10,000 米时显示
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试
          zIndex: 1,
          show: true,
        },
        billboard: {
          image: "/xiangji1.png",
          // width: 270,
          // height: 90,
          pixelOffset: new Cesium.Cartesian2(0, 3),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: 0.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试
          zIndex: 1,
          show: true,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300), // 广告牌在距离视点 0 到 10,000 米时显示
        },
      });
      legacyHotspotEntities.push(entity);   // ✅ 缓存引用
    } catch (error) {
      console.error(`添加热点时出错:`, error);
    }
  });
  enableHotspotClick();
};

const gaodidianliandong = (hotspotList: HotspotEntity[]) => {
  if (!viewer) {
    console.error("Cesium viewer 未初始化");
    return;
  }
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }

  hotspotList.forEach((hotspot) => {
    const { id, name, duankouhao, coords, height } = hotspot;
    try {
      // 创建多边形坐标点（添加高度值）
      const positions = coords.map(
        (coord) => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0), // 高度设为0
      );

      // 闭合多边形（添加第一个点到最后）
      const outlinePositions = [...positions, positions[0]];

      //区域
      const entity = viewer.entities.add({
        item: duankouhao,
        id: id,
        name: name,
        properties: {
          hotspot: hotspot as HotspotEntity, // 强制类型转换
        },
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outlinePositions), // 使用多边形轮廓点
          material: Cesium.Color.LIGHTGRAY.withAlpha(0.01), // 浅灰色半透明填充（调整alpha值控制透明度）
          outline: true, // 是否显示轮廓
          outlineColor: Cesium.Color.LIGHTGRAY.withAlpha(0.01), // 轮廓颜色（稍深的灰色）
          outlineWidth: 7, // 轮廓宽度（减细以更 subtle）
          clampToGround: true, // 强制贴地
          height: 2, // 多边形高度（可选）
          extrudedHeight: 2, // 拉伸高度（可选，设为0表示不拉伸）
        },
      });

      return entity;
    } catch (error) {
      console.error(`添加热点${id || name}时出错:`, error);
    }
  });

  // 初始化点击事件（若原有enableHotspotClick()需适配，下方提供标准拾取逻辑）
  enableHotspotClick();
};
const outgaodidianliandong = (hotspotList: HotspotEntity[]) => {
  if (!viewer) {
    console.error("Cesium viewer 未初始化");
    return;
  }
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }

  hotspotList.forEach((hotspot) => {
    const { id, name, duankouhao, coords, height } = hotspot;
    try {
      // 创建多边形坐标点（添加高度值）
      const positions = coords.map(
        (coord) => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0), // 高度设为0
      );

      // 闭合多边形（添加第一个点到最后）
      const outlinePositions = [...positions, positions[0]];

      //区域
      const entity = viewer.entities.add({
        item: duankouhao,
        id: id,
        name: name,
        properties: {
          hotspot: hotspot as HotspotEntity, // 强制类型转换
        },
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outlinePositions), // 使用多边形轮廓点
          material: Cesium.Color.LIGHTGRAY.withAlpha(0.01), // 浅灰色半透明填充（调整alpha值控制透明度）
          outline: true, // 是否显示轮廓
          outlineColor: Cesium.Color.RED.withAlpha(0.01), // 轮廓颜色（稍深的灰色）
          outlineWidth: 7, // 轮廓宽度（减细以更 subtle）
          clampToGround: true, // 强制贴地
          height: 2, // 多边形高度（可选）
          extrudedHeight: 2, // 拉伸高度（可选，设为0表示不拉伸）
        },
      });

      return entity;
    } catch (error) {
      console.error(`添加热点${id || name}时出错:`, error);
    }
  });

  // 初始化点击事件（若原有enableHotspotClick()需适配，下方提供标准拾取逻辑）
  enableHotspotClick();
};

const gaodidianxutingerlou = (hotspotList: HotspotEntity[]) => {
  if (!viewer) {
    console.error("Cesium viewer 未初始化");
    return;
  }
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }

  hotspotList.forEach((hotspot) => {
    const { id, name, duankouhao, coords, height } = hotspot;
    try {
      // 创建多边形坐标点（添加高度值）
      const positions = coords.map(
        (coord) => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0), // 高度设为0
      );

      // 闭合多边形（添加第一个点到最后）
      const outlinePositions = [...positions, positions[0]];

      //区域
      const entity = viewer.entities.add({
        item: duankouhao,
        id: id,
        name: name,
        properties: {
          hotspot: hotspot as HotspotEntity, // 强制类型转换
        },
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outlinePositions), // 使用多边形轮廓点
          material: Cesium.Color.LIGHTGRAY.withAlpha(0.01), // 浅灰色半透明填充（调整alpha值控制透明度）
          outline: true, // 是否显示轮廓
          outlineColor: Cesium.Color.RED.withAlpha(0.01), // 轮廓颜色（稍深的灰色）
          outlineWidth: 7, // 轮廓宽度（减细以更 subtle）
          clampToGround: true, // 强制贴地
          height: 6.6, // 多边形高度（可选）
          extrudedHeight: 6.6, // 拉伸高度（可选，设为0表示不拉伸）
        },
      });

      return entity;
    } catch (error) {
      console.error(`添加热点${id || name}时出错:`, error);
    }
  });

  // 初始化点击事件（若原有enableHotspotClick()需适配，下方提供标准拾取逻辑）
  enableHotspotClick();
};

const gaodidianxutingerlouC = (hotspotList: HotspotEntity[]) => {
  if (!viewer) {
    console.error("Cesium viewer 未初始化");
    return;
  }
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }

  hotspotList.forEach((hotspot) => {
    const { id, name, duankouhao, coords, height } = hotspot;
    try {
      // 创建多边形坐标点（添加高度值）
      const positions = coords.map(
        (coord) => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0), // 高度设为0
      );

      // 闭合多边形（添加第一个点到最后）
      const outlinePositions = [...positions, positions[0]];

      //区域
      const entity = viewer.entities.add({
        item: duankouhao,
        id: id,
        name: name,
        properties: {
          hotspot: hotspot as HotspotEntity, // 强制类型转换
        },
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outlinePositions), // 使用多边形轮廓点
          material: Cesium.Color.LIGHTGRAY.withAlpha(0.01), // 浅灰色半透明填充（调整alpha值控制透明度）
          outline: true, // 是否显示轮廓
          outlineColor: Cesium.Color.RED.withAlpha(0.01), // 轮廓颜色（稍深的灰色）
          outlineWidth: 7, // 轮廓宽度（减细以更 subtle）
          clampToGround: true, // 强制贴地
          height: 6.6, // 多边形高度（可选）
          extrudedHeight: 6.6, // 拉伸高度（可选，设为0表示不拉伸）
        },
      });

      return entity;
    } catch (error) {
      console.error(`添加热点${id || name}时出错:`, error);
    }
  });

  // 初始化点击事件
  enableHotspotClick();
};

let cgaoCameraList: string[] = [];

const loadCgaoCameraList = async () => {
  if (cgaoCameraList.length > 0) return cgaoCameraList;
  try {
    const [cgaoRes, pointssRes] = await Promise.all([
      fetch("/Cgaodidian.json"),
      fetch("/pointssC.json"),
    ]);
    const [cgaoCameras, pointssCameras] = await Promise.all([
      cgaoRes.json(),
      pointssRes.json(),
    ]);
    const cgaoCodes = cgaoCameras.map(
      (c: { cameraIndexCode: string }) => c.cameraIndexCode,
    );
    const pointssCodes = pointssCameras.map(
      (c: { cameraIndexCode: string }) => c.cameraIndexCode,
    );
    cgaoCameraList = [...new Set([...cgaoCodes, ...pointssCodes])];
  } catch (error) {
    console.error("加载C馆相机列表失败:", error);
  }
  return cgaoCameraList;
};

// 开启点击事件
const enableHotspotClick = () => {
  if (clickHandler) {
    clickHandler.destroy();
  }
  if (!viewer) {
    console.warn("viewer 未初始化，无法绑定点击事件");
    return;
  }
  clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  clickHandler.setInputAction(
    async (event: { position: Cesium.Cartesian2 }) => {
      emits("close-video");
      const pickedObject = viewer.scene.pick(event.position);
      if (Cesium.defined(pickedObject)) {
        const entity = pickedObject.id;

        if (entity && entity.properties) {
          // const ids = [];
          // if (ids.includes(entity.id)) {
          //   console.log("联动id", entity.id);
          //   emits("liandongss", entity?.properties?.hotspot?._value, 1);
          //   return;
          // }
          let hotspotData = entity?.properties?.hotspot?._value;
          await loadCgaoCameraList();
          const isCgao = cgaoCameraList.includes(hotspotData?.cameraIndexCode);
          console.log("是否C馆:", isCgao);

          if (isCgao) {
            try {
              const payload = cgaoCameraList.map((code) => ({
                cameraIndexCode: code,
                presetIndex: 300,
              }));
              console.log("C馆复位请求:", payload);
              await axios.post("/brBk/HKManage/batchPtz", payload, {
                timeout: 30000,
                headers: {
                  "Content-Type": "application/json",
                },
              });
            } catch (error) {
              console.error("C馆复位失败:", error);
            }

            const response = await axios({
              url: "/brBk/HKManage/selCGWsUrlByCode",
              method: "POST",
              data: {
                cameraIndexCode: hotspotData.cameraIndexCode,
              },
              timeout: 10000,
            });
            console.log("C馆接口返回----------------------：", response.data);
            // 直接赋值后端返回完整openUrl地址，无需额外拼接参数
            if (response.data.data) {
              hotspotData.wsUrl = response.data.data.url;
              console.log("url返回----------------------：", hotspotData.wsUrl);
            }
          } else {
            const response = await axios({
              // 修复接口路径缺少开头斜杠bug
              url: "/brBk/HKManage/selWsUrlByCode",
              method: "POST",
              data: {
                cameraIndexCode: hotspotData.cameraIndexCode,
              },
              timeout: 10000,
            });
            if (response.data.data) {
              hotspotData.wsUrl = response.data.data.url;
            }
          }

          emits("playVideoFusion", hotspotData);
        }
      }
    },
    Cesium.ScreenSpaceEventType.LEFT_CLICK,
  );
};

// 飞行方法（报警飞行）
const alarmFlyto = (params) => {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(params.lng, params.lat, 40), // 高度100米
    duration: 3, // 飞行时长1秒
    orientation: {
      pitch: -0.8, // 稍微俯视
      heading: 5,
      roll: 0,
    },
  });
};

// 关闭点击事件
const disableHotspotClick = () => {
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
  } else {
    console.error("点击事件处理器不存在或已关闭");
  }
};
// 删除热点连接的函数
const removeHotspotsByIds = (entityIds: string[]) => {
  if (!viewer) {
    console.warn("viewer 未初始化");
    return;
  }
  const removedIds: string[] = [];
  const notFoundIds: string[] = [];
  entityIds.forEach((entityId) => {
    let id = `hot_${entityId}`;
    const entity = viewer.entities.getById(id);
    if (entity) {
      viewer.entities.removeById(id);
      removedIds.push(id);
    } else {
      notFoundIds.push(id);
    }
  });
  if (notFoundIds.length > 0) {
    console.warn(`未找到的实体ID:`, notFoundIds);
  }

  return { removedIds, notFoundIds };
};
// 报警事件视频融合
// const VideoRef = ref()
// const createVideoFusion = async () => {
//   // cesiumContainer.value
//   const { createVideoFusion: createVideoFusion_fn } = useRTCVideo(viewer)
//   try {
//     const response = await fetch('/videoFusion.json')
//     const configs = await response.json()
//     // 一次性创建所有视频融合
//     await createVideoFusion_fn(configs)
//   }
//   catch (error) {
//     console.error(error)
//   }
// }
// // 清楚视频融合
// const cleanVideoFusion = async () => {
//   const { cleanup: cleanupFn } = useRTCVideo(viewer)
//   cleanupFn?.()
// }

const FlightFn = (params: TreePoint) => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Number(params.lon),
      Number(params.lat),
      1000,
    ), // 高度10km
    orientation: {
      heading: Cesium.Math.toRadians(0), // 朝北
      pitch: Cesium.Math.toRadians(-45), // 向下45度
      roll: 0,
    },
    duration: 3.0,
  });
  viewer.entities.add({
    id: String(params.id),
    position: Cesium.Cartesian3.fromDegrees(
      Number(params.lon),
      Number(params.lat),
      0,
    ),
    label: {
      text: params.name,
      font: "bold 16px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      scale: 1.0,
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      pixelOffset: new Cesium.Cartesian2(-10, -80),
      // distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300000), // 广告牌在距离视点 0 到 10,000 米时显示
      disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试
      show: true,
    },
    billboard: {
      image: "/spred.png",
      width: 60,
      height: 60,
      pixelOffset: new Cesium.Cartesian2(0, 3),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      scale: 1.0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY, // 禁用深度测试
      show: true,
    },
  });
};

//低图模型
const modelConfigs = [
  {
    id: 1,
    height: 3,
    uri: "/model/北会无盖.glb",
    // uri: "/model/20.glb",
    scale: 1,
    modelx: 116.520316,
    modely: 39.7799,
  },
  {
    id: 2,
    height: 3,
    uri: "/model/场景.glb",
    scale: 1,
    modelx: 116.520316,
    modely: 39.7799,
  },
  {
    id: 3,
    height: 3,
    uri: "/model/brgz.glb",
    scale: 1,
    modelx: 116.520316,
    modely: 39.7799,
  },
];

// 3. 全局（或模块级）变量，用于存储已加载的模型实体
// 键: model.id, 值: Cesium.Entity 对象
let loadedModels: any = {};

// 4. 加载模型的函数
function loadModelById(modelId: number) {
  // 检查模型是否已加载
  if (loadedModels[modelId]) {
    console.log(`模型 ID ${modelId} 已存在，无需重复加载。`);
    return;
  }

  // 查找模型配置
  const modelConfig = modelConfigs.find((config) => config.id === modelId);

  if (!modelConfig) {
    console.warn(`未找到 ID 为 ${modelId} 的模型配置。`);
    return;
  }

  const heading = Cesium.Math.toRadians(65); // 左右旋转 90°
  const pitch = Cesium.Math.toRadians(50); // 上下翻转 0°
  const roll = Cesium.Math.toRadians(1); // 侧倾 0°

  const orientation = Cesium.Quaternion.fromHeadingPitchRoll(
    new Cesium.HeadingPitchRoll(heading, pitch, roll),
  );
  // 创建并添加实体到场景
  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(
      modelConfig.modelx,
      modelConfig.modely,
      modelConfig.height,
    ),
    model: {
      uri: modelConfig.uri,
      scale: modelConfig.scale,
    },
    orientation: new Cesium.ConstantProperty(orientation), // 推荐方式
    // 同样，建议将id附加在entity上
    properties: { modelId: modelId },
  });

  // 存储已加载的实体
  loadedModels[modelId] = entity;
  console.log(`模型 ID ${modelId} 已成功加载。`);
}

// 5. 删除模型的函数
function removeModelById(modelId: number) {
  const entity = loadedModels[modelId];

  if (entity) {
    // 从viewer中移除
    viewer.entities.remove(entity);
    // 从存储中删除
    delete loadedModels[modelId];
    console.log(`模型 ID ${modelId} 已成功移除。`);
  } else {
    console.warn(`无法删除模型 ID ${modelId}，因为它未被加载。`);
  }
}

// 加载模型----------------------------------------------------------------------
// 模型管理相关的状态
let currentModelEntity: Cesium.Entity | null = null;
let isModelLoading = false;

// 模型配置
const MODEL_CONFIG = {
  scale: 1.0,
  minimumPixelSize: 128,
  maximumScale: 200,
};
// 固定的模型坐标 - 所有模型都使用相同位置
const MODEL_POSITION = {
  latitude: 39.7799,
  longitude: 116.520316,
  height: 0,
};
/**
 * 清除当前模型
 */
const clearCurrentModel = () => {
  if (!viewer) {
    console.warn("viewer 未初始化");
    return;
  }

  if (currentModelEntity) {
    try {
      viewer.entities.remove(currentModelEntity);
    } catch (error) {
      console.error("清除模型时出错:", error);
    }
    currentModelEntity = null;
  }
};

/**
 * 加载3D模型
 * @param modelUrl 模型文件URL
 * @param options 可选的模型配置覆盖
 */
const loadModel = async (
  modelUrl: string,
  options?: Partial<typeof MODEL_CONFIG>,
) => {
  if (!viewer) {
    console.warn("viewer 未初始化");
    return;
  }

  // 防止重复加载
  if (isModelLoading) {
    console.warn("模型正在加载中，请稍候");
    return;
  }

  try {
    isModelLoading = true;

    // 先清除之前的模型
    clearCurrentModel();
    // 合并配置
    const finalConfig = { ...MODEL_CONFIG, ...options };

    // 创建模型位置
    // 创建模型位置
    const position = Cesium.Cartesian3.fromDegrees(
      MODEL_POSITION.longitude,
      MODEL_POSITION.latitude,
      3,
    );

    const heading = Cesium.Math.toRadians(65); // 左右旋转 90°
    const pitch = Cesium.Math.toRadians(50); // 上下翻转 0°
    const roll = Cesium.Math.toRadians(1); // 侧倾 0°

    const orientation = Cesium.Quaternion.fromHeadingPitchRoll(
      new Cesium.HeadingPitchRoll(heading, pitch, roll),
    );

    // 添加新模型到场景
    currentModelEntity = viewer.entities.add({
      id: `model_${Date.now()}`, // 唯一ID
      position,
      model: {
        uri: modelUrl,
        scale: finalConfig.scale,
        // minimumPixelSize: finalConfig.minimumPixelSize,
        // maximumScale: finalConfig.maximumScale,
        // 添加一些优化选项
        // silhouetteColor: Cesium.Color.YELLOW,
        // 关键修复：添加这一行
        // heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        silhouetteSize: 1,
        // 启用阴影
        shadows: Cesium.ShadowMode.ENABLED,
      },
      orientation: new Cesium.ConstantProperty(orientation), // 推荐方式
    });

    // 等待模型加载完成后聚焦
    // if (currentModelEntity) {
    //   await viewer.zoomTo(currentModelEntity, new Cesium.HeadingPitchRange(
    //     Cesium.Math.toRadians(0), // heading: 正北方向
    //     Cesium.Math.toRadians(-45), // pitch: 向下45度
    //     500, // range: 距离500米
    //   ))
    // }
  } catch (error) {
    console.error(`加载模型失败: ${modelUrl}`, error);

    // 加载失败时清理
    if (currentModelEntity) {
      viewer.entities.remove(currentModelEntity);
      currentModelEntity = null;
    }

    // 可以添加用户友好的错误提示
    // ElMessage.error(`模型加载失败: ${error.message}`);
  } finally {
    isModelLoading = false;
  }
};

let handler: Cesium.ScreenSpaceEventHandler | null = null;
let currentHoveredHotspotId: string | null = null;
const hotspotMainEntities: Record<string, Cesium.Entity> = {};


/** 加载单张图片 */
const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

/** 自动检测 video.png 中心的透明镂空区 */
const detectFrameHole = (
  img: HTMLImageElement,
): { x: number; y: number; w: number; h: number } | null => {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const alphaAt = (x: number, y: number) => data[(y * c.width + x) * 4 + 3];

    const cx = Math.floor(c.width / 2);
    const cy = Math.floor(c.height / 2);
    if (alphaAt(cx, cy) > 20) return null;

    let left = cx;
    while (left > 0 && alphaAt(left - 1, cy) <= 20) left--;
    let right = cx;
    while (right < c.width - 1 && alphaAt(right + 1, cy) <= 20) right++;
    let top = cy;
    while (top > 0 && alphaAt(cx, top - 1) <= 20) top--;
    let bottom = cy;
    while (bottom < c.height - 1 && alphaAt(cx, bottom + 1) <= 20) bottom++;

    const w = right - left;
    const h = bottom - top;
    if (w < c.width * 0.2 || h < c.height * 0.2) return null;
    return { x: left, y: top, w, h };
  } catch {
    return null;
  }
};

/**
 * 生成「视频弹窗同款」缩略图（v3）：
 * ① 缩略图 cover 填满镂空窗口（object-fit: cover）
 * ② 发光挂在边框底图轮廓上（等价容器级 drop-shadow）
 * ③ 画布四周留 padding，防止光晕被截断
 * @returns image: 合成图 dataURL；scale: billboard 缩放值
 */
const preloadAndResizeImage = async (
  imgUrl: string,
  targetH = 100,
): Promise<{ image: string; scale: number }> => {
  // ---- 旧逻辑兜底：硬边框 ----
  const legacyDraw = async (): Promise<{ image: string; scale: number }> => {
    const thumb = await loadImg(imgUrl);
    const canvas = document.createElement("canvas");
    const borderWidth = 25;
    const ratio = Math.min(800 / thumb.width, 400 / thumb.height, 1);
    const width = Math.floor(thumb.width * ratio);
    const height = Math.floor(thumb.height * ratio);
    canvas.width = width + borderWidth * 2;
    canvas.height = height + borderWidth * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#4ca8e2";
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
    ctx.drawImage(thumb, borderWidth, borderWidth, width, height);
    return { image: canvas.toDataURL("image/png"), scale: targetH / canvas.height };
  };

  try {
    const [frame, thumb] = await Promise.all([
      loadImg(videoFrameUrl),
      loadImg(imgUrl),
    ]);

    const fw = frame.naturalWidth;
    const fh = frame.naturalHeight;

    // ✅ 关键1：四周留出光晕扩散空间（约短边 6%），避免发光被画布边缘切掉
    const pad = Math.round(Math.min(fw, fh) * 0.06);
    const canvas = document.createElement("canvas");
    canvas.width = fw + pad * 2;
    canvas.height = fh + pad * 2;
    const ctx = canvas.getContext("2d")!;

    // 镂空窗口（坐标加上 pad 偏移）
    const holeRaw =
      detectFrameHole(frame) ?? {
        x: fw * 0.06, y: fh * 0.14, w: fw * 0.88, h: fh * 0.78,
      };
    const hole = {
      x: holeRaw.x + pad,
      y: holeRaw.y + pad,
      w: holeRaw.w,
      h: holeRaw.h,
    };

    // ✅ 关键2：cover 填充——取较大缩放比，铺满窗口，超出部分裁掉
    ctx.save();
    ctx.beginPath();
    ctx.rect(hole.x, hole.y, hole.w, hole.h);
    ctx.clip();
    const cover = Math.max(hole.w / thumb.width, hole.h / thumb.height);
    const w = thumb.width * cover;
    const h = thumb.height * cover;
    ctx.drawImage(
      thumb,
      hole.x + (hole.w - w) / 2, // 水平居中
      hole.y + (hole.h - h) / 2, // 垂直居中
      w, h,
    );
    ctx.restore();

    // 提亮缩略图区域（等价 brightness(1.2)）
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
    ctx.restore();

    // 窗口内侧细描边：衔接图片与边框，避免生硬接缝
    ctx.save();
    ctx.strokeStyle = "rgba(0, 198, 255, 0.55)";
    ctx.lineWidth = Math.max(2, fw * 0.003);
    ctx.strokeRect(hole.x, hole.y, hole.w, hole.h);
    ctx.restore();

    // ✅ 关键3：发光挂在【边框底图】上——光晕沿边框最外轮廓向外发散
    //   与 CSS「容器级 filter: drop-shadow(0 0 10px rgba(0,198,255,.8))」行为一致
    ctx.save();
    ctx.shadowColor = "rgba(0, 198, 255, 0.9)";
    ctx.shadowBlur = Math.min(fw, fh) * 0.04; // 光晕半径
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // 画两次：第一遍主要贡献外发光，第二遍保证边框本体清晰实色
    ctx.drawImage(frame, pad, pad);
    ctx.drawImage(frame, pad, pad);
    ctx.restore();

    // 边框提亮（等价容器的 brightness(1.2)）
    ctx.save();
    ctx.globalCompositeOperation = "source-atop"; // 只提亮已绘制的像素，不影响外部透明区
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    return {
      image: canvas.toDataURL("image/png"),
      scale: targetH / canvas.height, // 含 pad，billboard 按 canvas 总高适配
    };
  } catch (err) {
    console.error("发光边框合成失败，回退硬边框:", err);
    try {
      return await legacyDraw();
    } catch {
      return { image: "/xiangji1.png", scale: 0.5 };
    }
  }
};


const addHotspots = async (hotspotList: HotspotEntity[]) => {
  if (!Array.isArray(hotspotList) || hotspotList.length === 0) {
    console.warn("热点数据为空或格式不正确");
    return;
  }

  // 如果已经存在热点，先清除旧的（可选优化）
  if (Object.keys(hotspotMainEntities).length > 0) {
    return;
  }

  if (!handler && viewer) {
    handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  for (const hotspot of hotspotList) {
    const { img, id, lon, lat, name, height } = hotspot;
    try {
      if (!viewer || !id || !img) {
        console.warn(`热点ID ${id} 缺少必要参数`);
        continue;
      }

      const childEntityId = `hotspot_child_${id}`;
      const meta  = await preloadAndResizeImage(img, 100);

      // --- 主实体（相机图标） ---
      const mainEntity = viewer.entities.add({
        id: `hots_${id}`,
        properties: {
          hotspot: hotspot as HotspotEntity,
          isHotspotMain: true,
          hotspotId: id,
          hotspotName: name,
        },
        position: Cesium.Cartesian3.fromDegrees(
          Number(lon),
          Number(lat),
          Number(height),
        ),
        billboard: {
          image: "/xiangji1.png",
          pixelOffset: new Cesium.Cartesian2(0, 3),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: 0.4,
          disableDepthTestDistance: 10,
          show: true,
          heightReference: Cesium.HeightReference.ABSOLUTE,
          // 关键：将相机图标向后推，确保在图片下方
          eyeOffset: new Cesium.Cartesian3(0, 0, -100), // 向后偏移10米
          zIndex: 3, // 最低层级
        },
      });
      // --- 子实体（详情图片） ---
      const childEntity = viewer.entities.add({
        id: childEntityId,
        properties: {
          hotspot: hotspot as HotspotEntity,
          originalImg: img,
          isHotspotChild: true,
          parentHotspotId: id,
        },
        position: Cesium.Cartesian3.fromDegrees(
          Number(lon),
          Number(lat),
          Number(height),
        ),
        billboard: {
          image: meta.image,
          scale: meta.scale,
          pixelOffset: new Cesium.Cartesian3(0, -100, 100),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
          heightReference: Cesium.HeightReference.ABSOLUTE,
          // 关键：将详情图片向前拉，确保在相机图标上方
          eyeOffset: new Cesium.Cartesian3(0, 0, 0), // 保持在最前
          zIndex: 9999, // 最高层级
        },
      });

      hotspotMainEntities[id] = mainEntity;
    } catch (error) {
      console.error(`添加热点 ${id || "未知"} 时出错:`, error);
    }
  }

  if (handler && viewer) {
    handler.setInputAction(
      (movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        if (!viewer || !movement.endPosition) return;

        const pickedObjects = viewer.scene.drillPick(movement.endPosition, 10);
        let targetHotspotId: string | null = null;

        for (const obj of pickedObjects) {
          if (obj?.id?.properties) {
            if (obj.id.properties.isHotspotChild) {
              targetHotspotId = obj.id.properties.parentHotspotId;
            } else if (obj.id.properties.isHotspotMain) {
              targetHotspotId = obj.id.properties.hotspotId;
            }
            if (targetHotspotId) break;
          }
        }

        if (targetHotspotId) {
          if (currentHoveredHotspotId !== targetHotspotId) {
            if (currentHoveredHotspotId) {
              const prevChild = viewer.entities.getById(
                `hotspot_child_${currentHoveredHotspotId}`,
              );
              if (prevChild?.billboard) prevChild.billboard.show = false;
            }

            currentHoveredHotspotId = targetHotspotId;
            const currentChild = viewer.entities.getById(
              `hotspot_child_${targetHotspotId}`,
            );
            if (currentChild?.billboard) currentChild.billboard.show = true;
          }
        } else if (currentHoveredHotspotId) {
          const currentChild = viewer.entities.getById(
            `hotspot_child_${currentHoveredHotspotId}`,
          );
          if (currentChild?.billboard) currentChild.billboard.show = false;
          currentHoveredHotspotId = null;
        }
      },
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    );
  }

  enableHotspotClick();
};

let allHotspotsVisible = false;

/** 高效清除：只删已记录的实体 + 摧毁悬停/点击 handler，不遍历全场景 */
const clearAllHotspots = () => {
  if (!viewer) return;
  Object.keys(hotspotMainEntities).forEach((id) => {
    viewer.entities.removeById(`hots_${id}`);
    viewer.entities.removeById(`hotspot_child_${id}`);
  });
  Object.keys(hotspotMainEntities).forEach((id) => delete hotspotMainEntities[id]);
  // ② 清 C 馆热点（addHotspot 缓存的 hot_ 实体）—— 不再遍历全场景
  legacyHotspotEntities.forEach((entity) => {
    if (entity && viewer.entities.contains(entity)) {
      viewer.entities.remove(entity);
    }
  });
  legacyHotspotEntities.length = 0;

  // ③ 兜底：万一有遗漏的 hot_ 前缀实体，遍历时加类型守卫，
  //    防止 id 为 number 的实体（gaodidianliandong 等创建）导致崩溃
  viewer.entities.values
    .filter((e) => typeof e.id === "string" && e.id.startsWith("hot_"))
    .forEach((e) => viewer.entities.remove(e));

  currentHoveredHotspotId = null;
  disableHotspotClick();                    // 关掉摄像头点击弹窗
  if (handler) { handler.destroy(); handler = null; } // 关掉 MOUSE_MOVE 悬停
  allHotspotsVisible = false;
};

/** 一次性加载 A馆+C馆 全部实时监控热点 */
const showAllHotspots = async () => {
  if (allHotspotsVisible) return;          // ✅ 已显示则不重复加载
  const [ra, rb, rc] = await Promise.all([fetch("/pointss.json"), fetch("/pointssC.json"), fetch("/points.json")]);
  const [listA, listB, listC] = await Promise.all([ra.json(), rb.json(), rc.json()]);
  await addHotspots([...listA, ...listB]); // 合并后调一次，绕过 addHotspots 的去重守卫
  await addHotspot(listC);
  allHotspotsVisible = true;
};

/** 切换入口，供父组件调用 */
const toggleAllHotspots = async () => {
  if (allHotspotsVisible) { clearAllHotspots(); return false; }
  await showAllHotspots();
  return true;
};

// 保留原始数组数据
const ld = (option = null) => {
  // 定义点位数据
  const gdld = [
    {
      id: "r1",
      startLnt: 116.521555,
      startLat: 39.778948,
      height: 0.1,
      name: "A馆南侧",
    },
    {
      id: "r2",
      startLnt: 116.521412,
      startLat: 39.779137,
      height: 0.1,
      name: "A馆北侧",
    },
    {
      id: "r3",
      startLnt: 116.521734,
      startLat: 39.77978,
      height: 0.1,
      name: "B馆南侧",
    },
    {
      id: "r4",
      startLnt: 116.520561,
      startLat: 39.779392,
      height: 0.1,
      name: "B馆中间",
    },
    {
      id: "r5",
      startLnt: 116.521236,
      startLat: 39.779902,
      height: 0.1,
      name: "B馆北侧",
    },
    {
      id: "r6",
      startLnt: 116.521971,
      startLat: 39.778485,
      height: 0.1,
      name: "外围鹰眼",
    },
    {
      id: "r7",
      startLnt: 116.522313,
      startLat: 39.77909,
      height: 0.1,
      name: "序厅一楼",
    },
    {
      id: "r8",
      startLnt: 116.52155,
      startLat: 39.778685,
      height: 0.1,
      name: "序厅二楼",
    },
    {
      id: "r9",
      startLnt: 116.51959,
      startLat: 39.778925,
      height: 0.1,
      name: "会客厅",
    },
    {
      id: "r10",
      startLnt: 116.520107,
      startLat: 39.778191,
      height: 0.1,
      name: "报告厅",
    },
    {
      id: "r11",
      startLnt: 116.520437,
      startLat: 39.778444,
      height: 0.1,
      name: "生态连廊",
    },
    {
      id: "r12",
      startLnt: 116.520925,
      startLat: 39.779154,
      height: 0.1,
      name: "AB连廊",
    },
    {
      id: "r13",
      startLnt: 116.519153,
      startLat: 39.778731,
      height: 0.1,
      name: "西广场",
    },
    {
      id: "r17",
      startLnt: 116.518792,
      startLat: 39.779686,
      height: 0.1,
      name: "北会",
    },
    // 这里加
    {
      id: "r14",
      startLnt: 116.52067,
      startLat: 39.780359,
      height: 0.1,
      name: "C馆南侧",
    },
    {
      id: "r15",
      startLnt: 116.520454,
      startLat: 39.780628,
      height: 0.1,
      name: "C馆中侧",
    },
    {
      id: "r16",
      startLnt: 116.520242,
      startLat: 39.78088,
      height: 0.1,
      name: "C馆北侧",
    },
  ];

  // 处理不同操作类型
  if (typeof option === "string") {
    // 如果传入"all"，则显示所有点位
    if (option === "all") {
      gdld.forEach((item) => showEntity(item));
      return;
    }

    // 如果传入"clear"，则清除所有点位
    if (option === "clear") {
      gdld.forEach((item) => viewer.entities.removeById(item.id));
      return;
    }

    // 否则视为单个id操作
    const targetItem = gdld.find((item) => item.id === option);
    if (targetItem) {
      // 检查该实体是否已存在
      const existingEntity = viewer.entities.getById(option);
      if (existingEntity) {
        // 如果已存在则移除
        viewer.entities.removeById(option);
      } else {
        // 不存在则显示
        showEntity(targetItem);
      }
    }
  } else {
    // 默认行为：如果没有传入参数或参数无效，显示所有点位
    gdld.forEach((item) => showEntity(item));
  }

  // 显示实体的辅助函数
  function showEntity(item) {
    // 先移除已存在的实体，避免重复添加
    viewer.entities.removeById(item.id);

    // 添加实体
    viewer.entities.add({
      id: item.id,
      position: Cesium.Cartesian3.fromDegrees(
        item.startLnt,
        item.startLat,
        item.height,
      ),
      label: {
        text: item.name,
        font: "bold 17px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        scale: 1.0,
        pixelOffset: new Cesium.Cartesian2(0, -147),
        // disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
      },
      billboard: {
        image: "/标签.png",
        width: 130,
        height: 90,
        pixelOffset: new Cesium.Cartesian2(0, -70),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scale: 1.0,
        // disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
        zIndex: 0, // 最低层级
      },
    });
  }
};


// 点击获取经纬度（包含3D模型高度）
const clickHandlers = (event: any) => {
  // 使用 pickPosition 可以获取包括3D模型在内的准确位置
  const cartesian = viewer.scene.pickPosition(event.position);

  if (cartesian) {
    // 转换为地理坐标
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height;

    console.log(
      `经度: ${longitude.toFixed(6)},  ${latitude.toFixed(
        6,
      )}, 高度: ${height.toFixed(2)}`,
    );
    console.log(getView());
  }
};

//获取相机视角
let getView = () => {
  //获取当前视角的pitch
  var pitch = viewer.camera.pitch;
  //获取当前视角的heading
  var heading = viewer.camera.heading;
  //获取当前视角的postion（位置）
  var position = viewer.camera.position;
  var x = position.x;
  var y = position.y;
  var z = position.z;
  // var testPitch = pitch;
  // var testHeading = heading;
  // console.log("获取当前视角x,y,z", position.x, position.y, position.z, "pitch", pitch, "heading", heading);

  var ObjectJson = {
    x: x,
    y: y,
    z: z,
    pitch: pitch,
    heading: heading,
  };
  // console.log("ObjectJson", ObjectJson);
  return ObjectJson;
};

let trailer1Ref = ref();
let trailer2Ref = ref();
let trailer3Ref = ref();
let trailer4Ref = ref();
let trailer5Ref = ref();
let trailer6Ref = ref();
let trailer7Ref = ref();
let trailer8Ref = ref();
let trailer9Ref = ref();
let trailer10Ref = ref();
let trailer11Ref = ref();
let trailer12Ref = ref();
let trailer13Ref = ref();
let trailer14Ref = ref();
let trailer15Ref = ref();
let trailer16Ref = ref();
let trailer17Ref = ref();
let trailer18Ref = ref();
let trailer19Ref = ref();
let trailer30Ref = ref();
let trailer31Ref = ref();
let trailer32Ref = ref();
let trailer33Ref = ref();
let trailer34Ref = ref();
let trailer35Ref = ref();

function test1() {
  //获取当前视角的pitch
  var pitch = viewer.camera.pitch;
  //获取当前视角的heading
  var heading = viewer.camera.heading;
  //获取当前视角的postion（位置）
  var position = viewer.camera.position;
  let x = position.x;
  let y = position.y;
  let z = position.z;
  let testPitch = pitch;
  let testHeading = heading;
  console.log(
    "获取当前视角x,y,z",
    position.x,
    position.y,
    position.z,
    "pitch",
    pitch,
    "heading",
    heading,
  );

  var ObjectJson = {
    x: x,
    y: y,
    z: z,
    pitch: pitch,
    heading: heading,
  };
  console.log("ObjectJson", ObjectJson);
  if (!window.localStorage) {
    window.alert("该浏览器不支持LocalStorage");
  } else {
    let storage = window.localStorage;
    storage.setItem("positionJson", JSON.stringify(ObjectJson));
    console.log("storage.positionJson", storage.positionJson);
  }
}
let trailer36Ref = ref();
let trailer37Ref = ref();
let trailer38Ref = ref();

let shipin: any;
let shipins: any;

let QuanJing = function (e, idArray) {
  // 定义所有视频实体配置 ---- 小屏
  const videoEntities = [
    // 第二版视频点位
    {
      id: "q2",
      hierarchy: [
        116.52235949210296, 39.779725271226546,
        116.52249511050584, 39.77956744104842,
        116.52255550357387, 39.77958636845925,
        // 116.52046083849733, 39.77855053655212,
        // 116.52037855630432, 39.77870794589659,
        116.52048565304626, 39.77854420329266,

        116.52034698571595, 39.77871075083103,
      ],
      materialRef: trailer2Ref,
      height: 1.5,
      rotation: Cesium.Math.toRadians(-182),
      stRotation: Cesium.Math.toRadians(-213),
      // streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/Ab211/webrtc",
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/Ab211/webrtc",
      visible: !e,
      x: -2191837.840988996, y: 4391846.580846679, z: 4059218.7812181143, pitch: -0.27361528074335073, heading: 4.133470092831442
    },

    {
      id: "q6",
      hierarchy: [
        116.52116875398785, 39.77980063105643,
        116.51993779247955, 39.77915859917878,
        116.5198262910951, 39.77928925530023,
        116.52106239740932, 39.77992445744558,

      ],
      materialRef: trailer6Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(146),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B2x813/webrtc",
      visible: !e,
      x: -2191776.6745118657, y: 4391829.610455442, z: 4059267.6261500968, pitch: -0.27361528788557665, heading: 4.133470095898148
    },

    {
      id: "q4",
      hierarchy: [
        116.5219763183091, 39.780190005660444,
        116.52117670378607, 39.77978442457041,
        116.52104980093331, 39.779930926201125,
        116.52185863586885, 39.78033912826204,
      ],
      materialRef: trailer4Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(37),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B1d1012/webrtc",
      visible: !e,
      x: -2191776.6745118657, y: 4391829.610455442, z: 4059267.6261500968, pitch: -0.27361528788557665, heading: 4.133470095898148


    },
    {
      id: "q5",
      hierarchy: [
        116.52140502287723, 39.77951983480345,
        116.52016646198457, 39.778901791683865,
        116.52003159688729, 39.77904457857391,
        116.52127813500208, 39.77966604218504
      ],
      materialRef: trailer5Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-110),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B2x27/webrtc",
      visible: !e,
      x: -2191803.2847895636, y: 4391837.034217936, z: 4059245.2259718766, pitch: -0.27361528479024466, heading: 4.13347009456906
    },
    {
      id: "q7",
      hierarchy: [
        116.52207870053472, 39.78007278241762,
        116.52220162775957, 39.7799227098656,
        116.52139985276874, 39.77951689171274,
        116.52127325524256, 39.77966324741188,
      ],
      materialRef: trailer7Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-210),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B1d24/webrtc",
      visible: !e,
      x: -2191803.2847895636, y: 4391837.034217936, z: 4059245.2259718766, pitch: -0.27361528479024466, heading: 4.13347009456906
    },
    {
      id: "q9",
      hierarchy: [
        116.52128571699208, 39.77965724148836,
        116.52004871980758, 39.77903151595605,
        116.5199381622298, 39.77916277480509,
        116.52116941098024, 39.77979106345445
      ],
      materialRef: trailer9Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(0),
      stRotation: Cesium.Math.toRadians(-34),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B2x12835/webrtc",
      visible: !e,
      x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.13347009521747
    },
    {
      id: "q1",
      hierarchy: [
        116.5204840707419, 39.77854385695454,
        116.5225194547104, 39.77958621976001,
        116.52264320883513, 39.77939186904636,
        116.52276901411669, 39.77947567105535,
        116.52063734413731, 39.77837287193166,
      ],
      materialRef: trailer1Ref,
      height: 1.7,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/An211/webrtc",
      visible: !e, // 默认显示，除非e为true
      x: -2191857.762064247, y: 4391851.216336267, z: 4059207.8195358147, pitch: -0.273615278180126, heading: 4.133470091730841
    },
    {
      id: "q3",
      hierarchy: [
        116.52197642858245, 39.78019024194994,

        116.52207804728421, 39.7800732364568,

        116.52127344863625, 39.77966366452583,

        116.52117634614076, 39.77978442254384,
      ],
      materialRef: trailer3Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-102),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/B1x57/webrtc",
      visible: !e,
      x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476
    },
    //C
    {
      id: "q41",
      hierarchy: [


        // 116.52155938855734, 39.78072199219563,
        // 			116.52153596023503, 39.78066902179235,
        // 			116.51961919844776, 39.7796961702926,
        // 			116.51938598567948, 39.77996147923146,
        // 			116.52126048450394, 39.780893665286996,
        // 			116.52143571375181, 39.78087216209829


        // 116.52154062925332, 39.78068626287124,
        // 116.52148709428215, 39.780626704964746,
        // 116.51959594908192, 39.77967932477759,
        // 116.51938956197901, 39.779930893676834,
        // 116.52121086219785, 39.780846849894985,
        // 116.5213834253056, 39.780879040957




        116.52154577248137, 39.780678042782505,
        116.52167777799758, 39.78075449975858,
        116.52154435730202, 39.78067660146713,
        116.51962397688746, 39.779697309484625,
        116.51941474059453, 39.77992391013904,
        116.52123144329265, 39.78082804191846,
        116.52140093411269, 39.780870794069635
      ],
      materialRef: trailer36Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/14545/webrtc",
      visible: !e,



      x: -2191733.8457237356, y: 4391820.719662465, z: 4059327.315948713, pitch: -0.8485225161402923, heading: 4.1272352075236025

    },
    // c中
    {
      id: "q42",
      hierarchy: [

        // 116.52140134408624, 39.78099945239965,
        // 							116.52130341196622, 39.78090470569269,
        // 							116.51930036911158, 39.779922649137106,
        // 							116.51912157526033, 39.78012708362883,
        // 							116.52122345021067, 39.78115712829593,
        // 							116.52127757344202, 39.78114442566467

        // 116.52134639980977, 39.780917416754114,
        // 							116.5212348939194, 39.7808591731013,
        // 							116.51929151092563, 39.77988108976067,
        // 							116.51937692692661, 39.77992552608468,
        // 							116.51918706257572, 39.78015922272091,
        // 							116.52104621615761, 39.7810872178031,
        // 							116.5212962749291, 39.78112728324896


        116.5215705064314, 39.781055933324545,
        116.52135784324449, 39.78089187057721,
        116.5193503151259, 39.779886833971474,
        116.51912780304855, 39.78014202192371,
        116.52115548685131, 39.78111878111415,
        116.5213579204378, 39.780891951990924


      ],
      materialRef: trailer37Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/zhong/webrtc",
      visible: !e,

      x: -2191714.377069298, y: 4391812.384958129, z: 4059346.8448545695, pitch: -0.848522518864169, heading: 4.127235212189515

      // x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476
    },
    //c北
    {
      id: "q43",
      hierarchy: [

        // 116.52115547678737, 39.781170192189066,
        // 			116.52105309071348, 39.78106706859534,
        // 			116.51920783869372, 39.78016276018542,
        // 			116.51896940916802, 39.78041676902939,
        // 			116.52082997177169, 39.78131770500593,
        // 			116.52102544403122, 39.7813376973312


        // 116.51915568669145, 39.78013896995889,
        // 			116.51896845307752, 39.78035520599535,
        // 			116.52085670078388, 39.781306258935786,
        // 			116.52098967106087, 39.78134969694512,
        // 			116.52114548942396, 39.7811968186964,
        // 			116.52104050632735, 39.781085709197306


        116.52100109547725, 39.7813383650606,
        116.52082517338268, 39.78131288026174,
        116.51902360061067, 39.780374919146915,
        116.51918699532338, 39.78017004860674,
        116.52103973377773, 39.78106069825779,
        116.52115115151305, 39.78116424441006
      ],
      materialRef: trailer38Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/zuo/webrtc",
      visible: !e,
      // x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476
      x: -2191693.340947181, y: 4391802.476533532, z: 4059368.9224454653, pitch: -0.8485225219434982, heading: 4.127235217464099
    },
  ];

  //这个是大屏
  const ERvideoEntities = [
    // 第二版视频点位
    // x: -2191844.90499787, y: 4391856.579736447, z: 4059193.7804605137, pitch: -0.32501260184049574, heading: 4.149519786668646
    {
      id: "q2",
      hierarchy: [
        // 16.52234376710084, 39.77973520667661,
        // 116.5224850801596, 39.77957058582381,
        // 116.520484316085, 39.778548672980676,
        // 116.52034173719078, 39.778713837705055,

        116.52235949210296, 39.779725271226546, 116.52249511050584,
        39.77956744104842, 116.52255550357387, 39.77958636845925,
        // 116.52046083849733, 39.77855053655212,
        116.52048565304626, 39.77854420329266,

        // 116.52037855630432, 39.77870794589659,
        116.52034698571595, 39.77871075083103,
      ],
      materialRef: trailer2Ref,
      height: 1.5,
      rotation: Cesium.Math.toRadians(-182),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/Ab211/webrtc",
      visible: !e,
      // x: -2191837.944442017, y: 4391842.094228165, z: 4059217.871671475, pitch: -0.4664988109446315, heading: 4.1431139771081815
      // x: -2191827.069284982,
      // y: 4391848.906919208,
      // z: 4059212.715590178,
      // pitch: -0.20905793073725487,
      // heading: 4.009119486301823
      x: -2191835.059618253,
      y: 4391844.498016035,
      z: 4059220.266051973,
      pitch: -0.11756014113769142,
      heading: 4.027884145446638,
    },

    // {
    //   id: "q38",
    //   hierarchy: [
    //     // 116.520167384743, 39.77857112651094,
    //     // 116.52054188865283, 39.77810056082629,
    //     // 116.51994888364183, 39.777819278350144,
    //     // 116.51957559465453, 39.778263803135786,

    //     116.520167384743, 39.77857112651094,
    //     116.52054188865283, 39.77810056082629,
    //     116.51994888364183, 39.777819278350144,
    //     116.51957559465453, 39.778263803135786,
    //   ],
    //   materialRef: trailer36Ref,
    //   height: 1.5,
    //   rotation: Cesium.Math.toRadians(0),
    //   stRotation: Cesium.Math.toRadians(-90),
    //   // stRotation: Cesium.Math.toRadians(-122),
    //   streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/16/webrtc",
    //   // streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/DT/webrtc",

    //   visible: !e,

    //   // x: -2191775.0190955778, y: 4391826.502686914, z: 4059262.7837457466, pitch: -0.28373414291367616, heading: 4.198139681368353
    // },

    // {
    //   id: "q39",
    //   hierarchy: [
    //     // 116.519592, 39.778744,
    //     // 116.519372, 39.778999,
    //     // 116.519726, 39.779173,
    //     // 116.519942, 39.778924,

    //     116.519592, 39.778744,
    //     116.519372, 39.778999,
    //     116.519726, 39.779173,
    //     116.519942, 39.778924,
    //   ],
    //   materialRef: trailer37Ref,
    //   height: 1.7,
    //   rotation: Cesium.Math.toRadians(0),
    //   stRotation: Cesium.Math.toRadians(238),
    //   streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/DT/webrtc",
    //   // streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/16/webrtc",

    //   visible: !e,
    //   // x: -2191775.0190955778, y: 4391826.502686914, z: 4059262.7837457466, pitch: -0.28373414291367616, heading: 4.198139681368353
    // },
    // {
    //   id: "q40",
    //   hierarchy: [
    //     116.518756, 39.778894,
    //     116.519180, 39.779111,
    //     116.519582, 39.778642,
    //     116.519153, 39.778428,
    //   ],
    //   materialRef: trailer40Ref,
    //   height: 0,
    //   rotation: Cesium.Math.toRadians(0),
    //   stRotation: Cesium.Math.toRadians(329),
    //   streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/xiguangchang/webrtc",
    //   visible: !e,

    //   // x: -2191649.5101635903, y: 4392030.632379704, z: 4059120.507504002, pitch: -0.38355857217580414, heading: 5.56680852135305
    //   // x: -2191651.450929657, y: 4392039.272162799, z: 4059116.545801404, pitch: -0.3835587179836688, heading: 5.728905456089201
    //   // x: -2191657.9384788633, y: 4392043.221343086, z: 4059116.3404027424, pitch: -0.44190701208566807, heading: 5.729030297364806

    //   x: -2191695.1914906153,
    //   y: 4392065.850788558,
    //   z: 4059092.426385657,
    //   pitch: -0.3243491626708854,
    //   heading: 5.638998730755515
    // },

    {
      id: "q5",
      hierarchy: [
        116.52140502287723, 39.77951983480345, 116.52016646198457,
        39.778901791683865, 116.52003159688729, 39.77904457857391,
        116.52127813500208, 39.77966604218504,
      ],
      materialRef: trailer5Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-110),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x27/webrtc",
      visible: !e,
      x: -2191750.5095564616,
      y: 4391894.103227447,
      z: 4059205.713993248,
      pitch: -0.4897681702400276,
      heading: 4.180667562874038,
      // x: -2191729.651153282, y: 4391916.67578974, z: 4059192.553673214, pitch: -0.48976816855460026, heading: 4.180667561346591
      // x: -2191690.9391007717, y: 4391960.957043947, z: 4059165.544528294, pitch: -0.48976816509540333, heading: 4.1806675582116775
    },

    {
      id: "q6",
      hierarchy: [
        116.52116875398785, 39.77980063105643, 116.51993779247955,
        39.77915859917878, 116.5198262910951, 39.77928925530023,
        116.52106239740932, 39.77992445744558,
      ],
      materialRef: trailer6Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(146),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x813/webrtc",
      visible: !e,
      x: -2191720.332699067,
      y: 4391888.096954051,
      z: 4059227.055239809,
      pitch: -0.4767043771541237,
      heading: 4.159876252137962,
      // x: -2191706.3078291058, y: 4391904.413447521, z: 4059216.974034116, pitch: -0.47670437581773895, heading: 4.15987625101862
      // x: -2191678.0782927284, y: 4391937.588132374, z: 4059196.322180759, pitch: -0.47670437308001157, heading: 4.159876248725511
      // x: -2191663.776215903, y: 4391954.839361683, z: 4059185.378860554, pitch: -0.4767043716292476, heading: 4.159876247510374
    },
    {
      id: "q4",
      hierarchy: [
        116.5219763183091, 39.780190005660444, 116.52117670378607,
        39.77978442457041, 116.52104980093331, 39.779930926201125,
        116.52185863586885, 39.78033912826204,
      ],
      materialRef: trailer4Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(37),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1d1012/webrtc",
      visible: !e,
      // x: -2191775.0190955778, y: 4391826.502686914, z: 4059262.7837457466, pitch: -0.28373414291367616, heading: 4.198139681368353
      // x: -2191772.811265936,
      // y: 4391825.302236272,
      // z: 4059266.8517366457,
      // pitch: -0.3526389963317018,
      // heading: 3.8960179104074215

      x: -2191776.560364014,
      y: 4391828.52000048,
      z: 4059267.2769953376,
      pitch: -0.11599974973720695,
      heading: 4.012165263052713,
    },
    {
      id: "q7",
      hierarchy: [
        116.52207870053472, 39.78007278241762, 116.52220162775957,
        39.7799227098656, 116.52139985276874, 39.77951689171274,
        116.52127325524256, 39.77966324741188,
      ],
      materialRef: trailer7Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-210),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1d24/webrtc",
      visible: !e,
      // x: -2191797.117216274, y: 4391838.986216471, z: 4059239.037856776, pitch: -0.4925220432304993, heading: 4.180845658144377
      // x: -2191797.1577867344,
      // y: 4391834.694502901,
      // z: 4059240.812518247,
      // pitch: -0.20861116735809548,
      // heading: 3.990725170132234

      x: -2191801.8546009064,
      y: 4391836.207263938,
      z: 4059245.3165048305,
      pitch: -0.11599974081254327,
      heading: 4.0382307749946404,
    },

    {
      id: "q9",
      hierarchy: [
        116.52128571699208, 39.77965724148836, 116.52004871980758,
        39.77903151595605, 116.5199381622298, 39.77916277480509,
        116.52116941098024, 39.77979106345445,
      ],
      materialRef: trailer9Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(0),
      stRotation: Cesium.Math.toRadians(-34),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x12835/webrtc",
      visible: !e,
      x: -2191742.670173698,
      y: 4391893.550770889,
      z: 4059211.7385337544,
      pitch: -0.4923482233027925,
      heading: 4.940834140511478,
      // x: -2191726.256564118, y: 4391911.38601078, z: 4059201.303893404, pitch: -0.4923482238996941, heading: 4.940834139134404
      // x: -2191693.2119106897, y: 4391947.332641984, z: 4059180.252708347, pitch: -0.4923482251038851, heading: 4.94083413635615
      // x: -2191682.5875212997, y: 4391960.184887759, z: 4059172.0832862654, pitch: -0.4923482255712255, heading: 4.940834135277956
    },

    {
      id: "q31", //A馆序厅二楼
      hierarchy: [
        116.52061121313045, 39.778369615251734, 116.52264595892827,
        39.77940197667817, 116.52282024157525, 39.77919703683782,
        116.5207891984327, 39.77816947212912,
      ],
      materialRef: trailer31Ref,
      height: 0.3,
      rotation: Cesium.Math.toRadians(0),
      stRotation: Cesium.Math.toRadians(148),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/xt2/webrtc",
      visible: !e,
      x: -2191871.9873331613,
      y: 4391858.154635156,
      z: 4059189.7051673406,
      pitch: -0.13210296444420178,
      heading: 3.978323984439869,
      // x: -2191825.2306870394, y: 4391905.081299725, z: 4059163.7924988503, pitch: -0.5234032425931909, heading: 3.6848294851186463
      // x: -2191791.2813096796, y: 4391941.105503058, z: 4059143.1465672636, pitch: -0.523403238128465, heading: 3.6848294835628232
      // x: -2191759.5054861554, y: 4391977.127419905, z: 4059121.328771534, pitch: -0.5234032334101202, heading: 3.68482948191863
    },

    {
      id: "q1",
      hierarchy: [
        // 116.52259073085548, 39.77946082937068,
        // 116.5228216790604, 39.77918698810373,
        // 116.52079618353238, 39.778155322981625,
        // 116.5205564663892, 39.77842859728641,

        116.5204840707419, 39.77854385695454, 116.5225194547104,
        39.77958621976001, 116.52264320883513, 39.77939186904636,
        116.52276901411669, 39.77947567105535, 116.52063734413731,
        39.77837287193166,
      ],
      materialRef: trailer1Ref,
      height: 1.7,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/An211/webrtc",
      visible: !e, // 默认显示，除非e为true
      // x: -2191851.882654214,
      // y: 4391848.089689518,
      // z: 4059204.507587001,
      // pitch: -0.33895532792516625,
      // heading: 4.0391208389122

      x: -2191853.592393524,
      y: 4391849.726027105,
      z: 4059205.2531665387,
      pitch: -0.10983709195249025,
      heading: 4.038483152598138,

      // x: -2191851.352057303, y: 4391852.580596374, z: 4059200.47307413, pitch: -0.4728214206952601, heading: 4.1631392007488675
      // x: -2191832.9107940835, y: 4391874.108516843, z: 4059187.138567423, pitch: -0.4728214189368707, heading: 4.163139199279333
      // x: -2191794.376106437, y: 4391917.090242023, z: 4059161.4411254837, pitch: -0.47282141554806634, heading: 4.163139196447265
      // x: -2191766.1485641594, y: 4391949.7145180665, z: 4059141.383958495, pitch: -0.472821412902944, heading: 4.16313919423669
      // x: -2191740.1311700097, y: 4391978.604781577, z: 4059124.1730663152, pitch: -0.47282141063310634, heading: 4.16313919233973
    },
    {
      id: "q3",
      hierarchy: [
        116.52197642858245, 39.78019024194994,

        116.52207804728421, 39.7800732364568,

        116.52127344863625, 39.77966366452583,

        116.52117634614076, 39.77978442254384,
      ],
      materialRef: trailer3Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-102),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1x57/webrtc",
      visible: !e,
      // x: -2191778.418887873, y: 4391838.19987968, z: 4059248.151758411, pitch: -0.3833461336507249, heading: 4.077378445919759
      // x: -2191784.449081554,
      // y: 4391829.797225024,
      // z: 4059252.6374086295,
      // pitch: -0.2655300429707199,
      // heading: 3.9657583994748102
      x: -2191788.5398980123,
      y: 4391832.838743265,
      z: 4059256.1651669266,
      pitch: -0.11599974251074618,
      heading: 4.038230775242267,
    },
  ];

  //这个是5760 x1080
  const SANvideoEntities = [
    // 第二版视频点位
    // x: -2191844.90499787, y: 4391856.579736447, z: 4059193.7804605137, pitch: -0.32501260184049574, heading: 4.149519786668646
    {
      id: "q2",
      hierarchy: [
        // 116.52235113817672, 39.7797356927528,
        // 116.52258915477995, 39.77945675255803,
        // 116.52055971499819, 39.778427737753255,
        // 116.52034571403847, 39.778697524970866

        116.52235949210296, 39.779725271226546, 116.52249511050584,
        39.77956744104842, 116.52255550357387, 39.77958636845925,
        // 116.52046083849733, 39.77855053655212,
        116.52048565304626, 39.77854420329266,
        // 116.52037855630432, 39.77870794589659,
        116.52034698571595, 39.77871075083103,
      ],
      materialRef: trailer2Ref,
      height: 1.5,
      rotation: Cesium.Math.toRadians(-182),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/Ab211/webrtc",
      visible: !e,
      // x: -2191837.944442017, y: 4391842.094228165, z: 4059217.871671475, pitch: -0.4664988109446315, heading: 4.1431139771081815
      // x: -2191827.069284982,
      // y: 4391848.906919208,
      // z: 4059212.715590178,
      // pitch: -0.20905793073725487,
      // heading: 4.009119486301823
      x: -2191835.059618253,
      y: 4391844.498016035,
      z: 4059220.266051973,
      pitch: -0.11756014113769142,
      heading: 4.027884145446638,
    },
    {
      id: "q5",
      hierarchy: [
        116.52140502287723, 39.77951983480345, 116.52016646198457,
        39.778901791683865, 116.52003159688729, 39.77904457857391,
        116.52127813500208, 39.77966604218504,
      ],
      materialRef: trailer5Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-110),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x27/webrtc",
      visible: !e,
      x: -2191750.5095564616,
      y: 4391894.103227447,
      z: 4059205.713993248,
      pitch: -0.4897681702400276,
      heading: 4.180667562874038,
    },

    {
      id: "q6",
      hierarchy: [
        116.52116875398785, 39.77980063105643, 116.51993779247955,
        39.77915859917878, 116.5198262910951, 39.77928925530023,
        116.52106239740932, 39.77992445744558,
      ],
      materialRef: trailer6Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(146),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x813/webrtc",
      visible: !e,
      x: -2191720.332699067,
      y: 4391888.096954051,
      z: 4059227.055239809,
      pitch: -0.4767043771541237,
      heading: 4.159876252137962,
      // x: -2191706.3078291058, y: 4391904.413447521, z: 4059216.974034116, pitch: -0.47670437581773895, heading: 4.15987625101862
      // x: -2191678.0782927284, y: 4391937.588132374, z: 4059196.322180759, pitch: -0.47670437308001157, heading: 4.159876248725511
      // x: -2191663.776215903, y: 4391954.839361683, z: 4059185.378860554, pitch: -0.4767043716292476, heading: 4.159876247510374
    },
    {
      id: "q4",
      hierarchy: [
        116.5219763183091, 39.780190005660444, 116.52117670378607,
        39.77978442457041, 116.52104980093331, 39.779930926201125,
        116.52185863586885, 39.78033912826204,
      ],
      materialRef: trailer4Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(37),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1d1012/webrtc",
      visible: !e,
      // x: -2191775.0190955778, y: 4391826.502686914, z: 4059262.7837457466, pitch: -0.28373414291367616, heading: 4.198139681368353
      // x: -2191772.811265936,
      // y: 4391825.302236272,
      // z: 4059266.8517366457,
      // pitch: -0.3526389963317018,
      // heading: 3.8960179104074215

      x: -2191776.560364014,
      y: 4391828.52000048,
      z: 4059267.2769953376,
      pitch: -0.11599974973720695,
      heading: 4.012165263052713,
    },
    {
      id: "q7",
      hierarchy: [
        116.52207870053472, 39.78007278241762, 116.52220162775957,
        39.7799227098656, 116.52139985276874, 39.77951689171274,
        116.52127325524256, 39.77966324741188,
      ],
      materialRef: trailer7Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-210),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1d24/webrtc",
      visible: !e,
      // x: -2191797.117216274, y: 4391838.986216471, z: 4059239.037856776, pitch: -0.4925220432304993, heading: 4.180845658144377
      // x: -2191797.1577867344,
      // y: 4391834.694502901,
      // z: 4059240.812518247,
      // pitch: -0.20861116735809548,
      // heading: 3.990725170132234

      x: -2191801.8546009064,
      y: 4391836.207263938,
      z: 4059245.3165048305,
      pitch: -0.11599974081254327,
      heading: 4.0382307749946404,
    },

    {
      id: "q9",
      hierarchy: [
        116.52128571699208, 39.77965724148836, 116.52004871980758,
        39.77903151595605, 116.5199381622298, 39.77916277480509,
        116.52116941098024, 39.77979106345445,
      ],
      materialRef: trailer9Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(0),
      stRotation: Cesium.Math.toRadians(-34),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B2x12835/webrtc",
      visible: !e,
      x: -2191742.670173698,
      y: 4391893.550770889,
      z: 4059211.7385337544,
      pitch: -0.4923482233027925,
      heading: 4.940834140511478,
      // x: -2191726.256564118, y: 4391911.38601078, z: 4059201.303893404, pitch: -0.4923482238996941, heading: 4.940834139134404
      // x: -2191693.2119106897, y: 4391947.332641984, z: 4059180.252708347, pitch: -0.4923482251038851, heading: 4.94083413635615
      // x: -2191682.5875212997, y: 4391960.184887759, z: 4059172.0832862654, pitch: -0.4923482255712255, heading: 4.940834135277956
    },

    {
      id: "q1",
      hierarchy: [
        // 116.52259073085548, 39.77946082937068,
        // 116.5228216790604, 39.77918698810373,
        // 116.52079618353238, 39.778155322981625,
        // 116.5205564663892, 39.77842859728641,

        116.5204840707419, 39.77854385695454, 116.5225194547104,
        39.77958621976001, 116.52264320883513, 39.77939186904636,
        116.52276901411669, 39.77947567105535, 116.52063734413731,
        39.77837287193166,
      ],
      materialRef: trailer1Ref,
      height: 1.7,
      rotation: Cesium.Math.toRadians(-3),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/An211/webrtc",
      visible: !e, // 默认显示，除非e为true
      // x: -2191851.882654214,
      // y: 4391848.089689518,
      // z: 4059204.507587001,
      // pitch: -0.33895532792516625,
      // heading: 4.0391208389122

      x: -2191853.592393524,
      y: 4391849.726027105,
      z: 4059205.2531665387,
      pitch: -0.10983709195249025,
      heading: 4.038483152598138,

      // x: -2191851.352057303, y: 4391852.580596374, z: 4059200.47307413, pitch: -0.4728214206952601, heading: 4.1631392007488675
      // x: -2191832.9107940835, y: 4391874.108516843, z: 4059187.138567423, pitch: -0.4728214189368707, heading: 4.163139199279333
      // x: -2191794.376106437, y: 4391917.090242023, z: 4059161.4411254837, pitch: -0.47282141554806634, heading: 4.163139196447265
      // x: -2191766.1485641594, y: 4391949.7145180665, z: 4059141.383958495, pitch: -0.472821412902944, heading: 4.16313919423669
      // x: -2191740.1311700097, y: 4391978.604781577, z: 4059124.1730663152, pitch: -0.47282141063310634, heading: 4.16313919233973
    },
    {
      id: "q3",
      hierarchy: [
        116.52197642858245, 39.78019024194994,

        116.52207804728421, 39.7800732364568,

        116.52127344863625, 39.77966366452583,

        116.52117634614076, 39.77978442254384,
      ],
      materialRef: trailer3Ref,
      height: 0.05,
      rotation: Cesium.Math.toRadians(-102),
      stRotation: Cesium.Math.toRadians(-213),
      streamUrl:
        "http://172.160.114.20:54321/stream/beilu1/channel/B1x57/webrtc",
      visible: !e,
      // x: -2191778.418887873, y: 4391838.19987968, z: 4059248.151758411, pitch: -0.3833461336507249, heading: 4.077378445919759
      // x: -2191784.449081554,
      // y: 4391829.797225024,
      // z: 4059252.6374086295,
      // pitch: -0.2655300429707199,
      // heading: 3.9657583994748102
      x: -2191788.5398980123,
      y: 4391832.838743265,
      z: 4059256.1651669266,
      pitch: -0.11599974251074618,
      heading: 4.038230775242267,
    },
    //C
    {
      id: "q41",
      hierarchy: [
        116.52154577248137, 39.780678042782505,
        116.52167777799758, 39.78075449975858,
        116.52154435730202, 39.78067660146713,
        116.51962397688746, 39.779697309484625,
        116.51941474059453, 39.77992391013904,
        116.52123144329265, 39.78082804191846,
        116.52140093411269, 39.780870794069635
      ],
      materialRef: trailer36Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/14545/webrtc",
      visible: !e,
      x: -2191733.8457237356, y: 4391820.719662465, z: 4059327.315948713, pitch: -0.8485225161402923, heading: 4.1272352075236025

    },
    // c中
    {
      id: "q42",
      hierarchy: [
        116.5215705064314, 39.781055933324545,
        116.52135784324449, 39.78089187057721,
        116.5193503151259, 39.779886833971474,
        116.51912780304855, 39.78014202192371,
        116.52115548685131, 39.78111878111415,
        116.5213579204378, 39.780891951990924
      ],
      materialRef: trailer37Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/zhong/webrtc",
      visible: !e,

      x: -2191714.377069298, y: 4391812.384958129, z: 4059346.8448545695, pitch: -0.848522518864169, heading: 4.127235212189515

      // x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476
    },
    //c北
    {
      id: "q43",
      hierarchy: [
        116.52100109547725, 39.7813383650606,
        116.52082517338268, 39.78131288026174,
        116.51902360061067, 39.780374919146915,
        116.51918699532338, 39.78017004860674,
        116.52103973377773, 39.78106069825779,
        116.52115115151305, 39.78116424441006
      ],
      materialRef: trailer38Ref,
      height: 0.5,
      rotation: Cesium.Math.toRadians(30),
      stRotation: Cesium.Math.toRadians(147),
      streamUrl: "http://172.160.114.20:54321/stream/beilu1/channel/zuo/webrtc",
      visible: !e,
      // x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476
      x: -2191693.340947181, y: 4391802.476533532, z: 4059368.9224454653, pitch: -0.8485225219434982, heading: 4.127235217464099
    },
  ];
  // 原有逻辑（保持不变）

  /**
   * 核心优化：创建视频实体并安全播放
   * 1. 创建透明占位材质，避免video在加载出首帧前出现白屏闪烁
   * 2. 监听 video 的 playing 和 loadeddata 事件，在视频真正有画面时再替换材质
   * 3. 超时兜底：如果5秒后视频还没准备好，强制替换材质避免一直透明
   */
  const createVideoEntitySafe = (item, entityConfig) => {
    const videoElement = entityConfig.materialRef.value;
    // 1. 使用完全透明的占位材质
    const placeholderMaterial = new Cesium.Color(0, 0, 0, 0);

    viewer.entities.add({
      id: item,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(entityConfig.hierarchy),
        material: placeholderMaterial, // 初始透明
        clampToGround: true,
        height: entityConfig.height || 0,
        rotation: entityConfig.rotation || 0,
        stRotation: entityConfig.stRotation || 0,
      },
    });

    // 视频首帧渲染完毕后的回调
    const onVideoReady = () => {
      const ent = viewer.entities.getById(item);
      if (ent && ent.polygon) {
        // 切换为真实的视频流材质
        ent.polygon.material = videoElement;
      }
      // 触发后移除监听
      videoElement.removeEventListener("playing", onVideoReady);
      videoElement.removeEventListener("loadeddata", onVideoReady);
    };

    // 2. 绑定事件监听
    // 先移除可能存在的旧监听，防止重复触发
    videoElement.removeEventListener("playing", onVideoReady);
    videoElement.removeEventListener("loadeddata", onVideoReady);
    videoElement.addEventListener("playing", onVideoReady);
    videoElement.addEventListener("loadeddata", onVideoReady);
    // 3. 启动 WebRTC 视频流
    rtcVideo(videoElement, entityConfig.streamUrl);
  };

  if (isSpecialViewport.value === true) {
    ERvideoEntities.forEach((entityConfig) => {
      idArray?.forEach((item) => {
        // 增加可选链容错
        if (item === entityConfig.id) {
          if (idArray.length >= 15) {
            // 调用安全创建方法
            createVideoEntitySafe(item, entityConfig);
          } else {
            // if (entityConfig.x) {
            //   viewer.camera.flyTo({
            //     destination: {
            //       x: entityConfig.x,
            //       y: entityConfig.y,
            //       z: entityConfig.z,
            //     },
            //     orientation: {
            //       heading: entityConfig.heading,
            //       pitch: entityConfig.pitch,
            //     },
            //     duration: 3,
            //   });
            // }
          }
        }
      });
    });

    // 关键：返回视频实体数组，供外部调用
    return ERvideoEntities;
  } else if (isSpecialViewport.value === false) {
    videoEntities.forEach((entityConfig) => {
      // viewer.entities.removeById(entityConfig.id);
      idArray?.forEach((item) => {
        // 增加可选链容错
        if (item === entityConfig.id) {
          if (idArray.length >= 12) {
            // 调用安全创建方法
            createVideoEntitySafe(item, entityConfig);
          } else {
            // if (entityConfig.x) {
            //   viewer.camera.flyTo({
            //     destination: {
            //       x: entityConfig.x,
            //       y: entityConfig.y,
            //       z: entityConfig.z,
            //     },
            //     orientation: {
            //       heading: entityConfig.heading,
            //       pitch: entityConfig.pitch,
            //     },
            //     duration: 3,
            //   });
            // }
          }
        }
      });
    });

    return videoEntities;
  } else {
    SANvideoEntities.forEach((entityConfig) => {
      // viewer.entities.removeById(entityConfig.id);
      idArray?.forEach((item) => {
        // 增加可选链容错
        if (item === entityConfig.id) {
          if (idArray.length >= 12) {
            // 调用安全创建方法
            createVideoEntitySafe(item, entityConfig);
          } else {
            // if (entityConfig.x) {
            //   viewer.camera.flyTo({
            //     destination: {
            //       x: entityConfig.x,
            //       y: entityConfig.y,
            //       z: entityConfig.z,
            //     },
            //     orientation: {
            //       heading: entityConfig.heading,
            //       pitch: entityConfig.pitch,
            //     },
            //     duration: 3,
            //   });
            // }
          }
        }
      });
    });

    //
    return SANvideoEntities;
  }
};

// 修复：获取所有实体配置的函数（保持）
QuanJing.getEntityConfigs = function () {
  // 调用QuanJing时传入默认参数（e默认false，idArray默认空数组）
  return QuanJing(false, []);
};

// 修复：移除所有视频的函数（参数改为接收实体数组）
function removeAllVideos(videoEntities) {
  if (!Array.isArray(videoEntities)) {
    // 增加参数校验
    console.error("移除视频失败：参数不是数组");
    return;
  }
  videoEntities.forEach((entityConfig) => {
    viewer.entities.removeById(entityConfig.id);
    console.log(`已移除视频实体：${entityConfig.id}`);

    // 关闭视频流（增加容错）
    if (entityConfig.materialRef && entityConfig.streamUrl) {
      try {
        const videoMaterial = entityConfig.materialRef.value;
        if (videoMaterial && videoMaterial.video) {
          videoMaterial.video.pause();
          videoMaterial.video.src = "";
          videoMaterial.video.load();
          console.log(`已关闭视频流：${entityConfig.streamUrl}`);
        }
      } catch (err) {
        console.error(`关闭视频流失败 ${entityConfig.id}：`, err);
      }
    }
  });
}

// 修复：移除视频的入口函数（调用正确的获取实体方法）
let yichushipin = () => {
  // 通过getEntityConfigs获取完整的实体数组
  const allEntities = QuanJing.getEntityConfigs();
  removeAllVideos(allEntities);
  console.log("所有视频实体已移除");
};

// 修复：控制单个实体显示/隐藏的函数（改为从QuanJing获取实体配置）
const setEntityVisibility = function (id, visible) {
  const entity = viewer.entities.getById(id);
  console.log(entity, id);
  // 先获取所有实体配置
  const allEntities = QuanJing.getEntityConfigs();
  allEntities.forEach((item) => {
    if (item.id !== id) {
      console.log("移除非目标实体：", item.id);
      viewer.entities.removeById(item.id);
    }
  });
};
let removeurl = () => {
  viewer.entities.removeAll();
  loadModel("/model/tm.glb");
};

function clearResources(vdo) {
  console.log(vdo);

  // 安全关闭 WebRTC 连接
  if (webrtc) {
    webrtc.close();
    webrtc = null;
  }

  // 清理发送通道的定时器
  if (webrtcSendChannelInterval) {
    clearInterval(webrtcSendChannelInterval);
    webrtcSendChannelInterval = null;
  }
  // 停止所有的 video 元素
  const videos = document.querySelectorAll("video");
  videos.forEach((vdo) => {
    vdo.pause();
    vdo.srcObject = null;

    // 停止流中的所有轨道
    if (vdo.srcObject) {
      const stream = vdo.srcObject;
      stream.getTracks().forEach((track) => track.stop());
    }
  });
}

const rtcVideo = (vdo, url) => {
  let webrtc,
    webrtcSendChannel = null,
    webrtcSendChannelInterval;
  if (shipin) {
    shipin.close();

    webrtc = null;
    clearInterval(shipins);
    webrtcSendChannelInterval = null;
  }

  startPlay();
  function startPlay() {
    webrtc = new RTCPeerConnection({
      sdpSemantics: "unified-plan",
    });
    webrtc.onnegotiationneeded = handleNegotiationNeeded;
    webrtc.ontrack = function (event) {
      vdo.srcObject = event.streams[0];
      vdo.play();
      //webrtc.getReceivers()[0].playoutDelayHint = 0;// 0.2s延迟
    };
    webrtc.addTransceiver("video", {
      direction: "sendrecv",
    });
    webrtcSendChannel = webrtc.createDataChannel("foo");

    webrtcSendChannel.onclose = () => {
      startPlay();
      console.log("[onclose] " + url);
    };
    webrtcSendChannel.onopen = () => {
      webrtcSendChannel.send("ping");
      if (webrtcSendChannelInterval) {
        clearInterval(webrtcSendChannelInterval);
      }
      let webrtcSendChannelInterval = setInterval(() => {
        webrtcSendChannel.send("ping");
      }, 1000);
      console.log(
        "[onopen] " + url + "  延迟(ms):" + webrtcSendChannelInterval,
      );
    };

    webrtcSendChannel.onmessage = (e) => console.log(e.data);
  }
  async function handleNegotiationNeeded() {
    let offer = await webrtc.createOffer();

    await webrtc.setLocalDescription(offer);
    $.post(
      url,
      {
        data: btoa(webrtc.localDescription.sdp),
      },
      function (data) {
        try {
          webrtc.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp: atob(data),
            }),
          );
        } catch (e) {
          console.warn(e);
        }
      },
    );
  }

  vdo.addEventListener("loadeddata", () => {
    vdo.play();
  });

  vdo.addEventListener("error", () => {
    console.log("video1 err.");
  });

  shipin = webrtc;
  shipins = webrtcSendChannelInterval;
};

// 组件挂载时初始化
onMounted(() => {
  initCesium();
  // QuanJing();
  loadModelById(1);
  loadModelById(2);
  loadModelById(3);
  ld();
});

// 组件卸载时清理资源
onUnmounted(() => {
  if (viewer) {
    viewer.destroy();
    // viewer = null
    cruiseCtl.dispose();
  }
  wsManager.destroyAll();
});

// 暴露方法可以在父组件里面使用
defineExpose({
  addHotspot,
  addHotspots,
  toggleAllHotspots, //实时监控切换
  gaodidianliandong,
  gaodidianxutingerlou,
  gaodidianxutingerlouC,
  outgaodidianliandong,
  disableHotspotClick,
  alarmFlyto, //报警飞行
  removeHotspotsByIds,
  // createVideoFusion,
  // cleanVideoFusion,
  test1,
  QuanJing,
  FlightFn,
  loadModel,
  loadModelById, //加载模型
  removeModelById, // 移除模型
  // click_draw_polygon_fn,
  changeMark,
  // stopCruise,
  clearResources,
  setEntityVisibility,
  removeurl,
  yichushipin,
  getRadarDatarc,
  getshengtailianlang,
  getbaogaoting,
  getxuting,
  closeAllWebSockets,
  // ===== 新增：动态区域显示/隐藏 =====
  showDynamicAreas,
  removeDynamicAreas,
  // 暴露新的动画方法
  loadModelWithAnimation: (modelId: number, options?: { dropHeight?: number; duration?: number }) => {
    modelAnimator?.loadModelWithAnimation(modelId, options);
  },
  removeModelWithAnimation: (modelId: number, options?: { raiseHeight?: number; duration?: number }) => {
    modelAnimator?.removeModelWithAnimation(modelId, options);
  },
  // 飞行方法
  flyToView: (viewKey: string, duration?: number) => {
    flyToView(viewKey, duration);
  },
  cruiseStart,
  cruisePause,
  cruiseResume,
  cruiseToggle,
  cruiseStop
});
</script>

<template>
  <div ref="cesiumContainer" class="cesium-viewer">
    <!-- <video ref="VideoRef" class="videos"></video> -->
    <!-- <video id="videoElement" ref="trailer36Ref" muted playsinline style="display: none"></video>
    <video id="videoElement37" ref="trailer37Ref" muted playsinline style="display: none"></video> -->
    <video id="videoElement40" ref="trailer40Ref" muted playsinline style="display: none"></video>
    <video id="trailer1" ref="trailer1Ref" muted playsinline style="display: none"></video>
    <video id="trailer2" ref="trailer2Ref" muted playsinline style="display: none"></video>
    <video id="trailer3" ref="trailer3Ref" muted playsinline style="display: none"></video>
    <video id="trailer4" ref="trailer4Ref" muted playsinline style="display: none"></video>
    <video id="trailer5" ref="trailer5Ref" muted playsinline style="display: none"></video>
    <video id="trailer6" ref="trailer6Ref" muted playsinline style="display: none"></video>
    <video id="trailer7" ref="trailer7Ref" muted playsinline style="display: none"></video>
    <video id="trailer8" ref="trailer8Ref" muted playsinline style="display: none"></video>
    <video id="trailer9" ref="trailer9Ref" muted playsinline style="display: none"></video>
    <video id="trailer10" ref="trailer10Ref" muted playsinline style="display: none"></video>
    <video id="trailer11" ref="trailer11Ref" muted playsinline style="display: none"></video>
    <video id="trailer12" ref="trailer12Ref" muted playsinline style="display: none"></video>
    <video id="trailer13" ref="trailer13Ref" muted playsinline style="display: none"></video>
    <video id="trailer14" ref="trailer14Ref" muted playsinline style="display: none"></video>
    <video id="trailer15" ref="trailer15Ref" muted playsinline style="display: none"></video>
    <video id="trailer16" ref="trailer16Ref" muted playsinline style="display: none"></video>
    <video id="trailer17" ref="trailer17Ref" muted playsinline style="display: none"></video>
    <video id="trailer18" ref="trailer18Ref" muted playsinline style="display: none"></video>
    <video id="trailer19" ref="trailer19Ref" muted playsinline style="display: none"></video>
    <video id="trailer30" ref="trailer30Ref" muted playsinline style="display: none"></video>
    <video id="trailer31" ref="trailer31Ref" muted playsinline style="display: none"></video>
    <video id="trailer32" ref="trailer32Ref" muted playsinline style="display: none"></video>
    <video id="trailer33" ref="trailer33Ref" muted playsinline style="display: none"></video>
    <video id="trailer34" ref="trailer34Ref" muted playsinline style="display: none"></video>
    <video id="trailer35" ref="trailer35Ref" muted playsinline style="display: none"></video>
    <video id="trailer36" ref="trailer36Ref" muted playsinline style="display: none"></video>
    <video id="trailer37" ref="trailer37Ref" muted playsinline style="display: none"></video>
    <video id="trailer38" ref="trailer38Ref" muted playsinline style="display: none"></video>
    <!-- <video id="trailer18" ref="trailer17Ref" muted playsinline style="display: none"></video> -->
    <!-- <video id="trailer19" ref="trailer18Ref" muted playsinline style="display: none"></video> -->
  </div>
</template>

<style scoped>
.cesium-viewer {
  width: 100%;
  height: 100%;
}

.videos {
  display: none;
}

/* @media screen and (width:1920px) and (height:1080px) {
  .cesium-viewer {
    width: 100%;
    height: 100%;
  }
} */
</style>
