<script lang="ts" setup>
import DataPanel from "@/components/data-panel/index.vue";
import vHead from "@/components/header/header.vue";
import type { VMapExposed } from "@/components/vmap/index.vue";
import vMap from "@/components/vmap/index.vue";
import { cameraMap } from "@/constants/map";
import type { HotspotEntity, TreePoint } from "@/type/vMap";
import { filterEmptyParams } from "@/utils/common";
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
import {
  clickGoPreset,
  clickStopRealPlay,
  data,
  destroyPlugin,
  init,
} from "../assets/HangKai";

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
    url: "brBk/api/alert/selList",
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
let xianshizhanshi = ref(false);
let xitongzhanshi = ref(false);
let showDataPanel = ref(false);
let currentCruise = ref();
let currentCruiseName = ref(true);

// 添加底部按钮激活状态变量
const activeButton = ref(2); // 初始激活"首页"按钮


// 新增：右侧按钮展开状态（控制子按钮显示/隐藏）
const rightBtnExpand = reactive({
  smartShow: false, // 智能展示 展开状态
  normalShow: false, // 显示展示 展开状态
  system: false, // 系统按钮 展开状态
});

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

const switchBoo = ref(false);
// 切换透明模型
const switchModel = () => {
  switchBoo.value = !switchBoo.value;
  // vMapRef.value?.loadModel('/model/tm.glb');
  // 真 加载虚拟
  if (switchBoo.value) {
    console.log(switchBoo.value);
    vMapRef.value?.removeModelById(1);
    vMapRef.value?.loadModelById(2);
  } else {
    console.log(switchBoo.value);
    vMapRef.value?.removeModelById(2);
    vMapRef.value?.loadModelById(1);
  }
};

// 风险数据
const risk = reactive({
  prewarnName: "",
  prewarnContent: "",
  happenPlace: "",
  happenTime: "",
});

// 获取到cesium的全部导出的方法
const vMapRef = useTemplateRef<VMapExposed>("vMapRef");
const videoRef = useTemplateRef("webrtc");

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

// 关闭链消息弹窗
const closeChainMsgPopup = () => {
  showChainMsgPopup.value = false;
};

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
          url: "brBk/HKManage/selWsUrlByCode",
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
          url: "brBk/HKManage/selPlayBackByCode",
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

// 单独请求链消息接口（不修改原有fetchChainMessage）
const fetchChainMsgForPopup = async () => {
  try {
    const response = await axios({
      url: "brBk/api/alert/selList",
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
// 直接飞行（移除弹窗逻辑）
const startDirectFlight = () => {
  // 检查全景视频是否打开
  if (!SPkzq.value) {
    ElMessage.warning("请先打开全景视频");
    return;
  }

  // 检查飞行区域是否选择
  if (!SPfx.value) {
    ElMessage.warning("请先选择飞行区域");
    return;
  }
  let targetEntity;
  // console.log("------------------222", SPfx.value)
  if (QJSP.value == "entity17") {
    targetEntity = "entity17";
  } else {
    targetEntity = entityMap[SPfx.value];
  }
  // console.log("------------11111", targetEntity)
  if (!targetEntity) {
    ElMessage.error("未找到对应的飞行实体");
    return;
  }

  // 先停止当前飞行（如果有）
  stopFlight();

  // 更新飞行状态
  flightStatus.isFlying = true;
  flightStatus.currentSpeed = flightSpeed.value;
  flightStatus.currentEntity = targetEntity;

  // 调用飞行方法
  // console.log("-----",targetEntity)
  vMapRef.value?.Erxun(targetEntity);

  ElMessage.success(`开始飞行`);
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

// 全景视频相关
let qtag = ref(false);
let yincang = ref(false);
let fenlei = ref(false);
let isbtn = ref(true);
let QuanJing = function (e: any) {
  if (fenlei.value) {
    isimagelist.value = false;
    isimagelist1.value = false;
    fenlei.value = false;
    vMapRef.value?.removeurl();
    isbtn.value = true;
  } else {
    fenlei.value = true;
  }
};

let isimagelist = ref(false);
let isimagelist1 = ref(false);

let Indoor = function () {
  if (isimagelist.value) {
    isimagelist.value = false;
    isimagelist1.value = false;
    isbtn.value = true;
  } else {
    isimagelist.value = true;
    isimagelist1.value = false;
    isbtn.value = false;
  }
};

let Outdoor = function () {
  if (isimagelist1.value) {
    isimagelist.value = false;
    isimagelist1.value = false;
    isbtn.value = true;
  } else {
    isimagelist.value = false;
    isimagelist1.value = true;
    isbtn.value = false;
  }
};

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
      //  vMapRef.value?.Qguannei();
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
        //  vMapRef.value?.Qguannei();
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
      const dataArr = [
        ...idToArrayMap.q8,
        ...idToArrayMap.q15,
        ...idToArrayMap.q18,
        ...idToArrayMap.q23,
      ];
      // vMapRef.value?.danquanbu(dataArr);
    },
  };

  // if (customOptions.value === "q30") {
  //    vMapRef.value?.yichu()
  //    vMapRef.value?.closeAllWebSockets()
  //   vMapRef.value?.getbaogaoting()

  // }

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
  yincang.value = false;
  isbtn.value = true;
};

// 按钮状态管理
const buttonStatus = ref({
  outer: false,
  panorama: false,
  xiguangchang: false,
});
const colses = ref(false);
const yyvideo = ref(false);
const sanwei = ref(false);
const opens = () => {
  colses.value = !colses.value;
  if (colses.value) {
    buttonStatus.value.outer = true;
    colses.value = true;
    // console.log("关闭");
  } else {
    colses.value = false;
    // console.log("dakai");
    buttonStatus.value.outer = false;
  }
};

const toggleOuter = () => {
  vMapRef.value?.waiwei();
};

// 西广场按钮点击事件 - 修正版
const xiguangchang = () => {
  QJSP.value = "";
  if (buttonStatus.value.xiguangchang) {
    // 关闭西广场逻辑（保持原有）
    vMapRef.value?.yichushipin();
    // vMapRef.value?.yichu()
    vMapRef.value?.loadModelById(3);
    // vMapRef.value?.closeAllWebSockets()
    buttonStatus.value.xiguangchang = false;
    SPkzq.value = false;
    SPfx.value = "";
    if (flightStatus.isFlying) {
      stopFlight();
    }
  } else {
    // 打开西广场逻辑 - 对齐智能展示的西广场逻辑
    // 1. 重置其他按钮状态（和智能展示点击逻辑一致）
    buttonStatus.value = {
      outer: false,
      panorama: false,
      xiguangchang: false,
    };

    // 2. 调用正确的OpenModel1（参数改为q40，和智能展示一致）
    OpenModel1(["q40"]);
    vMapRef.value?.QuanJing(true, ["q40"]); // 保持和智能展示一致的全景调用
    // vMapRef.value?.closeAllWebSockets()
    // 3. 标记西广场按钮激活
    buttonStatus.value.xiguangchang = true;

    // 4. 延时触发飞行（和智能展示的handleCustomItemClick逻辑一致）
    // setTimeout(() => {
    //   startDirectFlight();
    //   console.log("西广场：触发飞行逻辑");
    // }, 4000);
  }
};

let QJSP = ref("");
const togglePanorama = () => {
  if (buttonStatus.value.panorama) {
    if (isSpecialViewport == true) {
      vMapRef.value?.Qguannei1();
    } else if (isSpecialViewport == false) {
      vMapRef.value?.Qguannei();
    } else if (isSpecialViewport == 1) {
      vMapRef.value?.Qguannei2();
    }
    vMapRef.value?.yichushipin();
    // vMapRef.value?.yichu()
    vMapRef.value?.loadModelById(3);
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
    // vMapRef.value?.Qguannei()
    if (isSpecialViewport == true) {
      vMapRef.value?.Qguannei1();
    } else if (isSpecialViewport == false) {
      vMapRef.value?.Qguannei();
    } else if (isSpecialViewport == 1) {
      vMapRef.value?.Qguannei2();
    }

    vMapRef.value?.closeAllWebSockets();
    vMapRef.value?.getRadarDatarc();
    vMapRef.value?.getshengtailianlang();
    vMapRef.value?.getbaogaoting();
    vMapRef.value?.getxuting();
    vMapRef.value?.removeModelById(3);
    buttonStatus.value.outer = false;
  }
};

const toggleHallA = () => {
  if (isSpecialViewport == true) {
    vMapRef.value?.Aguannei1();
  } else if (isSpecialViewport == false) {
    vMapRef.value?.Aguannei();
  } else if (isSpecialViewport === 1) {
    vMapRef.value?.Aguannei2();
  }
};

const toggleHallB = () => {
  if (isSpecialViewport == true) {
    vMapRef.value?.Bguannei1();
  } else if (isSpecialViewport == false) {
    vMapRef.value?.Bguannei();
  } else if (isSpecialViewport == 1) {
    vMapRef.value?.Bguannei2();
  }
};
const toggleHallC = () => {
  if (isSpecialViewport == true) {
    vMapRef.value?.Cguannei1();
    console.log("C馆1");
  } else if (isSpecialViewport == false) {
    vMapRef.value?.Cguannei();
    console.log("C馆2");
  } else if (isSpecialViewport == 1) {
    vMapRef.value?.Cguannei();
  }
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
const x = ref(0);
const y = ref(0);
let startX = 0;
let startY = 0;
let dragging = false;
const startDrag = (event: MouseEvent) => {
  // console.log(startX);
  // console.log(startY);

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

// 按钮显隐控制
const showButtons = ref(true);
// 自定义列表显隐控制
const showCustomList = ref(false);
// 【保持原变量名】改造为互斥分类的二级结构
const customOptions = ref([
  {
    label: "A馆",
    expanded: false, // 是否展开
    disabled: false, // 是否禁用点击
    children: [
      { label: "A馆北侧", value: ["q2"] },
      { label: "A馆南侧", value: ["q1"] },
      { label: "A馆序厅一楼", value: ["q30"] },
      { label: "A馆序厅二楼", value: ["q31"] },
    ],
  },
  {
    label: "B馆",
    expanded: false,
    disabled: false,
    children: [
      { label: "B馆北侧", value: ["q4", "q6"] },
      { label: "B馆中间", value: ["q3", "q9"] },
      { label: "B馆南侧", value: ["q7", "q5"] },
    ],
  },
  {
    label: "C馆",
    expanded: false,
    disabled: false,
    children: [
      { label: "C馆南侧", value: ["q41"] },
      { label: "C馆中间", value: ["q42"] },
      { label: "C馆北侧", value: ["q43"] },
    ],
  },
  {
    label: "北会",
    expanded: false,
    disabled: false,
    children: [
      { label: "北会", value: ["q44"] },
    ],
  },
  {
    label: "其他",
    expanded: false,
    disabled: false,
    children: [
      { label: "生态连廊", value: ["q33"] },
      { label: "报告", value: ["q38"] },
      { label: "登录厅", value: ["q39"] },
      { label: "西广场", value: ["q40"] },
      { label: "AB馆连廊", value: ["q32"] },
      // { label: '外围', value: ['q8, q15, q18, q23'] },
    ],
  },
]);
// 切换按钮显隐
const toggleButtons = () => {
  showButtons.value = !showButtons.value;
  showCustomList.value = false;
};

// 【原有方法】重置自定义列表状态
const zidingyi = () => {
  //  buttonStatus.value.panorama = !buttonStatus.value.panorama
  if (!buttonStatus.value.panorama) {
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
    ]);
    buttonStatus.value.panorama = true;
  }

  stopFlight();
  QJSP.value = "";
  showCustomList.value = !showCustomList.value;
  if (showCustomList.value) {
    xianshizhanshi.value = false;
    xitongzhanshi.value = false;
    // 重置：所有分类收起 + 全部启用
    customOptions.value.forEach((item) => {
      item.expanded = false;
      item.disabled = false;
    });
    // vMapRef.value?.yichushipin();
    // vMapRef.value?.yichu();
    // vMapRef.value?.removeModelById(3);
    if (flightStatus.isFlying) {
      stopFlight();
    }
    // vMapRef.value?.test1()
  } else {
    // vMapRef.value?.loadModelById(3);
  }
};
// 【新增】点击分类标题（互斥展开/关闭）
const toggleCustomCategory = (catIndex: number) => {
  const currentCategory = customOptions.value[catIndex];
  // 记录当前分类点击前的展开状态
  const wasExpanded = currentCategory.expanded;

  // 第一步：先收起所有分类（实现互斥，不修改disabled）
  customOptions.value.forEach((item) => {
    item.expanded = false; // 只收起，不禁用
  });

  // 第二步：切换当前分类的状态（点击前展开则关闭，点击前关闭则展开）
  currentCategory.expanded = !wasExpanded;
};

// 【新增】点击具体选项直接触发逻辑（移除确认按钮）
const handleCustomItemClick = (value: string[]) => {
  OpenModel1(value);
  // console.log(xitongzhanshi.value)

  // buttonStatus.value.panorama = true;
  // 1. 先判断数组是否有值，再处理
  if (!value || value.length === 0) {
    console.warn("未选择任何选项");
    return; // 无值直接退出，避免后续逻辑执行
  }
  // 2. 去除首尾空白，兼容undefined
  // const realValue = value[0]?.trim() || '';
  // console.log('处理后的值：', realValue, '长度：', realValue.length)
  xitongzhanshi.value = true;
  tingzhifeixing.value = false;
  showCustomList.value = false;
  currentCruiseName.value = true;
  buttonStatus.value = { outer: false, panorama: true };

  // 3. 严格全等判断
  if (value[0] === "q1") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity2");
    }, 4000);
  } else if (value[0] === "q2") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity1");
    }, 4000);
  } else if (value[0] === "q7" && value[1] === "q5") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity3");
    }, 4000);
  } else if (value[0] === "q3" && value[1] === "q9") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity4");
    }, 4000);
  } else if (value[0] === "q4" && value[1] === "q6") {
    // console.log("111111111111111111");
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity5");
    }, 4000);
  } else if (value[0] === "q30") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity11");
    }, 4000);
  } else if (value[0] === "q31") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity16");
    }, 4000);
  } else if (value[0] == "q39") {
    vMapRef.value?.removeModelById(3);
  } else if (value[0] == "q38") {
    vMapRef.value?.removeModelById(3);
  } else if (value[0] == "q33") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity19");
    }, 4000);
  } else if (value[0] == "q32") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity20");
    }, 4000);
  } else if (value[0] == "q41") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity21");
    }, 4000);
  } else if (value[0] == "q42") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity22");
    }, 4000);
  } else if (value[0] == "q43") {
    vMapRef.value?.removeModelById(3);
    setTimeout(() => {
      vMapRef.value?.Erxun("entity23");
    }, 4000);
  } else if (value[0] == "q44") {
    // 北会
    vMapRef.value?.removeModelById(3);
  }
};

