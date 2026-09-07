<script lang="ts" setup>
import DataPanel from "@/components/data-panel/index.vue";
import vHead from "@/components/header/header.vue";
import type { VMapExposed } from "@/components/vmap/cesium.vue";
import vMap from "@/components/vmap/cesium.vue";
import { cameraMap } from "@/constants/map";
import type { HotspotEntity, TreePoint } from "@/type/vMap";
import { filterEmptyParams } from "@/utils/common";
import { UI_VALUE_TO_CRUISE_ID } from "@/utils/cruiseFly"; //巡航
import { Search } from '@element-plus/icons-vue';
import axios from "axios";
import dayjs from "dayjs";
import { ElMessage } from "element-plus";
import {
    nextTick,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    shallowRef,
    useTemplateRef,
} from "vue";

// 新增：标记是否为初始化加载全景
const isInitialLoad = ref(true);

const smartItemRefs = ref<HTMLElement[]>([]);
const setSmartItemRef = (el: any, i: number) => {
  if (el) smartItemRefs.value[i] = el;
};

/** 根据 q 编码串同步高亮对应的智能展示项，并自动滚动到可视区 */
const syncSmartHighlight = (uiValue: string) => {
  const idx = smartDisplayItems.value.findIndex((it) => it.value.join(",") === uiValue);
  if (idx < 0) return;
  activeSmartItem.value = smartDisplayItems.value[idx].label;
  nextTick(() => {
    smartItemRefs.value[idx]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",   // 横向滚动容器中把目标滚到中间
      block: "nearest",
    });
  });
};

/* ---- 子组件巡航相关事件 ---- */
const handleCruiseStart = () => {
  showSmartDisplay.value = true;   // 场景内点击模型也要展开面板
};
const handleCruiseRegion = (uiValue: string) => syncSmartHighlight(uiValue);
const handleCruiseFinished = () => {
  activeSmartItem.value = "";  // 巡航结束时清除高亮
  currentCruiseName.value = false;
  tingzhifeixing.value = false;
};

// ✅ 新增：卡片徽标点击 → 暂停/继续（与原导航栏「停止」逻辑等价）
const handleCruiseToggle = () => {
  const st = vMapRef.value?.cruiseToggle();
  if (st === null) return;
  tingzhifeixing.value = st === "paused";
  currentCruiseName.value = st === "running";
};

// 新增：智能展示数据
const showSmartDisplay = ref(false);
const smartDisplayItems = ref([
  { label: 'A馆北侧', value: ['q2'], image: '/src/assets/img/A馆北侧.png' },
  { label: 'A馆南侧', value: ['q1'], image: '/src/assets/img/A馆南侧.png' },
  { label: 'A馆序厅一楼', value: ['q30'], image: '/src/assets/img/序厅一楼.png' },
  { label: 'A馆序厅二楼', value: ['q31'], image: '/src/assets/img/序厅二楼.png' },
  { label: 'B馆北侧', value: ['q4', 'q6'], image: '/src/assets/img/B馆北侧.png' },
  { label: 'B馆中间', value: ['q3', 'q9'], image: '/src/assets/img/B馆中间.png' },
  { label: 'B馆南侧', value: ['q7', 'q5'], image: '/src/assets/img/B馆南侧.png' },
  { label: 'C馆南侧', value: ['q41'], image: '/src/assets/img/C馆南侧.png' },
  { label: 'C馆中间', value: ['q42'], image: '/src/assets/img/C馆中间.png' },
  { label: 'C馆北侧', value: ['q43'], image: '/src/assets/img/C馆北侧.png' },
  { label: '北会', value: ['q44'], image: '/src/assets/img/北会.png' },
  { label: '生态连廊', value: ['q33'], image: '/src/assets/img/ST.png' },
  { label: '报告厅', value: ['q38'], image: '/src/assets/img/报告厅.png' },
  { label: '登录厅', value: ['q39'], image: '/src/assets/img/登录厅.png' },
  { label: '西广场', value: ['q40'], image: '/src/assets/img/西广场.png' },
  { label: 'AB馆连廊', value: ['q32'], image: '/src/assets/img/AB.png' },
]);


// 新增：智能展示切换
const toggleSmartDisplay = () => {
  const next = !showSmartDisplay.value;
  showSmartDisplay.value = next;
  if (!next) {
    // ✅ 关闭面板 = 彻底结束巡航，相机不再被 prerender 接管
    vMapRef.value?.cruiseStop();
    activeSmartItem.value = "";
    currentCruiseName.value = false;
    tingzhifeixing.value = false;
  }
};

// 新增：记录当前选中的智能展示项（用 label 唯一标识）
const activeSmartItem = ref<string>("");

/** 只需飞过去、不巡航的点位（原代码里调 flyToView 的那几个） */
const ONLY_FLY_MAP: Record<string, string> = {
  q39: "dating", q38: "dengluting", q44: "beihui", q40: "xiguangchang",
};

/** ✅ 新增：判断该卡片是否为"巡航型"（只有巡航型才显示 暂停/继续 徽章） */
const isCruiseItem = (value: string[]): boolean => {
  return !!value?.length && !ONLY_FLY_MAP[value[0]];
};

// 修改原点击处理函数
const handleSmartDisplayItemClick = (value: string[], label: string) => {
  if (!value || value.length === 0) return;

  // ✅ 核心修复：无论点哪类 div，先彻底停掉进行中的巡航，
  //    释放 preRender 对相机的接管，flyToView 才能正常执行
  vMapRef.value?.cruiseStop();

  // ✅ 新增：高亮当前选中项
  activeSmartItem.value = label;


  // ...原有逻辑保持不变
  vMapRef.value?.removeModelById(3);
  // 只飞不巡航
  const onlyFlyKey = ONLY_FLY_MAP[value[0]];
  if (onlyFlyKey) {
    currentCruise.value = label;
    vMapRef.value?.flyToView(onlyFlyKey);
    return;
  }

  tingzhifeixing.value = false;
  currentCruiseName.value = true;
  buttonStatus.value.panorama = true;

  // 巡航：查映射表即可，没有任何业务 if-else
  const cruiseId = UI_VALUE_TO_CRUISE_ID[value.join(",")];
  if (!cruiseId) {
    console.warn("[smartDisplay] 未注册的点位组合:", value.join(","));
    return;
  }
  setTimeout(() => vMapRef.value?.cruiseStart(cruiseId), 800);
};


// 报警列表搜索参数
const searchAlarmParams = reactive({
  cameraName: "",
  beginTime: "",
  endTime: "",
});
// 搜索按钮
const handleAlarmSearch = async () => {
  const params = filterEmptyParams(searchAlarmParams);
  const response = await axios({
    url: "/brBk/api/alert/selList",
    method: "GET",
    params,
    timeout: 10000,
  });
  // console.log(searchAlarmParams.beginTime);
  // console.log(searchAlarmParams.endTime);

  // if (response.data) {
  //   console.log(response.data);
  // }
  chainMsgList.value = response.data;
};

const player = shallowRef(null); // 使用 shallowRef 优化性能
let showDataPanel = ref(false);
let currentCruise = ref();
let currentCruiseName = ref(true);

// 添加底部按钮激活状态变量
const activeButton = ref(2); // 初始激活"首页"按钮

// ===== 新增：动态区域显示/隐藏控制 =====
let showDynamicAreas = ref(false);

// 切换动态区域显示/隐藏
const toggleDynamicAreas = () => {
  showDynamicAreas.value = !showDynamicAreas.value;
  if (showDynamicAreas.value) {
    // 当前已显示，点击则关闭
    vMapRef.value?.showDynamicAreas();
  } else {
    // 当前未显示，点击则显示
    vMapRef.value?.removeDynamicAreas();
  }
};

const eveWarn = ref();
const showPopup = ref(false);
const openPopup = (risk) => {
  eveWarn.value = risk;
  showPopup.value = true;
};
const showMonitor = ref(false);
const enterMonitor = () => {
  showPopup.value = false;
  showMonitor.value = true;
};

const closeMonitor = () => {
  showMonitor.value = false;
};

const closePopup = () => {
  showPopup.value = false;
};

// 获取到cesium的全部导出的方法
const vMapRef = useTemplateRef<VMapExposed>("vMapRef");
const videoRef = useTemplateRef("videoRef");

// 飞行控制相关 - 移除弹窗和时间选择逻辑
let flightSpeed = ref<number>(8); // 默认8秒，不再提供修改

// 飞行状态
const flightStatus = reactive({
  isFlying: false,
  currentSpeed: 8,
  currentEntity: null as string | null,
});
let flightTimer: NodeJS.Timeout | null = null;

// ========== 新增：链消息监控弹窗（独立逻辑，不影响原有代码） ==========
// 监控数据列表
const chainMsgList = ref<any[]>([]);
const chainMsgList1 = ref<any[]>([]);
// 弹窗显示状态
const showChainMsgPopup = ref(false);
const showChainMsgPopup1 = ref(false);
// 已加载的数据ID集合（去重）
const loadedMsgIds = ref<Set<string | number>>(new Set());
// 轮询定时器
let chainMsgTimer: NodeJS.Timeout | null = null;

const formatToIOS8601WithTimezone = (dateString: any) => {
  // 解析输入时间（假设为本地时间）
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    throw new Error("Invalid date string");
  }

  // 获取时区偏移（分钟），转换为 ±HH:MM 格式
  const offsetMinutes = date.getTimezoneOffset();
  const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
  const offsetMins = Math.abs(offsetMinutes % 60);
  const sign = offsetMinutes <= 0 ? "+" : "-"; // getTimezoneOffset 返回的是本地时间与 UTC 的差（分钟），西半球为负
  const timezoneOffset = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

  // 补零辅助函数
  const pad = (n) => String(n).padStart(2, "0");

  // 提取各部分
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  // 构造 ISO8601 格式字符串
  const formatted = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${timezoneOffset}`;

  return formatted;
};

// 主函数：输入 "yyyy-MM-dd'T'HH:mm:ss"，输出两个 IOS8601 格式时间
const convertAndAddOneHour = (inputStr: any) => {
  const baseDate = new Date(inputStr);
  if (isNaN(baseDate.getTime())) {
    throw new Error("Invalid input date string");
  }

  // 当前时间格式化
  const currentFormatted = formatToIOS8601WithTimezone(inputStr);

  // // 加一小时
  const oneHourLater = new Date(baseDate.getTime() + 60 * 60 * 1000);

  // // 注意：oneHourLater 是 Date 对象，需重新格式化为相同格式
  // // 使用相同的格式化逻辑（复用函数）
  // const oneHourLaterFormatted = formatToIOS8601WithTimezone(
  //     oneHourLater.toISOString().slice(0, 19) // 临时转为 yyyy-MM-ddTHH:mm:ss
  //         .replace('T', ' ') // 改为空格方便解析？不，我们直接构造字符串
  // );

  // 更稳妥方式：手动构造 inputStr 加一小时的时间字符串再格式化
  // 或者直接基于 oneHourLater 生成字符串（推荐）
  // 重写 format 支持传入 Date 对象
  function formatDateToIOS8601(dateObj) {
    const offsetMinutes = dateObj.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
    const offsetMins = Math.abs(offsetMinutes % 60);
    const sign = offsetMinutes <= 0 ? "+" : "-";
    const timezoneOffset = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

    const pad = (n) => String(n).padStart(2, "0");

    const year = dateObj.getFullYear();
    const month = pad(dateObj.getMonth() + 1);
    const day = pad(dateObj.getDate());
    const hours = pad(dateObj.getHours());
    const minutes = pad(dateObj.getMinutes());
    const seconds = pad(dateObj.getSeconds());
    const milliseconds = String(dateObj.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${timezoneOffset}`;
  }

  const oneHourLaterStr = formatDateToIOS8601(oneHourLater);

  return {
    original: currentFormatted,
    oneHourLater: oneHourLaterStr,
  };
};

