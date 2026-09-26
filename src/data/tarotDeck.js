// ================================================================
// 完整 78 张塔罗牌
// 22 大阿尔卡纳 + 56 小阿尔卡纳（权杖/圣杯/宝剑/钱币 × 14）
// 图片素材放在 /textures/cards/
// ================================================================

const MAJOR = [
  {
    id: 'fool', file: '00-TheFool.webp',
    nameZh: '愚者', nameEn: 'The Fool', accent: '#FFE27A',
    keywords: ['新开始', '自由', '冒险', '纯真'],
    keywordsReversed: ['鲁莽', '犹豫', '迷茫', '不成熟'],
    meaning: '纯真无畏，踏上新征程',
  },
  {
    id: 'magician', file: '01-TheMagician.webp',
    nameZh: '魔术师', nameEn: 'The Magician', accent: '#FF9AA2',
    keywords: ['行动', '创造', '技巧', '意志力'],
    keywordsReversed: ['操纵', '自欺', '潜力未发'],
    meaning: '掌握资源，心想事成',
  },
  {
    id: 'priestess', file: '02-TheHighPriestess.webp',
    nameZh: '女祭司', nameEn: 'The High Priestess', accent: '#A0B3FF',
    keywords: ['直觉', '神秘', '潜意识', '智慧'],
    keywordsReversed: ['秘密', '混乱', '脱离直觉'],
    meaning: '聆听内心，洞察真相',
  },
  {
    id: 'empress', file: '03-TheEmpress.webp',
    nameZh: '皇后', nameEn: 'The Empress', accent: '#FFC3A0',
    keywords: ['丰盛', '母性', '创造力', '自然'],
    keywordsReversed: ['依赖', '空虚', '创造阻滞'],
    meaning: '自然与滋养的力量',
  },
  {
    id: 'emperor', file: '04-TheEmperor.webp',
    nameZh: '皇帝', nameEn: 'The Emperor', accent: '#E85A4F',
    keywords: ['权威', '结构', '掌控', '父性'],
    keywordsReversed: ['专制', '僵化', '失去权力'],
    meaning: '建立秩序，稳固根基',
  },
  {
    id: 'hierophant', file: '05-TheHierophant.webp',
    nameZh: '教皇', nameEn: 'The Hierophant', accent: '#C89C74',
    keywords: ['传统', '信仰', '指引', '学习'],
    keywordsReversed: ['反叛', '教条', '质疑'],
    meaning: '遵循规范，寻求智慧',
  },
  {
    id: 'lovers', file: '06-TheLovers.webp',
    nameZh: '恋人', nameEn: 'The Lovers', accent: '#FF8AAE',
    keywords: ['爱', '选择', '结合', '和谐'],
    keywordsReversed: ['分歧', '失衡', '诱惑'],
    meaning: '情感交融，关键抉择',
  },
  {
    id: 'chariot', file: '07-TheChariot.webp',
    nameZh: '战车', nameEn: 'The Chariot', accent: '#7AD3FF',
    keywords: ['意志', '胜利', '前进', '掌控'],
    keywordsReversed: ['失控', '侵略', '停滞'],
    meaning: '以决心征服阻碍',
  },
  {
    id: 'strength', file: '08-Strength.webp',
    nameZh: '力量', nameEn: 'Strength', accent: '#F4B860',
    keywords: ['勇气', '信心', '控制', '耐心'],
    keywordsReversed: ['自卑', '怀疑', '情绪失控'],
    meaning: '以柔克刚，内在力量',
  },
  {
    id: 'hermit', file: '09-TheHermit.webp',
    nameZh: '隐士', nameEn: 'The Hermit', accent: '#9AB3A8',
    keywords: ['独处', '反思', '引导', '智慧'],
    keywordsReversed: ['孤独', '逃避', '拒绝帮助'],
    meaning: '向内求索，寻找真我',
  },
  {
    id: 'wheel', file: '10-WheelOfFortune.webp',
    nameZh: '命运之轮', nameEn: 'Wheel of Fortune', accent: '#FFB347',
    keywords: ['转机', '循环', '命运', '变化'],
    keywordsReversed: ['逆境', '失控', '坏运'],
    meaning: '风水轮流转，顺势而为',
  },
  {
    id: 'justice', file: '11-Justice.webp',
    nameZh: '正义', nameEn: 'Justice', accent: '#D4A5A5',
    keywords: ['公正', '真相', '责任', '平衡'],
    keywordsReversed: ['偏见', '不公', '逃避责任'],
    meaning: '因果分明，诚实对待',
  },
  {
    id: 'hanged', file: '12-TheHangedMan.webp',
    nameZh: '倒吊人', nameEn: 'The Hanged Man', accent: '#7FB8E0',
    keywords: ['牺牲', '新视角', '等待', '放下'],
    keywordsReversed: ['停滞', '拖延', '无谓牺牲'],
    meaning: '换个角度，柳暗花明',
  },
  {
    id: 'death', file: '13-Death.webp',
    nameZh: '死神', nameEn: 'Death', accent: '#9B8F8F',
    keywords: ['转变', '结束', '重生', '蜕变'],
    keywordsReversed: ['抗拒改变', '停滞', '恐惧'],
    meaning: '旧的结束，新的开始',
  },
  {
    id: 'temperance', file: '14-Temperance.webp',
    nameZh: '节制', nameEn: 'Temperance', accent: '#A8D8B9',
    keywords: ['平衡', '耐心', '调和', '节制'],
    keywordsReversed: ['失衡', '冲动', '过度'],
    meaning: '中庸之道，和谐共处',
  },
  {
    id: 'devil', file: '15-TheDevil.webp',
    nameZh: '恶魔', nameEn: 'The Devil', accent: '#8B4A6B',
    keywords: ['欲望', '束缚', '诱惑', '物质'],
    keywordsReversed: ['解脱', '觉醒', '挣脱束缚'],
    meaning: '直面阴影，莫被奴役',
  },
  {
    id: 'tower', file: '16-TheTower.webp',
    nameZh: '高塔', nameEn: 'The Tower', accent: '#E06666',
    keywords: ['突变', '崩塌', '启示', '觉醒'],
    keywordsReversed: ['避免灾难', '延迟改变'],
    meaning: '破而后立，真相显现',
  },
  {
    id: 'star', file: '17-TheStar.webp',
    nameZh: '星星', nameEn: 'The Star', accent: '#8FC9E8',
    keywords: ['希望', '灵感', '宁静', '信念'],
    keywordsReversed: ['失望', '沮丧', '信心不足'],
    meaning: '黑夜中的指引之光',
  },
  {
    id: 'moon', file: '18-TheMoon.webp',
    nameZh: '月亮', nameEn: 'The Moon', accent: '#C5B4E3',
    keywords: ['幻觉', '潜意识', '不安', '直觉'],
    keywordsReversed: ['释放恐惧', '真相浮现'],
    meaning: '直觉与幻象并存',
  },
  {
    id: 'sun', file: '19-TheSun.webp',
    nameZh: '太阳', nameEn: 'The Sun', accent: '#FFD93D',
    keywords: ['喜悦', '成功', '活力', '光明'],
    keywordsReversed: ['暂时挫折', '过度乐观'],
    meaning: '光明在前，万事顺遂',
  },
  {
    id: 'judgement', file: '20-Judgement.webp',
    nameZh: '审判', nameEn: 'Judgement', accent: '#DDB1E8',
    keywords: ['觉醒', '重生', '呼唤', '宽恕'],
    keywordsReversed: ['自我怀疑', '逃避审视'],
    meaning: '回首过往，迎接新生',
  },
  {
    id: 'world', file: '21-TheWorld.webp',
    nameZh: '世界', nameEn: 'The World', accent: '#7FCDBB',
    keywords: ['完成', '圆满', '成就', '整合'],
    keywordsReversed: ['未尽', '缺失', '延迟完成'],
    meaning: '圆满完成，迈向新篇',
  },
];