let liandongs = ref(false);
let ldsp = ref(false);
let liandong1 = ref("高低联动");
let ips = ref("");

let liandong = async (e: any, id: any) => {
  console.log(e, "------------------", id);
  if (e.duankouhao.ip == ips.value) {
    console.log(111111);
    clickGoPreset(e.duankouhao.yuzhiwei);
  } else {
    console.log(22222);

    if (ldsp.value) {
      clickStopRealPlay();
      destroyPlugin();
      ldsp.value = true;
      controlCameraPTZ(e.duankouhao, id);
    }
    ldsp.value = true;
    await controlCameraPTZ(e.duankouhao, id);
  }
  ips.value = e.duankouhao.ip;
};

let controlCameraPTZ = async (e?: any, id?: any) => {
  console.log(ldsp.value);

  console.log("进入初始化");

  await nextTick();
  let videoRefIdElement = document.getElementById("videoRefId");
  // videoRefIdElement?.style.display = "none";
  if (videoRefIdElement) {
    let width = 200;
    let height = 200;
    data.ip = e.ip;
    data.port = "80";
    data.password = e.password;
    data.userName = e.admin;
    data.iChannelID = id;
    init(width, height, e);
  }
};

// 报警数据
const parsedData = ref();
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
  videoText: true,
  shijian: false,
});

// 显示热点连接的相机名字
const videoName = ref("");
const isPlay = ref(false);
const playerInfo = ref<any>(null);

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

// C馆服务器IP白名单（这些IP在开发环境中需要通过Vite代理转发）
const CHALL_SERVER_IPS = ["10.10.51.1", "172.160.120.2"];
// Vite代理路径前缀
const CHALL_PROXY_PREFIX = "/cghall-ws";

/**
 * 将C馆的直连URL改写为通过Vite代理转发的URL
 * 解决浏览器与C馆视频服务器跨网段无法直连的问题
 *
 * 转换规则：
 *   ws://10.10.51.1:559/openUrl/token -> ws://当前host:port/cghall-ws/openUrl/token
 */
const rewriteCgaoUrl = (url: string): string => {
  if (!url) return url;

  // 检查是否是C馆的URL
  const isCgaoUrl = CHALL_SERVER_IPS.some((ip) => url.includes(ip));
  if (!isCgaoUrl) return url;

  // 获取当前页面的host和port（用于构造代理URL）
  const currentUrl = new URL(window.location.href);
  const host = currentUrl.hostname;
  const port = currentUrl.port || "8081";

  // 从原始URL中提取路径部分（/openUrl/xxx 或 /media?xxx）
  // 原始URL格式：ws://10.10.51.1:559/openUrl/token
  // 需要转换为：ws://当前host:port/cghall-ws/openUrl/token
  let path = "";
  try {
    const originalUrl = new URL(url);
    path = originalUrl.pathname + originalUrl.search;
  } catch {
    // 如果URL解析失败，尝试简单正则提取路径
    const match = url.match(/\/(openUrl|media)[^\s]*/);
    path = match ? match[0] : url.replace(/^wss?:\/\/[^\/]+/, "");
  }

  const rewrittenUrl = `ws://${host}:${port}${CHALL_PROXY_PREFIX}${path}`;
  console.log(`[C馆代理] URL改写: ${url} -> ${rewrittenUrl}`);

  return rewrittenUrl;
};

