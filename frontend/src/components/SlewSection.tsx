import { useState } from "react";
import WheelArrayPanel, {
  defaultWheelArrayState,
  type WheelArrayState,
} from "./WheelArrayPanel";
import ManeuverPanel, {
  defaultManeuverState,
  type ManeuverState,
} from "./ManeuverPanel";
import SlewResultsCards from "./SlewResultsCards";
import { computeSlew } from "../api/slew";
import type {
  InertiaComponents,
  MoiComputeResponse,
} from "../types/moi";
import type {
  SlewComputeRequest,
  SlewComputeResponse,
} from "../types/slew";

interface Props {
  moiResult: MoiComputeResponse | null;
}

export default function SlewSection({ moiResult }: Props) {
  const [wheels, setWheels] = useState<WheelArrayState>(defaultWheelArrayState());
  const [maneuver, setManeuver] = useState<ManeuverState>(defaultManeuverState());
  const [result, setResult] = useState<SlewComputeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = moiResult === null;

  async function handleCompute(): Promise<void> {
    if (!moiResult) return;
    setLoading(true);
    setError(null);
    try {
      const req = buildRequest(moiResult.total_inertia_kgm2, wheels, maneuver);
      const data = await computeSlew(req);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>Slew time analysis</h2>
        <span style={styles.sub}>
          Rest-to-rest eigenaxis slew, 4-wheel pyramid RWA
        </span>
      </div>

      {disabled && (
        <div style={styles.gateNote}>
          Compute the total MOI above first — the slew calculation uses the
          aggregate inertia tensor in the SV body frame.
        </div>
      )}

      <div style={styles.inputsRow}>
        <div style={styles.inputCol}>
          <WheelArrayPanel value={wheels} onChange={setWheels} />
        </div>
        <div style={styles.inputCol}>
          <ManeuverPanel value={maneuver} onChange={setManeuver} />
        </div>
      </div>

      <div style={styles.actionRow}>
        <button
          type="button"
          onClick={handleCompute}
          disabled={disabled || loading}
          style={
            disabled || loading ? styles.computeBtnDisabled : styles.computeBtn
          }
        >
          {loading ? "Computing\u2026" : "Compute slew time"}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {result && <SlewResultsCards result={result} />}
    </section>
  );
}

function buildRequest(
  totalInertia: InertiaComponents,
  wheels: WheelArrayState,
  maneuver: ManeuverState,
): SlewComputeRequest {
  const req: SlewComputeRequest = {
    total_inertia_kgm2: totalInertia,
    wheel_array: {
      layout: "pyramid_4",
      cant_angle_deg: parseNum(wheels.cant, NaN),
      max_torque_per_wheel_nm: parseNum(wheels.tauPerWheel, 0),
      max_momentum_per_wheel_nms: parseNum(wheels.hPerWheel, 0),
    },
    maneuver:
      maneuver.mode === "eigenaxis_angle"
        ? {
            mode: "eigenaxis_angle",
            eigenaxis: [
              parseNum(maneuver.ex, 0),
              parseNum(maneuver.ey, 0),
              parseNum(maneuver.ez, 0),
            ],
            angle_deg: parseNum(maneuver.angleDeg, 0),
          }
        : {
            mode: "quaternion_pair",
            q_initial: [
              parseNum(maneuver.qiW, 1),
              parseNum(maneuver.qiX, 0),
              parseNum(maneuver.qiY, 0),
              parseNum(maneuver.qiZ, 0),
            ],
            q_final: [
              parseNum(maneuver.qfW, 1),
              parseNum(maneuver.qfX, 0),
              parseNum(maneuver.qfY, 0),
              parseNum(maneuver.qfZ, 0),
            ],
          },
  };
  return req;
}

function parseNum(s: string, fallback: number): number {
  if (s === "" || s == null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
    background: "#fff",
    borderRadius: "8px",
    border: "1px solid #dee2e6",
    padding: "1rem",
  },
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.6rem",
    flexWrap: "wrap",
    borderBottom: "1px solid #f1f3f5",
    paddingBottom: "0.6rem",
  },
  title: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#212529",
  },
  sub: {
    fontSize: "0.78rem",
    color: "#6c757d",
  },
  gateNote: {
    fontSize: "0.85rem",
    color: "#495057",
    background: "#f8f9fa",
    padding: "0.6rem 0.8rem",
    border: "1px dashed #ced4da",
    borderRadius: "6px",
  },
  inputsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.8rem",
  },
  inputCol: {
    minWidth: 0,
  },
  actionRow: {
    display: "flex",
    gap: "0.5rem",
  },
  computeBtn: {
    background: "#198754",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 1rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  computeBtnDisabled: {
    background: "#adb5bd",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 1rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "not-allowed",
  },
  error: {
    padding: "0.6rem 0.9rem",
    background: "#f8d7da",
    color: "#842029",
    borderRadius: "6px",
    border: "1px solid #f5c2c7",
    fontSize: "0.88rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
