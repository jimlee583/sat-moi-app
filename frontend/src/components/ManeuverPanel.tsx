import type { ManeuverMode } from "../types/slew";

export interface ManeuverState {
  mode: ManeuverMode;
  // eigenaxis_angle inputs
  ex: string;
  ey: string;
  ez: string;
  angleDeg: string;
  // quaternion_pair inputs (scalar-first)
  qiW: string;
  qiX: string;
  qiY: string;
  qiZ: string;
  qfW: string;
  qfX: string;
  qfY: string;
  qfZ: string;
}

export function defaultManeuverState(): ManeuverState {
  return {
    mode: "eigenaxis_angle",
    ex: "0",
    ey: "0",
    ez: "1",
    angleDeg: "30",
    qiW: "1",
    qiX: "0",
    qiY: "0",
    qiZ: "0",
    qfW: "0.7071068",
    qfX: "0",
    qfY: "0",
    qfZ: "0.7071068",
  };
}

interface Props {
  value: ManeuverState;
  onChange: (next: ManeuverState) => void;
}

export default function ManeuverPanel({ value, onChange }: Props) {
  function set<K extends keyof ManeuverState>(key: K, next: string): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <div style={styles.card}>
      <div style={styles.sectionLabel}>Maneuver</div>

      <div style={styles.modeRow}>
        <ModeButton
          active={value.mode === "eigenaxis_angle"}
          onClick={() => onChange({ ...value, mode: "eigenaxis_angle" })}
          label="Eigenaxis & angle"
        />
        <ModeButton
          active={value.mode === "quaternion_pair"}
          onClick={() => onChange({ ...value, mode: "quaternion_pair" })}
          label="Quaternion pair"
        />
      </div>

      {value.mode === "eigenaxis_angle" ? (
        <>
          <div style={styles.helpText}>
            Body-frame slew axis (auto-normalised) and rest-to-rest slew angle.
          </div>
          <div style={styles.grid3}>
            <NumberField
              label="ê x"
              value={value.ex}
              onChange={(v) => set("ex", v)}
            />
            <NumberField
              label="ê y"
              value={value.ey}
              onChange={(v) => set("ey", v)}
            />
            <NumberField
              label="ê z"
              value={value.ez}
              onChange={(v) => set("ez", v)}
            />
          </div>
          <div style={styles.grid1}>
            <NumberField
              label="Slew angle θ (deg, 0 < θ ≤ 180)"
              value={value.angleDeg}
              onChange={(v) => set("angleDeg", v)}
              min={0}
              max={180}
            />
          </div>
        </>
      ) : (
        <>
          <div style={styles.helpText}>
            Scalar-first unit quaternions [w, x, y, z] for body-from-inertial
            attitude. The shortest-path eigenaxis and angle are derived
            internally.
          </div>
          <div style={styles.subLabel}>Initial quaternion</div>
          <div style={styles.grid4}>
            <NumberField label="w" value={value.qiW} onChange={(v) => set("qiW", v)} />
            <NumberField label="x" value={value.qiX} onChange={(v) => set("qiX", v)} />
            <NumberField label="y" value={value.qiY} onChange={(v) => set("qiY", v)} />
            <NumberField label="z" value={value.qiZ} onChange={(v) => set("qiZ", v)} />
          </div>
          <div style={styles.subLabel}>Final quaternion</div>
          <div style={styles.grid4}>
            <NumberField label="w" value={value.qfW} onChange={(v) => set("qfW", v)} />
            <NumberField label="x" value={value.qfX} onChange={(v) => set("qfX", v)} />
            <NumberField label="y" value={value.qfY} onChange={(v) => set("qfY", v)} />
            <NumberField label="z" value={value.qfZ} onChange={(v) => set("qfZ", v)} />
          </div>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? styles.modeBtnActive : styles.modeBtn}
    >
      {label}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    padding: "0.9rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  sectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#6c757d",
    letterSpacing: "0.05em",
  },
  modeRow: {
    display: "flex",
    border: "1px solid #ced4da",
    borderRadius: "6px",
    overflow: "hidden",
  },
  modeBtn: {
    flex: 1,
    padding: "0.4rem 0.6rem",
    background: "#fff",
    color: "#495057",
    border: "none",
    borderRight: "1px solid #ced4da",
    fontSize: "0.78rem",
    cursor: "pointer",
  },
  modeBtnActive: {
    flex: 1,
    padding: "0.4rem 0.6rem",
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRight: "1px solid #0d6efd",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "default",
  },
  helpText: {
    fontSize: "0.74rem",
    color: "#6c757d",
    lineHeight: 1.4,
  },
  subLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#495057",
    marginTop: "0.2rem",
  },
  grid1: {
    display: "grid",
    gridTemplateColumns: "1fr",
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "0.4rem",
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    minWidth: 0,
  },
  fieldLabelText: {
    fontSize: "0.72rem",
    color: "#6c757d",
  },
  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "0.4rem 0.55rem",
    borderRadius: "5px",
    border: "1px solid #ced4da",
    fontSize: "0.85rem",
    fontFamily: "inherit",
    background: "#fff",
  },
};