// 播放热点连接的相机
const playRTCVideoStream = async (params: HotspotEntity) => {
  // console.log("1111111---------- 播放摄像头:", params.name, "URL:", params.wsUrl);
  videoName.value = params.name;
  isShow.isShowVideo = true;

  // 关键：C馆URL需要通过代理转发，否则浏览器无法直连
  const playUrl = rewriteCgaoUrl(params.wsUrl);

  // 先停止当前播放（关键：避免旧session未释放导致新连接失败）
  if (player.value) {
    try {
      await player.value.JS_Stop();
      console.log("已停止旧的播放");
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
    openDebug: true, // 先开启调试，方便排查问题，生产可关闭
    bWndFull: true,
    oStyle: {
      border: "#f21461",
      borderSelect: "#f21461",
      background: "#000",
    },
  });
  console.log("播放器实例:", player.value);

  // 绑定事件回调（对齐海康demo，重要！错误回调可帮助定位问题）
  player.value.JS_SetWindowControlCallback({
    windowEventSelect: function (iWndIndex) {
      // console.log('窗口选中回调:', iWndIndex);
    },
    pluginErrorHandler: function (iWndIndex, iErrorCode, oError) {
      // console.error('插件错误回调 - 窗口:', iWndIndex, '错误码:', iErrorCode, '详情:', oError);
    },
    windowEventOver: function (iWndIndex) { },
    windowEventOut: function (iWndIndex) { },
    windowEventUp: function (iWndIndex) { },
    windowFullCcreenChange: function (bFull) {
      // console.log('全屏变化:', bFull);
    },
    firstFrameDisplay: function (iWndIndex, iWidth, iHeight) {
      // console.log('首帧显示 - 窗口:', iWndIndex, '分辨率:', iWidth + 'x' + iHeight);
    },
    performanceLack: function (iWndIndex) {
      // console.warn('性能不足 - 窗口:', iWndIndex);
    },
    StreamEnd: function (iWndIndex) {
      // console.log('流结束 - 窗口:', iWndIndex);
    },
    StreamHeadChanged: function (iWndIndex) {
      // console.log('流头变化 - 窗口:', iWndIndex);
    },
  });
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

const playCreate = () => {
  const container = document.getElementById("player_box1");
  if (!container) return;
  const easyplayer = new (window as any).EasyPlayerPro({
    container: container,
    decoder: "/js/decoder-pro.js",
    videoBuffer: 0.2,
    isResize: false,
    text: "",
    loadingText: "加载中",
    useMSE: config.value.useMSE,
    useSIMD: config.value.useSIMD,
    useWCS: config.value.useWCS,
    isMulti: true,
    hasAudio: config.value.hasAudio,
    showBandwidth: config.value.showBandwidth,
    showPerformance: config.value.showBandwidth,
    operateBtns: {
      fullscreen: true,
      screenshot: true,
      play: true,
      audio: true,
      record: true,
      quality: true,
      performance: true,
    },
    watermarkConfig: {
      text: {
        content: "easyplayer-pro",
      },
      right: 10,
      top: 10,
    },
    playbackForwardMaxRateDecodeIFrame: 1,
    isWebrtcForOthers: true,
    demuxUseWorker: config.value.demuxUseWorker,
    supportHls265: true,
  });

  easyplayer.on("fullscreen", function (flag: any) {
    console.log("is fullscreen", flag);
  });
  easyplayer.on("playbackPreRateChange", (rate: any) => {
    easyplayer.forward(rate);
  });
  easyplayer.on("playbackSeek", (data: any) => {
    easyplayer.setPlaybackStartTime(data.ts);
  });

  playerInfo.value = easyplayer;
};

const onPlayer = async (url: any) => {
  isPlay.value = true;
  setTimeout(
    (url: string) => {
      if (playerInfo.value) {
        playerInfo.value
          .play(url)
          .then(() => { })
          .catch((e: any) => {
            console.error(e);
          });
      }
    },
    0,
    url,
  );
};

// 封装海康播放器关闭方法
const closeHisVideo = async () => {
  console.log(player.value);
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

// 关闭高低点联动播放
const closeHighVideo = () => {
  ldsp.value = false;
  clickStopRealPlay();
  destroyPlugin();
  ips.value = "";
};

// 关闭热点连接播放
const closeVideo = async () => {
  // 关闭海康播放器
  await closeHisVideo();
  // if(ldsp.value){
  //   ldsp.value = false;
  // }
  // closeHighVideo()
  //   isShow.isShowVideo = false;
  //   ldsp.value = false;
  //   clickStopRealPlay();
  //   destroyPlugin();
  //   ips.value = "";
};

// 热点连接的函数
let isaddCesiumLabel = ref(false);
const addCesiumLabel = async () => {
  QJSP.value = "";
  ButtonText.videoText = !ButtonText.videoText;
  const response = await fetch("/points.json");
  const data: HotspotEntity[] = await response.json();
  const idArray: string[] = data.map((item) => item.id);
  if (!ButtonText.videoText) {
    vMapRef.value?.removeHotspotsByIds(idArray);
    vMapRef.value?.disableHotspotClick();
    vMapRef.value?.addHotspot(data);
    vMapRef.value?.removeModelById(3);
    isaddCesiumLabel.value = true;
  } else {
    vMapRef.value?.removeHotspotsByIds(idArray);
    vMapRef.value?.disableHotspotClick();
    // vMapRef.value?.loadModelById(3)
    isaddCesiumLabel.value = false;
    addCesiumLabels();
    addCesiumLabelsC();
  }
};

//初始显示的实时监控
const addCesiumLabels = async () => {
  const response = await fetch("/pointss.json");
  const data: HotspotEntity[] = await response.json();

  vMapRef.value?.addHotspots(data);
};

//C管
const addCesiumLabelsC = async () => {
  const response = await fetch("/pointssC.json");
  const data: HotspotEntity[] = await response.json();

  vMapRef.value?.addHotspots(data);
};
const addCesiumLabelss = async () => {
  const response = await fetch("/gaodidian.json");
  const data: HotspotEntity[] = await response.json();
  //  console.log(data,"111111111111111111");

  vMapRef.value?.gaodidianliandong(data);
};
const xutingerlou = async () => {
  const response = await fetch("/xutingerlou.json");
  const data: HotspotEntity[] = await response.json();
  //  console.log(data,"111111111111111111");

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

// 打开模型
const OpenModel = (num: number) => {
  vMapRef.value?.loadModel(`/model/${num}.glb`);
};

// 给视频贴图
const click_draw_polygon_fn = () => {
  vMapRef.value?.click_draw_polygon_fn();
};

//路线图
let mtag = ref(false);
let changeMark = (e: any) => {
  QJSP.value = "";
  if (mtag.value) {
    vMapRef.value?.changeMark(mtag.value);
    mtag.value = false;
  } else {
    vMapRef.value?.changeMark(mtag.value);
    vMapRef.value?.removeModelById(3);

    mtag.value = true;
  }
};

let shijian = (e: any) => {
  if (ButtonText.shijian) {
    // console.log("-----", ButtonText.shijian, 111111)
    showChainMsgPopup.value = false;
    ButtonText.shijian = false;
    searchAlarmParams.cameraName = "";
    searchAlarmParams.beginTime = "";
    searchAlarmParams.endTime = "";
    closeHisVideo();
  } else {
    // console.log("-----------------2", showChainMsgPopup.value)
    showChainMsgPopup.value = true;
    ButtonText.shijian = true;
    fetchChainMsgForPopup();
  }
};
let fanhui = () => {
  vMapRef.value?.Qguannei();
};
let tingzhifeixing = ref(false);
let tingzhi = () => {
  tingzhifeixing.value = !tingzhifeixing.value;
  if (tingzhifeixing.value) {
    vMapRef.value?.stopErxun();
    currentCruiseName.value = false;
  } else {
    vMapRef.value?.continueErxun();
    currentCruiseName.value = true;
  }
};
let flytotingzhi = (id) => {
  // OpenModel1(['q2', 'q1', 'q4', 'q3', 'q7', 'q6', 'q5', 'q9', 'q8', 'q15', 'q18', 'q23', "q30", "q31", "q32", "q33", "q34", "q35", "q38", "q39", "q40"]);
  // buttonStatus.value.panorama = true;
  if (!buttonStatus.value.panorama) {
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
    ]);
    buttonStatus.value.panorama = true;
  }
  if (id == "r1") {
    xitongzhanshi.value = true;
    // console.log(xitongzhanshi.value)
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r2") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r3") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r4") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r5") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r7") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r8") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r11") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  } else if (id == "r12") {
    xitongzhanshi.value = true;
    tingzhifeixing.value = false;
    currentCruiseName.value = true;
  }
};

// 1. 数字-方向固定映射（保留原有规则：1西、2南、3东、4上）
const directionMap = {
  1: "西面",
  2: "南面",
  3: "东面",
  4: "上面",
};

// 2. 响应式状态：当前方向编号（初始为1，对应西面）
const currentNum = ref(1);

// 3. 【关键修复】用computed创建响应式计算属性，自动跟随currentNum更新
const currentDirection = computed(() => {
  return directionMap[currentNum.value];
});


// 方向按钮点击事件
const handleDirectionClick = (direction: number) => {
  currentNum.value = direction;
  switch (direction) {
    case 1:
      vMapRef.value?.ximian();
      break;
    case 2:
      vMapRef.value?.nanmian();
      break;
    case 3:
      vMapRef.value?.dongmian();
      break;
    case 4:
      vMapRef.value?.shangmian();
      break;
    default:
      break;
  }
};

/**
 * 核心切换方法：1→2→3→4→1 无限循环（原有逻辑无需修改，本身无问题）
 */
const changeDirection = () => {
  currentNum.value = currentNum.value === 4 ? 1 : currentNum.value + 1;
  // 步骤2：根据新编号执行对应方法
  switch (currentNum.value) {
    case 1:
      vMapRef.value?.ximian();
      break;
    case 2:
      vMapRef.value?.nanmian();
      break;
    case 3:
      vMapRef.value?.dongmian();
      break;
    case 4:
      vMapRef.value?.shangmian();
      break;
    default:
      break;
  }
};

const xianshizhanshis = () => {
  xianshizhanshi.value = !xianshizhanshi.value;
  if (xianshizhanshi.value) {
    showCustomList.value = false;
    xitongzhanshi.value = false;
    xianshizhanshi.value = true;
    // console.log(2222);
  } else {
    xianshizhanshi.value = false;
    // console.log(111);
  }
};
const xitongzhanshis = () => {
  xitongzhanshi.value = !xitongzhanshi.value;
  if (xitongzhanshi.value) {
    showCustomList.value = false;
    xianshizhanshi.value = false;
    xitongzhanshi.value = true;
  } else {
    xitongzhanshi.value = false;
  }
};
const toggleDataPanel = () => {
  showDataPanel.value = !showDataPanel.value;
};

// 1. 允许执行的方法映射表（保留原有逻辑，补全语法）
const allowExecMethods = {
  Aguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value && typeof vMapRef.value.Aguannei === "function") {
      vMapRef.value.Aguannei(); // 调用子组件暴露的方法
      console.log("子组件方法Aguannei执行成功");
    } else {
      console.warn("子组件未挂载或方法未暴露：Aguannei");
    }
  },
  Bguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value && typeof vMapRef.value.Bguannei === "function") {
      vMapRef.value.Bguannei(); // 调用子组件暴露的方法
      console.log("子组件方法Aguannei执行成功");
    } else {
      console.warn("子组件未挂载或方法未暴露：Aguannei");
    }
  },
  Cguannei: () => {
    // 判空处理：确保子组件已挂载、方法存在
    if (vMapRef.value && typeof vMapRef.value.Cguannei === "function") {
      vMapRef.value.Cguannei(); // 调用子组件暴露的方法
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
  startChainMsgPolling();

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
    addCesiumLabels();
    addCesiumLabelsC();
  }, 1500);

  setTimeout(() => {
    togglePanorama();
    buttonStatus.value.panorama = true;
    execMethodByUrl();
    addCesiumLabelss();
    outaddCesiumLabelss();
    xutingerlou();
    Cgaodidianliandong();
  }, 2000);

  // getRadarpoeple();
  window.addEventListener("resize", handleResize);
  // 初始化时先执行一次判断
  updateViewportStatus();

  // // 修正alert用法：拼接字符串和变量，确保数值正确显示
  // alert("浏览器视口宽度：" + viewportWidth);
  // alert("浏览器视口高度：" + viewportHeight);
});

// 1. 保留变量，用于存储匹配到的大屏标识值（true/1/2/3...）
let isSpecialViewport: any;
// 2. 特殊分辨率映射表（后续扩展直接追加即可）
const SPECIAL_RESOLUTIONS_MAP = {
  "11520x2160": true, // 原有分辨率-标识true
  "5760x1080": 1, // 新增分辨率-标识1
  "7640x2160": 2, // 新增分辨率-标识2
  // 扩展示例：'8000x6000': 3, '9000x3000': 4
};

// 3. 响应式视口对象（Vue3 reactive）
const viewportSize = reactive({
  width: window.innerWidth,
  height: window.innerHeight,
});

// 4. 窗口大小变化处理
const handleResize = () => {
  viewportSize.width = window.innerWidth;
  viewportSize.height = window.innerHeight;
};

