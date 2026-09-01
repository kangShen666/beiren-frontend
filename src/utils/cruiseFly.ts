/**
 * cruiseFly.ts —— 三维场景巡航控制器（重构版）
 *
 * 设计要点：
 * 1. 不再使用 camera.flyTo 做巡航，改为 scene.preRender 驱动的时间轴 +
 *    手动线性插值 + camera.setView，从根本上保证匀速，暂停/继续零误差。
 * 2. 各分辨率视口（big/small/san/middle/center）各自维护视角表，
 *    巡航路线只引用「区域 key」，运行时自动过滤当前视口不存在的区域。
 * 3. 单例式 class 封装，事件回调上抛（onRegionChange/onFinish），
 *    由组件层负责 UI 高亮联动。
 * 
 *  *
 * v2 变更：
 * 1. 每个区域进入前插入一段 "transition" 飞行动画：
 *    位置沿 lerp 路径 + 正弦抬升弧线（先拉高/拉远再压低逼近 → 视觉上的
 *    "先缩小视角再放大"），姿态用 smoothstep 缓动，观感更像无人机进场。
 * 2. 区域高亮上报改在 transition 段开始时触发 → 高亮与飞行动画同步。
 * 3. 首段起点不再是"瞬移"，而是从相机当前姿态起飞。
 */
import * as Cesium from "cesium";

/* ============================ 类型 ============================ */

/** 区域唯一 key（与各视口视角表的 key 对应） */
export type CruiseRegionKey =
  | "xuting1" | "xuting2"
  | "An" | "Ab" | "ABLL"
  | "Bdn" | "Bdz" | "Bdb"
  | "STLL"
  | "Cn" | "Cz" | "Cb";

/** 单个固定视角 */
export interface CruiseViewpoint {
  x: number; y: number; z: number;
  pitch: number; heading: number;
}

/** 当前视口下可用的区域视角表 */
type RegionViews = Partial<Record<CruiseRegionKey, CruiseViewpoint[]>>;

export type CruiseViewportKind = "big" | "small" | "san" | "middle" | "center";

export interface CruiseOptions {
  /** 换场飞行动画时长（秒），默认 4 */
  enterDuration?: number;
  /** 区域内驻留巡航时长（秒），默认 24 */
  stayDuration?: number;
  /** 飞行动画最大抬升高度（米），默认 600 */
  maxBumpHeight?: number;
}

/* ====================== 区域元信息 ====================== */

/** 名称 + 对应智能展示面板的 value 数组拼串（用于跨层高亮联动） */
export const REGION_META: Record<CruiseRegionKey, { name: string; uiValue: string }> = {
  Ab: { name: "A馆北侧", uiValue: "q2" },
  An: { name: "A馆南侧", uiValue: "q1" },
  xuting1: { name: "A馆序厅一楼", uiValue: "q30" },
  xuting2: { name: "A馆序厅二楼", uiValue: "q31" },
  Bdb: { name: "B馆北侧", uiValue: "q4,q6" },
  Bdz: { name: "B馆中间", uiValue: "q3,q9" },
  Bdn: { name: "B馆南侧", uiValue: "q7,q5" },
  STLL: { name: "生态连廊", uiValue: "q33" },
  ABLL: { name: "AB馆连廊", uiValue: "q32" },
  Cn: { name: "C馆南侧", uiValue: "q41" },
  Cz: { name: "C馆中间", uiValue: "q42" },
  Cb: { name: "C馆北侧", uiValue: "q43" },
};

/** 智能展示面板点击的 value 拼串 → 巡航ID（消灭页面里所有 if-else 分支） */
export const UI_VALUE_TO_CRUISE_ID: Record<string, string> = {
  "q1": "AguanSouth",
  "q2": "AguanNorth",
  "q7,q5": "BguanSouth",
  "q3,q9": "BguanMiddle",
  "q4,q6": "BguanNorth",
  "q30": "XutingFloor1",
  "q31": "XutingFloor2",
  "q33": "ShengtaiCorridor",
  "q32": "ABCorridor",
  "q41": "CguanSouth",
  "q42": "CguanMiddle",
  "q43": "CguanNorth",
};

