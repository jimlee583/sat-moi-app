import type { UnitSystem } from "../types/moi";

interface Props {
  value: UnitSystem;
  onChange: (next: UnitSystem) => void;
}

export default function UnitToggle({ value, onChange }: Props) {
  const hint =
    value === "si" ? "kg·m², kg, m" : "slug·ft², slug, ft";
  return (
    <div style={styles.wrap}>
      <div style={styles.label}>Units</div>
      <div style={styles.row}>
        <button
          type="button"
          onClick={() => value !== "si" && onChange("si")}
          style={value === "si" ? styles.btnActive : styles.btn}
          title="SI units (kg·m², kg, m)"
        >
          SI
        </button>
        <button
          type="button"
          onClick={() => value !== "english" && onChange("english")}
          style={value === "english" ? styles.btnActive : styles.btn}
          title="English units (slug·ft², slug, ft)"
        >
          English
        </button>
      </div>
      <div style={styles.hint}>{hint}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    width: "100%",
    minWidth: 0,
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#6c757d",
    letterSpacing: "0.05em",
  },
  row: {
    display: "flex",
    gap: "0",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid #ced4da",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  btn: {
    flex: "1 1 0",
    minWidth: 0,
    padding: "0.45rem 0.5rem",
    background: "#fff",
    border: "none",
    borderRight: "1px solid #ced4da",
    fontSize: "0.75rem",
    color: "#495057",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  btnActive: {
    flex: "1 1 0",
    minWidth: 0,
    padding: "0.45rem 0.5rem",
    background: "#0d6efd",
    border: "none",
    borderRight: "1px solid #0d6efd",
    fontSize: "0.75rem",
    color: "#fff",
    fontWeight: 600,
    cursor: "default",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  hint: {
    fontSize: "0.7rem",
    color: "#6c757d",
    fontStyle: "italic",
  },
};