// ==================== 小阿尔卡纳构造辅助 ====================
// 文件命名：Wands01-14, Cups01-14, Swords01-14, Pentacles01-14
// 编号 01 = Ace, 02-10 = 数字牌, 11 = Page侍从, 12 = Knight骑士, 13 = Queen王后, 14 = King国王
const SUITS = [
  {
    key: 'wands', nameZh: '权杖', nameEn: 'Wands',
    accent: '#E85A3C', element: '火',
  },
  {
    key: 'cups', nameZh: '圣杯', nameEn: 'Cups',
    accent: '#4A90E2', element: '水',
  },
  {
    key: 'swords', nameZh: '宝剑', nameEn: 'Swords',
    accent: '#9AA8B8', element: '风',
  },
  {
    key: 'pentacles', nameZh: '钱币', nameEn: 'Pentacles',
    accent: '#C89947', element: '土',
  },
];

// 每张小牌的正逆位关键词（按数字 1-14 组织）
// 参考塔罗传统释义，各花色的核心含义模式
const MINOR_MEANINGS = {
  wands: [
    { zh: 'Ace', k: ['灵感', '创造', '动力', '新机遇'], kr: ['延误', '缺乏动力', '犹豫'], m: '创造的火花，新的可能性' },
    { zh: 'Two', k: ['规划', '抉择', '个人力量'], kr: ['恐惧未知', '计划受阻'], m: '权衡道路，展望未来' },
    { zh: 'Three', k: ['扩展', '远见', '海外机会'], kr: ['延误', '短视', '受挫'], m: '蓝图展开，视野开阔' },
    { zh: 'Four', k: ['庆祝', '和谐', '家的归属'], kr: ['动荡', '冲突', '不稳'], m: '欢庆时刻，稳固根基' },
    { zh: 'Five', k: ['竞争', '冲突', '挑战'], kr: ['化解冲突', '妥协'], m: '短兵相接，良性竞争' },
    { zh: 'Six', k: ['胜利', '认可', '公众赞誉'], kr: ['短暂成功', '自负'], m: '凯旋归来，众望所归' },
    { zh: 'Seven', k: ['防守', '坚持立场', '挑战'], kr: ['退让', '被压垮'], m: '站稳立场，迎击挑战' },
    { zh: 'Eight', k: ['迅速', '行动', '消息到来'], kr: ['延迟', '内在阻滞'], m: '事件加速，变动迅捷' },
    { zh: 'Nine', k: ['韧性', '坚持', '防备'], kr: ['精疲力竭', '偏执'], m: '最后关头，坚守信念' },
    { zh: 'Ten', k: ['重担', '责任', '压力'], kr: ['放下重担', '委托'], m: '肩负重任，负重前行' },
    { zh: '侍从', k: ['好奇', '探索', '新消息'], kr: ['三心二意', '拖延'], m: '年轻的热情与探索欲' },
    { zh: '骑士', k: ['行动', '冲劲', '冒险'], kr: ['鲁莽', '挫败'], m: '风风火火，勇往直前' },
    { zh: '王后', k: ['自信', '魅力', '热情'], kr: ['嫉妒', '报复'], m: '充满魅力的领导者' },
    { zh: '国王', k: ['领导力', '远见', '果敢'], kr: ['专横', '冲动'], m: '成熟的领袖，胸怀壮志' },
  ],
  cups: [
    { zh: 'Ace', k: ['新情感', '灵性觉醒', '直觉'], kr: ['情感阻塞', '空虚'], m: '心的泉源涌出' },
    { zh: 'Two', k: ['联结', '伙伴关系', '互惠'], kr: ['失衡', '分歧'], m: '两颗心的共鸣' },
    { zh: 'Three', k: ['庆祝', '友谊', '社群'], kr: ['过度放纵', '孤立'], m: '欢聚一堂的喜悦' },
    { zh: 'Four', k: ['冥想', '冷淡', '重新审视'], kr: ['觉醒', '接受邀请'], m: '暂停当下，反观内心' },
    { zh: 'Five', k: ['失落', '遗憾', '哀伤'], kr: ['接受', '原谅'], m: '关注仍存的美好' },
    { zh: 'Six', k: ['怀旧', '童真', '旧友'], kr: ['沉溺过去', '向前'], m: '纯真的回响' },
    { zh: 'Seven', k: ['幻想', '选择', '机遇'], kr: ['清晰', '抉择'], m: '梦境纷纭，需辨真伪' },
    { zh: 'Eight', k: ['放下', '寻觅', '超越'], kr: ['停滞', '恐惧改变'], m: '告别，踏上精神之旅' },
    { zh: 'Nine', k: ['满足', '愿望达成', '感恩'], kr: ['不满', '物质主义'], m: '心愿得偿' },
    { zh: 'Ten', k: ['和睦', '家庭幸福', '圆满'], kr: ['家庭矛盾', '价值错位'], m: '情感的圆满归宿' },
    { zh: '侍从', k: ['创意', '惊喜', '讯息'], kr: ['情绪化', '不成熟'], m: '温柔敏感的心灵' },
    { zh: '骑士', k: ['浪漫', '理想主义', '追求'], kr: ['情感游戏', '不切实际'], m: '诗意的追寻者' },
    { zh: '王后', k: ['同理心', '温柔', '直觉'], kr: ['情绪失控', '过度依赖'], m: '温柔慈爱的力量' },
    { zh: '国王', k: ['沉稳', '情感成熟', '包容'], kr: ['压抑情感', '阴郁'], m: '内心深沉的智者' },
  ],
  swords: [
    { zh: 'Ace', k: ['清晰', '突破', '真理'], kr: ['混乱', '缺乏方向'], m: '思想之剑劈开迷雾' },
    { zh: 'Two', k: ['抉择僵局', '权衡', '平衡'], kr: ['犹豫已久', '释放'], m: '两难之中，需做决定' },
    { zh: 'Three', k: ['伤心', '背叛', '释放痛苦'], kr: ['愈合', '原谅自己'], m: '承认伤痛，方能疗愈' },
    { zh: 'Four', k: ['休息', '沉思', '恢复'], kr: ['倦怠', '被迫休息'], m: '静默中重整旗鼓' },
    { zh: 'Five', k: ['冲突', '失败', '不义之胜'], kr: ['和解', '放下宿怨'], m: '赢了战斗，输了人心' },
    { zh: 'Six', k: ['过渡', '远行', '转变'], kr: ['滞留', '未完之事'], m: '从动荡驶向平静' },
    { zh: 'Seven', k: ['策略', '欺瞒', '取巧'], kr: ['坦诚', '揭露真相'], m: '暗中行事，需防反噬' },
    { zh: 'Eight', k: ['自我束缚', '受限', '无力感'], kr: ['觉醒', '挣脱'], m: '束缚皆自心造' },
    { zh: 'Nine', k: ['焦虑', '失眠', '噩梦'], kr: ['走出阴霾', '寻求帮助'], m: '内心的恐惧最伤人' },
    { zh: 'Ten', k: ['终局', '谷底', '释然'], kr: ['复苏', '重生'], m: '到了谷底，只能向上' },
    { zh: '侍从', k: ['好学', '警觉', '直言'], kr: ['多疑', '口舌之争'], m: '敏锐的观察者' },
    { zh: '骑士', k: ['果断', '雄辩', '急进'], kr: ['鲁莽', '独断'], m: '一往无前的斗士' },
    { zh: '王后', k: ['独立', '理性', '锐利'], kr: ['冷酷', '苛刻'], m: '清明如镜的智者' },
    { zh: '国王', k: ['权威', '公正', '洞见'], kr: ['专制', '冷漠'], m: '智慧与律法的化身' },
  ],
  pentacles: [
    { zh: 'Ace', k: ['机会', '财富萌芽', '稳固'], kr: ['错失', '规划不周'], m: '现实世界的种子' },
    { zh: 'Two', k: ['平衡', '多任务', '适应'], kr: ['失衡', '焦头烂额'], m: '在变化中保持平衡' },
    { zh: 'Three', k: ['协作', '技艺', '认可'], kr: ['不和', '质量欠佳'], m: '匠心协作的成果' },
    { zh: 'Four', k: ['保守', '掌控', '储蓄'], kr: ['放手', '慷慨'], m: '把握在手，但勿执着' },
    { zh: 'Five', k: ['匮乏', '困境', '孤立'], kr: ['复苏', '接受帮助'], m: '困顿中仍有微光' },
    { zh: 'Six', k: ['分享', '慷慨', '平衡施受'], kr: ['贪婪', '附加条件'], m: '取予之间的流动' },
    { zh: 'Seven', k: ['耐心', '评估', '长期投资'], kr: ['短视', '放弃太早'], m: '播种与等待' },
    { zh: 'Eight', k: ['勤勉', '专注', '技艺精进'], kr: ['敷衍', '质量低下'], m: '日复一日的磨砺' },
    { zh: 'Nine', k: ['独立', '丰盛', '自我成就'], kr: ['依赖', '表面繁华'], m: '自力更生的优雅' },
    { zh: 'Ten', k: ['传承', '家族', '长久富足'], kr: ['财务不稳', '家族矛盾'], m: '根基深厚的繁荣' },
    { zh: '侍从', k: ['学习', '脚踏实地', '新机遇'], kr: ['懒散', '不切实际'], m: '勤勉的学徒' },
    { zh: '骑士', k: ['勤劳', '稳健', '可靠'], kr: ['刻板', '停滞'], m: '默默耕耘的守护者' },
    { zh: '王后', k: ['滋养', '务实', '富足'], kr: ['物质主义', '忽视自我'], m: '土壤般的丰饶母亲' },
    { zh: '国王', k: ['成功', '安全感', '事业有成'], kr: ['贪婪', '死板'], m: '物质世界的王者' },
  ],
};