/** 场景内可点击模型(r*) → 巡航ID */
export const SCENE_MODEL_TO_CRUISE_ID: Record<string, string> = {
  r1: "AguanSouth", r2: "AguanNorth",
  r3: "BguanSouth", r4: "BguanMiddle", r5: "BguanNorth",
  r7: "XutingFloor1", r8: "XutingFloor2",
  r11: "ShengtaiCorridor", r12: "ABCorridor",
  r14: "CguanSouth", r15: "CguanMiddle", r16: "CguanNorth",
};

/**
 * 场景内「只飞不巡航」模型(r*) 配置：
 * flyKey   —— flyToView 的视角 key（需在 constants/map 的 cameraMap 中登记）
 * wsChannel —— 点击后要打开/复用的 WebSocket 通道
 * uiValue  —— 上抛给父组件用于底部智能展示 item 高亮的 q 编码
 */
export const SCENE_FLY_ONLY_CONFIG: Record<
  string,
  { flyKey: string; wsChannel: string; uiValue?: string }
> = {
  r6: { flyKey: "waiwei", wsChannel: "radar" }, // 外围鹰眼
  r9: { flyKey: "dating", wsChannel: "qiao", uiValue: "q39" }, // 会客厅（登录厅）（与生态连廊同一动区）
  r10: { flyKey: "dengluting", wsChannel: "baogao", uiValue: "q38" }, // 报告厅
  r13: { flyKey: "xiguangchang", wsChannel: "qiao", uiValue: "q40" }, // 西广场（与生态连廊同一动区）
  r17: { flyKey: "beihui", wsChannel: "qiao", uiValue: "q44" },
};

/* ====================== 巡航路线 ====================== */

/** 巡航ID → 途经区域有序列表（缺失区域运行时自动跳过） */
const ROUTES: Record<string, CruiseRegionKey[]> = {
  AguanNorth: ["Ab", "Bdn", "Bdz", "Bdb", "Cn", "Cz", "Cb", "An"],
  AguanSouth: ["An", "Ab", "Bdn", "Bdz", "Bdb", "Cn", "Cz", "Cb"],
  BguanSouth: ["Bdn", "Bdz", "Bdb", "Cn", "Cz", "Cb", "An", "Ab"],
  BguanMiddle: ["Bdz", "Bdb", "Cn", "Cz", "Cb", "An", "Ab", "Bdn"],
  BguanNorth: ["Bdb", "Cn", "Cz", "Cb", "An", "Ab", "Bdn", "Bdz"],
  XutingFloor1: ["xuting1"],
  XutingFloor2: ["xuting2"],
  ShengtaiCorridor: ["STLL"],
  ABCorridor: ["ABLL"],
  CguanSouth: ["Cn", "Cz", "Cb", "An", "Ab", "Bdn", "Bdz", "Bdb"],
  CguanMiddle: ["Cz", "Cb", "An", "Ab", "Bdn", "Bdz", "Bdb", "Cn"],
  CguanNorth: ["Cb", "An", "Ab", "Bdn", "Bdz", "Bdb", "Cn", "Cz"],
};

/* ================== 各视口视角配置数据 ================== */

