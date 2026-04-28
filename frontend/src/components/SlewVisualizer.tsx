import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { SlewComputeResponse, SlewTimeseries } from "../types/slew";

interface Props {
  result: SlewComputeResponse;
}

const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const;

/** Animated 3D view of the SV body axes rotating inside a fixed LVLH triad,
 *  with a synchronised wheel-speed (or wheel-momentum) strip chart. Both
 *  share the same playback time. */
export default function SlewVisualizer({ result }: Props) {
  const ts = result.timeseries;
  if (!ts) return null;
  const totalT = ts.t_s[ts.t_s.length - 1] ?? 0;

  const [tNow, setTNow] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);

  // Reset playback whenever a new result comes in.
  useEffect(() => {
    setTNow(0);
    setPlaying(false);
  }, [result]);

  // requestAnimationFrame loop drives the playhead.
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dtMs = now - lastTickRef.current;
      lastTickRef.current = now;
      setTNow((prev) => {
        const next = prev + (dtMs / 1000) * speed;
        if (next >= totalT) {
          setPlaying(false);
          return totalT;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, totalT]);

  // Sample the time-series at tNow (linear / slerp interpolation between
  // adjacent samples).
  const sample = useMemo(
    () => sampleTimeseries(ts, tNow),
    [ts, tNow],
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <div style={styles.titleBlock}>
          <div style={styles.title}>Attitude visualizer</div>
          <div style={styles.sub}>
            Body axes inside the LVLH triad — initial attitude assumed identity
            (body x/y/z aligned with LVLH x/y/z at t = 0).
          </div>
        </div>
        <Transport
          tNow={tNow}
          totalT={totalT}
          playing={playing}
          onPlayPause={() => {
            if (tNow >= totalT) setTNow(0);
            setPlaying((p) => !p);
          }}
          onReset={() => {
            setPlaying(false);
            setTNow(0);
          }}
          onScrub={(v) => {
            setPlaying(false);
            setTNow(v);
          }}
          speed={speed}
          onSpeedChange={setSpeed}
          angleDeg={(sample.angleRad * 180) / Math.PI}
          rateDegS={(sample.rateRadS * 180) / Math.PI}
        />
      </div>

      <div style={styles.grid}>
        <div style={styles.canvasWrap}>
          <div style={styles.canvasFrame}>
            <Canvas
              camera={{ position: [3.2, 2.4, 3.6], fov: 38 }}
              dpr={[1, 2]}
              style={{ background: "#0b1320", borderRadius: "6px" }}
            >
              <ambientLight intensity={0.55} />
              <directionalLight position={[5, 6, 4]} intensity={0.6} />
              <directionalLight position={[-4, -2, -3]} intensity={0.25} />

              <LVLHTriad />
              <EigenaxisArrow eigenaxis={result.eigenaxis_unit} />
              <BodyGroup quat={sample.quat} />

              <gridHelper
                args={[6, 12, "#1f2a3d", "#152033"]}
                position={[0, -1.2, 0]}
              />
              <OrbitControls
                enablePan
                enableZoom
                enableRotate
                minDistance={2}
                maxDistance={20}
              />
            </Canvas>
          </div>
          <FrameLegend />
        </div>

        <div style={styles.chartWrap}>
          <WheelStripChart ts={ts} tNow={tNow} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3D scene primitives
// ---------------------------------------------------------------------------

const AXIS_COLOR = {
  x: "#e63946",
  y: "#2dc66e",
  z: "#4ea0ff",
};

function LVLHTriad() {
  // Fixed reference triad: solid lines + small text labels.
  const length = 1.5;
  return (
    <group>
      <ArrowSegment
        from={[0, 0, 0]}
        to={[length, 0, 0]}
        color={AXIS_COLOR.x}
        thickness={0.018}
      />
      <ArrowSegment
        from={[0, 0, 0]}
        to={[0, length, 0]}
        color={AXIS_COLOR.y}
        thickness={0.018}
      />
      <ArrowSegment
        from={[0, 0, 0]}
        to={[0, 0, length]}
        color={AXIS_COLOR.z}
        thickness={0.018}
      />
      <Text
        position={[length + 0.18, 0, 0]}
        color={AXIS_COLOR.x}
        fontSize={0.18}
        anchorX="center"
        anchorY="middle"
      >
        LVLH +X
      </Text>
      <Text
        position={[0, length + 0.18, 0]}
        color={AXIS_COLOR.y}
        fontSize={0.18}
        anchorX="center"
        anchorY="middle"
      >
        +Y
      </Text>
      <Text
        position={[0, 0, length + 0.18]}
        color={AXIS_COLOR.z}
        fontSize={0.18}
        anchorX="center"
        anchorY="middle"
      >
        +Z
      </Text>
    </group>
  );
}

function BodyGroup({ quat }: { quat: [number, number, number, number] }) {
  // Convert scalar-first [w, x, y, z] (backend) to three.js [x, y, z, w] order.
  const [w, x, y, z] = quat;
  const bodyAxisLen = 1.05;
  return (
    <group quaternion={[x, y, z, w]}>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial
          color="#dee5ee"
          roughness={0.55}
          metalness={0.15}
        />
      </mesh>
      <mesh position={[0.46, 0, 0]}>
        <boxGeometry args={[0.04, 0.7, 0.5]} />
        <meshStandardMaterial color="#5b6b80" />
      </mesh>
      <mesh position={[-0.46, 0, 0]}>
        <boxGeometry args={[0.04, 0.7, 0.5]} />
        <meshStandardMaterial color="#5b6b80" />
      </mesh>
      <ArrowSegment
        from={[0, 0, 0]}
        to={[bodyAxisLen, 0, 0]}
        color={AXIS_COLOR.x}
        thickness={0.026}
      />
      <ArrowSegment
        from={[0, 0, 0]}
        to={[0, bodyAxisLen, 0]}
        color={AXIS_COLOR.y}
        thickness={0.026}
      />
      <ArrowSegment
        from={[0, 0, 0]}
        to={[0, 0, bodyAxisLen]}
        color={AXIS_COLOR.z}
        thickness={0.026}
      />
      <Text
        position={[bodyAxisLen + 0.18, 0, 0]}
        color={AXIS_COLOR.x}
        fontSize={0.16}
        outlineColor="#0b1320"
        outlineWidth={0.012}
        anchorX="center"
        anchorY="middle"
      >
        Body x
      </Text>
      <Text
        position={[0, bodyAxisLen + 0.18, 0]}
        color={AXIS_COLOR.y}
        fontSize={0.16}
        outlineColor="#0b1320"
        outlineWidth={0.012}
        anchorX="center"
        anchorY="middle"
      >
        y
      </Text>
      <Text
        position={[0, 0, bodyAxisLen + 0.18]}
        color={AXIS_COLOR.z}
        fontSize={0.16}
        outlineColor="#0b1320"
        outlineWidth={0.012}
        anchorX="center"
        anchorY="middle"
      >
        z
      </Text>
    </group>
  );
}

function EigenaxisArrow({
  eigenaxis,
}: {
  eigenaxis: [number, number, number];
}) {
  const len = 1.9;
  const e = normalise3(eigenaxis);
  const to: [number, number, number] = [e[0] * len, e[1] * len, e[2] * len];
  const from: [number, number, number] = [
    -e[0] * len * 0.4,
    -e[1] * len * 0.4,
    -e[2] * len * 0.4,
  ];
  return (
    <group>
      <ArrowSegment
        from={from}
        to={to}
        color="#ffd166"
        thickness={0.012}
        opacity={0.55}
      />
      <Text
        position={[
          to[0] + 0.15 * sign(e[0] || 1),
          to[1] + 0.18,
          to[2] + 0.15 * sign(e[2] || 1),
        ]}
        color="#ffd166"
        fontSize={0.14}
        outlineColor="#0b1320"
        outlineWidth={0.01}
        anchorX="center"
        anchorY="middle"
      >
        ê
      </Text>
    </group>
  );
}

function sign(n: number): number {
  return n >= 0 ? 1 : -1;
}

function ArrowSegment({
  from,
  to,
  color,
  thickness = 0.02,
  opacity = 1,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  thickness?: number;
  opacity?: number;
}) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const mid = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const transparent = opacity < 1;
  return (
    <group position={mid.toArray()} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[thickness, thickness, length, 12]} />
        <meshStandardMaterial
          color={color}
          transparent={transparent}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, length / 2, 0]}>
        <coneGeometry args={[thickness * 2.2, thickness * 6, 16]} />
        <meshStandardMaterial
          color={color}
          transparent={transparent}
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

