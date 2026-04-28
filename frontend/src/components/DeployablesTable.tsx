import type { UnitSystem } from "../types/moi";
import { UNIT_LABELS } from "../types/moi";

export interface DeployableRowState {
  id: string;
  name: string;
  mass: string;
  ox: string;
  oy: string;
  oz: string;
  ixx: string;
  iyy: string;
  izz: string;
  ixy: string;
  ixz: string;
  iyz: string;
  showProducts: boolean;
  alreadyAboutSvRef: boolean;
}

interface Props {
  unitSystem: UnitSystem;
  rows: DeployableRowState[];
  onChange: (rows: DeployableRowState[]) => void;
}

export function emptyRow(id: string): DeployableRowState {
  return {
    id,
    name: "",
    mass: "",
    ox: "0",
    oy: "0",
    oz: "0",
    ixx: "",
    iyy: "",
    izz: "",
    ixy: "0",
    ixz: "0",
    iyz: "0",
    showProducts: false,
    alreadyAboutSvRef: false,
  };
}

export default function DeployablesTable({
  unitSystem,
  rows,
  onChange,
}: Props) {
  const labels = UNIT_LABELS[unitSystem];

  function updateRow(id: string, patch: Partial<DeployableRowState>): void {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string): void {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow(): void {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onChange([...rows, emptyRow(id)]);
  }

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div style={styles.sectionLabel}>Deployables</div>
        <button type="button" onClick={addRow} style={styles.addBtn}>
          + Add deployable
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={styles.empty}>
          No deployables yet. Click <strong>+ Add deployable</strong> to include
          solar arrays, antennas, booms, etc.
        </div>
      ) : (
        <div style={styles.rows}>
          {rows.map((row, idx) => (
            <DeployableRow
              key={row.id}
              index={idx}
              row={row}
              labels={labels}
              onUpdate={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeployableRow({
  index,
  row,
  labels,
  onUpdate,
  onRemove,
}: {
  index: number;
  row: DeployableRowState;
  labels: { inertia: string; mass: string; length: string };
  onUpdate: (patch: Partial<DeployableRowState>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={styles.rowCard}>
      <div style={styles.rowHeader}>
        <input
          value={row.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder={`Deployable ${index + 1}`}
          style={styles.nameInput}
        />
        <button type="button" onClick={onRemove} style={styles.removeBtn}>
          Remove
        </button>
      </div>

      <div style={styles.grid4}>
        <NumberField
          label={`Mass (${labels.mass})`}
          value={row.mass}
          onChange={(v) => onUpdate({ mass: v })}
        />
        <NumberField
          label={`Offset x (${labels.length})`}
          value={row.ox}
          onChange={(v) => onUpdate({ ox: v })}
        />
        <NumberField
          label={`Offset y (${labels.length})`}
          value={row.oy}
          onChange={(v) => onUpdate({ oy: v })}
        />
        <NumberField
          label={`Offset z (${labels.length})`}
          value={row.oz}
          onChange={(v) => onUpdate({ oz: v })}
        />
      </div>

      <div style={styles.inertiaLabel}>
        Inertia tensor ({labels.inertia})
        {row.alreadyAboutSvRef
          ? " — about SV reference"
          : " — about deployable CG"}
      </div>
      <div style={styles.grid3}>
        <NumberField
          label={`Ixx (${labels.inertia})`}
          value={row.ixx}
          onChange={(v) => onUpdate({ ixx: v })}
        />
        <NumberField
          label={`Iyy (${labels.inertia})`}
          value={row.iyy}
          onChange={(v) => onUpdate({ iyy: v })}
        />
        <NumberField
          label={`Izz (${labels.inertia})`}
          value={row.izz}
          onChange={(v) => onUpdate({ izz: v })}
        />
      </div>

      <label style={styles.disclosureRow}>
        <input
          type="checkbox"
          checked={row.showProducts}
          onChange={(e) => onUpdate({ showProducts: e.target.checked })}
        />
        <span>Show products of inertia</span>
      </label>

      {row.showProducts && (
        <div style={styles.grid3}>
          <NumberField
            label={`Ixy (${labels.inertia})`}
            value={row.ixy}
            onChange={(v) => onUpdate({ ixy: v })}
          />
          <NumberField
            label={`Ixz (${labels.inertia})`}
            value={row.ixz}
            onChange={(v) => onUpdate({ ixz: v })}
          />
          <NumberField
            label={`Iyz (${labels.inertia})`}
            value={row.iyz}
            onChange={(v) => onUpdate({ iyz: v })}
          />
        </div>
      )}

      <label style={styles.disclosureRow}>
        <input
          type="checkbox"
          checked={row.alreadyAboutSvRef}
          onChange={(e) => onUpdate({ alreadyAboutSvRef: e.target.checked })}
        />
        <span>
          Already about SV reference (skip parallel-axis shift; mass and offset
          ignored)
        </span>
      </label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
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
    gap: "0.75rem",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#6c757d",
    letterSpacing: "0.05em",
  },
  addBtn: {
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.8rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    padding: "1.25rem",
    color: "#6c757d",
    fontSize: "0.88rem",
    background: "#f8f9fa",
    border: "1px dashed #ced4da",
    borderRadius: "6px",
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  },
  rowCard: {
    background: "#f8f9fa",
    border: "1px solid #dee2e6",
    borderRadius: "6px",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    minWidth: 0,
    boxSizing: "border-box",
  },
  rowHeader: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    minWidth: 0,
  },
  nameInput: {
    flex: "1 1 0",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "0.4rem 0.55rem",
    borderRadius: "5px",
    border: "1px solid #ced4da",
    fontSize: "0.9rem",
    fontWeight: 600,
    fontFamily: "inherit",
  },
  removeBtn: {
    background: "transparent",
    color: "#dc3545",
    border: "1px solid #dc3545",
    borderRadius: "5px",
    padding: "0.35rem 0.7rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "0.5rem",
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
  },
  inertiaLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#495057",
    marginTop: "0.2rem",
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