// 5. 封装判断逻辑：精准获取映射表匹配的value
const updateViewportStatus = () => {
  const currentResolution = `${viewportSize.width}x${viewportSize.height}`;
  // 关键修改：用in判断是否存在该分辨率，存在则取原值，不存在则为false
  // 避免原逻辑中"假值"被覆盖，同时精准拿到匹配的标识值
  isSpecialViewport =
    currentResolution in SPECIAL_RESOLUTIONS_MAP
      ? SPECIAL_RESOLUTIONS_MAP[currentResolution]
      : false;
  console.log("当前匹配的大屏标识值：", isSpecialViewport); // 精准打印true/1/2/false
};

// 6. 监听视口变化，严格按标识值执行对应逻辑
watch(
  viewportSize,
  () => {
    updateViewportStatus();
    // 大屏判断：只要不是false，就是匹配到大屏
    if (isSpecialViewport !== false) {
      console.log(
        "匹配到特殊分辨率，执行大屏通用逻辑",
        window.innerWidth,
        window.innerHeight,
      );

      // 严格分支：精准匹配标识值，不会串逻辑（true/1/2各自执行）
      if (isSpecialViewport === true) {
        console.log("【11520x2160】执行专属逻辑，标识值：", isSpecialViewport);
      } else if (isSpecialViewport === 1) {
        console.log("【5760x1080】执行专属逻辑，标识值：", isSpecialViewport);
      } else if (isSpecialViewport === 2) {
        console.log("【7640x2160】执行专属逻辑，标识值：", isSpecialViewport);
      } else if (isSpecialViewport === 3) {
        // 扩展新分辨率时，直接加else if即可
        console.log("【新分辨率】执行专属逻辑，标识值：", isSpecialViewport);
      }
    } else {
      // 小屏逻辑：未匹配任何大屏分辨率
      console.log(
        "未匹配到特殊分辨率，执行小屏逻辑",
        window.innerWidth,
        window.innerHeight,
      );
    }
  },
  { deep: true, immediate: true }, // 深度监听+初始化立即执行
);

// 新增：动态添加特殊分辨率的方法（不改动原有逻辑，仅扩展）
const addSpecialResolution = (width, height, value) => {
  const resolutionKey = `${width}x${height}`;
  if (!SPECIAL_RESOLUTIONS_MAP[resolutionKey]) {
    SPECIAL_RESOLUTIONS_MAP[resolutionKey] = value;
    updateViewportStatus();
  }
};

const handleCruisePointChange = (pointName) => {
  console.log("父组件接收到巡航信息：", pointName);
  // ① 将数据赋值给父组件响应式变量，供页面渲染
  currentCruise.value = pointName;

  // ② 可执行父组件的其他业务逻辑（如根据点位名称更新状态、发起接口请求等）
  // doSomethingWithCruise(cruiseData.pointName);
};

// 11520 2160

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);

  stopChainMsgPolling();
});

let handleWsData = (parsedData) => {
  // 处理WebSocket数据逻辑
};
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
      <!-- 底部ABC馆按钮容器 -->
      <div class="abc-buttons-container">
        <ul class="abc-buttons-list">
          <li class="abc-button" :class="{ 'active': activeButton === 0 }" @click="toggleHallA(); activeButton = 0;"
            @mousedown="changDa" @mouseup="changXiao">
            <p class="button-text">A馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 1 }" @click="toggleHallB(); activeButton = 1;"
            @mousedown="changDa" @mouseup="changXiao">
            <p class="button-text">B馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 2 }" @click="togglePanorama(); activeButton = 2;"
            @mousedown="changDa" @mouseup="changXiao">
            <p class="button-text">首页</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 3 }" @click="toggleHallC(); activeButton = 3;"
            @mousedown="changDa" @mouseup="changXiao">
            <p class="button-text">C馆</p>
          </li>
          <li class="abc-button" :class="{ 'active': activeButton === 4 }" @click="toggleOuter(); activeButton = 4;"
            @mousedown="changDa" @mouseup="changXiao">
            <p class="button-text">外围</p>
          </li>
        </ul>
      </div>

      <!-- 方向按钮容器 -->
      <div class="direction-buttons-container">
        <ul class="direction-buttons-list">
          <li 
            class="direction-button" 
            data-tooltip="西面"
            :class="{ 'active': currentNum === 1 }"
            @click="handleDirectionClick(1)"
            @mousedown="changDa" 
            @mouseup="changXiao"
          >
            <div class="direction-button-bg bg-west"></div>
            <!-- <p class="button-text">西</p> -->
          </li>
          <li 
            class="direction-button" 
            data-tooltip="南面" 
            :class="{ 'active': currentNum === 2 }"
            @click="handleDirectionClick(2)"
            @mousedown="changDa" 
            @mouseup="changXiao"
          >
            <div class="direction-button-bg bg-south"></div>
            <!-- <p class="button-text">南</p> -->
          </li>
          <li 
            class="direction-button" 
            data-tooltip="东面" 
            :class="{ 'active': currentNum === 3 }"
            @click="handleDirectionClick(3)"
            @mousedown="changDa" 
            @mouseup="changXiao"
          >
            <div class="direction-button-bg bg-east"></div>
            <!-- <p class="button-text">东</p> -->
          </li>
          <li 
            class="direction-button" 
            data-tooltip="顶部" 
            :class="{ 'active': currentNum === 4 }"
            @click="handleDirectionClick(4)"
            @mousedown="changDa" 
            @mouseup="changXiao"
          >
            <div class="direction-button-bg bg-up"></div>
            <!-- <p class="button-text">上</p> -->
          </li>
        </ul>
      </div>

      <!-- 背景 -->
      <div class="center">
        <!-- 地图 -->
        <div class="map">
          <!-- 按钮容器 -->
          <div class="arenbiao" :class="{ 'arenbiao--show': showButtons }">
            <!-- 左侧按钮 -->
            <ul class="arenbiao__left-list">
              <li class="arenbiao__main-item" @click="resetHallC" @mousedown="changDa" @mouseup="changXiao">
                <p class="arenbiao__text">C馆复位</p>
              </li>
            </ul>
            <!-- <div class="fenleis" v-if="colses">
              <ul>
                。<li @click="toggleOuter">全景视频</li>
                <li @click="toggleOuters">三维重构</li>
              </ul>
            </div> -->

            <!-- 右侧按钮 备份勿删！！！！！！！！！！！！！ -->
            <!-- <div class="arenbiao__right-wrap"> -->
            <!-- <ul class="arenbiao__right-list"> -->

            <!-- A馆按钮 -->
            <!-- <li class="arenbiao__item" :class="{ 'arenbiao__item--active': buttonStatus.hallA }"
                  @click="toggleHallA" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text">{{ buttonStatus.hallA ? '关闭A馆' : 'A馆' }}</p>
                </li> -->
            <!-- B馆按钮 -->
            <!-- <li class="arenbiao__item" :class="{ 'arenbiao__item--active': buttonStatus.hallB }"
                  @click="toggleHallB" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text">{{ buttonStatus.hallB ? '关闭B馆' : 'B馆' }}</p>
                </li> -->

            <!-- <li class="arenbiao__item" :class="{ 'arenbiao__item--active': buttonStatus.hallB }" @click="shijian"
                  @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text"> {{ ButtonText.shijian ? '报警信息' : '报警信息' }} </p>
                </li>
                <li class="arenbiao__item" @click="changeMark" :class="{ 'active': mtag }" @mousedown="changDa"
                  @mouseup="changXiao">
                  <p class="arenbiao__text">路线图</p>
                </li> -->
            <!-- 实时监控按钮 -->
            <!-- <li class="arenbiao__item" :class="{ 'active': isaddCesiumLabel }" @click="addCesiumLabel"
                  @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text">{{ ButtonText.videoText ? "实时监控" : "实时监控" }}</p>
                </li> -->
            <!-- 全景按钮 -->
            <!-- <li class="arenbiao__item" :class="{ 'arenbiao__item--active': buttonStatus.panorama }"
                  @click="togglePanorama" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text">{{ buttonStatus.panorama ? '关闭全景' : '全景' }}</p>
                </li> -->
            <!-- 自定义按钮 -->
            <!-- <li class="arenbiao__item" @click="zidingyi" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text" style="cursor: pointer;">智能展示</p>
                </li> -->
            <!-- </ul> -->
            <!-- 右侧按钮 备份勿删！！！！！！！！！！！！！ -->
            <!-- 右侧按钮 -->
            <div class="arenbiao__right-wrap">
              <!-- 右侧主按钮列表（3个主按钮） -->
              <ul class="arenbiao__right-main-list">
                <!-- 第一个主按钮：智能展示 -->
                <li class="arenbiao__main-item" @mouseenter="rightBtnExpand.smartShow = true"
                  @mouseleave="() => (rightBtnExpand.smartShow = false)" @click="zidingyi" @mousedown="changDa"
                  @mouseup="changXiao">
                  <p class="arenbiao__text">智能展示</p>

                  <!-- 智能展示 下方并列子按钮（无额外子按钮，保持原有逻辑） -->
                  <ul class="arenbiao__sub-list" v-show="rightBtnExpand.smartShow">
                  </ul>
                </li>

                <!-- 第二个主按钮：显示展示 -->
                <li class="arenbiao__main-item" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text" @click="xianshizhanshis">
                    显示展示
                  </p>

                  <!-- 显示展示 下方并列子按钮：报警信息、路线图、实时监控 -->
                  <ul class="arenbiao__sub-list" v-if="xianshizhanshi">
                    <li class="arenbiao__sub-item" @click="shijian" @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">报警信息</p>
                    </li>
                    <li class="arenbiao__sub-item" @click="changeMark" :class="{ active: mtag }" @mousedown="changDa"
                      @mouseup="changXiao">
                      <p class="arenbiao__text">路线图</p>
                    </li>
                    <li class="arenbiao__sub-item" :class="{ active: isaddCesiumLabel }" @click="addCesiumLabel"
                      @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">实时监控</p>
                    </li>
                  </ul>
                </li>

                <!-- 第三个主按钮：系统按钮 -->
                <li class="arenbiao__main-item" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text" @click="xitongzhanshis">系统按钮</p>

                  <!-- 系统按钮 下方并列子按钮：全景、切换方向、停止、返回 -->
                  <ul class="arenbiao__sub-list" v-if="xitongzhanshi">
                    <li class="arenbiao__sub-item" :class="{
                      'arenbiao__item--active': buttonStatus.panorama,
                    }" @click="togglePanorama" @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">
                        {{ buttonStatus.panorama ? "关闭" : "全景" }}
                      </p>
                    </li>
                    <!-- <li class="arenbiao__sub-item" @click="changeDirection" @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">{{ currentDirection }}</p>
                    </li> -->
                    <li class="arenbiao__sub-item" @click="tingzhi" @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">
                        {{ tingzhifeixing ? "继续" : "停止" }}
                      </p>
                    </li>
                    <li class="arenbiao__sub-item" @click="fanhui" @mousedown="changDa" @mouseup="changXiao">
                      <p class="arenbiao__text">返回</p>
                    </li>
                  </ul>
                </li>

                <!-- 第四个主按钮：数据展示 -->
                <li class="arenbiao__main-item" @click="toggleDataPanel" @mousedown="changDa" @mouseup="changXiao">
                  <p class="arenbiao__text">
                    {{ showDataPanel ? "关闭数据" : "数据展示" }}
                  </p>
                </li>
              </ul>
              <!-- 自定义列表（原有，保留不变） -->
              <div class="arenbiao1" v-if="showCustomList">
                <ul class="custom-options__list">
                  <!-- 一级分类：A馆/B馆/其他（互斥展开） -->
                  <li class="custom-category__item" v-for="(category, catIndex) in customOptions" :key="catIndex">
                    <div class="custom-category__title" @click="toggleCustomCategory(catIndex)"
                      :class="{ disabled: category.disabled }">
                      <span>{{ category.label }}</span>
                      <span class="category-arrow">{{
                        category.expanded ? "▼" : "▶"
                      }}</span>
                    </div>
                    <ul class="custom-options__children" v-if="category.expanded">
                      <li class="custom-options__item" v-for="(item, index) in category.children" :key="index"
                        @click="handleCustomItemClick(item.value)">
                        {{ item.label }}
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>

            </div>
          </div>

          <!-- 数据展示模块 -->
          <DataPanel v-if="showDataPanel" />

          <!-- 切换透明模型 -->
          <!-- <div class="switchModel" @click="switchModel">
          </div> -->

          <!-- 移除飞行控制面板弹窗 -->

          <!-- 联动视频 -->
          <div class="liandongshipin" v-if="ldsp">
            <div id="videoRefId" class="video-ref">
              <div class="video-plugin" id="divPlugin" ref="player"></div>
              <div class="fangxiang">
                <button class="close-button" aria-label="关闭视频" @click="closeHighVideo">
                  <img src="../assets/img/close.png" alt="关闭" class="closesss" />
                </button>
              </div>
            </div>
          </div>

          <!-- 地图容器 -->
          <div class="chart">
            <vMap ref="vMapRef" @liandongss="liandong" @pointName="handleCruisePointChange" @flytotingzhi="flytotingzhi"
              @parsedDatas="handleWsData" @play-video-fusion="playRTCVideoStream" :showSystem="xitongzhanshi"
              @close-video="closeVideo" />
          </div>

          <!-- 视频弹窗 -->
          <div v-if="isShow.isShowVideo" class="video-container" ref="videoRef"
            :style="{ left: `${x}px`, top: `${y}px` }" style="position: absolute" @mousedown="startDrag">
            <!-- ref="videoRef"
    :style="{ left: `${x}px`, top: `${y}px` }"
    style="position: absolute"
    @mousedown="startDrag" -->
            <!-- 名字显示区域 -->
            <div class="name-display">{{ videoName || "摄像头01" }}</div>

            <!-- 关闭按钮 -->
            <button class="video-container__close" aria-label="关闭视频" @click="closeHisVideo">
              <img src="../assets/img/close.png" alt="关闭" class="close-icon-image" />
            </button>

            <!-- 视频播放器 -->
            <div class="player-container">
              <div class="player-item">
                <div class="player-box" id="player_box1"></div>
              </div>
            </div>

            <!-- <button class="video-container__play" @click="onPlayer(url)" v-if="!isPlay">播放</button> -->
          </div>

          <div class="popup-mask" v-show="showPopup" @click.self="closePopup">
            <div class="popup-content">
              <div class="popup-header">
                <h3 class="popup-title">警告信息</h3>
                <!-- <button class="popup-close" @click="closePopup">×</button> -->
              </div>
              <!-- <div class="popup-body">
                <img :src="'http://192.162.46.61' + eveWarn" class="popup-image" />
              </div> -->
              <!-- <div class="popup-footer">
                <button class="popup-button cancel-btn" @click="closePopup">退出</button>
              </div> -->
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
              <!-- <button class="popup-close" @click="closeChainMsgPopup">×</button> -->
            </div>

            <!-- 搜索栏（固定在头部下方，不随列表滚动） -->
            <div class="popup-search-bar">
              <div class="search-row">
                <input type="text" v-model="searchAlarmParams.cameraName" placeholder="按相机名称搜索"
                  class="search-input name-input" />
                <input type="datetime-local" v-model="searchAlarmParams.beginTime" class="search-input time-input" />
                <span style="color: #00c6ff">至</span>
                <input type="datetime-local" v-model="searchAlarmParams.endTime" class="search-input time-input" />
                <button class="search-btn" @click="handleAlarmSearch">
                  搜索
                </button>
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
                    <span class="label">图片事件</span><img :src="item.imageData" alt="" width="100%" height="50%" />
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

          <div class="chain-msg-popup1" v-show="showChainMsgPopup1">
            <div class="popup-header">
              <h3 class="popup-title">报警信息</h3>
              <!-- <button class="popup-close" @click="closeChainMsgPopup">×</button> -->
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
          </div>
          <div class="cruise-tip" v-if="currentCruiseName">
            {{ currentCruise }}
          </div>
          <!-- <div class="dibubutton">
            
            <ul class="operate-list">
             
              <li class="sigemian">
                <p class="direction-btn" @click="changeDirection">
                  {{ currentDirection }}
                </p>
              </li>
              <li class="tingzhi" @click="tingzhi">
                <p>停止</p>
              </li>
            
              <li class="fanhui" @click="fanhui">
                <p>返回</p>
              </li>

            </ul>
          </div> -->
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
// 方向按钮容器样式
.direction-buttons-container {
  position: absolute;
  bottom: 2vw;
  right: 1.5vw;
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
  gap: 1vw;
}