const handleChainMsgAction = async (item: any, type: string) => {
  switch (type) {
    case "playback":
      // 飞到相机经纬度位置
      item.name = item.cameraName;
      const cameraCode = cameraMap[item.cameraName];
      vMapRef.value.alarmFlyto(item);
      // 弹出对应视频流播放 code存在则弹窗
      if (cameraCode) {
        const response = await axios({
          url: "/brBk/HKManage/selWsUrlByCode",
          method: "POST",
          data: {
            cameraIndexCode: cameraCode,
          },
          timeout: 10000,
        });
        if (response.data.data) {
          item.wsUrl = response.data.data.url;
          playRTCVideoStream(item);
        }
      }
      // console.log('执行确认操作1111', item?.content?.data?.pmsgFiles[0]?.filePath);
      // eveWarn.value = item?.content?.data?.pmsgFiles[0]?.filePath; // 适配数据结构
      // showPopup.value = true; // 打开警告弹窗
      break;
    case "reject":
      const currentMsgId = item.id;
      chainMsgList1.value = chainMsgList1.value.filter(
        (msg) => (msg.id || msg.msgId) !== currentMsgId,
      );
      loadedMsgIds.value.delete(currentMsgId);

      // ✅ 无任何消息时，自动关闭弹窗
      if (chainMsgList1.value.length === 0) {
        showChainMsgPopup1.value = false;
      }
      break;
    case "confirm":
      // 飞到相机经纬度位置
      item.name = item.cameraName;
      const playbackCode = cameraMap[item.cameraName];
      vMapRef.value.alarmFlyto(item);
      const begintime = convertAndAddOneHour(item.happenTime).original;
      const endtime = convertAndAddOneHour(item.happenTime).oneHourLater;

      // 弹出对应视频流播放 code存在则弹窗
      if (playbackCode) {
        const response = await axios({
          url: "/brBk/HKManage/selPlayBackByCode",
          method: "POST",
          data: {
            cameraIndexCode: playbackCode,
            beginTime: begintime,
            endTime: endtime,
          },
          timeout: 10000,
        });
        if (response.data.data) {
          item.wsUrl = response.data.data.url;
          console.log(response.data.data.url);
          playRTCVideoStream(item);
        }
      }
      break;
  }
};

/**
 * 根据当前浏览器访问地址，动态改写报警图片的访问地址
 *
 * 场景：
 * 1. 内网环境：浏览器地址为 http://172.160.114.20/... 时，imageData 保持原样
 *    http://172.160.114.20:8089/brBk/421_xxx.jpg
 * 2. 外网环境：浏览器地址为 http://101.254.118.66:18081/... 时，改写为
 *    http://101.254.118.66:18081/brBk/421_xxx.jpg
 */
const rewriteImageUrl = (url: string): string => {
  if (!url) return url;

  const { protocol, host } = window.location;

  // 内网环境（10.245.118.11 访问）：保持原有数据不变
  if (host.includes("172.160.114.20")) {
    return url;
  }

  // 外网环境（101.254.118.66:18081 等访问）：将图片 host 替换为当前访问的 host
  try {
    const urlObj = new URL(url, window.location.origin);
    // 相对路径（如 /brBk/xxx.jpg）直接拼当前 origin 即可
    urlObj.protocol = protocol;
    urlObj.host = host;
    return urlObj.toString();
  } catch {
    // 兜底：正则替换协议+域名部分
    return url.replace(/^https?:\/\/[^/]+/, `${protocol}//${host}`);
  }
};


// 单独请求链消息接口（不修改原有fetchChainMessage）
const fetchChainMsgForPopup = async () => {
  try {
    const response = await axios({
      url: "/brBk/api/alert/selList",
      method: "GET",
      timeout: 10000,
    });
    // console.log(response.data);

    if (response.data && Array.isArray(response.data)) {
      // const newMsgList = response.data.data?.data.filter((item: any) => {
      //   const uniqueId = item.id || item.msgId || item.index;
      //   return uniqueId && !loadedMsgIds.value.has(uniqueId);
      // });
      const newMsgList = response.data;
      if (newMsgList.length > 0) {
        // 新数据添加到列表头部
        // chainMsgList.value.unshift(...newMsgList);
        chainMsgList.value = newMsgList;
        // 记录已加载的ID
        newMsgList.forEach((item: any) => {
          loadedMsgIds.value.add(item.id || item.msgId || item.index);
        });
        // 显示弹窗
        // showChainMsgPopup.value = false;
        // ElMessage.info(`收到 ${newMsgList.length} 条新的链消息`);
        // console.log("--------------------", chainMsgList.value)
      }
    }
  } catch (error) {
    console.error("获取链消息用于弹窗失败:", error);
  }
};

// 启动链消息轮询
const startChainMsgPolling = () => {
  // 立即执行一次
  // fetchChainMsgForPopup();
  // 每5秒轮询一次（可调整）
  // chainMsgTimer = setInterval(fetchChainMsgForPopup, 5000);
};

// 停止轮询
const stopChainMsgPolling = () => {
  if (chainMsgTimer) {
    clearInterval(chainMsgTimer);
    chainMsgTimer = null;
  }
};

// 飞行实体映射关系
const entityMap = {
  //A馆北侧
  q2: "entity1",
  //A馆南侧
  q1: "entity2",
  //A馆序厅一楼
  q30: "entity11",
  //A馆序厅二楼
  q31: "entity16",
  //  B馆北侧
  "q4,q6": "entity5",
  //  B馆中间
  "q3,q9": "entity4",
  //  B馆南侧
  "q7,q5": "entity3",
  //  生态连廊
  q33: "entity19",
  //  AB馆连廊
  q32: "entity20",
};

// 停止飞行
const stopFlight = () => {
  if (flightStatus.isFlying) {
    const targetEntity = entityMap[SPfx.value];
    if (targetEntity) {
      // vMapRef.value?.stopCruise(targetEntity);
    }

    flightStatus.isFlying = false;
    ElMessage.info("飞行已停止");

    if (flightTimer) {
      clearInterval(flightTimer);
      flightTimer = null;
    }
  }
};

let isimagelist = ref(false);
let isimagelist1 = ref(false);

let SPfx = ref("");
let SPkzq = ref(false);

let OpenModel1 = function (id) {
  SPfx.value = id;
  SPkzq.value = true;
  const idToArrayMap = {
    q1: [
      1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
      1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024,
      1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036,
      1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046,
    ],
    q2: [
      1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058,
      1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070,
      1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082,
      1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092,
    ],
    q7: [
      1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111,
      1112, 1113, 1114, 1115, 1116, 1117,
    ],
    q3: [
      1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129,
      1130, 1131, 1132, 1133, 1134, 1135,
    ],
    q4: [
      1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147,
      1148, 1149, 1150, 1151, 1152,
    ],
    q5: [
      1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1164,
      1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176,
      1177, 1178, 1179, 1180,
    ],
    q6: [
      1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192,
      1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204,
      1205, 1206, 1207, 1208,
    ],

    q9: [1401, 1402, 1403, 1404, 1405],
    q30: [1460, 1461, 1462, 1463, 1464, 1465],
    q31: [1470, 1471, 1472, 1473, 1474, 1475],
    q32: [1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447],
    q33: [1450, 1451, 1452, 1453, 1454, 1455],
    q34: [],
    q35: [],
    q38: [1420, 1421, 1422, 1423, 1430, 1431, 1432, 1433],
    q39: [1420, 1421, 1422, 1423, 1430, 1431, 1432, 1433],
    q40: [1500, 1501, 1502, 1503],
    //鹰眼视频
    q8: [1300, 1301],
    q15: [1306, 1307, 1308],
    q18: [1302, 1303, 1304],
    q23: [1305],
  };

  // 假设你有一个表示是否有视频的变量（根据你的实际场景命名）
  const hasVideo = true; // true=有视频，false=无视频

  const specialHandlers = {
    "q2,q1": () => {
      vMapRef.value?.QuanJing(true, id);
      const dataArr = hasVideo ? [...idToArrayMap.q1, ...idToArrayMap.q2] : [];
      console.log(dataArr);
      // vMapRef.value?.danquanbu(dataArr);

      // vMapRef.value?.Aguannei();
    },
    "q3,q4,q5,q6,q7": () => {
      vMapRef.value?.QuanJing(true, id);
      if (id == "q3,q4,q5,q6,q7") {
        vMapRef.value?.Bguannei();
      }
      // vMapRef.value?.Bguannei();
      const dataArr = hasVideo
        ? [
          ...idToArrayMap.q3,
          ...idToArrayMap.q4,
          ...idToArrayMap.q5,
          ...idToArrayMap.q6,
          ...idToArrayMap.q7,
        ]
        : [];
      // vMapRef.value?.danquanbu(dataArr);
    },
    "q2,q1,q4,q3,q7,q6,q5": () => {
      vMapRef.value?.QuanJing(true, id);
      // vMapRef.value?.ABguannei();
      const dataArr = hasVideo
        ? [
          ...idToArrayMap.q1,
          ...idToArrayMap.q2,
          ...idToArrayMap.q3,
          ...idToArrayMap.q4,
          ...idToArrayMap.q5,
          ...idToArrayMap.q6,
          ...idToArrayMap.q7,
        ]
        : [];
      // vMapRef.value?.danquanbu(dataArr);
    },
    "q2,q1,q4,q3,q7,q6,q5,q8,q15,q18,q23": () => {
      vMapRef.value?.QuanJing(true, id);
      const dataArr = hasVideo
        ? [
          ...idToArrayMap.q1,
          ...idToArrayMap.q2,
          ...idToArrayMap.q3,
          ...idToArrayMap.q4,
          ...idToArrayMap.q5,
          ...idToArrayMap.q6,
          ...idToArrayMap.q7,
          ...idToArrayMap.q8,
          ...idToArrayMap.q15,
          ...idToArrayMap.q18,
          ...idToArrayMap.q23,
        ]
        : [
          ...idToArrayMap.q8,
          ...idToArrayMap.q15,
          ...idToArrayMap.q18,
          ...idToArrayMap.q23,
        ];
      // vMapRef.value?.danquanbu(dataArr);
    },
    "q2, q1, q4, q3, q7, q6, q5, q9, q8, q15, q18, q23, q30, q31, q32, q33, q34, q35,q38, q39":
      () => {
        vMapRef.value?.QuanJing(true, id);
        const dataArr = hasVideo
          ? [
            ...idToArrayMap.q1,
            ...idToArrayMap.q2,
            ...idToArrayMap.q3,
            ...idToArrayMap.q4,
            ...idToArrayMap.q5,
            ...idToArrayMap.q6,
            ...idToArrayMap.q7,
            ...idToArrayMap.q8,
            ...idToArrayMap.q15,
            ...idToArrayMap.q18,
            ...idToArrayMap.q23,
            ...idToArrayMap.q9,
            ...idToArrayMap.q30,
            ...idToArrayMap.q31,
            ...idToArrayMap.q32,
            ...idToArrayMap.q33,
            ...idToArrayMap.q34,
            ...idToArrayMap.q38,
            ...idToArrayMap.q39,
          ]
          : [
            ...idToArrayMap.q8,
            ...idToArrayMap.q15,
            ...idToArrayMap.q18,
            ...idToArrayMap.q23,
          ];
        // vMapRef.value?.danquanbu(dataArr);
      },
    "q8,q15,q18,q23": () => {
      vMapRef.value?.QuanJing(true, id);
      vMapRef.value?.Qguannei();
    },
  };

  // 优先处理特殊组合
  if (specialHandlers[id]) {
    specialHandlers[id]();
  } else {
    // vMapRef.value?.yichu();

    // 统一处理多选逻辑（支持数组/逗号分隔字符串）
    const ids = Array.isArray(id)
      ? id
      : id.split(",").map((item) => item.trim());

    // 拼接所有选中项的数组（包括q9/q30-q35）
    let mergedArray = [];
    ids.forEach((singleId) => {
      if (idToArrayMap[singleId]) {
        mergedArray = [...mergedArray, ...idToArrayMap[singleId]];
      }
    });

    // 去重（避免重复id）
    mergedArray = [...new Set(mergedArray)];

    // 统一调用地图方法（无论单选/多选）
    vMapRef.value?.QuanJing(true, id);
    // vMapRef.value?.danquanbu(mergedArray);
  }

  isimagelist.value = false;
  isimagelist1.value = false;
  // yincang.value = false;
  // isbtn.value = true;
};