/* ---------- 小屏（1920x1080 等）---------- */
const VIEWS_SMALL: RegionViews = {
  xuting1: [
    { x: -2191865.560423731, y: 4391856.574464647, z: 4059180.894753303, pitch: -0.26680060602608213, heading: 4.163045401688904 },
    { x: -2191777.1389767127, y: 4391959.054677476, z: 4059117.508203577, pitch: -0.2647373452789705, heading: 4.163892389567881 },
  ],
  xuting2: [
    { x: -2191874.9881703043, y: 4391857.545383535, z: 4059191.676812438, pitch: -0.2736152758198662, heading: 4.174016118084943 },
    { x: -2191799.3919010996, y: 4391945.368071937, z: 4059137.4750487804, pitch: -0.273615268799384, heading: 4.174016114785783 },
  ],
  An: [
    { x: -2191857.762064247, y: 4391851.216336267, z: 4059207.8195358147, pitch: -0.273615278180126, heading: 4.133470091730841 },
    { x: -2191780.1963419374, y: 4391942.7189201, z: 4059150.706300502, pitch: -0.2736152705132333, heading: 4.174016115591178 },
  ],
  Ab: [
    { x: -2191837.840988996, y: 4391846.580846679, z: 4059218.7812181143, pitch: -0.27361528074335073, heading: 4.133470092831442 },
    { x: -2191752.151682671, y: 4391945.003318864, z: 4059158.5603542, pitch: -0.2736152724206695, heading: 4.133470089257832 },
  ],
  ABLL: [
    { x: -2191824.0634073704, y: 4391835.782166819, z: 4059237.6056591473, pitch: -0.2528161816516681, heading: 4.119397549186182 },
    { x: -2191734.4241563617, y: 4391939.564567391, z: 4059174.01694426, pitch: -0.27361527455690693, heading: 4.1334700901750905 },
  ],
  Bdn: [
    { x: -2191803.2847895636, y: 4391837.034217936, z: 4059245.2259718766, pitch: -0.27361528479024466, heading: 4.133470094569065 },
    { x: -2191713.3910603435, y: 4391940.32628511, z: 4059182.0063548964, pitch: -0.2736152760535817, heading: 4.133470090817698 },
  ],
  Bdz: [
    { x: -2191789.9405385195, y: 4391833.593338022, z: 4059256.154013882, pitch: -0.27361528630033405, heading: 4.133470095217476 },
    { x: -2191698.585661897, y: 4391939.170719848, z: 4059191.2506338484, pitch: -0.2736152773311682, heading: 4.133470091366267 },
  ],
  Bdb: [
    { x: -2191776.6745118657, y: 4391829.610455442, z: 4059267.6261500968, pitch: -0.27361528788557665, heading: 4.133470095898148 },
    { x: -2191687.1620376883, y: 4391931.945995739, z: 4059205.2366176825, pitch: -0.2736152790999231, heading: 4.14505473224456 },
  ],
  STLL: [
    { x: -2191626.3409828995, y: 4391958.258608755, z: 4059199.5447252337, pitch: -0.22259103150468995, heading: 2.621236359497433 },
    { x: -2191712.8853393546, y: 4391986.103812453, z: 4059122.845985915, pitch: -0.21783786361586177, heading: 2.6156527318724034 },
  ],
  Cn: [
    { x: -2191739.861679835, y: 4391821.475515011, z: 4059329.936194209, pitch: -1.0375815959304733, heading: 4.17402379001897 },
    { x: -2191632.5453954535, y: 4391936.863001866, z: 4059265.871851614, pitch: -0.9168399844851431, heading: 4.130144181455908 },
  ],
  Cz: [
    { x: -2191722.67124638, y: 4391824.376614587, z: 4059361.610021701, pitch: -1.1606125644047487, heading: 4.138551206120907 },
    { x: -2191621.5355790686, y: 4391926.642681557, z: 4059284.62573192, pitch: -0.8155953535208664, heading: 4.135267649382904 },
  ],
  Cb: [
    { x: -2191701.701896454, y: 4391818.946249625, z: 4059378.806771607, pitch: -1.160612566762115, heading: 4.138551214507572 },
    { x: -2191587.6847169246, y: 4391918.087213729, z: 4059293.2294566855, pitch: -0.7442036787208162, heading: 4.159179237519195 },
  ],
};