function FrameLegend() {
  return (
    <div style={styles.legendRow}>
      <span style={styles.legendItem}>
        <span style={{ ...styles.legendSwatch, background: AXIS_COLOR.x }} />X
      </span>
      <span style={styles.legendItem}>
        <span style={{ ...styles.legendSwatch, background: AXIS_COLOR.y }} />Y
      </span>
      <span style={styles.legendItem}>
        <span style={{ ...styles.legendSwatch, background: AXIS_COLOR.z }} />Z
      </span>
      <span style={styles.legendItem}>
        <span style={{ ...styles.legendSwatch, background: "#ffd166" }} />
        Eigenaxis ê
      </span>
      <span style={styles.legendNote}>
        Drag to orbit · scroll to zoom · right-click to pan
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transport (play / pause / scrubber / speed)
// ---------------------------------------------------------------------------

function Transport({
  tNow,
  totalT,
  playing,
  onPlayPause,
  onReset,
  onScrub,
  speed,
  onSpeedChange,
  angleDeg,
  rateDegS,
}: {
  tNow: number;
  totalT: number;
  playing: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onScrub: (v: number) => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  angleDeg: number;
  rateDegS: number;
}) {
  return (
    <div style={styles.transport}>
      <button
        type="button"
        onClick={onPlayPause}
        style={styles.playBtn}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button type="button" onClick={onReset} style={styles.resetBtn}>
        Reset
      </button>
      <div style={styles.speedRow}>
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            style={s === speed ? styles.speedBtnActive : styles.speedBtn}
          >
            {s}×
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={totalT}
        step={totalT / 600}
        value={tNow}
        onChange={(e) => onScrub(Number(e.target.value))}
        style={styles.scrubber}
        aria-label="Time scrubber"
      />
      <div style={styles.readout}>
        <div>
          t = <strong>{tNow.toFixed(2)} s</strong> / {totalT.toFixed(2)} s
        </div>
        <div>
          θ = <strong>{angleDeg.toFixed(2)}°</strong> · ω ={" "}
          <strong>{rateDegS.toFixed(3)}°/s</strong>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wheel speed / momentum strip chart
// ---------------------------------------------------------------------------

function WheelStripChart({
  ts,
  tNow,
}: {
  ts: SlewTimeseries;
  tNow: number;
}) {
  const useRpm = ts.wheel_speed_rpm != null;
  const series = useRpm
    ? (ts.wheel_speed_rpm as [number, number, number, number][])
    : ts.wheel_momentum_nms;
  const yLabel = useRpm ? "Wheel speed (RPM)" : "Wheel momentum (N·m·s)";

  const W = 520;
  const H = 280;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xMax = ts.t_s[ts.t_s.length - 1] ?? 1;
  const allValues = series.flat();
  const yAbsMax = Math.max(1e-9, ...allValues.map((v) => Math.abs(v)));
  // Plot symmetric range so positive and negative wheel speeds are visible.
  const yMin = -yAbsMax * 1.05;
  const yMax = yAbsMax * 1.05;

  const xScale = (t: number) => padL + (t / xMax) * innerW;
  const yScale = (v: number) =>
    padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const xTicks = niceTicks(0, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 5);
  const playheadX = xScale(Math.min(tNow, xMax));

  const polylines = WHEEL_INDICES.map((i) => ({
    color: WHEEL_COLOR[i],
    label: `W${i + 1}`,
    points: series
      .map((sample, k) => `${xScale(ts.t_s[k] ?? 0)},${yScale(sample[i])}`)
      .join(" "),
  }));

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartTitle}>{yLabel} vs time</div>
      {!useRpm && (
        <div style={styles.chartSub}>
          No max-speed entered — showing per-wheel stored momentum. Add a max
          wheel speed (RPM) above to plot wheel speed.
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label={yLabel}
      >
        {/* Axes */}
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="#adb5bd"
        />
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + innerH}
          stroke="#adb5bd"
        />

        {/* Y zero line */}
        <line
          x1={padL}
          y1={yScale(0)}
          x2={padL + innerW}
          y2={yScale(0)}
          stroke="#ced4da"
          strokeDasharray="4 3"
        />

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
              {fmtTickValue(t)}
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
              {fmtTickValue(t)}
            </text>
          </g>
        ))}

        {/* Axis titles */}
        <text
          x={padL + innerW / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize="11"
          fill="#495057"
        >
          time (s)
        </text>
        <text
          x={12}
          y={padT + innerH / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#495057"
          transform={`rotate(-90 12 ${padT + innerH / 2})`}
        >
          {yLabel}
        </text>

        {/* Wheel polylines */}
        {polylines.map((p) => (
          <polyline
            key={p.label}
            points={p.points}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
          />
        ))}

        {/* Playhead */}
        <line
          x1={playheadX}
          y1={padT}
          x2={playheadX}
          y2={padT + innerH}
          stroke="#212529"
          strokeWidth={1}
        />
      </svg>
      <div style={styles.legendRow}>
        {polylines.map((p) => (
          <span key={p.label} style={styles.legendItem}>
            <span style={{ ...styles.legendSwatch, background: p.color }} />
            {p.label}
          </span>
        ))}
        {ts.wheel_rotor_inertia_kgm2 != null && (
          <span style={styles.legendNote}>
            J<sub>w</sub> ≈ {ts.wheel_rotor_inertia_kgm2.toExponential(3)} kg·m²
          </span>
        )}
      </div>
    </div>
  );
}

const WHEEL_INDICES = [0, 1, 2, 3] as const;
const WHEEL_COLOR: Record<number, string> = {
  0: "#0d6efd",
  1: "#fd7e14",
  2: "#198754",
  3: "#d63384",
};

// ---------------------------------------------------------------------------
// Sampling and small math helpers
// ---------------------------------------------------------------------------

interface SampledState {
  angleRad: number;
  rateRadS: number;
  quat: [number, number, number, number];
}

function sampleTimeseries(ts: SlewTimeseries, t: number): SampledState {
  const N = ts.t_s.length;
  if (N === 0) {
    return { angleRad: 0, rateRadS: 0, quat: [1, 0, 0, 0] };
  }
  if (t <= ts.t_s[0]) {
    return {
      angleRad: ts.body_angle_rad[0],
      rateRadS: ts.body_rate_rad_s[0],
      quat: ts.body_quat_lvlh_to_body[0],
    };
  }
  if (t >= ts.t_s[N - 1]) {
    return {
      angleRad: ts.body_angle_rad[N - 1],
      rateRadS: ts.body_rate_rad_s[N - 1],
      quat: ts.body_quat_lvlh_to_body[N - 1],
    };
  }
  // Uniform sampling — direct index calculation, but be defensive in case
  // the backend ever returns non-uniform spacing.
  let lo = 0;
  let hi = N - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts.t_s[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = ts.t_s[lo];
  const t1 = ts.t_s[hi];
  const span = t1 - t0;
  const u = span > 0 ? (t - t0) / span : 0;
  const a = ts.body_angle_rad[lo] + u * (ts.body_angle_rad[hi] - ts.body_angle_rad[lo]);
  const w = ts.body_rate_rad_s[lo] + u * (ts.body_rate_rad_s[hi] - ts.body_rate_rad_s[lo]);
  const q = slerp(ts.body_quat_lvlh_to_body[lo], ts.body_quat_lvlh_to_body[hi], u);
  return { angleRad: a, rateRadS: w, quat: q };
}

function slerp(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bw = b[0],
    bx = b[1],
    by = b[2],
    bz = b[3];
  if (dot < 0) {
    dot = -dot;
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (dot > 0.9995) {
    const w = a[0] + t * (bw - a[0]);
    const x = a[1] + t * (bx - a[1]);
    const y = a[2] + t * (by - a[2]);
    const z = a[3] + t * (bz - a[3]);
    return normaliseQuat([w, x, y, z]);
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * Math.sin(theta)) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;
  return [
    s0 * a[0] + s1 * bw,
    s0 * a[1] + s1 * bx,
    s0 * a[2] + s1 * by,
    s0 * a[3] + s1 * bz,
  ];
}

function normaliseQuat(
  q: [number, number, number, number],
): [number, number, number, number] {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (n === 0) return [1, 0, 0, 0];
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function normalise3(v: [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n === 0) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
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

function fmtTickValue(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.01 || abs >= 1e5) return value.toExponential(1);
  if (abs < 1) return value.toFixed(2);
  if (abs < 100) return value.toFixed(1);
  return Math.round(value).toString();
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.7rem",
    background: "#fff",
    borderRadius: "8px",
    border: "1px solid #dee2e6",
    padding: "1rem",
  },
  headerRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    borderBottom: "1px solid #f1f3f5",
    paddingBottom: "0.6rem",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  title: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 700,
    color: "#212529",
  },
  sub: {
    fontSize: "0.78rem",
    color: "#6c757d",
  },
  transport: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    flexWrap: "wrap",
  },
  playBtn: {
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.8rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  resetBtn: {
    background: "transparent",
    color: "#495057",
    border: "1px solid #ced4da",
    borderRadius: "6px",
    padding: "0.35rem 0.7rem",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  speedRow: {
    display: "flex",
    border: "1px solid #ced4da",
    borderRadius: "6px",
    overflow: "hidden",
  },
  speedBtn: {
    background: "#fff",
    color: "#495057",
    border: "none",
    borderRight: "1px solid #ced4da",
    fontSize: "0.74rem",
    padding: "0.3rem 0.5rem",
    cursor: "pointer",
  },
  speedBtnActive: {
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRight: "1px solid #0d6efd",
    fontSize: "0.74rem",
    padding: "0.3rem 0.5rem",
    fontWeight: 600,
    cursor: "default",
  },
  scrubber: {
    flex: 1,
    minWidth: "180px",
  },
  readout: {
    fontSize: "0.78rem",
    color: "#495057",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
    minWidth: "180px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
    gap: "0.8rem",
  },
  canvasWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    minWidth: 0,
  },
  canvasFrame: {
    width: "100%",
    height: "360px",
    minHeight: "320px",
    borderRadius: "6px",
    overflow: "hidden",
  },
  chartWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    minWidth: 0,
  },
  chartCard: {
    background: "#fff",
    border: "1px solid #e9ecef",
    borderRadius: "6px",
    padding: "0.6rem 0.7rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  chartTitle: {
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#495057",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  chartSub: {
    fontSize: "0.74rem",
    color: "#6c757d",
    fontStyle: "italic",
  },
  legendRow: {
    display: "flex",
    gap: "0.9rem",
    flexWrap: "wrap",
    fontSize: "0.76rem",
    color: "#495057",
    alignItems: "center",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  legendSwatch: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    borderRadius: "3px",
  },
  legendNote: {
    color: "#6c757d",
    fontStyle: "italic",
  },
};