// 按钮状态管理
const buttonStatus = ref({
  outer: false,
  panorama: false,
  xiguangchang: false,
});

const toggleOuter = () => {
  vMapRef.value?.flyToView("waiwei");
};

let QJSP = ref("");
// 全景按钮
const togglePanorama = () => {
  activeSmartItem.value = "";
  if (buttonStatus.value.panorama) {
    vMapRef.value?.yichushipin();
    // vMapRef.value?.loadModelById(3);
    //缓慢降落
    vMapRef.value?.loadModelWithAnimation(3, { dropHeight: 65, duration: 2500 });
    vMapRef.value?.closeAllWebSockets();
    buttonStatus.value.panorama = false;
    SPkzq.value = false;
    SPfx.value = "";
    QJSP.value = "";
    if (flightStatus.isFlying) {
      stopFlight();
    }
  } else {
    QJSP.value = "entity17";
    OpenModel1([
      "q2",
      "q1",
      "q4",
      "q3",
      "q7",
      "q6",
      "q5",
      "q9",
      "q8",
      "q15",
      "q18",
      "q23",
      "q30",
      "q31",
      "q32",
      "q33",
      "q34",
      "q35",
      "q38",
      "q39",
      "q40",
      "q41",
      "q42",
      "q43",
    ]);
    buttonStatus.value.panorama = true;
    vMapRef.value?.closeAllWebSockets();
    vMapRef.value?.getRadarDatarc();
    vMapRef.value?.getshengtailianlang();
    vMapRef.value?.getbaogaoting();
    vMapRef.value?.getxuting();
    // 缓慢升高移除
    // 判断是否是初始化加载
    if (isInitialLoad.value) {
      // 首次 onMounted 执行时：直接移除，无动画
      vMapRef.value?.removeModelById(3);
      // 标记初始化完成，下次点击将走 else 分支
      isInitialLoad.value = false;
    } else {
      // 之后点击全景按钮时：缓慢升高移除，带动画
      vMapRef.value?.removeModelWithAnimation(3, { raiseHeight: 65, duration: 2500 });
    }
    buttonStatus.value.outer = false;
  }
};

// 首页按钮
const toggleHome = () => {
  activeSmartItem.value = "";
  vMapRef.value?.flyToView("Qguannei");
};

const toggleHallA = () => {
  activeSmartItem.value = "";
  vMapRef.value?.flyToView("Aguannei");
};

const toggleHallB = () => {
  activeSmartItem.value = "";
  vMapRef.value?.flyToView("Bguannei");
};
const toggleHallC = () => {
  activeSmartItem.value = "";
  vMapRef.value?.flyToView("Cguannei");
};

const resetHallC = async () => {
  try {
    // 使用axios读取json，自动携带token、baseURL
    const { data: cameras } = await axios.get("/Cgaodidian.json");

    if (!Array.isArray(cameras) || cameras.length === 0) {
      ElMessage.warning("未读取到C馆摄像机数据");
      return;
    }

    const payload = cameras.map((camera) => ({
      cameraIndexCode: camera.cameraIndexCode,
      presetIndex: 300,
    }));

    console.log("C馆复位请求payload：", payload);

    // 发送批量PTZ预置位调用
    const result = await axios.post("/brBk/HKManage/batchPtz", payload);
    console.log("C馆复位接口返回：", result);

    // 根据你们接口约定判断成功条件，自行修改code值
    if (result) {
      ElMessage.success("C馆所有摄像机复位成功");
    } else {
      ElMessage.error(`复位失败：${result.data.msg || "服务返回异常"}`);
    }
  } catch (err) {
    console.error("C馆复位异常：", err);
    ElMessage.error("请求失败，请检查接口连通性");
  }
};

// 弹窗拖动事件
const x = ref(200);
const y = ref(100);
let startX = 0;
let startY = 0;
let dragging = false;
const startDrag = (event: MouseEvent) => {
  dragging = true;
  startX = event.clientX - x.value;
  startY = event.clientY - y.value;
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("mouseup", stopDrag);
};

const doDrag = (event: MouseEvent) => {
  if (dragging) {
    x.value = event.clientX - startX;
    y.value = event.clientY - startY;
  }
};
const stopDrag = () => {
  dragging = false;
  document.removeEventListener("mousemove", doDrag);
  document.removeEventListener("mouseup", stopDrag);
};

// 报警数据
let websockets: WebSocket[] = [];
let getRadarpoeple = () => {
  // if (!("WebSocket" in window)) {
  //   alert("当前浏览器不支持 WebSocket");
  //   return;
  // }1
  //  console.log("--------------------",  11111)
  const websocket = new WebSocket(
    "ws://172.160.114.20:8091/brBk/websocket/alert",
  );

  websocket.onopen = () => { };

  websocket.onmessage = (event: MessageEvent) => {
    try {
      // parsedData.value = JSON.parse(event.data);
      let resData = JSON.parse(event.data);
      console.log(resData);

      chainMsgList1.value.unshift(resData);
      // if (parsedData.value) {
      // // risks.value.push(parsedData);
      //   if (chainMsgList1.value && Array.isArray(chainMsgList1.value)) {
      //     console.log("--------------------",  newMsgList1.value)
      //     const newMsgList1 = chainMsgList1.value.filter((item: any) => {

      //       const uniqueId = item.id || item.msgId || item.index;
      //       return uniqueId && !loadedMsgIds.value.has(uniqueId);
      //     });
      // showChainMsgPopup1.value = true;
      if (chainMsgList1.value.length > 0) {
        // 新数据添加到列表头部
        // chainMsgList1.value.unshift(...chainMsgList1.value);
        // 记录已加载的ID
        chainMsgList1.value.forEach((item: any) => {
          loadedMsgIds.value.add(item.id || item.msgId || item.index);
        });
        // 显示弹窗
        showChainMsgPopup1.value = true;
        // ElMessage.info(`收到 ${newMsgList1.length} 条新的链消息`);
        console.log("--------------------", chainMsgList1.value);
      }
      //   }
      // } else {
      //   return;
      // }
      // console.log(parsedData.value.data.data);
    } catch (error) {
      console.error(`WebSocket 数据解析错误:`, error);
    }
  };

  websocket.onerror = () => {
    console.log(`WebSocket 连接发生错误`);
  };

  websocket.onclose = () => {
    console.log(`WebSocket 连接已关闭`);
  };

  websockets.push(websocket);
};

// 关闭所有 WebSocket
const closeWebSocket = () => {
  websockets.forEach((websocket, index) => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close(1000, "Manual close");
    }
  });
  setTimeout(() => {
    websockets = [];
  }, 100);
};

// 控制页面显示与隐藏
const isShow = reactive({
  isShows: true,
  isShowVideo: false,
});

// 动态按钮显示的文字
const ButtonText = reactive({
  MenuText: false,
  AlertText: true,
  shijian: false,
});

// 显示热点连接的相机名字
const videoName = ref("");