/* ---------- 大屏 暂时无用（11520x2160 ；无 xuting1/STLL/Cn/Cz/Cb）---------- */
const VIEWS_BIG: RegionViews = {
  xuting2: [
    { x: -2191850.204253986, y: 4391872.035095663, z: 4059186.062354467, pitch: -0.5234032474088863, heading: 3.684829486796761 },
    { x: -2191825.2306870394, y: 4391905.081299725, z: 4059163.7924988503, pitch: -0.5234032425931909, heading: 3.6848294851186463 },
    { x: -2191791.2813096796, y: 4391941.105503058, z: 4059143.1465672636, pitch: -0.523403238128465, heading: 3.6848294835628232 },
    { x: -2191768.859882694, y: 4391965.068316232, z: 4059129.325716969, pitch: -0.5234032351395559, heading: 3.6848294825212884 },
  ],
  An: [
    { x: -2191851.882654214, y: 4391848.089689518, z: 4059204.507587001, pitch: -0.33895532792516625, heading: 4.0391208389122 },
    { x: -2191802.9154021367, y: 4391905.4900134755, z: 4059169.650922555, pitch: -0.36469881006759275, heading: 4.057536330424101 },
    { x: -2191745.1294403886, y: 4391973.048898168, z: 4059128.229008788, pitch: -0.3827192307583829, heading: 4.0740048069818515 },
  ],
  Ab: [
    { x: -2191827.069284982, y: 4391848.906919208, z: 4059212.715590178, pitch: -0.20905793073725487, heading: 4.009119486301823 },
    { x: -2191780.1421791194, y: 4391903.78664923, z: 4059178.6768301204, pitch: -0.20905792517677257, heading: 4.009119484910489 },
    { x: -2191731.950528058, y: 4391959.911270552, z: 4059143.9723288515, pitch: -0.2090579195071478, heading: 4.009119483491845 },
  ],
  ABLL: [
    { x: -2191816.8659931775, y: 4391841.449599456, z: 4059229.854928923, pitch: -0.2075651054048262, heading: 4.211258837014219 },
    { x: -2191789.6032867865, y: 4391874.2444375735, z: 4059209.093356498, pitch: -0.20756510288550167, heading: 4.211258836045627 },
    { x: -2191742.8599016885, y: 4391927.742920239, z: 4059176.4490664513, pitch: -0.20756509892404607, heading: 4.211258834522595 },
  ],
  Bdn: [
    { x: -2191797.1577867344, y: 4391834.694502901, z: 4059240.812518247, pitch: -0.20861116735809548, heading: 3.990725170132234 },
    { x: -2191747.552430843, y: 4391893.4952881895, z: 4059203.9775297884, pitch: -0.20861116121164813, heading: 3.990725168653698 },
    { x: -2191698.305378552, y: 4391949.62678877, z: 4059169.8354079328, pitch: -0.20861115551415188, heading: 3.9907251672831348 },
  ],
  Bdz: [
    { x: -2191784.449081554, y: 4391829.797225024, z: 4059252.6374086295, pitch: -0.2655300429707199, heading: 3.9657583994748102 },
    { x: -2191726.815355025, y: 4391896.94646368, z: 4059211.104615742, pitch: -0.2655300358460968, heading: 3.9657583973808808 },
    { x: -2191678.5398774953, y: 4391953.098934156, z: 4059176.678950699, pitch: -0.2809761331767724, heading: 3.9918661498845696 },
  ],
  Bdb: [
    { x: -2191772.811265936, y: 4391825.302236272, z: 4059266.8517366457, pitch: -0.3526389963317018, heading: 3.8960179104074215 },
    { x: -2191713.0043777823, y: 4391894.759600914, z: 4059223.9950768477, pitch: -0.3526389884444101, heading: 3.8960179076791723 },
    { x: -2191664.8131625573, y: 4391951.045620354, z: 4059189.2113521285, pitch: -0.40412593364523586, heading: 3.9714818992729355 },
  ],
};

