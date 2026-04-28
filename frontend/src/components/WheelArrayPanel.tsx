import { DEFAULT_CANT_DEG } from "../types/slew";

export interface WheelArrayState {
  cant: string;
  tauPerWheel: string;
  hPerWheel: string;
}

export function defaultWheelArrayState(): WheelArrayState {
  return {
    cant: DEFAULT_CANT_DEG.toFixed(4),
    tauPerWheel: "0.2",
    hPerWheel: "12",
  };
}

interface Props {
  value: WheelArrayState;
  onChange: (next: WheelArrayState) => void;
}

export default function WheelArrayPanel({ value, onChange }: Props) {
  function set<K extends keyof WheelArrayState>(
    key: K,
    next: string,
  ): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <div style={styles.card}>
      <div style={styles.sectionLabel}>Reaction wheel array</div>
      <div style={styles.helpText}>
        4-wheel pyramid: spin axes at 0&deg;, 90&deg;, 180&deg;, 270&deg; around
        body +Z, each canted from +Z by the cant angle. Default ≈ arctan(&radic;2)
        is the balanced choice.
      </div>

      <div style={styles.grid1}>
        <NumberField
          label="Cant angle from +Z (deg)"
          value={value.cant}
          onChange={(v) => set("cant", v)}
          min={0.001}
          max={89.999}
          placeholder="54.7356"
        />
      </div>

      <div style={styles.grid2}>
        <NumberField
          label="Per-wheel max torque (N·m)"
          value={value.tauPerWheel}
          onChange={(v) => set("tauPerWheel", v)}
          min={0}
        />
        <NumberField
          label="Per-wheel max momentum (N·m·s)"
          value={value.hPerWheel}
          onChange={(v) => set("hPerWheel", v)}
          min={0}
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(defaultWheelArrayState())}
        style={styles.resetLinkBtn}
      >
        Reset to defaults
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
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
        placeholder={placeholder}
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
  helpText: {
    fontSize: "0.74rem",
    color: "#6c757d",
    lineHeight: 1.4,
  },
  grid1: {
    display: "grid",
    gridTemplateColumns: "1fr",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "0.5rem",
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
  resetLinkBtn: {
    alignSelf: "flex-start",
    background: "transparent",
    color: "#0d6efd",
    border: "none",
    fontSize: "0.78rem",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
};
