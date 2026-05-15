"use client";

type LineChartProps = {
  data: { label: string; value: number }[];
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
};

export function LineChart({
  data,
  height = 200,
  valuePrefix = "",
  valueSuffix = "",
  color = "rgb(59, 130, 246)",
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 dark:text-gray-500"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 100;
  const padding = { top: 20, bottom: 30, left: 0, right: 0 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
    y: padding.top + chartHeight - ((d.value - min) / range) * chartHeight,
  }));

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - ratio)}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight * (1 - ratio)}
            stroke="currentColor"
            className="text-gray-200 dark:text-gray-700"
            strokeWidth="0.2"
          />
        ))}

        <path d={areaD} fill="url(#chartGradient)" />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1"
            fill="white"
            stroke={color}
            strokeWidth="0.4"
          />
        ))}
      </svg>

      <div className="flex justify-between mt-1">
        {data.map((d, i) => (
          <span
            key={i}
            className="text-[10px] text-gray-500 dark:text-gray-400"
          >
            {i % Math.ceil(data.length / 6) === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

type BarChartProps = {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  maxBars?: number;
};

export function BarChart({ data, height = 150, maxBars = 12 }: BarChartProps) {
  const displayData = data.slice(0, maxBars);

  if (displayData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 dark:text-gray-500"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...displayData.map((d) => d.value)) || 1;

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {displayData.map((d, i) => {
        const barHeight = (d.value / maxValue) * (height - 30);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {d.value}
            </span>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: barHeight,
                backgroundColor: d.color || "rgb(59, 130, 246)",
              }}
            />
            <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type DonutChartProps = {
  data: { label: string; value: number; color: string }[];
  size?: number;
};

export function DonutChart({ data, size = 120 }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 dark:text-gray-500"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {data.map((d, i) => {
          const percent = (d.value / total) * 100;
          const dashArray = `${(percent / 100) * circumference} ${circumference}`;
          const rotation = (cumulativePercent / 100) * 360 - 90;
          cumulativePercent += percent;

          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="15"
              strokeDasharray={dashArray}
              transform={`rotate(${rotation} 50 50)`}
              className="transition-all"
            />
          );
        })}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-900 dark:fill-white text-[16px] font-bold"
        >
          {total}
        </text>
      </svg>

      <div className="flex flex-col gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {d.label}: {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
