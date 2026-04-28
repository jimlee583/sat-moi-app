import type { UnitSystem } from "../types/moi";
import { UNIT_LABELS } from "../types/moi";

export interface SVInertiaState {
  ixx: string;
  iyy: string;
  izz: string;
  ixy: string;
  ixz: string;
  iyz: string;
}

interface Props {
  unitSystem: UnitSystem;
  sv: SVInertiaState;
  onSvChange: (next: SVInertiaState) => void;
  svMass: string;
  onSvMassChange: (next: string) => void;
  showProducts: boolean;
  onShowProductsChange: (next: boolean) => void;
}

export default function BaseSVPanel({
  unitSystem,
  sv,
  onSvChange,
  svMass,
  onSvMassChange,
  showProducts,
  onShowProductsChange,
}: Props) {
  const labels = UNIT_LABELS[unitSystem];

  function setField<K extends keyof SVInertiaState>(
    key: K,
    value: string,
  ): void {
    onSvChange({ ...sv, [key]: value });
  }

  return (
    <div style={styles.card}>
      <div style={styles.sectionLabel}>Base SV inertia ({labels.inertia})</div>

      <div style={styles.grid3}>
        <NumberField
          label={`Ixx (${labels.inertia})`}
          value={sv.ixx}
          onChange={(v) => setField("ixx", v)}
        />
        <NumberField
          label={`Iyy (${labels.inertia})`}
          value={sv.iyy}
          onChange={(v) => setField("iyy", v)}
        />
        <NumberField
          label={`Izz (${labels.inertia})`}
          value={sv.izz}
          onChange={(v) => setField("izz", v)}
        />
      </div>

      <label style={styles.disclosureRow}>
        <input
          type="checkbox"
          checked={showProducts}
          onChange={(e) => onShowProductsChange(e.target.checked)}
        />
        <span>Show products of inertia (Ixy, Ixz, Iyz)</span>
      </label>

      {showProducts && (
        <div style={styles.grid3}>
          <NumberField
            label={`Ixy (${labels.inertia})`}
            value={sv.ixy}
            onChange={(v) => setField("ixy", v)}
          />
          <NumberField
            label={`Ixz (${labels.inertia})`}
            value={sv.ixz}
            onChange={(v) => setField("ixz", v)}
          />
          <NumberField
            label={`Iyz (${labels.inertia})`}
            value={sv.iyz}
            onChange={(v) => setField("iyz", v)}
          />
        </div>
      )}

      <div style={styles.grid1}>
        <NumberField
          label={`SV mass — optional (${labels.mass})`}
          value={svMass}
          onChange={onSvMassChange}
          placeholder="Informational only"
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
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
    gap: "0.75rem",
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
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
  },
  grid1: {
    display: "grid",
    gridTemplateColumns: "1fr",
  },
  disclosureRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.82rem",
    color: "#495057",
    cursor: "pointer",
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
