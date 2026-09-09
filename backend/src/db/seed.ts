import type { Database as DatabaseType } from 'better-sqlite3';
import type {
  FocusGroup,
  FocusNode,
  FocusEdge,
  EvolutionSnapshot
} from '../types.js';
import { upsertFocusNode, getFullFocusTreeData } from './queries/focusTree.js';

export function seedDefaultData(db: DatabaseType) {
  // 1. 初始化神圣座位配置
  const seatConfig = db.prepare('SELECT id FROM sacred_seat_config WHERE id = 1').get();
  if (!seatConfig) {
    db.prepare(`
      INSERT INTO sacred_seat_config (id, sacredToken, reservationSignal, defaultFocusDuration, regretWindowSeconds, currentStreak, maxStreak, updatedAt)
      VALUES (1, '主力机开启专注模式', '反手拍手轻声说换人', 60, 30, 0, 0, datetime('now'))
    `).run();
  }

  // 2. 初始化国策树初始结构与种子节点
  const groupCount = db.prepare('SELECT count(*) as count FROM focus_groups').get() as { count: number };
  if (groupCount.count === 0) {
    // 初始分组
    const insertGroup = db.prepare(`
      INSERT INTO focus_groups (id, name, themeColor, positionX, positionY, width, height)
      VALUES (@id, @name, @themeColor, @positionX, @positionY, @width, @height)
    `);

    const seedGroups: FocusGroup[] = [
      {
        id: 'grp-root',
        name: '【根国策组】系统宪法与元机制（全天候生效）',
        themeColor: '#2563EB',
        position: { x: 20, y: 0 },
        size: { width: 640, height: 160 }
      },
      {
        id: 'grp-morning',
        name: '【早起国策组】破晓突围流水线',
        themeColor: '#EA580C',
        position: { x: 160, y: 190 },
        size: { width: 280, height: 530 }
      },
      {
        id: 'grp-focus',
        name: '【专注国策组】心流引擎',
        themeColor: '#0284C7',
        position: { x: 160, y: 740 },
        size: { width: 280, height: 650 }
      },
      {
        id: 'grp-buff',
        name: '【充能国策组】储备充能资产',
        themeColor: '#16A34A',
        position: { x: 160, y: 1430 },
        size: { width: 280, height: 410 }
      },
      {
        id: 'grp-night',
        name: '【夜间国策组】极夜降临与神圣寝域',
        themeColor: '#7C3AED',
        position: { x: 50, y: 1880 },
        size: { width: 500, height: 1100 }
      },
      {
        id: 'grp-night-lock',
        name: '23:00 物理驱逐 (手环闹钟)',
        themeColor: '#9333EA',
        position: { x: 80, y: 2040 },
        size: { width: 440, height: 130 }
      }
    ];

    for (const g of seedGroups) {
      insertGroup.run({
        id: g.id,
        name: g.name,
        themeColor: g.themeColor,
        positionX: g.position.x,
        positionY: g.position.y,
        width: g.size.width,
        height: g.size.height
      });
    }

    const seedNodes: Array<FocusNode & { sortOrder: number }> = [
      {
        id: 'node-r0',
        code: 'R0',
        name: '水密隔舱',
        groupId: 'grp-root',
        triggerTime: null,
        triggerScene: '生病/不可抗力冻结结算',
        hasExactTime: false,
        timeValueMinutes: null,
        level: 1,
        maxLevel: 1,
        isLit: true,
        isFrozen: false,
        position: { x: 50, y: 55 },
        specCard: {
          instruction: '突发危机、生病或不可抗力时，在日记打上 [FREEZE] 声明，冻结当日国策结算。允许休养生息，不判定为节点崩溃。',
          failCondition: '未切断污染源强行自我谴责，或放任破罐子破摔雪崩。',
          benefitMechanism: '保全历史稳态进度条，锁定单日损失上限，消灭雪崩心理。',
          notes: '系统宪法元机制，全天候生效，永不崩溃。'
        },
        sortOrder: 0
      },
      {
        id: 'node-r1',
        code: 'R1',
        name: '下必为例',
        groupId: 'grp-root',
        triggerTime: null,
        triggerScene: '模糊行为终身判例定性',
        hasExactTime: false,
        timeValueMinutes: null,
        level: 1,
        maxLevel: 1,
        isLit: true,
        isFrozen: false,
        position: { x: 250, y: 55 },
        specCard: {
          instruction: '遇到灰色行为或新App时进行终身推演——若我现在开特例，则今后在相同场景下一律合法。',
          failCondition: '心存侥幸以“就这一次”破戒，为灰色行为寻找借口。',
          benefitMechanism: '博弈论判例法典，放大违规摩擦力，将微小放纵与终身习惯成本绑定。',
          notes: '若不愿承担终身代价，则当场判定违规并列入限制组。'
        },
        sortOrder: 1
      },
      {
        id: 'node-r2',
        code: 'R2',
        name: '词林赎买',
        groupId: 'grp-root',
        triggerTime: null,
        triggerScene: '背10词解锁10m娱乐',
        hasExactTime: false,
        timeValueMinutes: null,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 450, y: 55 },
        specCard: {
          instruction: '产生强烈想玩手机冲动时，每额外游玩 10 分钟，必须提前在背词软件中完成 10 个单词学习/复习。手环开启 10 分钟倒计时，震动立刻放下手机。',
          failCondition: '未背单词直接玩手机，或手环倒计时震动后未立即交还手机。',
          benefitMechanism: '冲激代偿机制，背词枯燥感劝退 80% 伪冲动，将即时诱惑反向转化为正面词汇资产。',
          notes: '手环倒计时半自动定死，严禁超时妥协。'
        },
        sortOrder: 2
      },
      {
        id: 'node-m1',
        code: 'M1',
        name: '离地起爆',
        groupId: 'grp-morning',
        triggerTime: null,
        triggerScene: '闹钟响后3分钟下床',
        hasExactTime: false,
        timeValueMinutes: 450,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 250 },
        specCard: {
          instruction: '晨间闹钟响后 3 分钟内脚掌触地离开床铺，重心完全移出床铺引力场。',
          failCondition: '闹钟响后躺在床上超过 3 分钟（含闭眼回笼觉与玩手机）。',
          benefitMechanism: '打破睡眠惰性引力，建立第一行动物理势能。'
        },
        sortOrder: 3
      },
      {
        id: 'node-m2',
        code: 'M2',
        name: '净面破障',
        groupId: 'grp-morning',
        triggerTime: null,
        triggerScene: '醒后10分钟进洗手间洗漱',
        hasExactTime: false,
        timeValueMinutes: 460,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 370 },
        specCard: {
          instruction: '下床后 10 分钟内必须进入洗手间，用凉水洗脸并完成刷牙洗漱。',
          failCondition: '下床后游荡超过 10 分钟未进入洗手间洗漱。',
          benefitMechanism: '借助凉水物理刺激面部三叉神经，快速驱散睡眠惰性。'
        },
        sortOrder: 4
      },
      {
        id: 'node-m3',
        code: 'M3',
        name: '晨光净空',
        groupId: 'grp-morning',
        triggerTime: null,
        triggerScene: '起身后30m手环禁娱',
        hasExactTime: false,
        timeValueMinutes: 480,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 490 },
        specCard: {
          instruction: '下床瞬间在手环上启动 30 分钟倒计时，倒计时结束前严禁打开任何限制组 App。',
          failCondition: '30 分钟内主动点开限制组应用。',
          benefitMechanism: '晨光多巴胺防火墙，保护前额叶神经递质基线不被高频图文多巴胺劫持。'
        },
        sortOrder: 5
      },
      {
        id: 'node-m4',
        code: 'M4',
        name: '沙盘推演',
        groupId: 'grp-morning',
        triggerTime: null,
        triggerScene: '微软ToDo极简规划单元',
        hasExactTime: false,
        timeValueMinutes: 500,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 610 },
        specCard: {
          instruction: '禁娱结束前夕或出门前，花 3 分钟打开微软 ToDo，仅规划今日 1~3 个核心行动单元（碎石颗粒度）。',
          failCondition: '过度做复杂层级规划，或跳过规划直接盲目出门。',
          benefitMechanism: '日间作战桥梁，以碎石颗粒度降低启动前额叶负荷。'
        },
        sortOrder: 6
      },
      {
        id: 'node-f1',
        code: 'F1',
        name: '声呐巡航',
        groupId: 'grp-focus',
        triggerTime: null,
        triggerScene: '通勤录音自聊防刷屏',
        hasExactTime: false,
        timeValueMinutes: 510,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 800 },
        specCard: {
          instruction: '踏上通勤路线后，戴上耳机开启手机录音机，以跟自己闲聊/复盘形式持续口头叙述。',
          failCondition: '通勤途中低头无目的滑动社交/短视频软件。',
          benefitMechanism: '全面占领发声和思考通道，生理上杜绝边走边低头刷手机，零成本锻炼即兴表达。'
        },
        sortOrder: 7
      },
      {
        id: 'node-f2',
        code: 'F2',
        name: '碎石颗粒',
        groupId: 'grp-focus',
        triggerTime: null,
        triggerScene: '仅拆到可启动单元',
        hasExactTime: false,
        timeValueMinutes: 530,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 920 },
        specCard: {
          instruction: '任务拆解坚决只细化到“随时能开始动手的第一步”（如打开IDE创建文件、写出前言第一句）。',
          failCondition: '因规划过大过重导致前额叶认知过载与抗拒拖延。',
          benefitMechanism: '认知卸载准则，消除前额叶恐惧，启动阻力趋向于零。'
        },
        sortOrder: 8
      },
      {
        id: 'node-f3',
        code: 'F3',
        name: '神圣坐席',
        groupId: 'grp-focus',
        triggerTime: null,
        triggerScene: '工位锁定+限制组关闭',
        hasExactTime: false,
        timeValueMinutes: 540,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1040 },
        specCard: {
          instruction: '坐在指定学习/工作座位上，手环设定目标倒计时，限制组 App 全面封锁。时间一到立即行动。',
          failCondition: '就坐后未锁限制组，随意浏览无关网页。',
          benefitMechanism: '构筑工位结界与空间物理锚定。'
        },
        sortOrder: 9
      },
      {
        id: 'node-f4',
        code: 'F4',
        name: '微火试车',
        groupId: 'grp-focus',
        triggerTime: null,
        triggerScene: '先跑5分钟低阻力启动',
        hasExactTime: false,
        timeValueMinutes: 550,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1160 },
        specCard: {
          instruction: '心理契约仅承诺“全神贯注做 5 分钟”。5 分钟一到若阻力大允许微调，顺利进入状态则顺延 F5。',
          failCondition: '因预想 60 分钟过重而在启动前放弃。',
          benefitMechanism: '破冰起跑器，跨越静摩擦力后依靠惯性滑行。'
        },
        sortOrder: 10
      },
      {
        id: 'node-f5',
        code: 'F5',
        name: '全功率深潜',
        groupId: 'grp-focus',
        triggerTime: null,
        triggerScene: '状态佳手环顺延至60m',
        hasExactTime: false,
        timeValueMinutes: 560,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1280 },
        specCard: {
          instruction: 'F4 微火点火成功后，手环顺水推舟延展至 60 分钟单任务深度攻坚。',
          failCondition: '中途主动跳出心流查看即时通讯或切换无关任务。',
          benefitMechanism: '高阶攻坚战役，产出最高密度心流成果。'
        },
        sortOrder: 11
      },
      {
        id: 'node-l1',
        code: 'L1',
        name: '记忆温固',
        groupId: 'grp-buff',
        triggerTime: null,
        triggerScene: '日常单词复习巩固',
        hasExactTime: false,
        timeValueMinutes: 720,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1490 },
        specCard: {
          instruction: '利用白天碎片时间或早晨，在背词软件中完成既有旧词复习巩固。',
          failCondition: '多日不复习导致遗忘率堆积。',
          benefitMechanism: '资产巩固，同时作为 R2 赎买机制的原料储备库。'
        },
        sortOrder: 12
      },
      {
        id: 'node-l2',
        code: 'L2',
        name: '前沿装填',
        groupId: 'grp-buff',
        triggerTime: null,
        triggerScene: '每日定量新词背诵',
        hasExactTime: false,
        timeValueMinutes: 900,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1610 },
        specCard: {
          instruction: '推进每日既定配额的新单词攻坚背诵，持续拓展词汇边界。',
          failCondition: '长时间停滞无新词增量输入。',
          benefitMechanism: '增量攻坚，稳步构建语言护城河。'
        },
        sortOrder: 13
      },
      {
        id: 'node-l3',
        code: 'L3',
        name: '营垒锻造',
        groupId: 'grp-buff',
        triggerTime: null,
        triggerScene: '寝室器械力量锻炼',
        hasExactTime: false,
        timeValueMinutes: 1140,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1730 },
        specCard: {
          instruction: '在寝室利用哑铃/弹力带等器械进行 15~30 分钟抗阻体能训练。',
          failCondition: '连续多日缺乏任何体能负荷刺激。',
          benefitMechanism: '生理稳态筑底，积累深睡压力，与夜间 N1 蛋白质审计形成闭环。'
        },
        sortOrder: 14
      },
      {
        id: 'node-n1',
        code: 'N1',
        name: '暮鼓内省',
        groupId: 'grp-night',
        triggerTime: '22:30',
        triggerScene: '主力勿扰+记账+补蛋白粉',
        hasExactTime: true,
        timeValueMinutes: 1350,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 1940 },
        specCard: {
          instruction: '22:30 主力机开启勿扰；用 2 分钟复核记账流水；核算蛋白质摄入，缺口立即冲蛋白粉补上。',
          failCondition: '22:35 前未开启勿扰且未进行记账与健康复核。',
          benefitMechanism: '夜间减速锚点，生理与心理的双重结账仪式。'
        },
        sortOrder: 15
      },
      {
        id: 'node-n2-a',
        code: 'N2-A',
        name: '兵装前置',
        groupId: 'grp-night-lock',
        triggerTime: '23:00',
        triggerScene: '工作日：主力机进通勤包',
        hasExactTime: true,
        timeValueMinutes: 1380,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 100, y: 2070 },
        specCard: {
          instruction: '23:00 手环闹钟响，工作日分支：主力机直接放进次日通勤包并拉上拉链。',
          failCondition: '23:05 后仍拿主力机把玩，未入包隔离。',
          benefitMechanism: '空间物理隔离，且省去次晨翻找手机的摩擦力。'
        },
        sortOrder: 16
      },
      {
        id: 'node-n2-b',
        code: 'N2-B',
        name: '结界归仓',
        groupId: 'grp-night-lock',
        triggerTime: '23:00',
        triggerScene: '休息日：主力机放进抽屉',
        hasExactTime: true,
        timeValueMinutes: 1380,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 320, y: 2070 },
        specCard: {
          instruction: '23:00 手环闹钟响，休息日分支：主力机锁进书桌抽屉并关好。',
          failCondition: '23:05 后主力机仍停留在床上或视线可及范围。',
          benefitMechanism: '脱离触觉与视觉刺激范围，切断睡前刷屏路径。'
        },
        sortOrder: 17
      },
      {
        id: 'node-n3',
        code: 'N3',
        name: '极夜滤镜',
        groupId: 'grp-night',
        triggerTime: '23:00',
        triggerScene: '备用机自动化全黑白屏',
        hasExactTime: true,
        timeValueMinutes: 1380,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2240 },
        specCard: {
          instruction: '备用机自动化切换为全黑白屏幕（23:00 - 08:10），剥夺视觉多巴胺反馈。',
          failCondition: '睡前主动关闭黑白滤镜切回彩色。',
          benefitMechanism: '降低视觉刺激，加速褪黑素自然分泌。'
        },
        sortOrder: 18
      },
      {
        id: 'node-n4',
        code: 'N4',
        name: '温足解甲',
        groupId: 'grp-night',
        triggerTime: '23:15',
        triggerScene: '泡脚放松 + 倒水顺手洗漱',
        hasExactTime: true,
        timeValueMinutes: 1395,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2360 },
        specCard: {
          instruction: '23:15 打热水泡脚；端洗脚水倒水时顺手完成刷牙、洗脸洗漱，动线一次性闭环。',
          failCondition: '泡脚与洗漱分批拖延，导致就寝延误。',
          benefitMechanism: '核心体温先升后降诱发深度睡意，合并动线消灭多批次内耗。'
        },
        sortOrder: 19
      },
      {
        id: 'node-n5',
        code: 'N5',
        name: '战阵复盘',
        groupId: 'grp-night',
        triggerTime: '23:30',
        triggerScene: '记录今日笔记·排空脑内存',
        hasExactTime: true,
        timeValueMinutes: 1410,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2480 },
        specCard: {
          instruction: '在备用机或电脑上快速记录今日笔记与复盘，排空大脑工作内存。',
          failCondition: '脑中思绪盘旋仍强行就寝导致失眠。',
          benefitMechanism: '认知内存清空，将心理未结事项落盘，安抚夜间焦虑。'
        },
        sortOrder: 20
      },
      {
        id: 'node-n6',
        code: 'N6',
        name: '电子宵禁',
        groupId: 'grp-night',
        triggerTime: '23:30',
        triggerScene: '备用机限制组App自动封锁',
        hasExactTime: true,
        timeValueMinutes: 1410,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2600 },
        specCard: {
          instruction: '备用机屏幕使用时间/限制组 App 自动封锁，仅保留闹钟与通话功能。',
          failCondition: '宵禁后手动输入密码解锁娱乐类应用。',
          benefitMechanism: '外部强制力锁死睡前多巴胺窗口。'
        },
        sortOrder: 21
      },
      {
        id: 'node-n7',
        code: 'N7',
        name: '神圣寝域',
        groupId: 'grp-night',
        triggerTime: '24:00',
        triggerScene: '上床5m脱手·闭目充电',
        hasExactTime: true,
        timeValueMinutes: 1440,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2720 },
        specCard: {
          instruction: '23:55 进被窝，00:00 熄灯。5 分钟内彻底放下手机，坚守“闭目养神即是大脑充电”心态。',
          failCondition: '00:05 后仍在床头亮屏看手机。',
          benefitMechanism: '神圣寝域结界，杜绝睡意焦虑，重塑床铺与睡眠的强反射连接。'
        },
        sortOrder: 22
      },
      {
        id: 'node-n8',
        code: 'N8',
        name: '声波避难所',
        groupId: 'grp-night',
        triggerTime: null,
        triggerScene: '外部吵闹戴耳机听离线白噪音',
        hasExactTime: false,
        timeValueMinutes: null,
        level: 1,
        maxLevel: 1,
        isLit: false,
        isFrozen: false,
        position: { x: 210, y: 2860 },
        specCard: {
          instruction: '非吵不戴，戴则白噪：室友喧闹/吹头时，戴柔软侧睡耳机播放离线白噪音，手环定时 30m 自动关闭。',
          failCondition: '与环境噪音愤怒对抗，或找视频音频听而花费大量时间。',
          benefitMechanism: '非对称应急防御，单曲白噪音阻断对抗心理与挑选耗时。'
        },
        sortOrder: 23
      }
    ];

    for (const node of seedNodes) {
      upsertFocusNode(node, node.sortOrder);
    }

    // 初始连线
    const insertEdge = db.prepare(`
      INSERT INTO focus_edges (id, sourceId, sourceType, targetId, targetType, sourceAnchor, targetAnchor, style)
      VALUES (@id, @sourceId, @sourceType, @targetId, @targetType, @sourceAnchor, @targetAnchor, @style)
    `);

    const seedEdges: FocusEdge[] = [
      { id: 'edge-m1-m2', sourceId: 'node-m1', sourceType: 'NODE', targetId: 'node-m2', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-m2-m3', sourceId: 'node-m2', sourceType: 'NODE', targetId: 'node-m3', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-m3-m4', sourceId: 'node-m3', sourceType: 'NODE', targetId: 'node-m4', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-m4-f1', sourceId: 'node-m4', sourceType: 'NODE', targetId: 'node-f1', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-f1-f2', sourceId: 'node-f1', sourceType: 'NODE', targetId: 'node-f2', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-f2-f3', sourceId: 'node-f2', sourceType: 'NODE', targetId: 'node-f3', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-f3-f4', sourceId: 'node-f3', sourceType: 'NODE', targetId: 'node-f4', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-f4-f5', sourceId: 'node-f4', sourceType: 'NODE', targetId: 'node-f5', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-f5-l1', sourceId: 'node-f5', sourceType: 'NODE', targetId: 'node-l1', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'DASHED' },
      { id: 'edge-r2-l1', sourceId: 'node-r2', sourceType: 'NODE', targetId: 'node-r1', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'RIGHT', style: 'DASHED' },
      { id: 'edge-l1-l2', sourceId: 'node-l1', sourceType: 'NODE', targetId: 'node-l2', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-l2-l3', sourceId: 'node-l2', sourceType: 'NODE', targetId: 'node-l3', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-l3-n1', sourceId: 'node-l3', sourceType: 'NODE', targetId: 'node-n1', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'DASHED' },
      { id: 'edge-n1-n2a', sourceId: 'node-n1', sourceType: 'NODE', targetId: 'node-n2-a', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n1-n2b', sourceId: 'node-n1', sourceType: 'NODE', targetId: 'node-n2-b', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n2a-n3', sourceId: 'node-n2-a', sourceType: 'NODE', targetId: 'node-n3', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n2b-n3', sourceId: 'node-n2-b', sourceType: 'NODE', targetId: 'node-n3', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n3-n4', sourceId: 'node-n3', sourceType: 'NODE', targetId: 'node-n4', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n4-n5', sourceId: 'node-n4', sourceType: 'NODE', targetId: 'node-n5', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n5-n6', sourceId: 'node-n5', sourceType: 'NODE', targetId: 'node-n6', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n6-n7', sourceId: 'node-n6', sourceType: 'NODE', targetId: 'node-n7', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'SOLID' },
      { id: 'edge-n7-n8', sourceId: 'node-n7', sourceType: 'NODE', targetId: 'node-n8', targetType: 'NODE', sourceAnchor: 'BOTTOM', targetAnchor: 'TOP', style: 'DASHED' }
    ];

    for (const edge of seedEdges) {
      insertEdge.run(edge);
    }
  }

  // 3. 初始化演化版本快照与活跃指针
  const stateRow = db.prepare('SELECT id FROM evolution_state WHERE id = 1').get();
  if (!stateRow) {
    db.prepare('INSERT INTO evolution_state (id, activePointerIndex) VALUES (1, 0)').run();
  }

  const snapshotCount = db.prepare('SELECT count(*) as count FROM evolution_snapshots').get() as { count: number };
  if (snapshotCount.count === 0) {
    // 将当前树结构保存为 v1.0 初始快照 (Slot 0)
    const nodes = getFullFocusTreeData();
    const initSnapshot: EvolutionSnapshot = {
      version: 'v1.0',
      timestamp: '2026-09-02T00:00:00.000Z',
      changelogNotes: '动能破晓：全域稳态与昼夜效能国策树 v1.0 正式基准版',
      isMajor: true,
      nodes: nodes.nodes,
      edges: nodes.edges,
      groups: nodes.groups
    };

    db.prepare(`
      INSERT INTO evolution_snapshots (slotIndex, id, version, timestamp, changelogNotes, isMajor, dataJson)
      VALUES (0, 'snap-v1-0', @version, @timestamp, @changelogNotes, 1, @dataJson)
    `).run({
      version: initSnapshot.version,
      timestamp: initSnapshot.timestamp,
      changelogNotes: initSnapshot.changelogNotes,
      dataJson: JSON.stringify(initSnapshot)
    });
  }
}