// 处理日期格式
const parseTimeFromUrl = (url: string) => {
  const urlObj = new URL(url);
  console.log(urlObj);
  const beginTimeStr = urlObj.searchParams.get("beginTime");
  const endTimeStr = urlObj.searchParams.get("endTime");

  const parseTimeString = (rawTime: any) => {
    const year = rawTime.slice(0, 4);
    const month = rawTime.slice(4, 6);
    const day = rawTime.slice(6, 8);
    const hour = rawTime.slice(9, 11); // 注意 T 后面第1位起是小时
    const minute = rawTime.slice(11, 13);
    const second = rawTime.slice(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  };

  const startTime = parseTimeString(beginTimeStr);
  const endTime = parseTimeString(endTimeStr);

  return { startTime, endTime };
};


/** 是否外网环境（内网页面 host 以 172.160. 开头） */
const isExternalNetwork = () =>
  !window.location.hostname.startsWith("172.160.");

/** 从 playURL 中提取取流 token：/openUrl/<token> */
const extractStreamToken = (url: string): string | null => {
  const m = url.match(/\/openUrl\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};

/**
 * WS 取流地址统一改写：
 * - C馆(10.10.51.1)：内外网都改写为 当前入口 + /cghall-ws 前缀（nginx 直转，Host 已修正）
 * - AB馆(172.160.120.x)：内网直连；外网换 host 为当前入口、path 保留，
 *   h5player 会拿该 host:port 去连 /media，由 ws-router 按 token 转发
 */
const rewriteWsUrl = (url: string): string => {
  if (!url) return url;

  const { hostname, port } = window.location;
  const entry = `${hostname}:${port || "8081"}`;

  try {
    const u = new URL(url);

    // —— C馆：内外网统一走 nginx 前缀代理 ——
    if (url.includes("10.10.51.1")) {
      const target = `ws://${entry}/cghall-ws${u.pathname}${u.search}`;
      console.log("[WS改写] C馆:", url, "->", target);
      return target;
    }

    // —— AB馆：外网才改写（内网可直达，保持原样） ——
    if (url.includes("172.160.120.") && isExternalNetwork()) {
      const target = `ws://${entry}${u.pathname}${u.search}`;
      console.log("[WS改写] AB馆:", url, "->", target);
      return target;
    }
  } catch {
    /* ignore */
  }
  console.log("[WS改写] 保持原样:", url);
  return url;
};


/** 外网播放 AB 馆前，向 ws-router 注册 token → 真实流服务器 的路由 */
const registerStreamRoute = async (originWsUrl: string) => {
  const token = extractStreamToken(originWsUrl);
  if (!token) return;
  const u = new URL(originWsUrl);
  await axios.post(
    "/ws-router/register",
    { token, upstream: `${u.hostname}:${u.port || "559"}` },
    { timeout: 5000 },
  );
  console.log(`[ws-router] 已注册路由: ${token} -> ${u.hostname}:${u.port}`);
};


// 播放热点连接的相机
const playRTCVideoStream = async (params: HotspotEntity) => {
  videoName.value = params.name;
  isShow.isShowVideo = true;

  const playUrl = rewriteWsUrl(params.wsUrl);
  // ★ C馆(内外网都走 ws-router)和 AB馆(外网走 ws-router)都需要提前注册路由
  if (extractStreamToken(params.wsUrl)) {
    try { await registerStreamRoute(params.wsUrl); }
    catch (e) { console.error("[ws-router] 注册取流路由失败:", e); }
  }

  // 先停止当前播放（关键：避免旧session未释放导致新连接失败）
  if (player.value) {
    try {
      await player.value.JS_Stop();
      console.log('已停止旧的播放');
    } catch (e) {
      // 忽略停止错误
    }
  }

  // 等待DOM更新和播放器初始化完成
  await nextTick();
  await initPlayer();
  await nextTick();

  // 开始播放（传递params用于日志输出）
  await realplay(playUrl, params);
};

const config = ref({
  useSIMD: false,
  hasAudio: true,
  showBandwidth: false,
  demuxUseWorker: true,
  useMSE: true,
  useWCS: true,
});

// 优化后的播放器初始化（对齐海康demo配置）
const initPlayer = async () => {
  await nextTick();

  // 如果播放器已存在，先销毁
  if (player.value) {
    try {
      await player.value.JS_Stop();
    } catch (e) {
      // 忽略停止错误
    }
    player.value = null;
  }

  // 对齐海康官方demo配置，移除可能导致session丢失的参数
  player.value = new JSPlugin({
    szId: "player_box1",
    szBasePath: "/demo/", // 末尾加斜杠，与demo一致，避免资源路径拼接问题
    iMaxSplit: 16,
    iCurrentSplit: 1,
    openDebug: false, // 先开启调试，方便排查问题，生产可关闭
    bWndFull: true,
    oStyle: {
      border: "transparent",
      borderSelect: "transparent",
      background: "#000",
    },
  });
  // 绑定事件回调（对齐海康demo，重要！错误回调可帮助定位问题）
  // player.value.JS_SetWindowControlCallback({
  //   windowEventSelect: function (iWndIndex) {
  //     // console.log('窗口选中回调:', iWndIndex);
  //   },
  //   pluginErrorHandler: function (iWndIndex, iErrorCode, oError) {
  //     // console.error('插件错误回调 - 窗口:', iWndIndex, '错误码:', iErrorCode, '详情:', oError);
  //   },
  //   windowEventOver: function (iWndIndex) { },
  //   windowEventOut: function (iWndIndex) { },
  //   windowEventUp: function (iWndIndex) { },
  //   windowFullCcreenChange: function (bFull) {
  //     // console.log('全屏变化:', bFull);
  //   },
  //   firstFrameDisplay: function (iWndIndex, iWidth, iHeight) {
  //     // console.log('首帧显示 - 窗口:', iWndIndex, '分辨率:', iWidth + 'x' + iHeight);
  //   },
  //   performanceLack: function (iWndIndex) {
  //     // console.warn('性能不足 - 窗口:', iWndIndex);
  //   },
  //   StreamEnd: function (iWndIndex) {
  //     // console.log('流结束 - 窗口:', iWndIndex);
  //   },
  //   StreamHeadChanged: function (iWndIndex) {
  //     // console.log('流头变化 - 窗口:', iWndIndex);
  //   },
  // });
};

// 播放函数（对齐海康官方demo参数）
const realplay = async (url: string, params?: HotspotEntity) => {
  // console.log("22222----------------- 开始播放URL:", url);
  if (!url) {
    console.warn(`没有可用的视频流URL`);
    return;
  }
  if (!player.value) {
    // console.warn('播放器未初始化，正在重新初始化...');
    await initPlayer();
    await nextTick();
  }

  const WND_INDEX = 0; // 固定使用第0号窗口

  try {
    // 对齐海康官方demo参数，只保留必要字段
    // 多余参数（如streamType/transType/gpuType等）可能干扰SDK内部逻辑
    const playOptions = {
      playURL: url,
      mode: 1, // 1=高级模式(软解)，0=MSE模式。H265必须用高级模式
      keepDecoder: 0, // 0=停止后释放解码器（对齐demo，避免资源泄漏）
      token: "", // 无token时留空字符串，不要省略该字段
    };

    // 开启trace（对齐demo，方便排查性能问题）
    player.value.JS_SetTraceId(WND_INDEX, true);

    // 判断url是否有起始结束时间（回放场景）
    const urlParts = url.split("?");
    if (urlParts.length > 1 && urlParts[1].includes("beginTime")) {
      // console.log("33333333333------------------- 回放URL:", urlParts);
      const resultTime = parseTimeFromUrl(url);
      // console.log("44444444------------------- 回放时间范围:", resultTime);
      // JS_Play(URL, options, wndIndex, startTime, endTime)
      await player.value.JS_Play(
        url,
        playOptions,
        WND_INDEX,
        resultTime.startTime,
        resultTime.endTime,
      );
    } else {
      // 实时播放：JS_Play(URL, options, wndIndex) —— 必须传wndIndex！
      // 之前省略wndIndex是bug的可能原因之一
      await player.value.JS_Play(url, playOptions, WND_INDEX);
      console.log(`实时视频播放成功 - URL:`, url);
      if (params) {
        console.log(`实时视频播放成功 - 摄像头信息:`, params);
      }
    }

    // 打印traceId（对齐demo，性能排查用）
    player.value.JS_GetTraceId(WND_INDEX).then((id) => {
      console.log("播放traceId:", id);
    });
  } catch (e) {
    console.error(`视频播放失败:`, e, "URL:", url);
  }
};

// 封装海康播放器关闭方法
const closeHisVideo = async () => {
  if (player.value) {
    try {
      await player.value.JS_Stop();
      player.value = null;
      console.log(`视频停止播放`);
    } catch (e) {
      console.error(`停止播放失败:`, e);
    }
  }
  isShow.isShowVideo = false;
};


// 关闭热点连接播放
const closeVideo = async () => {
  // 关闭海康播放器
  await closeHisVideo();
};

// 热点连接的函数
const addCesiumLabel = async () => {
  QJSP.value = "";
  vMapRef.value?.toggleAllHotspots(); // 子组件内部自行判断 展示/清除
};

const addCesiumLabelss = async () => {
  const response = await fetch("/gaodidian.json");
  const data: HotspotEntity[] = await response.json();
  vMapRef.value?.gaodidianliandong(data);
};
const xutingerlou = async () => {
  const response = await fetch("/xutingerlou.json");
  const data: HotspotEntity[] = await response.json();
  vMapRef.value?.gaodidianxutingerlou(data);
};

//c管
const Cgaodidianliandong = async () => {
  const response = await fetch("Cgaodidian.json");
  const data: HotspotEntity[] = await response.json();
  //  console.log(data,"111111111111111111");

  vMapRef.value?.gaodidianxutingerlouC(data);
};

const outaddCesiumLabelss = async () => {
  const response = await fetch("/outgaodidian.json");
  const data: HotspotEntity[] = await response.json();
  let ss = [];
  for (let i = 0; i < data.length; i++) {
    // console.log(data[i].id);
    // console.log(data[i]);
    ss.push(data[i].id);
  }
  // console.log(ss);

  //  console.log(data,"111111111111111111");

  vMapRef.value?.outgaodidianliandong(data);
};

// 点击三级菜单的效果
const ClickThreeMenu = async (item: TreePoint) => {
  const response = await fetch("/points.json");
  const data: HotspotEntity[] = await response.json();
  const idArray: string[] = data.map((item) => item.id);
  vMapRef.value?.removeHotspotsByIds(idArray);
  vMapRef.value?.FlightFn(item);
};


// 给视频贴图
const click_draw_polygon_fn = () => {
  vMapRef.value?.click_draw_polygon_fn();
};

//路线图
let mtag = ref(false);
let changeMark = (e: any) => {
  QJSP.value = "";
  mtag.value = !mtag.value;
  vMapRef.value?.changeMark(mtag.value);
};

// 报警信息
let shijian = (e: any) => {
  if (ButtonText.shijian) {
    closeChainMsgPopup();
  } else {
    showChainMsgPopup.value = true;
    ButtonText.shijian = true;
    fetchChainMsgForPopup();
  }
};

// 报警信息弹窗关闭按钮（与顶部导航"报警信息"关闭逻辑一致）
const closeChainMsgPopup = () => {
  showChainMsgPopup.value = false;
  ButtonText.shijian = false; // 同步导航按钮状态，保证下次点击"报警信息"能正常打开
  searchAlarmParams.cameraName = "";
  searchAlarmParams.beginTime = "";
  searchAlarmParams.endTime = "";
  closeHisVideo(); // 关闭可能正在播放的报警视频
};

let tingzhifeixing = ref(false);

// 2. 响应式状态：当前方向编号（初始为1，对应西面）
const currentNum = ref(1);


// 方向按钮点击事件
const handleDirectionClick = (direction: number) => {
  currentNum.value = direction;
  switch (direction) {
    case 1:
      activeSmartItem.value = "";
      vMapRef.value?.flyToView("ximian");
      break;
    case 2:
      activeSmartItem.value = "";
      vMapRef.value?.flyToView("nanmian");
      break;
    case 3:
      activeSmartItem.value = "";
      vMapRef.value?.flyToView("dongmian");
      break;
    case 4:
      activeSmartItem.value = "";
      vMapRef.value?.flyToView("shangmian");
      break;
    case 5:
      resetHallC();
      break;
    default:
      break;
  }
};

const toggleDataPanel = () => {
  showDataPanel.value = !showDataPanel.value;
};

// 1. 允许执行的方法映射表（保留原有逻辑，补全语法）
const allowExecMethods = {
  Aguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value) {
      vMapRef.value.flyToView("Aguannei"); // 调用子组件暴露的方法
      console.log("子组件方法Aguannei执行成功");
    } else {
      console.warn("子组件未挂载或方法未暴露：Aguannei");
    }
  },
  Bguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value) {
      vMapRef.value.flyToView("Bguannei"); // 调用子组件暴露的方法
      console.log("子组件方法Aguannei执行成功");
    } else {
      console.warn("子组件未挂载或方法未暴露：Aguannei");
    }
  },
  Cguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value) {
      vMapRef.value.flyToView("Cguannei"); // 调用子组件暴露的方法
      console.log("子组件方法Aguannei执行成功");
    } else {
      console.warn("子组件未挂载或方法未暴露：Aguannei");
    }
  },

  // 【新增】映射 URL 参数到现有的切换方法
  // URL: ?execMethod=toggleHallA
  toggleHallA: () => {
    toggleHallA(); // 直接调用当前组件内已定义的方法
    console.log("URL触发：toggleHallA");
  },
  // URL: ?execMethod=toggleHallB
  toggleHallB: () => {
    toggleHallB();
    console.log("URL触发：toggleHallB");
  },
  // URL: ?execMethod=toggleHallC
  toggleHallC: () => {
    toggleHallC();
    console.log("URL触发：toggleHallC");
  },

  // 可添加更多方法：otherMethod: () => { ... }
};