// 生成小牌
function buildMinor() {
  const out = [];
  for (const suit of SUITS) {
    const meanings = MINOR_MEANINGS[suit.key];
    for (let i = 0; i < 14; i++) {
      const num = i + 1;
      const m = meanings[i];
      // 文件名：Wands01.jpg ~ Wands14.jpg（首字母大写）
      const cap = suit.key.charAt(0).toUpperCase() + suit.key.slice(1);
      const file = `${cap}${String(num).padStart(2, '0')}.webp`;

      // 中文名
      let numZh;
      if (num === 1) numZh = 'Ace';
      else if (num <= 10) numZh = String(num);
      else numZh = m.zh; // 侍从/骑士/王后/国王

      const nameZh =
        num === 1
          ? `${suit.nameZh}一`
          : num <= 10
          ? `${suit.nameZh}${['二', '三', '四', '五', '六', '七', '八', '九', '十'][num - 2]}`
          : `${suit.nameZh}${m.zh}`;

      const nameEn =
        num === 1
          ? `Ace of ${suit.nameEn}`
          : num <= 10
          ? `${['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][num - 2]} of ${suit.nameEn}`
          : `${['Page', 'Knight', 'Queen', 'King'][num - 11]} of ${suit.nameEn}`;

      out.push({
        id: `${suit.key}-${num}`,
        file,
        nameZh,
        nameEn,
        accent: suit.accent,
        suit: suit.key,
        element: suit.element,
        keywords: m.k,
        keywordsReversed: m.kr,
        meaning: m.m,
      });
    }
  }
  return out;
}

// ==================== 导出 ====================
export const TAROT_DECK = [...MAJOR, ...buildMinor()];

// 获取卡牌图片的公开 URL
export function getCardImageUrl(tarot) {
  if (!tarot || !tarot.file) return '/textures/card-back.jpg';
  return `/textures/cards/${tarot.file}`;
}

export const CARD_BACK_URL = '/textures/card-back.jpg';
