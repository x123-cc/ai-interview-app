import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuestionType, QuestionDifficulty } from '@/types';
import { INTERVIEW_TYPE_LABELS } from '@/config/prompts';

const TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  technical: '考察算法、系统设计、编程能力等技术素养',
  behavioral: '考察领导力、团队协作、沟通表达等软技能',
  case: '考察商业分析、结构化思维和问题解决能力',
};

export default function HomePage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<QuestionType>('technical');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('medium');
  const [questionCount, setQuestionCount] = useState(5);

  const types: QuestionType[] = ['technical', 'behavioral', 'case'];
  const difficulties: QuestionDifficulty[] = ['easy', 'medium', 'hard'];

  const handleStart = () => {
    navigate('/interview', {
      state: { type: selectedType, difficulty, questionCount },
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-semibold text-gray-900">AI 模拟面试</h1>
        <p className="mt-4 text-lg text-gray-600">
          通过摄像头和麦克风与 AI 面试官实时对话，模拟真实面试场景。
        </p>
      </div>

      {/* 面试类型选择 */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-gray-800">选择面试类型</h2>
        <div className="grid grid-cols-3 gap-4">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                selectedType === type
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-lg font-semibold text-gray-900">
                {INTERVIEW_TYPE_LABELS[type]}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {TYPE_DESCRIPTIONS[type]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 难度选择 */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-gray-800">难度等级</h2>
        <div className="flex gap-3">
          {difficulties.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
                difficulty === d
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {d === 'easy' ? '初级' : d === 'medium' ? '中级' : '高级'}
            </button>
          ))}
        </div>
      </div>

      {/* 题目数量 */}
      <div className="mb-10">
        <h2 className="mb-4 text-lg font-medium text-gray-800">题目数量</h2>
        <div className="flex gap-3">
          {[3, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => setQuestionCount(n)}
              className={`rounded-lg px-6 py-2 text-sm font-medium transition-colors ${
                questionCount === n
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {n} 题
            </button>
          ))}
        </div>
      </div>

      {/* 开始按钮 */}
      <div className="text-center">
        <button
          onClick={handleStart}
          className="rounded-lg bg-blue-600 px-10 py-3 text-lg font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
        >
          开始面试
        </button>
      </div>
    </div>
  );
}
