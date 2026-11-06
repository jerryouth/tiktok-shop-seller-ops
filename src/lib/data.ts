// 内置演示数据：28 个典型 TikTok Shop 商品，覆盖 6 大热门类目
// 后续对接真实数据时，仅需替换 store.ts 中的数据源，评分引擎与接口保持不变
import type { Category, Product } from './types';

/** 确定性伪随机（mulberry32），保证每次启动生成一致的日销序列 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成近 14 天日销序列
 * @param seed 随机种子（商品序号）
 * @param base 基础日销水平
 * @param slope 趋势斜率（正为上升、负为下滑）
 */
function genDailySales(seed: number, base: number, slope: number): number[] {
  const rand = seededRandom(seed * 9973 + 17);
  const days: number[] = [];
  for (let i = 0; i < 14; i++) {
    const trend = base * (1 + slope * (i / 13));
    const weekend = i % 7 === 5 || i % 7 === 6 ? 1.25 : 1;
    const noise = 0.75 + rand() * 0.5;
    days.push(Math.max(1, Math.round(trend * weekend * noise)));
  }
  return days;
}

interface RawProduct {
  name: string;
  category: Category;
  image: string;
  price: number;
  cost: number;
  sales: number;
  rating: number;
  reviews: number;
  listedAt: string;
  competition: number;
  heat: number;
  seller: string;
  /** 日销基数与趋势 */
  dailyBase: number;
  slope: number;
}