.direction-button {
  position: relative;
  min-width: 2vw;
  height: 2vw;
  cursor: pointer;
  transition: all 0.3s ease;
  // background-image: url('../assets/img/西面.png');
  // background-size: 100% 100%; // 确保底图填满按钮
  // background-repeat: no-repeat; // 不重复平铺
  // background-position: center; // 居中显示
  
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
  
  .button-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    color: white;
    font-size: 0.8vw;
    font-weight: bold;
    text-shadow: 0 0.1vw 0.2vw rgba(0, 0, 0, 0.8);
    margin: 0;
    padding: 0;
  }
  
  &:hover {
    transform: scale(1.1);
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

// 右侧主按钮列表（3个主按钮）
.arenbiao__right-main-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0; // 主按钮之间无间距，保持原有样式

  // 主按钮样式（继承原有arenbiao__item样式，新增相对定位用于子按钮布局）
  .arenbiao__main-item {
    @extend .arenbiao__item;
    position: relative; // 子按钮绝对定位参考
    cursor: pointer;

    // 主按钮鼠标移入高亮（保留原有hover效果）
    &:hover {
      transform: scale(1.05);
    }
  }
}

.arenbiao__sub-list {
  list-style: none;
  margin: 0;
  padding: 0;
  // width: 10vw;
  display: flex;
  flex-direction: column;
  gap: 0; // 【极致紧凑】无间距
  position: absolute;
  top: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;

  // 子按钮样式
  .arenbiao__sub-item {
    @extend .arenbiao__item;
    // min-width: 5.8vw;
    height: 2vw;
    padding: 0;
    margin: 0;
    // line-height: 2.0vw;
    font-size: 0.7vw;
    margin-bottom: -1.5vw;
  }
}

// 隐藏原有右侧列表样式（不再使用）
.arenbiao__right-list {
  display: none;
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

// 底部ABC馆按钮容器样式
.abc-buttons-container {
  position: absolute;
  bottom: 2vw;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  display: flex;
  justify-content: center;
  gap: 2vw; // 按钮之间的间距
}

.abc-buttons-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 2vw;
}

.abc-button {
  @extend .arenbiao__item; // 继承原有按钮样式
  min-width: 5.8vw;
  height: 4.4vw;
  background-image: url("../assets/img/按钮new.png") !important;
  background-size: 100% 100% !important;
  background-repeat: no-repeat !important;
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
    background-image: url("../assets/img/btn-active.png") !important;
    // box-shadow: 0 0 15px rgba(0, 198, 255, 0.6);
    transform: scale(1.08);
  }
}

.button-text {
  margin-top: 0.5vw;
  padding: 0;
  text-align: center;
  color: white;
  font-size: 0.8vw;
}

.cruise-tip {
  position: absolute;
  top: 3vw;
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

// 按钮容器样式
.arenbiao {
  position: absolute;
  top: 2vw;
  left: -2.3vw;
  right: -1vw;
  z-index: 999999;
  display: flex;
  justify-content: space-between;
  padding: 0 2.3vw;
  box-sizing: border-box;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;

  &--show {
    opacity: 1;
    visibility: visible;
  }

  &__left-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0;

    .arenbiao__main-item {
      @extend .arenbiao__item;
      position: relative;
      cursor: pointer;

      &:hover {
        transform: scale(1.05);
      }
    }
  }

  &__right-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  &__right-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0;
  }

  &__item {
    min-width: 5.8vw;
    height: 4.4vw;
    // background-color: rgba(255, 255, 255, 0.9);
    background-image: url("../assets/img/按钮new.png") !important;
    background-size: 100% 100% !important;
    /* 强制拉伸填充，可能变形 */
    background-repeat: no-repeat !important;
    border-radius: 0.4vw;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    // box-shadow: 0 0.1vw 0.4vw rgba(0, 0, 0, 0.1);
    font-size: 0.8vw;

    &--active {
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: white;
      box-shadow: 0 0.2vw 0.8vw rgba(24, 144, 255, 0.4);
    }

    &:hover {
      transform: scale(1.05);
      // background-color: #e6f7ff;
    }
  }

  &__text {
    margin-top: 0.5vw;
    padding: 0;
    text-align: center;
    color: white;
  }
}

// 切换模型
.switchModel {
  position: absolute;
  bottom: 1%;
  right: 1%;
  width: 3vw;
  height: 3vw;
  background-color: #00edfa;
  z-index: 9;
  // background: url('/img/switch.png') no-repeat contain;
}

