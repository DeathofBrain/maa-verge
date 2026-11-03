/** 验证官方姓名精确匹配与有限标点纠正，禁止模糊名、未知名和语言映射猜测。 */
import { expect, test } from 'bun:test';
import { resolveOperatorName, type AtomicResourceProfile } from '@maaverge/automation';

const profile: AtomicResourceProfile = {
  id: 'synthetic-name-dictionary',
  clientType: 'Official',
  available: true,
  diagnostics: [],
  rules: {},
  actions: {},
  card: null,
  sources: [],
  operatorNames: {
    names: ['甲', '甲乙', 'Lancet-2'],
    source: {
      repository: 'synthetic',
      ref: 'test',
      path: 'battle_data.json',
      sha256: '0'.repeat(64),
    },
  },
};

test('exact official names preserve their raw OCR and verify without correction', () => {
  expect(resolveOperatorName(profile, '甲乙')).toEqual({
    name: '甲乙',
    rawName: '甲乙',
    nameVerified: true,
  });
});

for (const rawName of ['、甲', '，甲。', '.甲,'])
  test(`bounded edge punctuation ${rawName} is corrected only to an exact official name`, () => {
    expect(resolveOperatorName(profile, rawName)).toEqual({
      name: '甲',
      rawName,
      nameVerified: true,
    });
  });

for (const rawName of ['、甲丙', '甲、乙', '[甲]', 'lancet-2', '甲 乙'])
  test(`unknown or nonexact OCR ${rawName} is preserved rather than completed`, () => {
    expect(resolveOperatorName(profile, rawName)).toEqual({
      name: rawName,
      rawName,
      nameVerified: false,
    });
  });

test('an exact official name takes priority over stripping its punctuation', () => {
  const exact = { ...profile, operatorNames: { ...profile.operatorNames!, names: ['、甲', '甲'] } };
  expect(resolveOperatorName(exact, '、甲')).toEqual({
    name: '、甲',
    rawName: '、甲',
    nameVerified: true,
  });
});

test('client language and a current dictionary are prerequisites for verified names', () => {
  expect(resolveOperatorName({ ...profile, clientType: 'YoStarEN' }, '甲').nameVerified).toBe(
    false,
  );
  expect(resolveOperatorName({ ...profile, operatorNames: undefined }, '甲').nameVerified).toBe(
    false,
  );
  expect(resolveOperatorName({ ...profile, clientType: 'Bilibili' }, '甲').nameVerified).toBe(true);
});
