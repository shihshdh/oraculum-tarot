// 把提示词、牌义等共享数据导出给 Beam 上的 Python 后端，保证两套后端说的话一字不差。
// 用法：node scripts/export-shared.mjs   （修改 server/prompts.js 或牌义后重新运行）
import fs from 'node:fs';
import { TAROT_DECK } from '../src/data/tarotDeck.js';
import { READER_SYSTEM, COMPANION_SYSTEM, PAGES, NAV_TARGETS, POSITIONS, MOODS, readingRequest, describeSpread } from '../server/prompts.js';

// 用占位符生成解读请求模板，Python 端只做替换
const fake = TAROT_DECK.slice(0, 5).map((tarot) => ({ tarot, reversed: false }));
const template = readingRequest('{{QUESTION}}', fake).replace(describeSpread(fake), '{{SPREAD}}');
if (!template.includes('{{SPREAD}}')) throw new Error('模板里没找到牌阵描述');
// 顺便导出一份牌阵描述样例，供 Python 端测试格式是否一致
const spreadSample = describeSpread(fake);
const shared = {
  readerSystem: READER_SYSTEM,
  companionSystem: COMPANION_SYSTEM,
  readingTemplate: template,
  spreadSample,
  spreadSampleIds: fake.map((c) => c.tarot.id),
  pages: PAGES,
  navTargets: NAV_TARGETS,
  positions: POSITIONS,
  moods: MOODS,
  deck: TAROT_DECK.map(({ id, nameZh, nameEn, keywords, keywordsReversed, meaning }) => ({ id, nameZh, nameEn, keywords, keywordsReversed, meaning })),
};
fs.writeFileSync(new URL('../backend/beam/shared.json', import.meta.url), JSON.stringify(shared, null, 1));
console.log('backend/beam/shared.json:', shared.deck.length, 'cards');
