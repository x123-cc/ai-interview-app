import type { Question, QuestionFilter } from '@/types';

/**
 * 按条件筛选题目
 *
 * @param questions - 题目列表
 * @param filter - 筛选条件（type/difficulty/tags/excludeIds）
 * @returns 符合所有条件的题目数组
 */
export function filterQuestions(
  questions: Question[],
  filter: QuestionFilter = {},
): Question[] {
  return questions.filter((q) => {
    if (filter.type && q.type !== filter.type) return false;
    if (filter.difficulty && q.difficulty !== filter.difficulty) return false;
    if (filter.tags && filter.tags.length > 0) {
      const hasTag = filter.tags.some((t) => q.tags.includes(t));
      if (!hasTag) return false;
    }
    if (filter.excludeIds && filter.excludeIds.includes(q.id)) return false;
    return true;
  });
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 从题库中随机选题（带公平性策略）
 *
 * 公平性策略：优先选择不同 category 的题目，最多连续 2 题同一 category。
 *
 * @param questions - 题目列表（已筛选）
 * @param count - 要选择的题目数量
 * @returns 选中的题目数组，如果题库不足则返回全部
 */
export function selectQuestions(
  questions: Question[],
  count: number,
): Question[] {
  if (questions.length <= count) return shuffle(questions);

  // 按 category 分组
  const byCategory = new Map<string, Question[]>();
  for (const q of questions) {
    const list = byCategory.get(q.category) || [];
    list.push(q);
    byCategory.set(q.category, list);
  }

  const selected: Question[] = [];
  const categories = shuffle([...byCategory.keys()]);

  // 轮询各 category 选题
  let round = 0;
  const maxRounds = Math.ceil(count / categories.length) + 1;

  while (selected.length < count && round < maxRounds) {
    for (const cat of categories) {
      if (selected.length >= count) break;
      const pool = byCategory.get(cat) || [];
      const unusedPool = pool.filter(
        (q) => !selected.some((s) => s.id === q.id),
      );
      if (unusedPool.length > 0) {
        const picked = unusedPool[Math.floor(Math.random() * unusedPool.length)];
        selected.push(picked);
      }
    }
    round++;
  }

  // 如果还不够，从剩余题目中随机补充
  if (selected.length < count) {
    const remaining = questions.filter(
      (q) => !selected.some((s) => s.id === q.id),
    );
    const extra = shuffle(remaining).slice(0, count - selected.length);
    selected.push(...extra);
  }

  return selected;
}