/* ---------- 5760x1080（驾驶舱；无 Cn/Cz/Cb）---------- */
const VIEWS_SAN: RegionViews = {
  xuting1: [
    { x: -2191865.7060670736, y: 4391857.067578937, z: 4059182.294626689, pitch: -0.10211924908560444, heading: 3.833160953474144 },
    { x: -2191790.643440148, y: 4391942.323462089, z: 4059128.0728420047, pitch: -0.10211923768185827, heading: 3.833160967689527 },
  ],
  xuting2: [
    { x: -2191871.9873331613, y: 4391858.154635156, z: 4059189.7051673406, pitch: -0.13210296444420178, heading: 3.978323984439869 },
    { x: -2191819.703921018, y: 4391917.999124635, z: 4059153.1870941054, pitch: -0.13210295826455787, heading: 3.9783239835297866 },
  ],
  An: [
    { x: -2191853.592393524, y: 4391849.726027105, z: 4059205.2531665387, pitch: -0.10983709195249025, heading: 4.038483152598138 },
    { x: -2191783.6262582447, y: 4391931.857270204, z: 4059154.1263022246, pitch: -0.10983708435878503, heading: 4.03848315267791 },
  ],
  Ab: [
    { x: -2191835.059618253, y: 4391844.498016035, z: 4059220.266051973, pitch: -0.11756014113769142, heading: 4.027884145446638 },
    { x: -2191769.430122003, y: 4391919.328671621, z: 4059174.7396824006, pitch: -0.11756013386650865, heading: 4.027884144394415 },
  ],
  ABLL: [
    { x: -2191822.7852451205, y: 4391833.902370928, z: 4059238.38876324, pitch: -0.11756014366878675, heading: 4.027884145604161 },
    { x: -2191762.786497357, y: 4391907.727129515, z: 4059190.879443536, pitch: -0.1175601364443215, heading: 4.027884144767448 },
  ],
  Bdn: [
    { x: -2191801.8546009064, y: 4391836.207263938, z: 4059245.3165048305, pitch: -0.11599974081254327, heading: 4.0382307749946404 },
    { x: -2191733.05855172, y: 4391916.425290628, z: 4059195.6708375798, pitch: -0.11599973298476929, heading: 4.038230773853133 },
  ],
  Bdz: [
    { x: -2191788.5398980123, y: 4391832.838743265, z: 4059256.1651669266, pitch: -0.11599974251074618, heading: 4.038230775242267 },
    { x: -2191719.7125953566, y: 4391914.521138286, z: 4059204.9519546623, pitch: -0.11599973443598266, heading: 4.038230774064747 },
  ],
  Bdb: [
    { x: -2191776.560364014, y: 4391828.52000048, z: 4059267.2769953376, pitch: -0.11599974973720695, heading: 4.012165263052713 },
    { x: -2191704.056783164, y: 4391911.488875828, z: 4059216.373048525, pitch: -0.11599974155446047, heading: 4.012165261921213 },
  ],
  STLL: [
    { x: -2191609.563920239, y: 4391954.019581999, z: 4059211.800107714, pitch: -0.05223811043976556, heading: 2.4547294631336065 },
    { x: -2191686.3019441254, y: 4391979.345829029, z: 4059148.890909552, pitch: -0.08570464818421941, heading: 2.4604329690089966 },
  ],
  Cn: [
    {
      "x": -2191755.9170534187,
      "y": 4391810.300735574,
      "z": 4059342.5940739796,
      "pitch": -0.4450076011393258,
      "heading": 4.065449346229582
    },
    {
      "x": -2191669.292338532,
      "y": 4391896.116535528,
      "z": 4059290.072700895,
      "pitch": -0.44500759391527156,
      "heading": 4.065449341669119
    }
  ],
  Cz: [
    {
      "x": -2191728.2196840136,
      "y": 4391803.336599261,
      "z": 4059365.083030247,
      "pitch": -0.44500760456216515,
      "heading": 4.0654493483910255
    },
    {
      "x": -2191649.815389858,
      "y": 4391890.9304684065,
      "z": 4059306.199502387,
      "pitch": -0.4450075963701643,
      "heading": 4.065449343219015
    }
  ],
  Cb: [
    {
      "x": -2191707.132931961,
      "y": 4391795.521287984,
      "z": 4059384.923396456,
      "pitch": -0.4450076075819003,
      "heading": 4.065449350297532
    },
    {
      "x": -2191622.1653215387,
      "y": 4391884.60769282,
      "z": 4059327.9686334566,
      "pitch": -0.4450075996838274,
      "heading": 4.065449345311098
    }
  ],
};

/* ---------- 5120x960 北人三联屏（无 ABLL/STLL）---------- */
const VIEWS_MIDDLE: RegionViews = {
  xuting1: VIEWS_SAN.xuting1,
  xuting2: VIEWS_SAN.xuting2,
  An: VIEWS_SAN.An,
  Ab: VIEWS_SAN.Ab,
  Bdn: VIEWS_SAN.Bdn,
  Bdz: VIEWS_SAN.Bdz,
  Bdb: VIEWS_SAN.Bdb,
  Cn: [
    { x: -2191793.383060866, y: 4391828.465112648, z: 4059416.7288915757, pitch: -0.8475892623713919, heading: 4.0825134840233375 },
    { x: -2191699.79119681, y: 4391882.821104431, z: 4059312.5300057824, pitch: -0.44113361371024107, heading: 4.135904291309523 },
  ],
  Cz: [
    { x: -2191753.0391099313, y: 4391888.164525584, z: 4059413.919575522, pitch: -1.4605107711473786, heading: 4.12651665030858 },
    { x: -2191695.5054864376, y: 4391894.7808376085, z: 4059374.2723496533, pitch: -0.6445037155596642, heading: 4.089347744639515 },
  ],
  Cb: [
    { x: -2191747.612091036, y: 4391883.386012675, z: 4059457.9422178366, pitch: -1.3421144109932004, heading: 4.12760906911168 },
    { x: -2191683.922745105, y: 4391935.057033398, z: 4059418.966512324, pitch: -0.9328235942604293, heading: 4.092936665386214 },
  ],
};

