const fs = require('fs');
const path = require('path');

const dir = './data/tournaments';

// 分级方案
const priorityMap = {
  // 4级
  '4-digit-osumania-world-cup-2023.json': 4,
  'osumania-ln-tournament-4.json': 4,
  'asia-suiji-cup-2025.json': 4,
  'touhou-project-mania-cup-4th.json': 4,

  // 3.5级
  'piano-tiles-chinese-tournament-6.json': 3.5,
  'gb-cup-2025-spring-ex.json': 3.5,
  'gb-cup-2025-autumn.json': 3.5,

  // 3级
  'china-lan-2025-mania.json': 3,
  'osumania-chilean-tournament-4k-2026.json': 3,
  'the-third-impact.json': 3,
  'jack-house-cup-2025.json': 3,

  // 2.5级
  'roasted-duck-cup-2025.json': 2.5,
  'newcomers-mania-world-cup-2025.json': 2.5,
  'china-university-cup-4k-2026.json': 2.5,

  // 2级
  'hlc-season3.json': 2,
  'korean-extraterrestrials-tournament-2.json': 2,
  'po-fang-cup-s3.json': 2,
  'gbc-2025-spring-A-and-B.json': 2,
  'gbc2025sex.json': 2,
};

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let updated = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (priorityMap.hasOwnProperty(file)) {
    const newPriority = priorityMap[file];
    if (data.priority !== newPriority) {
      data.priority = newPriority;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      console.log(`✓ ${data.name}: ${data.priority || '未设置'} → ${newPriority}`);
      updated++;
    } else {
      console.log(`= ${data.name}: 已是 ${newPriority}`);
    }
  }
}

console.log(`\n共更新 ${updated} 个比赛的 priority`);