// 2. 封装通用URL参数解析+方法执行函数（核心优化：增加nextTick子组件挂载确认）
const execMethodByUrl = async () => {
  const searchParams = new URLSearchParams(window.location.search);
  const targetMethod = searchParams.get("execMethod"); // 获取URL参数

  // 安全校验：无参数/参数未声明，直接返回
  if (!targetMethod || !allowExecMethods[targetMethod]) {
    targetMethod &&
      console.warn(
        `禁止执行未声明方法：${targetMethod}，请在allowExecMethods中注册`,
      );
    return;
  }

  try {
    // 关键1：nextTick等待VueDOM更新，确保子组件已挂载（解决外部跳转缓存问题）
    await nextTick();
    // 执行映射表中的方法
    allowExecMethods[targetMethod]();
    console.log(`URL参数触发方法：${targetMethod}`);
  } catch (err) {
    console.error(`方法执行异常：${targetMethod}`, err);
  }
};

// 页面初始化加载
onMounted(() => {
  getRadarpoeple();
  // startChainMsgPolling();

  setTimeout(() => {
    isShow.isShows = false;
    nextTick(() => {
      const playerDiv = document.getElementById("videoRefId");
      if (playerDiv) {
        playerDiv.addEventListener("dblclick", function () {
          if (!document.fullscreenElement) {
            if (playerDiv.requestFullscreen) {
              playerDiv.requestFullscreen();
            } else if ((playerDiv as any).webkitRequestFullscreen) {
              (playerDiv as any).webkitRequestFullscreen();
            } else if ((playerDiv as any).msRequestFullscreen) {
              (playerDiv as any).msRequestFullscreen();
            }
          } else {
            if (document.exitFullscreen) {
              document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            } else if ((document as any).msExitFullscreen) {
              (document as any).msExitFullscreen();
            }
          }
        });
      }
    });
  }, 1500);

  setTimeout(() => {
    togglePanorama();
    // buttonStatus.value.panorama = true;
    execMethodByUrl();
    addCesiumLabelss();
    outaddCesiumLabelss();
    xutingerlou();
    Cgaodidianliandong();
  }, 2000);
});

const handleCruisePointChange = (pointName) => {
  console.log("父组件接收到巡航信息：", pointName);
  // ① 将数据赋值给父组件响应式变量，供页面渲染
  currentCruise.value = pointName;

  // ② 可执行父组件的其他业务逻辑（如根据点位名称更新状态、发起接口请求等）
  // doSomethingWithCruise(cruiseData.pointName);
};

// 11520 2160

onUnmounted(() => {
  // window.removeEventListener("resize", handleResize);
  // 增加安全清理（如果用户拖拽途中切走页面）
  stopDrag();
  stopChainMsgPolling();
});

// 按下按钮效果
const changDa = function (e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (target) {
    target.style.transform = "scale(1.1)";
  }
};

// 松开效果
const changXiao = function (e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (target) {
    target.style.transform = "scale(1)";
  }
};
</script>

<template>
  <div class="contont">
    <dv-loading v-if="isShow.isShows" class="loading">正在加载中...</dv-loading>
    <main v-else>
      <!-- 头部 -->
      <div class="head">
        <vHead />
      </div>

      <!-- 顶部导航栏 -->
      <div class="menu-container">
        <div class="child-menu" @click="togglePanorama">全景</div>
        <div class="child-menu" @click="addCesiumLabel">实时监控</div>
        <div class="child-menu" @click="shijian">报警信息</div>
        <div class="child-menu" @click="changeMark">路线图</div>
        <div class="child-menu" @click="toggleDynamicAreas">展位图</div>
        <!-- <div class="child-menu" @click="resetHallC">C馆回位</div> -->
        <div class="child-menu" @click="toggleDataPanel">人流监控</div>
        <div class="child-menu" :class="{ 'menu-active': showSmartDisplay }" @click="toggleSmartDisplay">
          {{ showSmartDisplay ? "关闭巡航" : "漫游巡航" }}
        </div>
      </div>

      <div class="smart-display-panel" v-if="showSmartDisplay">
        <div class="smart-display-grid">
          <div class="smart-display-item" v-for="(item, i) in smartDisplayItems" :key="item.label"
            :ref="(el) => setSmartItemRef(el, i)" :class="{ 'active': activeSmartItem === item.label }"
            :style="{ backgroundImage: 'url(' + item.image + ')' }"
            @click="handleSmartDisplayItemClick(item.value, item.label)">
            <p>{{ item.label }}</p>

            <!-- ✅ 新增：巡航中在该卡片右上角显示 停止/继续 徽标 -->
            <span v-if="activeSmartItem === item.label && isCruiseItem(item.value)" class="cruise-stop-badge"
              :class="{ 'paused': tingzhifeixing }" @click.stop="handleCruiseToggle"
              :title="tingzhifeixing ? '继续巡航' : '暂停巡航'">
              <i class="icon">{{ tingzhifeixing ? "▶" : "❚❚" }}</i>
              <em>{{ tingzhifeixing ? "继续" : "停止" }}</em>
            </span>
          </div>
        </div>
      </div>


      <!-- 底部ABC馆按钮容器 -->
      <div class="abc-buttons-container" v-show="!showSmartDisplay">
        <ul class="abc-buttons-list">
          <li class="abc-button" :class="{ 'active': activeButton === 0 }" @click="toggleHallA(); activeButton = 0;">
            <p class="button-text">A馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 1 }" @click="toggleHallB(); activeButton = 1;">
            <p class="button-text">B馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 2 }" @click="toggleHome(); activeButton = 2;">
            <p class="button-text">首页</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 3 }" @click="toggleHallC(); activeButton = 3;">
            <p class="button-text">C馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 4 }" @click="toggleOuter(); activeButton = 4;">
            <p class="button-text">外围</p>
          </li>
        </ul>
      </div>


      <!-- 方向按钮容器 -->
      <div class="direction-buttons-container">
        <ul class="direction-buttons-list">
          <li class="direction-button" data-tooltip="C馆复位" :class="{ 'active': currentNum === 5 }"
            @click="handleDirectionClick(5)" @mousedown="changDa" @mouseup="changXiao">
            <div class="direction-button-bg bg-reset"></div>
          </li>
          <li class="direction-button" data-tooltip="西面" :class="{ 'active': currentNum === 1 }"
            @click="handleDirectionClick(1)" @mousedown="changDa" @mouseup="changXiao">
            <div class="direction-button-bg bg-west"></div>
          </li>
          <li class="direction-button" data-tooltip="南面" :class="{ 'active': currentNum === 2 }"
            @click="handleDirectionClick(2)" @mousedown="changDa" @mouseup="changXiao">
            <div class="direction-button-bg bg-south"></div>
          </li>
          <li class="direction-button" data-tooltip="东面" :class="{ 'active': currentNum === 3 }"
            @click="handleDirectionClick(3)" @mousedown="changDa" @mouseup="changXiao">
            <div class="direction-button-bg bg-east"></div>
          </li>
          <li class="direction-button" data-tooltip="顶部" :class="{ 'active': currentNum === 4 }"
            @click="handleDirectionClick(4)" @mousedown="changDa" @mouseup="changXiao">
            <div class="direction-button-bg bg-up"></div>
          </li>
        </ul>
      </div>

      <!-- 背景 -->
      <div class="center">
        <!-- 地图 -->
        <div class="map">
          <!-- 数据展示模块 -->
          <DataPanel v-if="showDataPanel" />

          <!-- 地图容器 -->
          <div class="chart">
            <vMap ref="vMapRef" @pointName="handleCruisePointChange" @play-video-fusion="playRTCVideoStream"
              @close-video="closeVideo" @cruise-start="handleCruiseStart" @cruise-region="handleCruiseRegion"
              @cruise-finished="handleCruiseFinished" />
          </div>

          <!-- 视频弹窗 -->
          <div v-if="isShow.isShowVideo" class="video-container" ref="videoRef"
            :style="{ left: `${x}px`, top: `${y}px` }" style="position: absolute">
            <!-- 名字显示区域 -->
            <div class="name-display" @mousedown="startDrag">{{ videoName || "摄像头01" }}</div>

            <div class="video-container__close" @click="closeHisVideo">关闭</div>

            <!-- 视频播放器 -->
            <div class="player-container">
              <!-- <div class="player-item"> -->
              <div class="player-box" id="player_box1"></div>
              <!-- </div> -->
            </div>

          </div>

          <div class="popup-mask" v-show="showPopup" @click.self="closePopup">
            <div class="popup-content">
              <div class="popup-header">
                <h3 class="popup-title">警告信息</h3>
                <!-- <button class="popup-close" @click="closePopup">×</button> -->
              </div>
            </div>
          </div>

          <!-- 监控弹窗 -->
          <div class="monitor-popup" v-show="showMonitor">
            <div class="monitor-header">
              <h2 class="monitor-title">实时监控画面</h2>
              <button class="monitor-close" @click="closeMonitor">×</button>
            </div>
            <div class="monitor-video">
              <video controls class="monitor-video__player">
                您的浏览器不支持视频播放
              </video>
            </div>
          </div>

          <!-- 新增：链消息监控弹窗（独立DOM，不影响原有结构） -->
          <div class="chain-msg-popup" v-show="showChainMsgPopup">
            <div class="popup-header">
              <h3 class="popup-title">报警信息</h3>
              <!-- ✅ 新增：关闭按钮，样式同 video-container 的 __close（exit.png 贴图） -->
              <div class="popup-close-btn" @click="closeChainMsgPopup()">关闭</div>
            </div>

            <!-- 搜索栏（固定在头部下方，不随列表滚动） -->
            <div class="popup-search-bar">
              <div class="search-row">
                <input type="text" v-model="searchAlarmParams.cameraName" placeholder="相机名称"
                  class="search-input name-input" />
                <input type="datetime-local" v-model="searchAlarmParams.beginTime" class="search-input time-input" />
                <span style="color: #00c6ff">至</span>
                <input type="datetime-local" v-model="searchAlarmParams.endTime" class="search-input time-input" />
                <!-- <button class="search-btn" >
                  搜索
                </button> -->
                <el-button class="alarm-search-btn" type="primary" :icon="Search"
                  @click="handleAlarmSearch"></el-button>
              </div>
            </div>

            <div class="popup-body">
              <div class="msg-item" v-for="(item, index) in chainMsgList" :key="item.id || item.msgId || item.index">
                <div class="msg-content">
                  <p><span class="label">消息ID：</span>{{ index + 1 }}</p>
                  <p>
                    <span class="label">消息内容：</span>{{ item.prewarnContent || "无内容" }}
                  </p>
                  <p>
                    <span class="label">创建时间：</span>{{
                      item.happenTime
                        ? dayjs(item.happenTime).format("YYYY-MM-DD HH: mm: ss")
                        : "未知时间"
                    }}
                  </p>
                  <p>
                    <span class="label">相机名称</span>{{ item.cameraName || "未知" }}
                  </p>
                  <!-- <p><span class="label">图片事件</span>{{  }}</p> -->
                  <p>
                    <span class="label">图片事件</span><img :src="rewriteImageUrl(item.imageData)" alt="" width="100%" height="50%" />
                  </p>
                </div>
                <div class="msg-actions">
                  <button class="action-btn confirm" @click="handleChainMsgAction(item, 'confirm')">
                    确认
                  </button>
                  <!-- <button class="action-btn reject" @click="handleChainMsgAction(item, 'reject')">关闭</button> -->
                </div>
              </div>
            </div>
          </div>

          <!-- <div class="chain-msg-popup1" v-show="showChainMsgPopup1">
            <div class="popup-header">
              <h3 class="popup-title">报警信息</h3>
            </div>
            <div class="popup-body">
              <div class="msg-item" v-for="item in chainMsgList1" :key="item.id || item.msgId || item.index">
                <div class="msg-content">
                  <p>
                    <span class="label">消息ID：</span>{{ item.id || "未知" }}
                  </p>
                  <p>
                    <span class="label">消息内容：</span>{{ item.prewarnContent || "无内容" }}
                  </p>
                  <p>
                    <span class="label">创建时间：</span>{{
                      item.happenTime
                        ? dayjs(item.happenTime).format("YYYY-MM-DD HH: mm: ss")
                        : "未知时间"
                    }}
                  </p>
                  <p>
                    <span class="label">消息状态：</span>{{ item.status || "未处理" }}
                  </p>
                </div>
                <div class="msg-actions">
                  <button class="action-btn confirm" @click="handleChainMsgAction(item, 'playback')">
                    确认
                  </button>
                  <button class="action-btn reject" @click="handleChainMsgAction(item, 'reject')">
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div> -->

          <div class="cruise-tip" v-if="currentCruiseName">
            {{ currentCruise }}
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
/* 优化：智能展示面板 */
.smart-display-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  // 高度根据内容自适应，或者固定一个高度
  // min-height: 15vh; 
  background: rgba(0, 0, 0, 0.5); // 背景稍微加深一点突显图片
  // border-top: 1px solid #d1d2d2;
  padding: 0.12rem; // 左右增加padding，防止滚动条贴边
  box-sizing: border-box;
  z-index: 999;
  // display: flex;
  // flex-direction: column;
  // align-items: center;
}