/* ---------- 财富中心18楼（无 ABLL/STLL）---------- */
const VIEWS_CENTER: RegionViews = {
  xuting1: VIEWS_SAN.xuting1,
  xuting2: VIEWS_SAN.xuting2,
  An: [
    { x: -2191866.6211736198, y: 4391851.522831841, z: 4059221.708316238, pitch: -0.39816355973717443, heading: 4.088522949450766 },
    { x: -2191788.0464643133, y: 4391943.950647526, z: 4059164.132506584, pitch: -0.3981635512410162, heading: 4.088522944485585 },
  ],
  Ab: [
    { x: -2191851.8629883695, y: 4391843.584653343, z: 4059238.2659231657, pitch: -0.39816356218034477, heading: 4.088522950878495 },
    { x: -2191768.5984158874, y: 4391938.098823174, z: 4059176.669666783, pitch: -0.3981635538161059, heading: 4.088522945990425 },
  ],
  Bdn: [
    { x: -2191804.3485440444, y: 4391840.136608158, z: 4059251.4399710516, pitch: -0.5011371247271907, heading: 4.0801771812851255 },
    { x: -2191710.2029175004, y: 4391949.436038492, z: 4059184.0163306743, pitch: -0.5011371146634334, heading: 4.080177173759306 },
  ],
  Bdz: [
    { x: -2191785.050655734, y: 4391837.507670057, z: 4059255.23296429, pitch: -0.3930150078576198, heading: 4.062436755870774 },
    { x: -2191696.629602864, y: 4391942.664834565, z: 4059192.3654479897, pitch: -0.3930149976833932, heading: 4.06243675032163 },
  ],
  Bdb: [
    { x: -2191777.932684785, y: 4391830.389375065, z: 4059269.9432133893, pitch: -0.3930150095410183, heading: 4.062436756788999 },
    { x: -2191683.0380641674, y: 4391941.391948858, z: 4059201.081181628, pitch: -0.3930149990156713, heading: 4.062436751048265 },
  ],
  Cn: [
    { x: -2191731.112129056, y: 4391817.428396797, z: 4059324.5281401896, pitch: -0.6199921260461796, heading: 4.0511180529568405 },
    { x: -2191640.975932403, y: 4391922.220369304, z: 4059258.9197757808, pitch: -0.60635062018651, heading: 4.059758707492876 },
  ],
  Cz: [
    { x: -2191711.0612801453, y: 4391808.361189432, z: 4059344.884631618, pitch: -0.5445666993545881, heading: 4.082689697823561 },
    { x: -2191618.712626907, y: 4391911.45687236, z: 4059283.2031521266, pitch: -0.5445666901812345, heading: 4.082689690198721 },
  ],
  Cb: [
    { x: -2191685.2612481294, y: 4391802.469818159, z: 4059365.1882607136, pitch: -0.5445667023739, heading: 4.0826897003332223 },
    { x: -2191597.328721372, y: 4391904.962582959, z: 4059301.774728886, pitch: -0.5445666929433353, heading: 4.082689692494578 },
  ],
};

const VIEWPORT_VIEWS: Record<CruiseViewportKind, RegionViews> = {
  small: VIEWS_SMALL,
  big: VIEWS_BIG,
  san: VIEWS_SAN,
  middle: VIEWS_MIDDLE,
  center: VIEWS_CENTER,
};

/* ====================== 巡航控制器 ====================== */

interface Waypoint {
  regionKey: CruiseRegionKey | null;
  view: CruiseViewpoint;
}

type SegmentKind = "transition" | "cruise";

interface Segment {
  from: Waypoint;
  to: Waypoint;
  kind: SegmentKind;
  duration: number;   // 秒
  startTime: number;  // 时间轴起始秒
}

export interface CruiseCallbacks {
  onRegionChange?: (key: CruiseRegionKey, name: string) => void;
  onFinish?: () => void;
}

export class CruiseController {
  private opts: Required<CruiseOptions>;
  private resolveViewport: () => CruiseViewportKind;

  private segments: Segment[] = [];
  private lastWaypoint: Waypoint | null = null;
  private totalDuration = 0;

  private progress = 0;
  private playing = false;
  private finished = false;
  private lastTs = 0;
  private emittedKeys = new Set<string>();