// .fenleis {
//   z-index: 999;
//   // margin-top: 0.5vw;
//   background-color: #0f100f;
//   padding: 0.3vw 1vw;
//   border-radius: 0.4vw;
//   // max-height: 20vw;
//   // border-color: #215c82;
//   border: 5px solid #215c82;
//   color: #fff;
//   box-shadow: 0 0.2vw 0.6vw rgba(0, 0, 0, 0.15);
// }
.fenleis {
  z-index: 999;
  position: absolute;
  top: 5.5vh;
  left: 7.3vw;
  background-color: #0f100f;
  padding: 0.3vw 1vw;
  border-radius: 0.4vw;
  border: 5px solid #215c82;
  color: #fff;
  // 修正字体大小单位（0.15rem 过小，改为vw适配）
  font-size: 0.8vw;
  box-shadow: 0 0.2vw 0.6vw rgba(0, 0, 0, 0.15);
  // 防止文字溢出
  min-width: 5vw;

  ul {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      list-style: none;
      // 修正行高单位，适配整体风格
      line-height: 1.8vw;
      // 增加内边距提升点击区域
      padding: 0.2vw 0.5vw;
      border-radius: 0.2vw;
      cursor: pointer;
      // 基础文字颜色
      color: #ffffff;
      // 过渡动画，让颜色变化更平滑
      transition: all 0.2s ease;

      // 鼠标移入时文字变红
      &:hover {
        color: #00edfa; // 醒目红色
        // 可选：增加背景高亮，提升视觉反馈
        background-color: rgba(255, 51, 51, 0.1);
      }

      // 可选：选中态样式（如果需要）
      &.active {
        color: #ff3333;
        background-color: rgba(255, 51, 51, 0.2);
        border-left: 0.2vw solid #ff3333;
      }
    }
  }
}

// 自定义列表样式
.arenbiao1 {
  z-index: 999;
  margin-top: 0.5vw;
  margin-right: 12vw;
  background-color: #0f100f;
  padding: 0.3vw 1vw;
  border-radius: 0.4vw;
  border: 5px solid #215c82;
  overflow-y: auto;
  min-width: 10vw;
  color: #fff;
  box-shadow: 0 0.2vw 0.6vw rgba(0, 0, 0, 0.15);

  &::-webkit-scrollbar {
    width: 0.3vw;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 0.15vw;
  }

  &::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 0.15vw;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #999;
  }
}

// 自定义选项根列表
.custom-options {
  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  // 二级选项列表
  &__children {
    margin: 0.2vw 0 0.2vw 1.5vw;
    padding: 0;
    list-style: none;
  }

  // 二级选项项（点击触发）
  &__item {
    display: flex;
    align-items: center;
    margin: 0.4vw 0;
    padding: 0.3vw 0.6vw;
    font-size: 0.7vw;
    border-radius: 0.3vw;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(24, 144, 255, 0.2);
      color: #00c6ff;
      transform: translateX(0.2vw);
    }
  }

  // 移除所有复选框相关样式
}

// 一级分类标题样式
.custom-category__item {
  margin: 0.5vw 0;
}

.custom-category__title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4vw 0.8vw;
  background: rgba(24, 144, 255, 0.1);
  border-radius: 0.3vw;
  cursor: pointer;
  font-size: 0.8vw;
  font-weight: 600;
  color: #00c6ff;
  border: 1px solid #215c82;
  transition: all 0.2s ease;

  &:not(.disabled):hover {
    background: rgba(24, 144, 255, 0.2);
    color: #1890ff;
  }
}

.category-arrow {
  font-size: 0.6vw;
  transition: transform 0.2s ease;
  // 新增：展开时箭头旋转
  transform: rotate(0deg);

  // 父元素展开时，箭头旋转90度
  .custom-category__title[aria-expanded="true"] & {
    transform: rotate(90deg);
  }
}

// 优化分类标题的可访问性（可选）
.custom-category__title {

  // 新增 aria 属性，配合样式和可访问性
  &[aria-expanded="true"] {
    background: rgba(24, 144, 255, 0.3);
  }
}

// 移除飞行控制面板相关样式

// 联动视频样式
.liandongshipin {
  background-image: url("../assets/img/border_1.png");
  background-size: 100% 100%;
  height: 47vh;
  width: 30vw;
  background-repeat: no-repeat;
  z-index: 9999;
  position: absolute;
  right: 2vw;
  top: 15vh;
  // display: none;

  &:not([style*="display: none"]) {
    display: block;
  }

  .video-ref {
    height: 90%;
    width: 99%;
    margin-top: 10%;
    margin-left: 0.5%;
    z-index: 99;

    .video-plugin {
      width: 100%;
      height: 100%;
      padding-top: 1.5vw;
    }

    .fangxiang {
      position: absolute;
      top: 0;
      right: 0;

      .close-button {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0.25vw;

        .closesss {
          width: 1vw;
          height: 1vw;
        }
      }
    }
  }
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
  position: absolute;
  right: 9vw;
  top: 12vh;
  background-image: url("../assets/img/border_1.png");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border-radius: 0.4vw;
  overflow: hidden;
  box-shadow: 0 0.2vw 1vw rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;

  .name-display {
    position: absolute;
    top: 0.6vw;
    left: 50%;
    transform: translate(-50%);
    z-index: 100;
    color: #fff;
    font-size: clamp(0.7vw, 1.2vw, 0.8vw);
    font-weight: bold;
    padding: 0.25vw 0.6vw;
    border-radius: 0.75vw;
    text-shadow: 0.05vw 0.05vw 0.1vw rgba(0, 0, 0, 0.8);
    max-width: 10vw;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__close {
    position: absolute;
    top: 0.5vw;
    right: 0.75vw;
    z-index: 100;
    width: 2vw;
    height: 2vw;
    // border: 0.1vw solid #ddd;
    // border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    // transition: all 0.2s ease;
    // background: transparent;
    background: transparent;
    border: none;
    padding: 0;

    .close-icon-image {
      width: 1vw;
      height: 1vw;
      // object-fit: contain;
      // filter: brightness(0.3);
    }
  }

  .player-container {
    padding-top: 3vw;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;

    .player-item {
      width: 98%;
      height: 96%;

      .player-box {
        width: 100%;
        height: 100%;
        background-color: #000;
      }
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

// 新增：链消息弹窗样式（暗黑风格，不影响原有样式）
.chain-msg-popup1 {
  position: fixed;
  top: 7vw;
  right: 1.5vw;
  width: 22vw;
  max-height: 78vh;
  background: rgba(0, 15, 30, 0.98);
  border: 1px solid #00c6ff;
  border-radius: 8px;
  z-index: 99999;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(0, 40, 60, 0.8);
    border-bottom: 1px solid #00c6ff;

    .popup-title {
      color: #00c6ff;
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .popup-close {
      background: transparent;
      border: none;
      color: #ffffff;
      font-size: 20px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.2s;

      &:hover {
        color: #ff4d4f;
        transform: scale(1.1);
      }
    }
  }

  .popup-body {
    padding: 16px;
    overflow-y: auto;
    max-height: calc(75vh - 50px);

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
      background: rgba(0, 25, 45, 0.7);
      border-radius: 6px;
      border-left: 3px solid #00c6ff;

      .msg-content {
        color: #ffffff;
        font-size: 0.15rem;

        // font-size: clamp(16px, 4vw, 25px);
        line-height: 1.6;
        margin-bottom: 10px;

        .label {
          color: #00c6ff;
          font-weight: 600;
          margin-right: 4px;
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
            color: #000000;
          }

          &.reject {
            background: #ff4d4f;
            color: #ffffff;
          }
        }
      }
    }
  }
}

.chain-msg-popup {
  position: fixed;
  top: 7vw;
  left: 1.5vw;
  width: 22vw;
  max-height: 78vh;
  background: rgba(0, 15, 30, 0.98);
  border: 1px solid #00c6ff;
  border-radius: 8px;
  z-index: 99999;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(0, 40, 60, 0.8);
    border-bottom: 1px solid #00c6ff;

    .popup-title {
      color: #00c6ff;
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .popup-close {
      background: transparent;
      border: none;
      color: #ffffff;
      font-size: 20px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.2s;

      &:hover {
        color: #ff4d4f;
        transform: scale(1.1);
      }
    }
  }

  // 搜索栏（固定在 header 下方，不滚动）
  .popup-search-bar {
    padding: 8px 10px;
    background: rgba(0, 30, 55, 0.9);
    border-bottom: 1px solid #00c6ff;
    flex-shrink: 0; // 防止被压缩

    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .search-input {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid #00c6ff;
        border-radius: 4px;
        background: rgba(0, 15, 30, 0.8);
        color: #fff;
        font-size: 12px;

        &.time-input {
          flex: none;
          width: 130px;
        }

        &.name-input {
          width: 50px;
        }
      }

      .search-btn {
        padding: 4px 12px;
        background: #00c6ff;
        border: none;
        border-radius: 4px;
        color: #000;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;

        &:hover {
          transform: scale(1.05);
        }
      }
    }
  }

  .popup-body {
    padding: 16px;
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
      background: rgba(0, 25, 45, 0.7);
      border-radius: 6px;
      border-left: 3px solid #00c6ff;

      .msg-content {
        color: #ffffff;
        font-size: 0.15rem;

        // font-size: clamp(16px, 4vw, 25px);
        line-height: 1.6;
        margin-bottom: 10px;

        .label {
          color: #00c6ff;
          font-weight: 600;
          margin-right: 4px;
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
            color: #000000;
          }

          &.reject {
            background: #ff4d4f;
            color: #ffffff;
          }
        }
      }
    }
  }
}

/* 外层容器：清除默认样式，适配按钮布局（可选，根据页面调整） */
.dibubutton {
  width: fit-content;

  position: absolute;
  bottom: 0.5vw;
  right: 1vw;
  z-index: 99;
}

/* 操作列表：清除ul默认样式，弹性布局让两个li横向排列（核心布局） */
.operate-list {
  list-style: none;
  /* 清除li默认圆点 */
  margin: 0;
  padding: 0;
  display: flex;

  /* 横向排列两个按钮li */
  gap: 10px;
  /* 两个按钮之间的间距，可自定义 */
  align-items: center;
  /* 垂直居中对齐 */
}

/* 所有li通用样式：背景图核心属性+左下角定位+宽高基础设置 */
.operate-list li {
  /* 背景图核心：强制填充+不重复，保留!important覆盖其他样式 */
  background-image: url("../assets/img/按钮new.png") !important;
  background-size: 100% 100% !important;
  /* 强制拉伸填充容器，无视图片比例 */
  background-repeat: no-repeat !important;
  background-position: left bottom !important;
  /* 关键：背景图固定在左下角 */
  /* 基础布局：按需设置宽高（适配你的按钮图片尺寸），行内块/块级 */
  display: inline-block;
  padding: 40px 50px 25px 50px;
  /* 示例高度，根据实际图片调整 */
  position: relative;
  /* 文字颜色，按需调整 */
  font-size: 0.25rem;
  color: #fff;
  /* 用于子元素（按钮/文字）居中定位，可选 */
  cursor: pointer;
  /* 鼠标悬浮手型，提升交互 */
}

