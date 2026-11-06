// 美国电商营销日历：节日节点 + 备货周期 + 文化洞察 + 选品方向
// 静态知识库（选品总监的"时令盘"），按近似日期匹配未来窗口

export interface SeasonalEvent {
  /** 节点名 */
  name: string;
  /** 近似日期（月/日，浮动节日取代表性日期） */
  month: number;
  day: number;
  /** 日期中文描述 */
  dateLabel: string;
  /** 建议提前备货天数（海运+入仓+测品周期） */
  leadDays: number;
  /** 热门品类 */
  categories: string[];
  /** 美国文化洞察：这个节点美国人为什么买、买什么 */
  culture: string;
  /** 选品方向 */
  productIdeas: string[];
}

export interface UpcomingEvent extends SeasonalEvent {
  daysUntil: number;
  /** 现在距离备货截止是否紧张 */
  urgent: boolean;
}

export const US_ECOMMERCE_CALENDAR: SeasonalEvent[] = [
  {
    name: '新年焕新季',
    month: 1,
    day: 1,
    dateLabel: '1月1日',
    leadDays: 30,
    categories: ['运动户外', '家居生活', '美妆个护'],
    culture:
      'New Year Resolution 文化：美国人新年立 flag 的执念极强，健身、收纳整理、自我提升是开年三大消费主题，1月是健身器材和收纳用品全年峰值之一',
    productIdeas: ['家用健身器材', '收纳整理', ' planners 手账文具', '低卡厨房小工具'],
  },
  {
    name: '超级碗',
    month: 2,
    day: 9,
    dateLabel: '2月第2个周日',
    leadDays: 30,
    categories: ['家居生活', '数码电子'],
    culture:
      '美国春晚，全家围坐看球吃 wings 的国民仪式，派对经济爆发：一次性餐具、投影/电视周边、懒人沙发、零食盘销量飙升',
    productIdeas: ['派对餐具', '投影配件', '沙发盖毯', '零食分装盘'],
  },
  {
    name: '情人节',
    month: 2,
    day: 14,
    dateLabel: '2月14日',
    leadDays: 45,
    categories: ['美妆个护', '服饰鞋包'],
    culture:
      '送礼刚需+「犒赏自己」(self-gifting) 双引擎，美国人年均情人节消费 $200+；香薰、礼盒、仪式感小物通吃情侣与单身人群',
    productIdeas: ['香薰蜡烛', '首饰礼盒', '情侣睡衣', '彩妆礼盒'],
  },
  {
    name: '圣帕特里克节',
    month: 3,
    day: 17,
    dateLabel: '3月17日',
    leadDays: 30,
    categories: ['服饰鞋包', '家居生活'],
    culture:
      '全民穿绿日：不穿绿色会被"捏"，绿色 T 恤、三叶草元素、派对装饰短期爆发，典型的快时尚脉冲行情',
    productIdeas: ['绿色主题T恤', '三叶草配饰', '派对装饰'],
  },
  {
    name: '复活节',
    month: 4,
    day: 20,
    dateLabel: '4月中旬（春分后月圆首个周日）',
    leadDays: 40,
    categories: ['母婴用品', '家居生活'],
    culture:
      '家庭亲子节日：画彩蛋、寻蛋游戏、春季家装焕新；儿童玩具、兔子元素、春季花园用品起量',
    productIdeas: ['彩蛋DIY套装', '兔子玩偶', '春季花园装饰', '亲子餐具'],
  },
  {
    name: '母亲节',
    month: 5,
    day: 11,
    dateLabel: '5月第2个周日',
    leadDays: 45,
    categories: ['美妆个护', '家居生活'],
    culture:
      '美国全年第三大送礼节点（人均 $250+）："感恩妈妈"情感营销黄金期，SPA 级个护、定制感礼物、鲜花替代品最受欢迎',
    productIdeas: ['SPA级身体护理', '定制刻字首饰', '永生花', '按摩仪'],
  },
  {
    name: '阵亡将士纪念日',
    month: 5,
    day: 26,
    dateLabel: '5月最后一个周一',
    leadDays: 30,
    categories: ['运动户外', '家居生活'],
    culture:
      '夏季开场哨：烧烤、露营、泳池派对季开启，户外品类从这天起进入全年主场',
    productIdeas: ['烧烤工具', '便携冰包', '户外折叠椅', '泳池玩具'],
  },
  {
    name: '父亲节',
    month: 6,
    day: 15,
    dateLabel: '6月第3个周日',
    leadDays: 45,
    categories: ['数码电子', '运动户外'],
    culture:
      '"酷老爸"经济：工具、数码、男士个护、汽车周边是四大礼赠方向，实用主义至上，花哨包装反而不讨好',
    productIdeas: ['多功能工具', '车载配件', '男士理容', '户外手电'],
  },
  {
    name: '独立日',
    month: 7,
    day: 4,
    dateLabel: '7月4日',
    leadDays: 30,
    categories: ['运动户外', '家居生活', '服饰鞋包'],
    culture:
      '国庆=全民户外日：红白蓝元素、星条旗周边、烧烤野餐装备；爱国情绪消费是真实存在的购买力',
    productIdeas: ['星条旗元素服饰', '户外野餐垫', '烧烤配件', '庭院灯串'],
  },
  {
    name: 'Prime Day / 年中大促',
    month: 7,
    day: 15,
    dateLabel: '7月中旬',
    leadDays: 45,
    categories: ['数码电子', '家居生活', '美妆个护'],
    culture:
      '亚马逊造节成功，全平台跟进的年中折扣季；美国消费者已养成"7月囤货"心智，客单价敏感度最高的一波',
    productIdeas: ['高客单数码配件', '囤货型消耗品', '礼品卡导向小物'],
  },
  {
    name: '返校季',
    month: 8,
    day: 15,
    dateLabel: '8月-9月初',
    leadDays: 45,
    categories: ['母婴用品', '数码电子', '家居生活'],
    culture:
      '全年第二大零售季：K12 文具书包 + 大学生宿舍经济（dorm room 布置是 TikTok 热门内容），家长为孩子花钱绝不手软',
    productIdeas: ['宿舍收纳', '桌面氛围灯', '文具套装', '便携小家电'],
  },
  {
    name: '万圣节',
    month: 10,
    day: 31,
    dateLabel: '10月31日（9月起预热）',
    leadDays: 60,
    categories: ['服饰鞋包', '家居生活', '母婴用品'],
    culture:
      '美国人均消费 $100+ 的全民 cosplay 节：服装、庭院装饰（卷到邻居攀比）、宠物变装（宠物即家人文化的极致体现）',
    productIdeas: ['变装服饰', '庭院充气装饰', '宠物万圣节装', '南瓜灯'],
  },
  {
    name: '黑五网一',
    month: 11,
    day: 28,
    dateLabel: '11月第4个周五起',
    leadDays: 60,
    categories: ['数码电子', '美妆个护', '家居生活', '服饰鞋包'],
    culture:
      '全年最大购物狂欢：美国消费者攒着购物清单等这一天，折扣驱动的冲动消费巅峰；也是清库存+冲排名的战略窗口',
    productIdeas: ['全年利润款冲量', '礼盒套装', '高客单折扣款'],
  },
  {
    name: '圣诞季',
    month: 12,
    day: 25,
    dateLabel: '12月25日（11月起预热）',
    leadDays: 60,
    categories: ['家居生活', '母婴用品', '美妆个护'],
    culture:
      '全年送礼经济顶峰： stocking stuffers（圣诞袜小礼物，$10-25 小物的天下）、家庭装饰、倒计时礼盒；12月20日后"最后一分钟礼物"又是一波',
    productIdeas: ['圣诞袜小礼物', '倒计时礼盒', '节日装饰灯', '冬季毛绒家居'],
  },
];

/** 取未来 withinDays 天内的营销节点（跨年自动顺延） */
export function getUpcomingEvents(now: Date, withinDays = 90): UpcomingEvent[] {
  const result: UpcomingEvent[] = [];
  const year = now.getFullYear();

  for (const ev of US_ECOMMERCE_CALENDAR) {
    for (const y of [year, year + 1]) {
      const date = new Date(y, ev.month - 1, ev.day);
      const daysUntil = Math.ceil(
        (date.getTime() - now.getTime()) / (24 * 3600 * 1000),
      );
      if (daysUntil >= -7 && daysUntil <= withinDays) {
        result.push({
          ...ev,
          daysUntil,
          urgent: daysUntil > 0 && daysUntil <= ev.leadDays,
        });
        break;
      }
    }
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}