/* 优化：容器改为 Flex 布局，实现单行横向滚动 */
.smart-display-grid {
  display: flex;
  flex-direction: row; // 横向排列
  overflow-x: auto; // 开启横向滚动
  gap: 0.12rem; // 卡片间距
  width: 100%;
  align-items: center;
  padding: 0.05rem 0 0.1rem;

  // 隐藏滚动条但保留功能 (可选，如果不喜欢默认滚动条样式)
  &::-webkit-scrollbar {
    height: 2px;
  }

  &::-webkit-scrollbar-thumb {
    // background: #00c6ff;
    background: #868889;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
}

/* 优化：单个展示项 */
.smart-display-item {
  position: relative;
  width: 10vw;
  height: 8vw;
  flex-shrink: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94); // 更顺滑的缓动
  overflow: hidden;
  border: 2px solid rgba(0, 198, 255, 0.6);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;

  // ✅ 贴片式 停止/继续 徽标（挂在 active 卡片右上角）
  .cruise-stop-badge {
    position: absolute;
    top: 6px;
    right: 30px; // 避开 .active::after 的 ◉ 角标
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 12px;
    background: rgba(0, 40, 60, 0.85);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-size: 0.14rem;
    line-height: 1.4;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.6);
    animation: badgeGlow 2s ease-in-out infinite; // 与卡片呼吸光晕呼应
    transition: all 0.2s ease;

    .icon {
      font-style: normal;
      font-size: 0.12rem;
    }

    em {
      font-style: normal;
      letter-spacing: 1px;
    }

    &:hover {
      background: #00e5ff;
      color: #001018;
      transform: scale(1.08);
    }

    // 暂停态：转为琥珀色，视觉上区分「已暂停，点我继续」
    &.paused {
      border-color: #ffb020;
      color: #ffb020;
      box-shadow: 0 0 8px rgba(255, 176, 32, 0.6);
      animation: none;

      &:hover {
        background: #ffb020;
        color: #201400;
      }
    }
  }

  @keyframes badgeGlow {

    0%,
    100% {
      box-shadow: 0 0 6px rgba(0, 229, 255, 0.5);
    }

    50% {
      box-shadow: 0 0 14px rgba(0, 229, 255, 0.95);
    }
  }

  p {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    margin: 0;
    padding: 0.1rem;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    font-size: 0.18rem;
    font-weight: bold;
    text-align: center;
    backdrop-filter: blur(2px);
    transition: all 0.3s; // 文字区也加过渡
  }

  &:hover {
    transform: scale(1.05);
    border-color: rgb(0, 198, 255);
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.6);
    z-index: 2;

    p {
      background: rgba(0, 198, 255, 0.35); // hover 时文字底色呼应主题
    }
  }

  /* ✅===== 新增：选中高亮样式 ===== */
  &.active {
    // 主题青色实边框 + 呼吸光晕动画
    border-color: #00e5ff;
    box-shadow:
      0 0 10px rgba(0, 229, 255, 0.8),
      inset 0 0 18px rgba(0, 229, 255, 0.25); // 内外双发光，科技感更强
    transform: scale(1.06); // 选中态略大于 hover，视觉权重最高
    z-index: 3;

    // 半透明遮罩提亮图片，与未选中形成明暗对比
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background: rgba(0, 198, 255, 0.12);
      pointer-events: none;
      animation: pulseGlow 2s ease-in-out infinite; // 呼吸效果
    }

    // 右上角"选中角标"
    &::after {
      content: "◉";
      position: absolute;
      top: 6px;
      right: 8px;
      z-index: 2;
      color: #00e5ff;
      font-size: 0.16rem;
      text-shadow: 0 0 6px rgba(0, 229, 255, 0.9);
    }

    p {
      background: linear-gradient(90deg,
          rgba(0, 198, 255, 0.55),
          rgba(0, 150, 200, 0.55)); // 渐变底色替代纯色，更精致
      color: #ffffff;
      text-shadow: 0 0 8px rgba(0, 229, 255, 0.9);
      letter-spacing: 1px;
    }
  }
}

/* 呼吸光晕动画 */
@keyframes pulseGlow {

  0%,
  100% {
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.8),
      inset 0 0 18px rgba(0, 229, 255, 0.25);
  }

  50% {
    box-shadow: 0 0 22px rgba(0, 229, 255, 1),
      inset 0 0 28px rgba(0, 229, 255, 0.4);
  }
}




// 方向按钮容器样式
.direction-buttons-container {
  position: absolute;
  bottom: 2vw;
  right: 0.8vw;
  z-index: 999999;
  display: flex;
  flex-direction: column;
  // gap: 1.5vw;
}

.direction-buttons-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8vw;
}

.direction-button {
  position: relative;
  min-width: 2vw;
  height: 2vw;
  cursor: pointer;
  transition: all 0.3s ease;

  .direction-button-bg {
    width: 100%;
    height: 100%;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
  }

  .bg-reset {
    background-image: url("../assets/img/复位.png");
  }

  .bg-west {
    background-image: url("../assets/img/正面.png");
  }

  .bg-east {
    background-image: url("../assets/img/东侧.png");
  }

  .bg-south {
    background-image: url("../assets/img/南侧.png");
  }

  .bg-up {
    background-image: url("../assets/img/分顶部.png");
  }

  &.active {
    .direction-button-bg {
      filter: brightness(1.3) drop-shadow(0 0 10px rgba(0, 198, 255, 0.8));
    }

    .button-text {
      color: #00c6ff;
      text-shadow: 0 0 10px rgba(0, 198, 255, 0.8);
    }
  }
}

/* 提示框文本背景 */
.direction-button::before {
  content: attr(data-tooltip); // 读取 HTML 中的 data-tooltip 内容
  position: absolute;
  top: 50%;
  right: 105%; // 显示在按钮左侧
  transform: translateY(-50%) translateX(-10px); // 初始位置稍微偏左，用于动画
  background: rgba(0, 15, 30, 0.95); // 深色半透明背景
  color: #00c6ff; // 青色文字，与主题呼应
  padding: 0.4vw 0.8vw;
  border-radius: 0.2vw;
  font-size: 0.7vw;
  white-space: nowrap; // 强制一行显示
  border: 1px solid #00c6ff; // 边框
  box-shadow: 0 0 0.5vw rgba(0, 198, 255, 0.3); // 发光效果
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease; // 平滑过渡动画
  z-index: 10000;
  pointer-events: none; // 防止鼠标事件被提示框拦截
}

/* 提示框的小箭头 */
.direction-button::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 100%; // 箭头紧贴按钮左侧
  transform: translateY(-50%);
  border: 0.4vw solid transparent;
  border-left-color: rgba(0, 198, 255, 0.3); // 箭头颜色（透明背景时显示边框色）
  // 注意：这里使用了一个简单的边框技巧做箭头
  // 如果需要实心箭头，可以调整 border-left-color
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
  z-index: 10000;
}

/* 鼠标移入时显示 */
.direction-button:hover::before,
.direction-button:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0); // 移回原位
}

/* 针对箭头的微调：移入时改变箭头颜色以匹配背景 */
.direction-button:hover::after {
  border-left-color: rgba(0, 15, 30, 0.95);
  // 如果需要箭头指向按钮，我们其实需要在左侧画一个指向右侧的箭头
  // 下面的 CSS 修正了箭头方向，使其指向按钮
  border-right-color: rgba(0, 15, 30, 0.95);
  border-left-color: transparent;
  right: 99%; // 调整位置
  transform: translateY(-50%);
}


// 基础样式
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-size: clamp(16px, 0.8vw, 24px);
}