  private prerenderFn: (() => void) | null = null;
  private viewerGetter: () => Cesium.Viewer | undefined;
  private cb: CruiseCallbacks = {};

  // 复用临时对象，避免每帧分配
  private tmpFrom = new Cesium.Cartesian3();
  private tmpTo = new Cesium.Cartesian3();
  private tmpPos = new Cesium.Cartesian3();
  private tmpUp = new Cesium.Cartesian3();

  constructor(
    getViewer: () => Cesium.Viewer | undefined,
    resolveViewport: () => CruiseViewportKind,
    options?: CruiseOptions,
  ) {
    this.viewerGetter = getViewer;
    this.resolveViewport = resolveViewport;
    this.opts = {
      enterDuration: 4,
      stayDuration: 24,
      maxBumpHeight: 600,
      ...options,
    };
  }

  /* ---------------- 对外 API ---------------- */

  setCallbacks(cb: CruiseCallbacks) { this.cb = cb; }

  /** 开始一条新巡航（从相机当前位置起飞） */
  start(cruiseId: string): boolean {
    const viewer = this.viewerGetter();
    if (!viewer) { console.warn("[CruiseController] viewer 未初始化"); return false; }

    const routeKeys = ROUTES[cruiseId];
    if (!routeKeys) { console.warn(`[CruiseController] 未找到巡航ID "${cruiseId}"`); return false; }

    const views = VIEWPORT_VIEWS[this.resolveViewport()] ?? {};

    // 过滤当前视口不存在的区域
    const regions = routeKeys.filter((k) => views[k]?.length);

    // 1. 起点 = 相机当前姿态（不再瞬移）
    const cam = viewer.camera;
    const origin: Waypoint = {
      regionKey: null,
      view: {
        x: cam.position.x, y: cam.position.y, z: cam.position.z,
        pitch: cam.pitch, heading: cam.heading,
      },
    };

    // 2. 构建分段：每个区域 = 1 段 transition 飞入 + (N-1) 段 cruise 驻留
    this.segments = [];
    this.totalDuration = 0;
    let prev: Waypoint = origin;

    for (const key of regions) {
      const pts = views[key]!;

      const head: Waypoint = { regionKey: key, view: pts[0] };
      this.pushSegment(prev, head, "transition");
      let cur = head;

      for (let i = 1; i < pts.length; i++) {
        const next: Waypoint = { regionKey: null, view: pts[i] };
        this.pushSegment(cur, next, "cruise");
        cur = next;
      }
      prev = cur;
    }

    this.lastWaypoint = prev;

    if (this.segments.length === 0) {
      console.warn(`[CruiseController] ${cruiseId} 在当前视口无可巡航线段`);
      return false;
    }

    this.emittedKeys.clear();
    this.finished = false;
    this.attachTick();

    this.progress = 0;
    this.playing = true;
    this.lastTs = performance.now();
    return true;
  }

  /** 暂停（冻结时间轴，飞行动画/巡航均无速度畸变） */
  pause() { this.playing = false; }

  /** 继续 */
  resume() {
    if (this.finished || !this.segments.length) return;
    this.playing = true;
    this.lastTs = performance.now();
  }

  toggle(): "running" | "paused" | null {
    if (!this.segments.length || this.finished) return null;
    this.playing ? this.pause() : this.resume();
    return this.playing ? "running" : "paused";
  }

  isPlaying() { return this.playing; }

  stop() {
    this.playing = false;
    this.detachTick();
    this.segments = [];
    this.lastWaypoint = null;
    this.totalDuration = 0;
    this.progress = 0;
    this.emittedKeys.clear();
  }

  dispose() { this.stop(); this.cb = {}; }

  /* ---------------- 内部实现 ---------------- */

  private pushSegment(from: Waypoint, to: Waypoint, kind: SegmentKind) {
    this.segments.push({
      from, to, kind,
      duration: kind === "transition" ? this.opts.enterDuration : this.opts.stayDuration,
      startTime: this.totalDuration,
    });
    this.totalDuration += this.segments[this.segments.length - 1].duration;
  }

  private attachTick() {
    const viewer = this.viewerGetter();
    if (!viewer || this.prerenderFn) return;
    this.prerenderFn = () => this.tick();
    viewer.scene.preRender.addEventListener(this.prerenderFn);
  }

