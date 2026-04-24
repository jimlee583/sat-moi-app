import type { UnitSystem } from "../types/moi";

interface Props {
  value: UnitSystem;
  onChange: (next: UnitSystem) => void;
}

export default function UnitToggle({ value, onChange }: Props) {
  return (
    <div style={styles.wrap}>
      <div style={styles.label}>Units</div>
      <div style={styles.row}>
        <button
          type="button"
          onClick={() => value !== "si" && onChange("si")}
          style={value === "si" ? styles.btnActive : styles.btn}
        >
          SI (kg·m², kg, m)
        </button>
        <button
          type="button"
          onClick={() => value !== "english" && onChange("english")}
          style={value === "english" ? styles.btnActive : styles.btn}
        >
          English (slug·ft², slug, ft)
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
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
  },
  btn: {
    flex: 1,
    padding: "0.45rem 0.5rem",
    background: "#fff",
    border: "none",
    borderRight: "1px solid #ced4da",
    fontSize: "0.8rem",
    color: "#495057",
    cursor: "pointer",
  },
  btnActive: {
    flex: 1,
    padding: "0.45rem 0.5rem",
    background: "#0d6efd",
    border: "none",
    borderRight: "1px solid #0d6efd",
    fontSize: "0.8rem",
    color: "#fff",
    fontWeight: 600,
    cursor: "default",
  },
};