/* 可选：鼠标悬浮轻微效果，提升交互 */
.operate-list li:hover {
  opacity: 0.9;
  transform: scale(1.02);
  transition: all 0.2s ease;
}

// 响应式调整
@media screen and (max-width: 768px) {
  .arenbiao {
    padding: 0 20px !important;

    &__item {
      min-width: 80px !important;
      height: 40px !important;
      font-size: 14px !important;
    }
  }

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

  .arenbiao {
    position: absolute;
    margin-top: -5vh;
    left: 7vw;
    right: 7vw;
    padding: 0 2vw;

    &__item {
      min-width: 4vw;
      height: 1.3vw;
      font-size: 0.5vw;
      border-radius: 0.5vw;
    }

    &__left-list,
    &__right-list {
      gap: 3vw;
    }
  }

  .arenbiao1 {
    max-height: 13vw;
    min-width: 6vw;
    padding: 0.2vw 1vw;
    font-size: 5rem;
    overflow: hidden;
  }

  .custom-options {
    &__item {
      font-size: 0.4vw;
    }

    &__checkbox {
      width: 0.6vw;
      height: 0.6vw;
    }

    &__confirm {
      position: relative;
      top: -23vh;
      width: 100%;
      padding: 0.2vw 0;
      font-size: 0.4vw;
    }
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

  .liandongshipin {
    height: 47vh;
    width: 30vw;
    right: 2vw;
    top: 15vh;
  }

  // 新增：链消息弹窗样式（暗黑风格，不影响原有样式）
  .chain-msg-popup {
    position: fixed;
    top: 7vw;
    left: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .chain-msg-popup1 {
    position: fixed;
    top: 7vw;
    right: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }
}

// 超高清大屏适配
@media screen and (min-width: 3840px) and (height: 1080px) {

  html,
  body {
    font-size: clamp(20px, 1vw, 30px);
  }

  

  .arenbiao {
    &__item {
      min-width: 4vw;
      height: 3vw;
      margin-top: -5%;
      // background-color: rgba(255, 255, 255, 0.9);
      background-image: url("../assets/img/按钮new.png") !important;
      background-size: 100% 100% !important;
      /* 强制拉伸填充，可能变形 */
      background-repeat: no-repeat !important;
      border-radius: 0.4vw;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      // box-shadow: 0 0.1vw 0.4vw rgba(0, 0, 0, 0.1);
      font-size: 0.5vw;

      &--active {
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: white;
        box-shadow: 0 0.2vw 0.8vw rgba(24, 144, 255, 0.4);
      }

      &:hover {
        transform: scale(1.05);
        // background-color: #e6f7ff;
      }
    }
  }

  .arenbiao__sub-item {
    // min-width: 5.8vw;
    margin-top: 5px !important;
    // margin-bottom: 0.01rem !important;
  }

  .video-container {
    width: 30vw !important;
    height: 60vh !important;
    z-index: 999999;
    position: absolute;
    right: 9vw;
    top: 14vh;
    background-image: url("../assets/img/border_1.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border-radius: 0.4vw;
    overflow: hidden;
    box-shadow: 0 0.2vw 1vw rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;

    .player-container {
      padding-top: 1.4vw;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;

      .player-item {
        width: 95%;
        height: 90%;

        .player-box {
          width: 100%;
          height: 100%;
          background-color: #000;
        }
      }
    }
  }
}

// 横屏超高清大屏额外适配
@media screen and (width: 3170px) and (height: 1622.5px) {

  // 新增：链消息弹窗样式（暗黑风格，不影响原有样式）
  .chain-msg-popup {
    position: fixed;
    top: 7vw;
    left: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .chain-msg-popup1 {
    position: fixed;
    top: 7vw;
    right: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }
}

@media screen and (width: 3128px) and (height: 1760px) {
  .arenbiao {
    position: absolute;
    top: 2vw;
    left: -2.3vw;
    right: -1vw;
    z-index: 999999;
    display: flex;
    justify-content: space-between;
    padding: 0 2.3vw;
    box-sizing: border-box;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;

    &--show {
      opacity: 1;
      visibility: visible;
    }

    &__left-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__right-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    &__right-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__item {
      min-width: 6.3vw;
      height: 4.8vw;
      margin-top: -5%;
      // background-color: rgba(255, 255, 255, 0.9);
      background-image: url("../assets/img/按钮new.png") !important;
      background-size: 100% 100% !important;
      /* 强制拉伸填充，可能变形 */
      background-repeat: no-repeat !important;
      border-radius: 0.4vw;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      // box-shadow: 0 0.1vw 0.4vw rgba(0, 0, 0, 0.1);
      font-size: 0.9vw;

      &--active {
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: white;
        box-shadow: 0 0.2vw 0.8vw rgba(24, 144, 255, 0.4);
      }

      &:hover {
        transform: scale(1.05);
        // background-color: #e6f7ff;
      }
    }

    &__text {
      margin-top: 0.5vw;
      padding: 0;
      text-align: center;
      color: white;
    }
  }

  // 新增：链消息弹窗样式（暗黑风格，不影响原有样式）
  .chain-msg-popup {
    position: fixed;
    top: 7vw;
    left: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.5rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
            font-size: 0.27rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .chain-msg-popup1 {
    position: fixed;
    top: 7vw;
    right: 1.5vw;
    width: 22vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.5rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.25rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
            font-size: 0.27rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }
}

// 横屏超高清大屏额外适配
@media screen and (width: 11520px) and (height: 2160px) {

  // 按钮容器样式
  .arenbiao {
    position: absolute;
    top: 0.2vw;
    left: -2vw;
    right: -1vw;
    margin-top: -2%;
    z-index: 999999;
    display: flex;
    justify-content: space-between;
    padding: 0 2.3vw;
    box-sizing: border-box;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;

    &--show {
      opacity: 1;
      visibility: visible;
    }

    &__left-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__right-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    &__right-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__item {
      min-width: 5.8vw;
      height: 2.4vw;
      padding-bottom: 0.15vw;
      // background-color: rgba(255, 255, 255, 0.9);
      background-image: url("../assets/img/按钮new.png") !important;
      background-size: 100% 100% !important;
      /* 强制拉伸填充，可能变形 */
      background-repeat: no-repeat !important;
      border-radius: 0.4vw;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      // box-shadow: 0 0.1vw 0.4vw rgba(0, 0, 0, 0.1);
      font-size: 0.6vw;

      &--active {
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: white;
        box-shadow: 0 0.2vw 0.8vw rgba(24, 144, 255, 0.4);
      }

      &:hover {
        transform: scale(1.05);
        // background-color: #e6f7ff;
      }
    }

    &__text {
      margin-top: 0.5vw;
      padding: 0;
      text-align: center;
      color: white;
    }
  }

  .arenbiao1 {
    z-index: 999;
    margin-top: 0.5vw;
    background-color: #0f100f;
    padding: 0.3vw 1vw;
    border-radius: 0.4vw;
    width: 10vw;
    // height: 30vh;
    border: 5px solid #215c82;
    overflow-y: auto;
    min-width: 4vw;
    color: #fff;
    box-shadow: 0 0.2vw 0.6vw rgba(0, 0, 0, 0.15);

    &::-webkit-scrollbar {
      width: 0.3vw;
    }

    &::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 0.15vw;
    }

    &::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 0.15vw;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: #999;
    }
  }

  // 自定义选项根列表
  .custom-options {
    &__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // 二级选项列表
    &__children {
      margin: 0.2vw 0 0.2vw 1.5vw;
      padding: 0;

      list-style: none;
    }

    // 二级选项项（点击触发）
    &__item {
      display: flex;
      align-items: center;
      margin: 0.4vw 0;
      padding: 0.3vw 0.6vw;
      font-size: 0.5vw;
      border-radius: 0.3vw;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(24, 144, 255, 0.2);
        color: #00c6ff;
        transform: translateX(0.2vw);
      }
    }

    // 移除所有复选框相关样式
  }

  // 一级分类标题样式
  .custom-category__item {
    margin: 0.3vw 0;
  }

  .custom-category__title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2vw 0.8vw;
    background: rgba(24, 144, 255, 0.1);
    border-radius: 0.3vw;
    cursor: pointer;
    font-size: 0.6vw;
    font-weight: 600;
    color: #00c6ff;
    border: 1px solid #215c82;
    transition: all 0.2s ease;

    // 禁用状态样式（灰显 + 禁止点击）
    &.disabled {
      background: rgba(100, 100, 100, 0.1);
      color: #666;
      border-color: #444;
      cursor: not-allowed;

      &:hover {
        background: rgba(100, 100, 100, 0.1);
      }
    }

    &:not(.disabled):hover {
      background: rgba(24, 144, 255, 0.2);
      color: #1890ff;
    }
  }

  .category-arrow {
    font-size: 0.6vw;
    transition: transform 0.2s ease;
    // 新增：展开时箭头旋转
    transform: rotate(0deg);

    // 父元素展开时，箭头旋转90度
    .custom-category__title[aria-expanded="true"] & {
      transform: rotate(90deg);
    }
  }

  // 优化分类标题的可访问性（可选）
  .cust om-category__title {

    // 新增 aria 属性，配合样式和可访问性
    &[aria-expanded="true"] {
      background: rgba(24, 144, 255, 0.3);
    }
  }

  .chain-msg-popup {
    position: fixed;
    top: 3vw;
    left: 1.7vw;
    width: 21.3vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.6rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.5rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
            font-size: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .chain-msg-popup1 {
    position: fixed;
    top: 3vw;
    right: 1.7vw;
    width: 21.3vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.6rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.5rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
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
            font-size: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .liandongshipin {
    height: 60vh;
    width: 20vw;
    top: 19vh;
    right: 1.5vw;
  }

  // .video-container {
  //   top: 40vh;
  //   right: 15vw;
  // }

  .arenbiao {
    top: 2vw;
    padding: 0 1.8vw;
  }

  // 视频弹窗样式
  .video-container {
    width: 20vw;
    height: 53vh;
    z-index: 9999;
    position: absolute;
    right: 7.7vw;
    top: 30vh;
    background-image: url("../assets/img/border_1.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border-radius: 0.4vw;
    overflow: hidden;
    box-shadow: 0 0.2vw 1vw rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;

    .name-display {
      position: absolute;
      top: 0.6vw;
      left: 50%;
      transform: translate(-50%);
      z-index: 100;
      // color: #fff;
      font-size: clamp(0.7vw, 1.2vw, 0.8vw);
      font-weight: bold;
      padding: 0.25vw 0.6vw;
      border-radius: 0.75vw;
      text-shadow: 0.05vw 0.05vw 0.1vw rgba(0, 0, 0, 0.8);
      max-width: 10vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__close {
      position: absolute;
      top: -0.3vw;
      right: 0.5vw;
      z-index: 100;
      width: 2vw;
      height: 2vw;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: transparent;
      border: none;

      .close-icon-image {
        width: 1vw;
        height: 1vw;
        // object-fit: contain;
        // filter: brightness(0.3);
      }
    }

    .player-container {
      padding-top: 1.4vw;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;

      .player-item {
        width: 95%;
        height: 90%;

        .player-box {
          width: 100%;
          height: 100%;
          background-color: #000;
        }
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
}

// 横屏超高清大屏额外适配
@media screen and (width: 5760px) and (height: 1080px) {

 .direction-button {
    min-width: 1vw;
    height: 1vw;
 }

  // 按钮容器样式
  .arenbiao {
    position: absolute;
    top: 0.2vw;
    left: -2vw;
    right: -1vw;
    margin-top: -2%;
    z-index: 999999;
    display: flex;
    justify-content: space-between;
    padding: 0 2.3vw;
    box-sizing: border-box;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;

    &--show {
      opacity: 1;
      visibility: visible;
    }

    &__left-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__right-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    &__right-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0;
    }

    &__item {
      min-width: 5.8vw;
      height: 2.4vw;
      padding-bottom: 0.15vw;
      // background-color: rgba(255, 255, 255, 0.9);
      background-image: url("../assets/img/按钮new.png") !important;
      background-size: 100% 100% !important;
      /* 强制拉伸填充，可能变形 */
      background-repeat: no-repeat !important;
      border-radius: 0.4vw;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      // box-shadow: 0 0.1vw 0.4vw rgba(0, 0, 0, 0.1);
      font-size: 0.6vw;

      &--active {
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: white;
        box-shadow: 0 0.2vw 0.8vw rgba(24, 144, 255, 0.4);
      }

      &:hover {
        transform: scale(1.05);
        // background-color: #e6f7ff;
      }
    }

    &__text {
      margin-top: 0.5vw;
      padding: 0;
      text-align: center;
      color: white;
    }
  }

  // 右侧主按钮列表（3个主按钮）
  .arenbiao__right-main-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0; // 主按钮之间无间距，保持原有样式

    // 主按钮样式（继承原有arenbiao__item样式，新增相对定位用于子按钮布局）
    .arenbiao__main-item {
      @extend .arenbiao__item;
      position: relative; // 子按钮绝对定位参考
      cursor: pointer;

      // 主按钮鼠标移入高亮（保留原有hover效果）
      &:hover {
        transform: scale(1.05);
      }
    }
  }

  .arenbiao__sub-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0; // 【极致紧凑】无间距
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;

    // 子按钮样式
    .arenbiao__sub-item {
      @extend .arenbiao__item;
      // min-width: 5.8vw;
      // height: 2.0vw;
      padding: 0;
      margin: 0;
      // line-height: 2.0vw;
      font-size: 0.7vw;
      margin-bottom: -0.7vw;
    }
  }

  .arenbiao1 {
    position: fixed;
    right: 1.3vw;
    top: 2.5vw;
    z-index: 999;
    margin-top: 0.5vw;
    background-color: #0f100f;
    padding: 0.3vw 1vw;
    border-radius: 0.4vw;
    width: 10vw;
    // height: 30vh;
    border: 5px solid #215c82;
    overflow-y: auto;
    min-width: 4vw;
    color: #fff;
    box-shadow: 0 0.2vw 0.6vw rgba(0, 0, 0, 0.15);

    &::-webkit-scrollbar {
      width: 0.3vw;
    }

    &::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 0.15vw;
    }

    &::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 0.15vw;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: #999;
    }
  }

  // 自定义选项根列表
  .custom-options {
    &__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // 二级选项列表
    &__children {
      margin: 0.2vw 0 0.2vw 1.5vw;
      padding: 0;

      list-style: none;
    }

    // 二级选项项（点击触发）
    &__item {
      display: flex;
      align-items: center;
      margin: 0.4vw 0;
      padding: 0.3vw 0.6vw;
      font-size: 0.5vw;
      border-radius: 0.3vw;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(24, 144, 255, 0.2);
        color: #00c6ff;
        transform: translateX(0.2vw);
      }
    }

    // 移除所有复选框相关样式
  }

  // 一级分类标题样式
  .custom-category__item {
    margin: 0.3vw 0;
  }

  .custom-category__title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2vw 0.8vw;
    background: rgba(24, 144, 255, 0.1);
    border-radius: 0.3vw;
    cursor: pointer;
    font-size: 0.6vw;
    font-weight: 600;
    color: #00c6ff;
    border: 1px solid #215c82;
    transition: all 0.2s ease;

    // 禁用状态样式（灰显 + 禁止点击）
    &.disabled {
      background: rgba(100, 100, 100, 0.1);
      color: #666;
      border-color: #444;
      cursor: not-allowed;

      &:hover {
        background: rgba(100, 100, 100, 0.1);
      }
    }

    &:not(.disabled):hover {
      background: rgba(24, 144, 255, 0.2);
      color: #1890ff;
    }
  }

  .category-arrow {
    font-size: 0.6vw;
    transition: transform 0.2s ease;
    // 新增：展开时箭头旋转
    transform: rotate(0deg);

    // 父元素展开时，箭头旋转90度
    .custom-category__title[aria-expanded="true"] & {
      transform: rotate(90deg);
    }
  }

  // 优化分类标题的可访问性（可选）
  .cust om-category__title {

    // 新增 aria 属性，配合样式和可访问性
    &[aria-expanded="true"] {
      background: rgba(24, 144, 255, 0.3);
    }
  }

  .chain-msg-popup {
    position: fixed;
    top: 2vw;
    left: 1.7vw;
    width: 21.3vw;
    max-height: 90vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.46rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-search-bar {
      padding: 8px 10px;
      background: rgba(0, 30, 55, 0.9);
      border-bottom: 1px solid #00c6ff;
      flex-shrink: 0; // 防止被压缩

      .search-row {
        display: flex;
        align-items: center;
        gap: 8px;

        .search-input {
          flex: 1;
          padding: 13px 30px;
          border: 1px solid #00c6ff;
          border-radius: 4px;
          background: rgba(0, 15, 30, 0.8);
          color: #fff;
          font-size: 0.25rem;

          &.time-input {
            flex: none;
            width: 200px;
          }

          &.name-input {
            width: 50px;
          }
        }

        .search-btn {
          padding: 13px 30px;
          background: #00c6ff;
          border: none;
          border-radius: 4px;
          color: #000;
          cursor: pointer;
          font-size: 0.25rem;
          transition: all 0.2s;

          &:hover {
            transform: scale(1.05);
          }
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.3rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
          }
        }

        .msg-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;

          .action-btn {
            padding: 2px 30px;
            border: none;
            border-radius: 4px;
            font-size: 0.3rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .chain-msg-popup1 {
    position: fixed;
    top: 2.5vw;
    right: 1.7vw;
    width: 14vw;
    max-height: 78vh;
    background: rgba(0, 15, 30, 0.98);
    border: 1px solid #00c6ff;
    border-radius: 8px;
    z-index: 99999;
    overflow: hidden;
    box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 40, 60, 0.8);
      border-bottom: 1px solid #00c6ff;

      .popup-title {
        color: #00c6ff;
        font-size: 0.4rem;
        font-weight: 600;
        margin: 0;
      }

      .popup-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s;

        &:hover {
          color: #ff4d4f;
          transform: scale(1.1);
        }
      }
    }

    .popup-body {
      padding: 16px;
      overflow-y: auto;
      max-height: calc(75vh - 50px);

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
        background: rgba(0, 25, 45, 0.7);
        border-radius: 6px;
        border-left: 3px solid #00c6ff;

        .msg-content {
          color: #ffffff;
          font-size: 0.3rem;
          line-height: 1.6;
          margin-bottom: 10px;

          .label {
            color: #00c6ff;
            font-weight: 600;
            margin-right: 4px;
          }
        }

        .msg-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;

          .action-btn {
            padding: 2px 25px;
            border: none;
            border-radius: 4px;
            font-size: 0.3rem;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              transform: scale(1.05);
            }

            &.confirm {
              background: #00c6ff;
              color: #000000;
            }

            &.reject {
              background: #ff4d4f;
              color: #ffffff;
            }
          }
        }
      }
    }
  }

  .liandongshipin {
    height: 60vh;
    width: 20vw;
    top: 19vh;
    right: 1.5vw;
    // display: block;

    // .video-plugin {
    //   width: 100%;
    //   height: 100%;
    //   padding-top: 1.5vw;
    //   display: none;
    // }
  }

  // .video-container {
  //   top: 40vh;
  //   right: 15vw;
  // }

  .arenbiao {
    top: 2vw;
    padding: 0 1.8vw;
  }

  // 视频弹窗样式
  .video-container {
    width: 20vw;
    height: 70vh;
    z-index: 9999;
    position: absolute;
    right: 1.7vw;
    top: 15vh;
    background-image: url("../assets/img/border_1.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border-radius: 0.4vw;
    overflow: hidden;
    box-shadow: 0 0.2vw 1vw rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;

    .name-display {
      position: absolute;
      top: 0vw;
      left: 50%;
      transform: translate(-50%);
      z-index: 100;
      // color: #fff;
      font-size: clamp(0.7vw, 1.2vw, 0.8vw);
      font-weight: bold;
      padding: 0.25vw 0.6vw;
      border-radius: 0.75vw;
      text-shadow: 0.05vw 0.05vw 0.1vw rgba(0, 0, 0, 0.8);
      max-width: 10vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__close {
      position: absolute;
      top: -0.1vw;
      right: 0.5vw;
      z-index: 100;
      width: 2vw;
      height: 2vw;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: transparent;
      border: none;

      .close-icon-image {
        width: 1vw;
        height: 1vw;
        // object-fit: contain;
        // filter: brightness(0.3);
      }
    }

    .player-container {
      padding-top: 1.4vw;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;

      .player-item {
        width: 98%;
        height: 96%;

        .player-box {
          width: 100%;
          height: 100%;
          background-color: #000;
        }
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

  .cruise-tip {
    position: absolute;
    top: 0.7vw;
    right: 33vw;
    font-size: 0.3rem;
    padding: 2px 10px;
    z-index: 9;
    color: #fff;
    background-color: #000;
  }
}
</style>
