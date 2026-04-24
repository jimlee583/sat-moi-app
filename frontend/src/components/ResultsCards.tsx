import type { MoiComputeResponse, UnitSystem } from "../types/moi";
import {
  UNIT_LABELS,
  inertiaFromSI,
  massFromSI,
} from "../types/moi";

interface Props {
  result: MoiComputeResponse;
  displaySystem: UnitSystem;
}

export default function ResultsCards({ result, displaySystem }: Props) {
  const labels = UNIT_LABELS[displaySystem];

  const I = result.total_inertia_kgm2;
  const toI = (v: number) => inertiaFromSI(v, displaySystem);
  const toM = (v: number) => massFromSI(v, displaySystem);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.cardLabel}>
          Total inertia tensor ({labels.inertia})
        </div>
        <table style={styles.matrixTable}>
          <thead>
            <tr>
              <th></th>
              <th style={styles.colHead}>x</th>
              <th style={styles.colHead}>y</th>
              <th style={styles.colHead}>z</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th style={styles.rowHead}>x</th>
              <td style={styles.diagCell}>{fmt(toI(I.ixx))}</td>
              <td style={styles.offCell}>{fmt(toI(I.ixy))}</td>
              <td style={styles.offCell}>{fmt(toI(I.ixz))}</td>
            </tr>
            <tr>
              <th style={styles.rowHead}>y</th>
              <td style={styles.offCell}>{fmt(toI(I.ixy))}</td>
              <td style={styles.diagCell}>{fmt(toI(I.iyy))}</td>
              <td style={styles.offCell}>{fmt(toI(I.iyz))}</td>
            </tr>
            <tr>
              <th style={styles.rowHead}>z</th>
              <td style={styles.offCell}>{fmt(toI(I.ixz))}</td>
              <td style={styles.offCell}>{fmt(toI(I.iyz))}</td>
              <td style={styles.diagCell}>{fmt(toI(I.izz))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>
          Principal moments ({labels.inertia}, ascending)
        </div>
        <table style={styles.principalTable}>
          <thead>
            <tr>
              <th style={styles.thLeft}>#</th>
              <th style={styles.thLeft}>Moment</th>
              <th style={styles.thLeft}>Unit eigenvector (x, y, z)</th>
            </tr>
          </thead>
          <tbody>
            {result.principal_moments_kgm2.map((m, i) => (
              <tr key={i}>
                <td style={styles.tdMono}>I{i + 1}</td>
                <td style={styles.tdMono}>{fmt(toI(m))}</td>
                <td style={styles.tdMono}>
                  ({fmtVec(result.principal_axes[i][0])},{" "}
                  {fmtVec(result.principal_axes[i][1])},{" "}
                  {fmtVec(result.principal_axes[i][2])})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>Total mass</div>
        <div style={styles.massValue}>
          {fmt(toM(result.total_mass_kg))} {labels.mass}
        </div>
      </div>
    </div>
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    return value.toExponential(4);
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtVec(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(4);
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
    gap: "0.5rem",
  },
  cardLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#6c757d",
    letterSpacing: "0.05em",
  },
  matrixTable: {
    borderCollapse: "collapse",
    fontSize: "0.9rem",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  principalTable: {
    borderCollapse: "collapse",
    fontSize: "0.88rem",
    width: "100%",
  },
  colHead: {
    textAlign: "center",
    padding: "0.35rem 0.7rem",
    color: "#6c757d",
    fontWeight: 600,
    fontSize: "0.78rem",
  },
  rowHead: {
    textAlign: "right",
    padding: "0.35rem 0.6rem",
    color: "#6c757d",
    fontWeight: 600,
    fontSize: "0.78rem",
  },
  thLeft: {
    textAlign: "left",
    padding: "0.35rem 0.7rem",
    borderBottom: "1px solid #dee2e6",
    color: "#6c757d",
    fontWeight: 600,
    fontSize: "0.78rem",
  },
  diagCell: {
    padding: "0.45rem 0.8rem",
    background: "#e7f1ff",
    color: "#084298",
    fontWeight: 600,
    borderRadius: "4px",
    textAlign: "right",
    minWidth: "9ch",
  },
  offCell: {
    padding: "0.45rem 0.8rem",
    color: "#495057",
    textAlign: "right",
    minWidth: "9ch",
  },
  tdMono: {
    padding: "0.35rem 0.7rem",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "#212529",
    borderBottom: "1px solid #f1f3f5",
  },
  massValue: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#212529",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
};