// 容器样式
.contont {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

// 加载样式
.loading {
  width: 100vw;
  height: 100vh;
  background: #000;
  font-size: clamp(24px, 4vw, 60px);
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
}

// 主内容样式
main {
  width: 100%;
  height: 100%;
  display: block;
}

// 头部样式
.head {
  position: absolute;
  z-index: 9;
  width: 100%;
}

// 顶部导航栏
.menu-container {
  position: absolute;
  top: 8vw;
  left: 22%;
  width: 60vw;
  height: 4vw;
  z-index: 999;
  background: url('@/assets/img/顶部导航栏.png') no-repeat;
  background-size: 100% 100%;
  /* 强制拉伸填充，可能变形 */
  display: flex;
  flex-direction: row;
  align-items: center; // 垂直居中
  padding: 0 10vw;
  box-sizing: border-box; // 确保padding不会增加总宽度


  // 新增：child-menu 样式
  .child-menu {
    flex: 1; // 让每个菜单项平分宽度
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff; // 文字默认白色
    font-size: 1vw; // 根据大屏适配调整字号
    letter-spacing: 0.1vw; // 增加字间距，提升科技感
    cursor: pointer;
    position: relative;
    transition: all 0.3s ease;

    // 鼠标悬浮效果
    &:hover {
      color: #00c6ff; // 悬浮变为主题青色
      text-shadow: 0 0 10px rgba(0, 198, 255, 0.8); // 添加发光效果
      transform: scale(1.05); // 略微放大
    }

    // 添加白色 | 间隔符，排除最后一个元素
    &:not(:last-child)::after {
      content: '|';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      color: #ffffff;
      opacity: 0.8; // 稍微透明，避免喧宾夺主
      font-weight: 300;
      pointer-events: none; // 防止点击间隔符触发事件
    }
  }

  .child-menu.menu-active {
    color: #00e5ff;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.8);

    &::after {
      display: none;
    }

    // 该项不显示右侧 | 分隔符（可按需去掉）
  }
}

// 底部ABC馆按钮容器样式
.abc-buttons-container {
  position: absolute;
  bottom: 2vw;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  justify-content: center;
  // gap: 2vw; // 按钮之间的间距

  .abc-buttons-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 1.8vw;
    // 【新增】添加平滑过渡动画，持续时间 0.5秒，使用 ease-in-out 缓动函数
    transition: bottom 0.5s ease-in-out;

    .abc-button {
      width: 3.5vw;
      height: 2.3vw;
      background: url("@/assets/img/按钮new.png");
      background-size: 100% 100%;
      // background-repeat: no-repeat;
      border-radius: 0.4vw;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover {
        transform: scale(1.05);
      }

      // 激活状态样式
      &.active {
        background-image: url("@/assets/img/btn-active.png") !important;
        // box-shadow: 0 0 15px rgba(0, 198, 255, 0.6);
        transform: scale(1.08);
      }

      .button-text {
        // margin-top: 0.5vw;
        padding: 0;
        text-align: center;
        color: white;
        font-size: 0.8vw;
      }
    }
  }
}

.cruise-tip {
  position: absolute;
  top: 2vw;
  right: 33vw;
  font-size: 0.2rem;
  padding: 2px 10px;
  z-index: 9;
  color: #fff;
}

// 中心容器样式
.center {
  width: 100%;
  height: 100%;
  position: relative;
}

// 地图容器样式
.map {
  width: 100%;
  height: 100%;
  position: relative;
}

// 地图图表样式
.chart {
  width: 100vw;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

// 视频弹窗样式
.video-container {
  width: 40vw;
  height: 50vh;
  z-index: 9999;
  // position: absolute;
  // right: 9vw;
  // top: 12vh;
  background-image: url("../assets/img/video.png");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border-radius: 0.4vw;
  overflow: hidden;
  // 【新增】关键代码：使用 drop-shadow 让非透明像素发光
  // 这会给整个背景图的边缘加上光晕
  filter: drop-shadow(0 0 10px rgba(0, 198, 255, 0.8)) brightness(1.2); //稍微提亮原图

  // box-shadow: 0 0 15px rgba(0, 198, 255, 0.3); // 外层辅助光晕
  // border: 1px solid rgba(0, 198, 255, 0.3); // 增加一圈细边框强化轮廓
  // box-shadow: 0 0.2vw 1vw rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-size: clamp(0.7vw, 1.2vw, 0.8vw);
  font-weight: bold;

  .name-display {
    position: absolute;
    top: 1vw;
    left: 50%;
    transform: translate(-50%);
    z-index: 100;
    padding: 0.25vw 0.6vw;
    border-radius: 0.75vw;
    text-shadow: 0.05vw 0.05vw 0.1vw rgba(0, 0, 0, 0.8);
    max-width: 10vw;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    // 新增：提示可拖拽
    cursor: move;
    user-select: none; // 防止拖拽时选中文字
  }

  &__close {
    position: absolute;
    top: 1vw;
    right: 0.8vw;
    z-index: 100;
    width: 4.5vw;
    height: 2vw;
    // border: 0.1vw solid #ddd;
    // border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 0.1rem;
    background-image: url("../assets/img/exit.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    overflow: hidden;
    // 【新增】关键代码：使用 drop-shadow 让非透明像素发光
    // 这会给整个背景图的边缘加上光晕
    // filter: drop-shadow(0 0 10px rgba(0, 198, 255, 0.8)) 
    //         brightness(1.2); //稍微提亮原图
  }

  .player-container {
    padding: 0.12rem;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;

    :deep(#player_box1),
    :deep(#player_box1 *) {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }

    .player-box {
      width: 100%;
      height: 100%;
      background-color: #000;
    }

  }

  &__play {
    position: absolute;
    bottom: 0.5vw;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.4vw 0.8vw;
    background: #1890ff;
    color: white;
    border: none;
    border-radius: 0.2vw;
    cursor: pointer;
    font-size: 0.7vw;
  }
}

// 告警弹窗遮罩
.popup-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;

  .popup-content {
    background-color: white;
    border-radius: 0.25vw;
    width: clamp(15vw, 25vw, 25vw);
    max-width: 90%;
    box-shadow: 0 0.1vw 0.6vw 0 rgba(0, 0, 0, 0.1);

    .popup-header {
      padding: 0.75vw 1vw;
      border-bottom: 0.05vw solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;

      .popup-title {
        font-size: 0.9vw;
        font-weight: bold;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        font-size: 1vw;
        cursor: pointer;
      }
    }

    .popup-body {
      padding: 1vw;

      .image-item {
        margin-bottom: 0.75vw;

        .popup-image {
          width: 100%;
          max-height: 15vw;
          object-fit: cover;
          border-radius: 0.2vw;
        }
      }

      .popup-text {
        margin-bottom: 1vw;
        line-height: 1.6;
        color: #666;
        font-size: 0.75vw;

        .popup-text__item {
          margin: 0.25vw 0;
        }
      }
    }
  }
}

// 监控弹窗样式
.monitor-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: clamp(20vw, 40vw, 40vw);
  background: white;
  border-radius: 0.4vw;
  box-shadow: 0 0 1vw rgba(0, 0, 0, 0.3);
  z-index: 1001;

  .monitor-header {
    padding: 0.75vw;
    background: #f5f5f5;
    border-bottom: 0.05vw solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .monitor-title {
      margin: 0;
      font-size: 0.9vw;
    }

    .monitor-close {
      background: transparent;
      border: none;
      font-size: 1vw;
      cursor: pointer;
    }
  }

  .monitor-video {
    padding: 1vw;

    .monitor-video__player {
      width: 100%;
      max-height: 25vw;
      border-radius: 0.2vw;
    }
  }
}

/* ==========================================================
   报警信息弹窗（统一为 video-container 风格：背景图 + 发光）
   .chain-msg-popup  左侧：报警信息（含搜索栏）
   .chain-msg-popup1 右侧：WebSocket 实时报警弹窗
   ========================================================== */
.chain-msg-popup,
.chain-msg-popup1 {
  position: fixed;
  top: 7vw;
  width: 26vw;
  max-height: 78vh;
  z-index: 99999;
  padding: 8px 10px 38px;
  /* ✅ 核心改动1：与 video-container 一致的背景图 */
  background-image: url("../assets/img/video.png");
  background-size: 100% 100%;
  background-repeat: no-repeat;

  /* ✅ 核心改动2：与 video-container 一致的 drop-shadow 发光 + 提亮 */
  filter: drop-shadow(0 0 10px rgba(0, 198, 255, 0.8)) brightness(1.15);

  border-radius: 0.4vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #fff;

  /* 左右弹窗仅定位不同 */
  &.chain-msg-popup {
    left: 1.5vw;
  }

  &.chain-msg-popup1 {
    right: 1.5vw;
    width: 22vw;
  }

  /* ---------- 头部 ---------- */
  .popup-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    /* 半透明底色融入背景图，去掉实线边框改为青色细线 */
    background: linear-gradient(90deg, rgba(0, 60, 90, 0.75), rgba(0, 30, 50, 0.45));
    border-bottom: 1px solid rgba(0, 198, 255, 0.45);

    .popup-title {
      color: #00e5ff;
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      /* 与 direction-button 悬浮发光呼应 */
      text-shadow: 0 0 10px rgba(0, 198, 255, 0.8);
      letter-spacing: 1px;
    }
  }

  /* ✅ 新增：关闭按钮 —— 与 .video-container__close 完全同款风格 */
  .popup-close-btn {
    width: 4.5vw; // 同视频弹窗关闭按钮尺寸
    height: 2vw;
    line-height: 2vw;
    min-width: 56px; // 小屏兜底，防止贴图压缩变形
    min-height: 24px;
    flex-shrink: 0; // 防止被标题挤压
    cursor: pointer;
    display: flex;
    padding-left: 0.1rem;
    align-items: center;
    justify-content: center;
    background-image: url("../assets/img/exit.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    transition: all 0.2s ease;

    // 与视频弹窗一致的发光提亮效果（hover 时更明显）
    &:hover {
      filter: drop-shadow(0 0 8px rgba(0, 198, 255, 0.9)) brightness(1.3);
      transform: scale(1.02);
    }
  }

  /* ---------- 搜索栏（仅 chain-msg-popup 有） ---------- */
  .popup-search-bar {
    flex-shrink: 0;
    padding: 0.08rem 0.1rem;
    background: rgba(0, 30, 55, 0.55);
    border-bottom: 1px solid rgba(0, 198, 255, 0.35);

    .search-row {
      display: flex;
      align-items: center;
      gap: 0.08rem;

      .search-input {
        flex: 1;
        height: 0.3rem; // 统一控件高度，视觉对齐
        padding: 0 0.08rem;
        border: 1px solid rgba(0, 198, 255, 0.6);
        border-radius: 4px;
        background: rgba(0, 15, 30, 0.7);
        color: #fff;
        font-size: 0.15rem;
        transition: all 0.2s;

        &:focus {
          outline: none;
          border-color: #00e5ff;
          box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
        }

        &::placeholder {
          color: rgba(255, 255, 255, 0.45);
          font-size: 0.14rem;
        }

        // datetime-local 的日历图标大小跟随字体
        &::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.7;
          cursor: pointer;
        }

        &.time-input {
          flex: none;
          width: 1.4rem;
        }

        &.name-input {
          width: 0.9rem;
        }
      }

      /* 搜索按钮：与视频弹窗主题色呼应 */
      .alarm-search-btn {
        flex-shrink: 0;
        height: 0.3rem;
        min-width: 0.45rem;
        padding: 0 0.1rem !important;
        margin: 0 !important;
        background-color: #00c6ff !important;
        border: 1px solid #00c6ff !important;
        color: #000 !important;
        font-size: 0.15rem !important;
        border-radius: 4px !important;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background-color: #33d1ff !important;
          border-color: #33d1ff !important;
          transform: scale(1.05);
        }

        :deep(.el-icon) {
          color: #000 !important;
          font-size: 0.16rem !important;
        }
      }
    }
  }

  /* ---------- 消息列表 ---------- */
  .popup-body {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
    max-height: calc(78vh - 50px);

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(0, 30, 50, 0.5);
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
      background: #00c6ff;
      border-radius: 3px;
    }

    .msg-item {
      padding: 12px;
      margin-bottom: 12px;
      /* 半透明卡片融入背景图 */
      background: rgba(0, 25, 45, 0.6);
      border-radius: 6px;
      border-left: 3px solid #00c6ff;
      transition: all 0.25s ease;

      &:hover {
        background: rgba(0, 40, 70, 0.75);
        box-shadow: 0 0 10px rgba(0, 198, 255, 0.35);
        border-left-color: #00e5ff;
      }

      .msg-content {
        color: #ffffff;
        font-size: 0.15rem;
        line-height: 1.6;
        margin-bottom: 10px;

        .label {
          color: #00e5ff;
          font-weight: 600;
          margin-right: 4px;
          text-shadow: 0 0 6px rgba(0, 229, 255, 0.6);
        }

        img {
          border-radius: 4px;
          border: 1px solid rgba(0, 198, 255, 0.35);
        }
      }

      .msg-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;

        .action-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;

          &:hover {
            transform: scale(1.05);
          }

          &.confirm {
            background: #00c6ff;
            color: #000;
            box-shadow: 0 0 8px rgba(0, 198, 255, 0.5);

            &:hover {
              box-shadow: 0 0 14px rgba(0, 229, 255, 0.8);
            }
          }

          &.reject {
            background: #ff4d4f;
            color: #fff;
            box-shadow: 0 0 8px rgba(255, 77, 79, 0.5);
          }
        }
      }
    }
  }
}

