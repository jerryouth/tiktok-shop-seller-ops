// 主图工作台共享类型（纯类型定义，前后端通用，禁止引入服务端 SDK）

/** 主图结构元素类型 */
export type ElementType = 'product' | 'background' | 'prop' | 'text' | 'badge' | 'decor';

/** 单个结构元素 */
export interface ImageElement {
  id: string;
  type: ElementType;
  /** 元素名称，如「产品主体」「促销角标」 */
  name: string;
  /** 视觉描述；text 类型为具体文案 */
  description: string;
  /** [x, y, w, h]，0-1 归一化，x/y 为左上角 */
  bbox: [number, number, number, number];
  /** 营销作用说明 */
  role: string;
}

/** AI 解析出的主图完整结构 */
export interface ImageStructure {
  productName: string;
  composition: string;
  style: string;
  elements: ImageElement[];
}

/** AI 联想的使用场景（从卖点发散，传达温度与理念，驱动场景化图生图） */
export interface SceneSuggestion {
  id: string;
  /** 场景短名，如「晨间通勤」 */
  name: string;
  /** 发散源头的产品卖点，如「12小时持妆」 */
  sellingPoint: string;
  /** 画面传达的情绪与理念，如「通勤路上的从容自信」 */
  emotion: string;
  /** 具体画面描述：环境/光线/道具/氛围/人物状态 */
  scene: string;
}

/** 生成结果 */
export interface RemixResult {
  url: string;
  variant: string;
  /** 结果副标题（场景模式为「卖点 · 情绪」，多角度模式为来源场景名） */
  note?: string;
  /** 来源场景 id（场景模式下有值，用于多角度衍生时找回场景） */
  sceneId?: string;
}

/** 元素类型元数据（标签 + 标记色，与 DESIGN.md 图表色板一致） */
export const TYPE_META: Record<ElementType, { label: string; color: string }> = {
  product: { label: '产品主体', color: '#FE2C55' },
  background: { label: '背景', color: '#00B8B0' },
  prop: { label: '道具', color: '#6366F1' },
  text: { label: '文字卖点', color: '#F59E0B' },
  badge: { label: '角标', color: '#8B5CF6' },
  decor: { label: '装饰', color: '#94A3B8' },
};

export const ELEMENT_TYPES = Object.keys(TYPE_META) as ElementType[];
