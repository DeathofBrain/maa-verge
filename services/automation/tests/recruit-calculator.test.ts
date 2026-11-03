/** 计算测试覆盖候选边界和稀有标签保护所依赖的确定性数据，不断言任何外观。 */
import { expect, test } from 'bun:test';
import { calculateRecruitment } from '#custom/recruit/calculator';
const tags = ['高级资深干员', '输出', '近战位', '先锋干员', '费用回复'];
const data = {
  tags,
  operators: [
    { id: '3', name: '三星', rarity: 3, tags: ['先锋干员', '近战位', '费用回复'] },
    { id: '4', name: '四星', rarity: 4, tags: ['输出', '先锋干员', '近战位'] },
    {
      id: '6',
      name: '六星',
      rarity: 6,
      tags: ['高级资深干员', '输出', '近战位', '先锋干员', '费用回复'],
    },
  ],
};
test('recruitment includes six-star candidates only with the senior tag and ranks guarantees first', () => {
  const combinations = calculateRecruitment(tags, data);
  expect(combinations[0]).toMatchObject({ minimum: 6, tags: ['高级资深干员'] });
  expect(
    combinations
      .filter((value) => !value.tags.includes('高级资深干员'))
      .every((value) => value.maximum <= 4),
  ).toBe(true);
  expect(
    combinations.find((value) => value.tags.length === 1 && value.tags[0] === '输出'),
  ).toMatchObject({ minimum: 4, maximum: 4 });
});
test('incomplete, duplicate or unknown recruitment tags never produce a candidate selection', () => {
  expect(calculateRecruitment(tags.slice(1), data)).toEqual([]);
  expect(calculateRecruitment([...tags.slice(1), '输出'], data)).toEqual([]);
  expect(calculateRecruitment([...tags.slice(1), '未知标签'], data)).toEqual([]);
});
