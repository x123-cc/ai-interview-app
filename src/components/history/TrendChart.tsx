export interface TrendChartProps {
  scores: number[];
  width?: number;
  height?: number;
}

/**
 * SVG 折线图组件 - 展示评分趋势
 *
 * 零外部依赖，纯 SVG 手绘。
 */
export default function TrendChart({
  scores,
  width = 400,
  height = 120,
}: TrendChartProps) {
  if (scores.length < 2)
    return (
      <p className="text-sm text-gray-400">至少需要 2 次面试数据才能展示趋势</p>
    );

  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxScore = 10;
  const minScore = 0;

  const points = scores.map((s, i) => ({
    x: padding.left + (i / Math.max(1, scores.length - 1)) * chartW,
    y: padding.top + chartH - ((s - minScore) / (maxScore - minScore)) * chartH,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const trend = scores[scores.length - 1] >= scores[0] ? '#22c55e' : '#ef4444';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="评分趋势图"
    >
      {/* Y 轴标签 */}
      <text x={5} y={padding.top + 4} className="fill-gray-400 text-[8px]">
        10
      </text>
      <text
        x={5}
        y={padding.top + chartH / 2 + 4}
        className="fill-gray-400 text-[8px]"
      >
        5
      </text>
      <text x={5} y={height - 2} className="fill-gray-400 text-[8px]">
        0
      </text>

      {/* 网格线 */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={width - padding.right}
        y2={padding.top}
        stroke="#e5e7eb"
        strokeWidth="0.5"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartH / 2}
        x2={width - padding.right}
        y2={padding.top + chartH / 2}
        stroke="#e5e7eb"
        strokeWidth="0.5"
      />

      {/* 趋势线 */}
      <path
        d={pathD}
        fill="none"
        stroke={trend}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="3"
            fill="white"
            stroke={trend}
            strokeWidth="2"
          />
          <text
            x={p.x}
            y={height - 4}
            textAnchor="middle"
            className="fill-gray-400 text-[7px]"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