const RAW_PRODUCTS: RawProduct[] = [
  // ---------- 美妆个护 ----------
  {
    name: '哑光丝绒唇釉三支套装',
    category: '美妆个护',
    image: '/products/beauty-1.png',
    price: 12.99, cost: 3.2, sales: 42800, rating: 4.7, reviews: 9860,
    listedAt: '2025-08-14', competition: 62, heat: 95,
    seller: 'BeautyHub 海外旗舰店', dailyBase: 320, slope: 0.9,
  },
  {
    name: '玻尿酸高保湿精华液 30ml',
    category: '美妆个护',
    image: '/products/beauty-2.png',
    price: 15.5, cost: 4.1, sales: 31500, rating: 4.6, reviews: 7200,
    listedAt: '2025-06-02', competition: 70, heat: 88,
    seller: 'GlowLab 美妆专营店', dailyBase: 210, slope: 0.3,
  },
  {
    name: '积雪草舒缓修护面膜 10 片装',
    category: '美妆个护',
    image: '/products/beauty-2.png',
    price: 9.99, cost: 2.5, sales: 18700, rating: 4.5, reviews: 4300,
    listedAt: '2025-09-21', competition: 58, heat: 82,
    seller: 'SkinFirst 护肤官方店', dailyBase: 150, slope: 0.5,
  },
  {
    name: '氨基酸温和净澈洁面乳',
    category: '美妆个护',
    image: '/products/beauty-2.png',
    price: 8.99, cost: 2.2, sales: 12400, rating: 4.4, reviews: 2900,
    listedAt: '2025-10-05', competition: 66, heat: 74,
    seller: 'SkinFirst 护肤官方店', dailyBase: 95, slope: -0.15,
  },
  {
    name: '防水纤长卷翘睫毛膏',
    category: '美妆个护',
    image: '/products/beauty-1.png',
    price: 7.99, cost: 1.8, sales: 26800, rating: 4.3, reviews: 6100,
    listedAt: '2025-04-18', competition: 81, heat: 79,
    seller: 'BeautyHub 海外旗舰店', dailyBase: 160, slope: -0.35,
  },

  // ---------- 家居生活 ----------
  {
    name: '网红日落投影氛围灯',
    category: '家居生活',
    image: '/products/home-1.png',
    price: 18.99, cost: 5.5, sales: 38900, rating: 4.8, reviews: 11200,
    listedAt: '2025-07-08', competition: 55, heat: 96,
    seller: 'HomeVibe 家居好物馆', dailyBase: 290, slope: 1.1,
  },
  {
    name: '迷你桌面静音加湿器 300ml',
    category: '家居生活',
    image: '/products/home-2.png',
    price: 11.99, cost: 3.6, sales: 22300, rating: 4.5, reviews: 5400,
    listedAt: '2025-09-12', competition: 63, heat: 81,
    seller: 'HomeVibe 家居好物馆', dailyBase: 170, slope: 0.4,
  },
  {
    name: 'LED 人体感应小夜灯',
    category: '家居生活',
    image: '/products/home-1.png',
    price: 6.99, cost: 1.9, sales: 15600, rating: 4.4, reviews: 3300,
    listedAt: '2025-10-22', competition: 48, heat: 72,
    seller: 'LightUp 照明专营店', dailyBase: 130, slope: 0.6,
  },
  {
    name: '免打孔壁挂收纳架套装',
    category: '家居生活',
    image: '/products/home-2.png',
    price: 13.5, cost: 4.0, sales: 9800, rating: 4.6, reviews: 2100,
    listedAt: '2025-11-01', competition: 42, heat: 66,
    seller: 'HomeVibe 家居好物馆', dailyBase: 88, slope: 0.35,
  },
  {
    name: '云朵香薰蜡烛礼盒',
    category: '家居生活',
    image: '/products/home-1.png',
    price: 14.99, cost: 4.8, sales: 7600, rating: 4.7, reviews: 1800,
    listedAt: '2025-10-28', competition: 38, heat: 69,
    seller: 'CozyCorner 生活馆', dailyBase: 66, slope: 0.55,
  },

  // ---------- 服饰鞋包 ----------
  {
    name: 'oversize 奶油风连帽卫衣',
    category: '服饰鞋包',
    image: '/products/fashion-1.png',
    price: 24.99, cost: 8.5, sales: 35200, rating: 4.6, reviews: 8900,
    listedAt: '2025-08-30', competition: 74, heat: 90,
    seller: 'UrbanStyle 服饰旗舰店', dailyBase: 260, slope: 0.7,
  },
  {
    name: '高腰提臀瑜伽鲨鱼裤',
    category: '服饰鞋包',
    image: '/products/fashion-2.png',
    price: 16.99, cost: 5.2, sales: 29400, rating: 4.5, reviews: 7600,
    listedAt: '2025-07-19', competition: 78, heat: 87,
    seller: 'FlexFit 运动服饰店', dailyBase: 200, slope: 0.25,
  },
  {
    name: '复古做旧水洗牛仔外套',
    category: '服饰鞋包',
    image: '/products/fashion-1.png',
    price: 32.99, cost: 12.8, sales: 11800, rating: 4.4, reviews: 2600,
    listedAt: '2025-10-08', competition: 68, heat: 71,
    seller: 'UrbanStyle 服饰旗舰店', dailyBase: 92, slope: -0.1,
  },
  {
    name: '云朵厚底毛毛拖鞋',
    category: '服饰鞋包',
    image: '/products/fashion-2.png',
    price: 12.99, cost: 3.9, sales: 20100, rating: 4.7, reviews: 5200,
    listedAt: '2025-09-26', competition: 59, heat: 84,
    seller: 'CozyCorner 生活馆', dailyBase: 165, slope: 0.8,
  },
  {
    name: '大容量帆布托特包',
    category: '服饰鞋包',
    image: '/products/fashion-2.png',
    price: 15.99, cost: 4.6, sales: 8900, rating: 4.3, reviews: 1900,
    listedAt: '2025-10-30', competition: 51, heat: 63,
    seller: 'UrbanStyle 服饰旗舰店', dailyBase: 72, slope: 0.15,
  },

  // ---------- 数码电子 ----------
  {
    name: '磁吸无线充电手机支架',
    category: '数码电子',
    image: '/products/digital-1.png',
    price: 21.99, cost: 7.2, sales: 33700, rating: 4.6, reviews: 8100,
    listedAt: '2025-06-25', competition: 72, heat: 91,
    seller: 'TechNova 数码专营店', dailyBase: 240, slope: 0.5,
  },
  {
    name: '半入耳式无线蓝牙耳机',
    category: '数码电子',
    image: '/products/digital-2.png',
    price: 19.99, cost: 6.5, sales: 41200, rating: 4.4, reviews: 12400,
    listedAt: '2025-05-11', competition: 85, heat: 89,
    seller: 'AudioMax 声学旗舰店', dailyBase: 230, slope: -0.2,
  },
  {
    name: '手机补光灯直播支架套装',
    category: '数码电子',
    image: '/products/digital-1.png',
    price: 17.99, cost: 5.8, sales: 16900, rating: 4.5, reviews: 3900,
    listedAt: '2025-09-18', competition: 61, heat: 83,
    seller: 'TechNova 数码专营店', dailyBase: 135, slope: 0.45,
  },
  {
    name: '迷你便携蓝牙音箱',
    category: '数码电子',
    image: '/products/digital-2.png',
    price: 22.99, cost: 8.1, sales: 13500, rating: 4.6, reviews: 3400,
    listedAt: '2025-08-02', competition: 64, heat: 76,
    seller: 'AudioMax 声学旗舰店', dailyBase: 96, slope: 0.1,
  },
  {
    name: '10000mAh 磁吸快充充电宝',
    category: '数码电子',
    image: '/products/digital-1.png',
    price: 25.99, cost: 10.2, sales: 19400, rating: 4.5, reviews: 4700,
    listedAt: '2025-07-27', competition: 77, heat: 80,
    seller: 'TechNova 数码专营店', dailyBase: 128, slope: -0.05,
  },

  // ---------- 母婴用品 ----------
  {
    name: '食品级硅胶婴儿围兜',
    category: '母婴用品',
    image: '/products/baby-1.png',
    price: 8.99, cost: 2.4, sales: 15800, rating: 4.8, reviews: 4100,
    listedAt: '2025-08-19', competition: 45, heat: 78,
    seller: 'BabyCare 母婴官方店', dailyBase: 120, slope: 0.4,
  },
  {
    name: '婴儿保温学饮杯 260ml',
    category: '母婴用品',
    image: '/products/baby-2.png',
    price: 13.99, cost: 4.3, sales: 12600, rating: 4.7, reviews: 3200,
    listedAt: '2025-09-29', competition: 49, heat: 75,
    seller: 'BabyCare 母婴官方店', dailyBase: 102, slope: 0.5,
  },
  {
    name: '婴儿安抚豆豆绒毯',
    category: '母婴用品',
    image: '/products/baby-1.png',
    price: 18.99, cost: 6.2, sales: 9300, rating: 4.9, reviews: 2400,
    listedAt: '2025-10-15', competition: 36, heat: 73,
    seller: 'LittleDream 婴童馆', dailyBase: 82, slope: 0.65,
  },
  {
    name: '宝宝早教叠叠乐玩具',
    category: '母婴用品',
    image: '/products/baby-2.png',
    price: 11.99, cost: 3.5, sales: 18100, rating: 4.6, reviews: 4600,
    listedAt: '2025-06-30', competition: 52, heat: 77,
    seller: 'LittleDream 婴童馆', dailyBase: 118, slope: 0.2,
  },

  // ---------- 运动户外 ----------
  {
    name: '智能计数无绳两用跳绳',
    category: '运动户外',
    image: '/products/sports-1.png',
    price: 12.99, cost: 3.8, sales: 24600, rating: 4.5, reviews: 5900,
    listedAt: '2025-07-12', competition: 57, heat: 85,
    seller: 'FitGear 运动装备店', dailyBase: 175, slope: 0.35,
  },
  {
    name: '迷你便携筋膜枪按摩器',
    category: '运动户外',
    image: '/products/sports-2.png',
    price: 29.99, cost: 11.5, sales: 21900, rating: 4.6, reviews: 5600,
    listedAt: '2025-05-28', competition: 69, heat: 82,
    seller: 'FitGear 运动装备店', dailyBase: 138, slope: -0.12,
  },
  {
    name: '运动止汗发带 3 条装',
    category: '运动户外',
    image: '/products/sports-1.png',
    price: 6.99, cost: 1.5, sales: 11400, rating: 4.3, reviews: 2500,
    listedAt: '2025-10-19', competition: 44, heat: 68,
    seller: 'FlexFit 运动服饰店', dailyBase: 96, slope: 0.3,
  },
  {
    name: '便携折叠运动水杯 750ml',
    category: '运动户外',
    image: '/products/sports-2.png',
    price: 9.99, cost: 2.8, sales: 14700, rating: 4.4, reviews: 3100,
    listedAt: '2025-09-05', competition: 53, heat: 74,
    seller: 'FitGear 运动装备店', dailyBase: 108, slope: 0.18,
  },
];

/** 生成演示商品列表（28 个） */
export function demoProducts(): Product[] {
  return RAW_PRODUCTS.map((raw, index) => {
    const { dailyBase, slope, ...base } = raw;
    return {
      ...base,
      id: `P${String(index + 1).padStart(4, '0')}`,
      dailySales: genDailySales(index + 1, dailyBase, slope),
    };
  });
}