  private detachTick() {
    const viewer = this.viewerGetter();
    if (viewer && this.prerenderFn) {
      viewer.scene.preRender.removeEventListener(this.prerenderFn);
    }
    this.prerenderFn = null;
  }

  private tick() {
    const viewer = this.viewerGetter();
    if (!viewer || !this.playing || !this.segments.length) return;

    const now = performance.now();
    let dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    if (dt > 0.2) dt = 0.2;
    if (dt <= 0) return;

    this.progress += dt;

    if (this.progress >= this.totalDuration) {
      const last = this.segments[this.segments.length - 1].to;
      this.applyWaypoint(last.view);
      this.playing = false;
      this.finished = true;
      this.detachTick();
      this.cb.onFinish?.();
      return;
    }
    this.applyAtProgress(this.progress);
  }

  private applyAtProgress(t: number) {
    const viewer = this.viewerGetter();
    if (!viewer) return;

    let seg = this.segments[0];
    for (const s of this.segments) { if (t >= s.startTime) seg = s; else break; }

    const rawK = Math.min(Math.max((t - seg.startTime) / seg.duration, 0), 1);
    const f = seg.from.view;
    const g = seg.to.view;
    Cesium.Cartesian3.fromElements(f.x, f.y, f.z, this.tmpFrom);
    Cesium.Cartesian3.fromElements(g.x, g.y, g.z, this.tmpTo);

    let heading: number, pitch: number;

    if (seg.kind === "cruise") {
      // 区域内：严格线性匀速
      Cesium.Cartesian3.lerp(this.tmpFrom, this.tmpTo, rawK, this.tmpPos);
      heading = f.heading + shortestAngleDiff(g.heading, f.heading) * rawK;
      pitch = f.pitch + (g.pitch - f.pitch) * rawK;
    } else {
      // 换场飞行动画：smoothstep 缓动 + 正弦抬升弧线（先拉远再逼近）
      const k = smoothstep(rawK);
      Cesium.Cartesian3.lerp(this.tmpFrom, this.tmpTo, k, this.tmpPos);

      const dist = Cesium.Cartesian3.distance(this.tmpFrom, this.tmpTo);
      const bump =
        Math.sin(Math.PI * rawK) *
        Math.min(Math.max(dist * 0.35, 60), this.opts.maxBumpHeight);

      // 沿"竖直向上"（位置的 geocentric 法向近似）抬升
      Cesium.Cartesian3.normalize(this.tmpPos, this.tmpUp);
      Cesium.Cartesian3.multiplyByScalar(this.tmpUp, bump, this.tmpUp);
      Cesium.Cartesian3.add(this.tmpPos, this.tmpUp, this.tmpPos);

      heading = f.heading + shortestAngleDiff(g.heading, f.heading) * k;
      pitch = f.pitch + (g.pitch - f.pitch) * k;
    }

    viewer.camera.setView({
      destination: Cesium.Cartesian3.clone(this.tmpPos),
      orientation: { heading, pitch, roll: 0 },
    });
    if ((viewer.scene as any).requestRenderMode) viewer.scene.requestRender();

    // 高亮上报：飞入动画开始的瞬间（与需求1/3联动）
    if (seg.kind === "transition" && seg.to.regionKey &&
      !this.emittedKeys.has(seg.to.regionKey)) {
      this.emittedKeys.add(seg.to.regionKey);
      this.emitRegion(seg.to.regionKey);
    }
  }

  private applyWaypoint(view: CruiseViewpoint) {
    const viewer = this.viewerGetter();
    if (!viewer) return;
    viewer.camera.setView({
      destination: new Cesium.Cartesian3(view.x, view.y, view.z),
      orientation: { heading: view.heading, pitch: view.pitch, roll: 0 },
    });
  }

  private emitRegion(key: CruiseRegionKey) {
    this.cb.onRegionChange?.(key, REGION_META[key].name);
  }
}

function shortestAngleDiff(to: number, from: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** smoothstep 缓动：先慢后快再慢，飞行动画观感更自然 */
function smoothstep(k: number): number {
  return k * k * (3 - 2 * k);
}


/** 组合式入口（用法同 useCameraFly） */
export function useCruise(
  getViewer: () => Cesium.Viewer | undefined,
  options?: CruiseOptions,
) {
  const ctl = new CruiseController(getViewer, () => "small", options);
  return ctl;
}