// 响应式调整
@media screen and (max-width: 768px) {

  .video-container {
    width: 80vw !important;
    height: 40vh !important;
  }
}

// 超高清大屏适配
@media screen and (min-width: 3840px) {

  html,
  body {
    font-size: clamp(20px, 1vw, 30px);
  }

  .video-container {
    width: 38vw;
    height: 52vh;

    &__close {
      width: 2.2vw;
      height: 2.2vw;

      .close-icon-image {
        width: 1.1vw;
        height: 1.1vw;
      }
    }

    .name-display {
      font-size: 0.5vw;
      padding: 0.3vw 0.7vw;
    }
  }
}

// 财富中心18楼大屏适配
@media screen and (min-width: 3840px) and (height: 1080px) {

  html,
  body {
    font-size: clamp(20px, 1vw, 30px);
  }

  // 菜单高度
  .menu-container {
    top: 6vw;
  }

  // 底部巡航菜单
  .smart-display-item {
    width: 8vw; // 固定宽度
    height: 6vw; // 固定高度
    border-radius: 8px;

    // 文字样式：浮动在底部，带透明浅色背景
    p {
      // padding: 0.1rem;
      // background: rgba(255, 255, 255, 0.2); // 透明浅色背景
      // color: #fff; // 黑色文字
      font-size: 0.18rem;
      // font-weight: bold;
      // text-align: center;
      // backdrop-filter: blur(2px); // 背景模糊效果，提升文字可读性
    }
  }

  // 方向按钮容器样式
  .direction-buttons-container {
    bottom: 2vw;
    right: 1vw;

    .direction-buttons-list {
      gap: 0.8vw;
    }
  }

  .video-container {
    width: 30vw;
    height: 60vh;
    font-size: 0.25rem;

    // z-index: 999999;
    // position: absolute;
    // right: 9vw;
    // top: 14vh;

    .name-display {
      top: 0.5vw;
    }

    &__close {
      top: 0.7vw;
      // padding-left: 0.1rem;
      // right: 0.2vw;
      width: 3vw;
      height: 1.2vw;
    }
  }

  // 报警信息
  .chain-msg-popup {
    width: 20vw;
    max-height: 60vh;
    .popup-header {
      padding: 12px 16px;

      .popup-title {
        font-size: 24px;
        letter-spacing: 1px;
      }

      .popup-close-btn {
        width: 2.3vw; // 同视频弹窗关闭按钮尺寸
        height: 1.3vw;
        font-size: 22px;
        line-height: 1.3vw;
        padding-left: 0.1rem;
      }
    }

    .popup-search-bar {
      padding: 0.1rem 0.14rem;

      .search-row {
        gap: 0.1rem;

        .search-input {
          height: 0.38rem;
          font-size: 0.18rem;
          border-radius: 5px;

          &::placeholder {
            font-size: 0.17rem;
          }

          &.time-input {
            width: 2rem; // 时间输入框加宽，避免日期被截断
          }

          &.name-input {
            width: 1.2rem;
          }
        }

        .alarm-search-btn {
          height: 0.38rem;
          min-width: 0.55rem;
          font-size: 0.18rem !important;

          :deep(.el-icon) {
            font-size: 0.2rem !important;
          }
        }
      }
    }
  }

  .cruise-tip {
    top: 1.2vw;
    font-size: 0.3rem;
    // right: 33vw;
  }
}

// 四楼三联屏适配
@media screen and (min-width: 5120px) and (height: 960px) {

  html,
  body {
    font-size: clamp(18px, 1vw, 30px);
  }


  // 菜单高度
  .menu-container {
    top: 3vw;
  }

  // 底部巡航菜单
  .smart-display-item {
    width: 6vw; // 固定宽度
    height: 4vw; // 固定高度
    border-radius: 8px;

    // 文字样式：浮动在底部，带透明浅色背景
    p {
      // padding: 0.1rem;
      // background: rgba(255, 255, 255, 0.2); // 透明浅色背景
      // color: #fff; // 黑色文字
      font-size: 0.18rem;
      // font-weight: bold;
      // text-align: center;
      // backdrop-filter: blur(2px); // 背景模糊效果，提升文字可读性
    }
  }

  .video-container {
    width: 20vw;
    height: 60vh;
    font-size: 0.25rem;

    .name-display {
      top: 0.2vw;
    }

    &__close {
      top: 0.4vw;
      right: 0.2vw;
      width: 2.2vw;
      height: 1.2vw;
    }
  }

  // 底部ABC馆按钮容器样式
  .abc-buttons-container {
    position: absolute;
    bottom: 1vw;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999;
    display: flex;
    justify-content: center;
    gap: 2vw; // 按钮之间的间距
  }

  // 方向按钮容器样式
  .direction-buttons-container {
    bottom: 1vw;
    right: 0.5vw;

    .direction-buttons-list {
      gap: 0.2rem;

      .direction-button {
        position: relative;
        min-width: 1.8vw;
        height: 1.8vw;
      }

      /* 提示框文本背景 */
      // .direction-button::before {
      //   padding: 0.2vw 0.4vw;
      //   border-radius: 0.2vw;
      //   font-size: 0.4rem;
      // }
    }
  }

  .chain-msg-popup {
    top: 5vw;
    // left: 1.5vw;
    width: 15vw;
    max-height: 60vh;

    .popup-header {

      // padding: 12px 16px;
      .popup-close-btn {
        width: 2vw; // 同视频弹窗关闭按钮尺寸
        height: 1vw;
        line-height: 1vw;
        padding-left: 0.1rem;
      }
    }

    .popup-search-bar {
      padding: 0.06rem 0.08rem;

      .search-row {
        gap: 0.06rem;
        flex-wrap: nowrap; // 强制一行，靠压缩宽度解决

        .search-input {
          height: 0.3rem;
          font-size: 0.15rem; // 字号保持可读，不随弹窗缩小
          border-radius: 4px;

          &::placeholder {
            font-size: 0.14rem;
          }

          &.time-input {
            width: 1.5rem; // 比基础略窄但保留完整日期显示
          }

          &.name-input {
            width: 0.8rem;
          }
        }

        /* "至" 字号同步 */
        span {
          font-size: 0.15rem;
        }

        .alarm-search-btn {
          height: 0.3rem;
          min-width: 0.4rem;
          padding: 0 0.08rem !important;
          font-size: 0.15rem !important;

          :deep(.el-icon) {
            font-size: 0.16rem !important;
          }
        }
      }
    }
  }

  .cruise-tip {
    top: 0.6vw;
    font-size: 0.3rem;
  }
}

// 驾驶舱（可能）
@media screen and (width: 11520px) and (height: 2160px) {

  // 视频弹窗样式
  .video-container {
    width: 20vw;
    height: 53vh;

    .name-display {}

    &__close {}

    &__play {
      position: absolute;
      bottom: 0.5vw;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.4vw 0.8vw;
      background: #1890ff;
      color: white;
      border: none;
      border-radius: 0.2vw;
      cursor: pointer;
      font-size: 0.7vw;
    }
  }
}

// 驾驶舱
@media screen and (min-width: 5744px) and (max-width: 5776px) and (min-height: 1064px) and (max-height: 1092px) {

  // 菜单高度
  .menu-container {
    top: 2.5vw;
    left: 25%;
    width: 50vw;
    height: 2.2vw;
    /* 强制拉伸填充，可能变形 */
    padding: 0 11vw;

    .child-menu {
      font-size: 0.4rem;
    }
  }

  // 底部巡航菜单
  .smart-display-item {
    width: 6vw; // 固定宽度
    height: 4vw; // 固定高度
    border-radius: 8px;

    // 文字样式：浮动在底部，带透明浅色背景
    p {
      font-size: 0.18rem;
    }
  }

  .video-container {
    width: 20vw;
    height: 60vh;
    font-size: 0.25rem;

    .name-display {
      top: 0.2vw;
    }

    &__close {
      top: 0.4vw;
      right: 0.2vw;
      width: 2.2vw;
      height: 1.2vw;
    }
  }


  // 底部ABC馆按钮容器样式
  .abc-buttons-container {
    bottom: 1vw;
    left: 50%;

    .abc-buttons-list {
      gap: 1vw; // 按钮之间的间距

      .abc-button {
        width: 2.5vw;
        height: 1.5vw;
        border-radius: 0.4vw;

        .button-text {
          font-size: 0.4rem;
        }
      }
    }
  }

  // 右侧按钮组
  // 方向按钮容器样式
  .direction-buttons-container {
    bottom: 1vw;
    right: 0.5vw;

    .direction-buttons-list {
      gap: 0.2rem;

      .direction-button {
        position: relative;
        min-width: 1.2vw;
        height: 1.2vw;
      }

      /* 提示框文本背景 */
      .direction-button::before {
        padding: 0.2vw 0.4vw;
        border-radius: 0.2vw;
        font-size: 0.4rem;
      }
    }
  }

  // 报警信息
  .chain-msg-popup {
    top: 5vw;
    // left: 1.5vw;
    width: 15vw;
    max-height: 60vh;

    .popup-header {
      // padding: 12px 16px;

      .popup-title {
        font-size: 24px;
        letter-spacing: 1px;
      }

      .popup-close-btn {
        width: 2vw; // 同视频弹窗关闭按钮尺寸
        height: 1vw;
        font-size: 22px;
        line-height: 1vw;
        padding-left: 0.1rem;
      }
    }

    .popup-search-bar {
      padding: 0.06rem 0.08rem;

      .search-row {
        gap: 0.06rem;
        flex-wrap: nowrap;

        .search-input {
          height: 0.32rem;
          font-size: 0.16rem;

          &::placeholder {
            font-size: 0.15rem;
          }

          &.time-input {
            width: 1.55rem;
          }

          &.name-input {
            width: 0.85rem;
          }
        }

        span {
          font-size: 0.16rem;
        }

        .alarm-search-btn {
          height: 0.32rem;
          min-width: 0.42rem;
          padding: 0 0.08rem !important;
          font-size: 0.16rem !important;

          :deep(.el-icon) {
            font-size: 0.17rem !important;
          }
        }
      }
    }
  }
  
  .cruise-tip {
    top: 0.6vw;
    font-size: 0.3rem;
  }
}
</style>
