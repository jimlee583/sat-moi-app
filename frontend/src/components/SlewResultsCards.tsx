import type { SlewComputeResponse, SlewCurvePoint } from "../types/slew";

interface Props {
  result: SlewComputeResponse;
}

export default function SlewResultsCards({ result }: Props) {
  const regimeLabel = REGIME_LABEL[result.regime];

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.cardLabel}>Slew time</div>
        <div style={styles.bigNumberRow}>
          <div style={styles.bigNumber}>{fmtTime(result.slew_time_s)}</div>
          <div
            style={{
              ...styles.regimePill,
              background: REGIME_BG[result.regime],
              color: REGIME_FG[result.regime],
            }}
          >
            {regimeLabel}
          </div>
        </div>

        <table style={styles.kvTable}>
          <tbody>
            <Row
              label="Slew angle θ"
              value={`${fmt4(result.slew_angle_deg)}°`}
            />
            <Row
              label="Eigenaxis ê (body)"
              value={`(${fmt4(result.eigenaxis_unit[0])}, ${fmt4(result.eigenaxis_unit[1])}, ${fmt4(result.eigenaxis_unit[2])})`}
              mono
            />
            <Row
              label="Effective inertia ê·I·ê"
              value={`${fmt4(result.effective_inertia_kgm2)} kg·m²`}
            />
            <Row
              label="Axis torque capability"
              value={`${fmt4(result.axis_max_torque_nm)} N·m`}
            />
            <Row
              label="Axis momentum capability"
              value={`${fmt4(result.axis_max_momentum_nms)} N·m·s`}
            />
            <Row
              label="Crossover angle"
              value={`${fmt4(result.crossover_angle_deg)}°`}
              hint="Above this slew angle the wheels saturate at h and the profile becomes trapezoidal."
            />
            <Row
              label="Peak body rate ω̂"
              value={`${fmt4(result.peak_rate_deg_s)}°/s`}
            />
          </tbody>
        </table>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>Slew time vs. slew angle</div>
        <SlewCurveChart result={result} />
        <div style={styles.legend}>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendSwatch, background: COLOR_TQ }} />
            Torque-limited (triangular)
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendSwatch, background: COLOR_MO }} />
            Momentum-limited (trapezoidal)
          </span>
          <span style={styles.legendItem}>
            <span
              style={{
                ...styles.legendSwatch,
                background: "#212529",
                width: "12px",
                height: "2px",
                borderRadius: 0,
                marginTop: "5px",
              }}
            />
            Your maneuver
          </span>
        </div>
      </div>

      <div style={styles.disclaimer}>
        <strong>v1 caveats.</strong> This calculation assumes a perfectly rigid SV
        with the actuator array and inertia tensor in the same body frame. It
        ignores controller settling time (typically 5–30 s of additional
        deadband convergence), gyroscopic coupling between body rates and
        stored wheel momentum, flexible-body modes excited by the slew (which
        force you to slow the profile down), and disturbance torques. Treat
        the reported time as an <em>open-loop, rigid-body lower bound</em>.
        Wheel allocation uses the Moore–Penrose pseudoinverse; per-axis
        capability along arbitrary directions can be slightly conservative
        compared with an exact LP allocation.
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <tr>
      <th style={styles.kvLabel}>{label}</th>
      <td style={mono ? styles.kvValueMono : styles.kvValue}>
        {value}
        {hint && <div style={styles.hint}>{hint}</div>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SVG line chart for the time-vs-angle curve
// ---------------------------------------------------------------------------

function SlewCurveChart({ result }: { result: SlewComputeResponse }) {
  const W = 520;
  const H = 240;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const finitePoints = result.curve.filter((p) => Number.isFinite(p.slew_time_s));
  if (finitePoints.length < 2) {
    return (
      <div style={styles.emptyPlot}>
        Not enough finite data to plot — capability is likely zero along this axis.
      </div>
    );
  }

  const xMax = finitePoints[finitePoints.length - 1].angle_deg;
  const yMax = Math.max(...finitePoints.map((p) => p.slew_time_s));
  const yPlotMax = yMax > 0 ? yMax * 1.05 : 1;

  const xScale = (deg: number) => padL + (deg / xMax) * innerW;
  const yScale = (s: number) => padT + innerH - (s / yPlotMax) * innerH;

  // Split the polyline so torque- and momentum-limited segments can be drawn
  // in different colours.  We linearly interpolate the colour change at the
  // exact crossover angle so the join is visually clean.
  const segments = splitByRegime(result.curve, result.crossover_angle_deg);

  const xTicks = niceTicks(0, xMax, 6);
  const yTicks = niceTicks(0, yPlotMax, 5);

  const slewX = xScale(result.slew_angle_deg);
  const slewY = Number.isFinite(result.slew_time_s)
    ? yScale(result.slew_time_s)
    : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="Slew time vs angle"
    >
      {/* Axes */}
      <line
        x1={padL}
        y1={padT + innerH}
        x2={padL + innerW}
        y2={padT + innerH}
        stroke="#adb5bd"
      />
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#adb5bd" />

      {/* Y gridlines + labels */}
      {yTicks.map((t, i) => (
        <g key={`y-${i}`}>
          <line
            x1={padL}
            y1={yScale(t)}
            x2={padL + innerW}
            y2={yScale(t)}
            stroke="#e9ecef"
          />
          <text
            x={padL - 6}
            y={yScale(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="#6c757d"
          >
            {fmtTickTime(t)}
          </text>
        </g>
      ))}

      {/* X tick labels */}
      {xTicks.map((t, i) => (
        <g key={`x-${i}`}>
          <line
            x1={xScale(t)}
            y1={padT + innerH}
            x2={xScale(t)}
            y2={padT + innerH + 3}
            stroke="#adb5bd"
          />
          <text
            x={xScale(t)}
            y={padT + innerH + 14}
            textAnchor="middle"
            fontSize="10"
            fill="#6c757d"
          >
            {`${Math.round(t)}°`}
          </text>
        </g>
      ))}

      {/* Axis titles */}
      <text
        x={padL + innerW / 2}
        y={H - 4}
        textAnchor="middle"
        fontSize="11"
        fill="#495057"
      >
        Slew angle (deg)
      </text>
      <text
        x={12}
        y={padT + innerH / 2}
        textAnchor="middle"
        fontSize="11"
        fill="#495057"
        transform={`rotate(-90 12 ${padT + innerH / 2})`}
      >
        Slew time (s)
      </text>

      {/* Curve segments */}
      {segments.map((seg, i) => (
        <polyline
          key={`seg-${i}`}
          points={seg.points
            .map((p) => `${xScale(p.angle_deg)},${yScale(p.slew_time_s)}`)
            .join(" ")}
          fill="none"
          stroke={seg.regime === "torque_limited" ? COLOR_TQ : COLOR_MO}
          strokeWidth={2}
        />
      ))}

      {/* Crossover marker */}
      {result.crossover_angle_deg > 0 &&
        result.crossover_angle_deg < xMax && (
          <g>
            <line
              x1={xScale(result.crossover_angle_deg)}
              y1={padT}
              x2={xScale(result.crossover_angle_deg)}
              y2={padT + innerH}
              stroke="#adb5bd"
              strokeDasharray="3 3"
            />
            <text
              x={xScale(result.crossover_angle_deg) + 4}
              y={padT + 10}
              fontSize="9"
              fill="#6c757d"
            >
              crossover
            </text>
          </g>
        )}

      {/* Requested slew marker */}
      {slewY !== null && (
        <g>
          <line
            x1={slewX}
            y1={padT}
            x2={slewX}
            y2={padT + innerH}
            stroke="#212529"
            strokeWidth={1}
          />
          <line
            x1={padL}
            y1={slewY}
            x2={padL + innerW}
            y2={slewY}
            stroke="#212529"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <circle cx={slewX} cy={slewY} r={4} fill="#212529" />
        </g>
      )}
    </svg>
  );
}

type SegmentRegime = "torque_limited" | "momentum_limited";
interface CurveSegment {
  regime: SegmentRegime;
  points: SlewCurvePoint[];
}

function splitByRegime(
  points: SlewCurvePoint[],
  crossoverDeg: number,
): CurveSegment[] {
  const finite = points.filter((p) => Number.isFinite(p.slew_time_s));
  if (finite.length === 0) return [];

  const segs: CurveSegment[] = [];
  let current: CurveSegment | null = null;
  const lastAngle = finite[finite.length - 1]?.angle_deg ?? 0;

  for (const p of finite) {
    const reg: SegmentRegime =
      p.regime === "momentum_limited" ? "momentum_limited" : "torque_limited";

    if (!current || current.regime !== reg) {
      // On a regime change, splice in the exact crossover sample so adjacent
      // coloured segments share a vertex.
      if (
        current &&
        Number.isFinite(crossoverDeg) &&
        crossoverDeg > 0 &&
        crossoverDeg < lastAngle
      ) {
        const last: SlewCurvePoint | undefined =
          current.points[current.points.length - 1];
        if (last && p.angle_deg !== last.angle_deg) {
          const t =
            (crossoverDeg - last.angle_deg) /
            (p.angle_deg - last.angle_deg);
          const interpolatedTime: number =
            last.slew_time_s + t * (p.slew_time_s - last.slew_time_s);
          const join: SlewCurvePoint = {
            angle_deg: crossoverDeg,
            slew_time_s: interpolatedTime,
            regime: last.regime,
          };
          current.points.push(join);
          current = { regime: reg, points: [join] };
          segs.push(current);
        } else {
          current = { regime: reg, points: [p] };
          segs.push(current);
        }
      } else {
        current = { regime: reg, points: [p] };
        segs.push(current);
      }
    }
    current.points.push(p);
  }
  return segs;
}

function niceTicks(min: number, max: number, target: number): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const rough = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step: number;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatters and constants
// ---------------------------------------------------------------------------

const COLOR_TQ = "#0d6efd";
const COLOR_MO = "#dc3545";

const REGIME_LABEL: Record<SlewComputeResponse["regime"], string> = {
  zero: "No rotation",
  torque_limited: "Torque-limited (triangular)",
  momentum_limited: "Momentum-limited (trapezoidal)",
  infeasible: "Infeasible — no axis capability",
};

const REGIME_BG: Record<SlewComputeResponse["regime"], string> = {
  zero: "#e9ecef",
  torque_limited: "#cfe2ff",
  momentum_limited: "#f8d7da",
  infeasible: "#fff3cd",
};

const REGIME_FG: Record<SlewComputeResponse["regime"], string> = {
  zero: "#495057",
  torque_limited: "#084298",
  momentum_limited: "#842029",
  infeasible: "#664d03",
};

function fmt4(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) return value.toExponential(4);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtTime(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value < 60) return `${value.toFixed(2)} s`;
  if (value < 3600) {
    const m = Math.floor(value / 60);
    const s = value - 60 * m;
    return `${m} min ${s.toFixed(1)} s`;
  }
  const h = Math.floor(value / 3600);
  const m = Math.floor((value - 3600 * h) / 60);
  return `${h} h ${m} min`;
}

function fmtTickTime(value: number): string {
  if (value === 0) return "0";
  if (value < 1) return value.toFixed(2);
  if (value < 100) return value.toFixed(1);
  return Math.round(value).toString();
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  card: {
    background: "#fff",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    padding: "0.9rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  cardLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#6c757d",
    letterSpacing: "0.05em",
  },
  bigNumberRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.8rem",
    flexWrap: "wrap",
  },
  bigNumber: {
    fontSize: "1.6rem",
    fontWeight: 700,
    color: "#0d6efd",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  regimePill: {
    fontSize: "0.78rem",
    fontWeight: 600,
    padding: "0.25rem 0.6rem",
    borderRadius: "999px",
  },
  kvTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.86rem",
  },
  kvLabel: {
    textAlign: "left",
    color: "#6c757d",
    fontWeight: 500,
    padding: "0.3rem 0.6rem 0.3rem 0",
    width: "45%",
    verticalAlign: "top",
  },
  kvValue: {
    textAlign: "left",
    color: "#212529",
    padding: "0.3rem 0",
    fontFamily: "inherit",
  },
  kvValueMono: {
    textAlign: "left",
    color: "#212529",
    padding: "0.3rem 0",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  hint: {
    fontSize: "0.74rem",
    color: "#6c757d",
    marginTop: "0.15rem",
    fontStyle: "italic",
  },
  legend: {
    display: "flex",
    gap: "1.2rem",
    flexWrap: "wrap",
    fontSize: "0.78rem",
    color: "#495057",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  legendSwatch: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "3px",
  },
  emptyPlot: {
    padding: "1rem",
    color: "#6c757d",
    fontSize: "0.85rem",
    background: "#f8f9fa",
    borderRadius: "6px",
  },
  disclaimer: {
    fontSize: "0.78rem",
    color: "#664d03",
    background: "#fff3cd",
    border: "1px solid #ffecb5",
    borderRadius: "6px",
    padding: "0.7rem 0.9rem",
    lineHeight: 1.5,
  },
};
