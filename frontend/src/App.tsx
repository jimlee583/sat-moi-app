import { useState } from "react";
import UnitToggle from "./components/UnitToggle";
import BaseSVPanel from "./components/BaseSVPanel";
import type { SVInertiaState } from "./components/BaseSVPanel";
import DeployablesTable, {
  emptyRow,
} from "./components/DeployablesTable";
import type { DeployableRowState } from "./components/DeployablesTable";
import ResultsCards from "./components/ResultsCards";
import SlewSection from "./components/SlewSection";
import { computeMoi } from "./api/moi";
import type {
  MoiComputeRequest,
  MoiComputeResponse,
  UnitSystem,
} from "./types/moi";
import {
  inertiaFromSI,
  inertiaToSI,
  lengthFromSI,
  lengthToSI,
  massFromSI,
  massToSI,
} from "./types/moi";

const DEFAULT_SV: SVInertiaState = {
  ixx: "1000",
  iyy: "1500",
  izz: "1800",
  ixy: "0",
  ixz: "0",
  iyz: "0",
};

function makeInitialRows(): DeployableRowState[] {
  return [];
}

export default function App() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("si");
  const [sv, setSv] = useState<SVInertiaState>(DEFAULT_SV);
  const [svMass, setSvMass] = useState<string>("");
  const [showSvProducts, setShowSvProducts] = useState<boolean>(false);
  const [rows, setRows] = useState<DeployableRowState[]>(makeInitialRows());

  const [result, setResult] = useState<MoiComputeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUnitSystem, setResultUnitSystem] = useState<UnitSystem>("si");

  function handleUnitChange(next: UnitSystem): void {
    if (next === unitSystem) return;
    setSv(convertSvBetween(sv, unitSystem, next));
    setSvMass(convertStr(svMass, (v) => massFromSI(massToSI(v, unitSystem), next)));
    setRows(rows.map((r) => convertRowBetween(r, unitSystem, next)));
    setUnitSystem(next);
  }

  async function handleCompute(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const req = buildRequest(unitSystem, sv, svMass, rows);
      const data = await computeMoi(req);
      setResult(data);
      setResultUnitSystem(unitSystem);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function handleReset(): void {
    setSv(DEFAULT_SV);
    setSvMass("");
    setShowSvProducts(false);
    setRows([]);
    setResult(null);
    setError(null);
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Satellite Moment of Inertia Aggregator</h1>
        <span style={styles.version}>
          v1.1 — MOI aggregation + 4-wheel pyramid RWA slew time
        </span>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <UnitToggle value={unitSystem} onChange={handleUnitChange} />
          <BaseSVPanel
            unitSystem={unitSystem}
            sv={sv}
            onSvChange={setSv}
            svMass={svMass}
            onSvMassChange={setSvMass}
            showProducts={showSvProducts}
            onShowProductsChange={setShowSvProducts}
          />
          <div style={styles.actionRow}>
            <button
              type="button"
              onClick={handleCompute}
              disabled={loading}
              style={loading ? styles.computeBtnDisabled : styles.computeBtn}
            >
              {loading ? "Computing\u2026" : "Compute total MOI"}
            </button>
            <button type="button" onClick={handleReset} style={styles.resetBtn}>
              Reset
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              setRows((r) => [
                ...r,
                emptyRow(
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `row-${Date.now()}`,
                ),
              ])
            }
            style={styles.quickAddBtn}
          >
            + Quick add deployable
          </button>
        </aside>

        <main style={styles.main}>
          {error && <div style={styles.error}>{error}</div>}

          <DeployablesTable
            unitSystem={unitSystem}
            rows={rows}
            onChange={setRows}
          />

          {result ? (
            <ResultsCards result={result} displaySystem={resultUnitSystem} />
          ) : (
            !error && (
              <div style={styles.placeholder}>
                Enter base SV inertia and any deployables, then click{" "}
                <strong>Compute total MOI</strong>.
              </div>
            )
          )}

          <SlewSection moiResult={result} />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNum(s: string, fallback = 0): number {
  if (s === "" || s == null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function convertStr(s: string, fn: (v: number) => number): string {
  if (s === "" || s == null) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return fn(n).toString();
}

function convertSvBetween(
  sv: SVInertiaState,
  from: UnitSystem,
  to: UnitSystem,
): SVInertiaState {
  const convI = (v: string) =>
    convertStr(v, (x) => inertiaFromSI(inertiaToSI(x, from), to));
  return {
    ixx: convI(sv.ixx),
    iyy: convI(sv.iyy),
    izz: convI(sv.izz),
    ixy: convI(sv.ixy),
    ixz: convI(sv.ixz),
    iyz: convI(sv.iyz),
  };
}

function convertRowBetween(
  row: DeployableRowState,
  from: UnitSystem,
  to: UnitSystem,
): DeployableRowState {
  const convI = (v: string) =>
    convertStr(v, (x) => inertiaFromSI(inertiaToSI(x, from), to));
  const convM = (v: string) =>
    convertStr(v, (x) => massFromSI(massToSI(x, from), to));
  const convL = (v: string) =>
    convertStr(v, (x) => lengthFromSI(lengthToSI(x, from), to));
  return {
    ...row,
    mass: convM(row.mass),
    ox: convL(row.ox),
    oy: convL(row.oy),
    oz: convL(row.oz),
    ixx: convI(row.ixx),
    iyy: convI(row.iyy),
    izz: convI(row.izz),
    ixy: convI(row.ixy),
    ixz: convI(row.ixz),
    iyz: convI(row.iyz),
  };
}

function buildRequest(
  system: UnitSystem,
  sv: SVInertiaState,
  svMass: string,
  rows: DeployableRowState[],
): MoiComputeRequest {
  const toI = (s: string) => inertiaToSI(parseNum(s), system);
  const toM = (s: string) => massToSI(parseNum(s), system);
  const toL = (s: string) => lengthToSI(parseNum(s), system);

  const svMassSi = svMass.trim() === "" ? null : toM(svMass);

  return {
    sv: {
      ixx: toI(sv.ixx),
      iyy: toI(sv.iyy),
      izz: toI(sv.izz),
      ixy: toI(sv.ixy),
      ixz: toI(sv.ixz),
      iyz: toI(sv.iyz),
    },
    sv_mass_kg: svMassSi,
    deployables: rows.map((r) => ({
      name: r.name.trim() ? r.name.trim() : undefined,
      mass_kg: toM(r.mass),
      offset_m: [toL(r.ox), toL(r.oy), toL(r.oz)],
      inertia: {
        ixx: toI(r.ixx),
        iyy: toI(r.iyy),
        izz: toI(r.izz),
        ixy: toI(r.ixy),
        ixz: toI(r.ixz),
        iyz: toI(r.iyz),
      },
      already_about_sv_ref: r.alreadyAboutSvRef,
    })),
  };
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: "100vh",
    background: "#e9ecef",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  header: {
    background: "#212529",
    color: "#fff",
    padding: "1rem 2rem",
    display: "flex",
    alignItems: "baseline",
    gap: "1rem",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "1.3rem",
    fontWeight: 700,
  },
  version: {
    fontSize: "0.8rem",
    color: "#adb5bd",
  },
  body: {
    display: "flex",
    gap: "1.5rem",
    padding: "1.5rem 2rem",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  sidebar: {
    flexShrink: 0,
    width: "330px",
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
  },
  main: {
    flex: 1,
    minWidth: "0",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  actionRow: {
    display: "flex",
    gap: "0.5rem",
  },
  computeBtn: {
    flex: 1,
    background: "#0d6efd",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 0.8rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  computeBtnDisabled: {
    flex: 1,
    background: "#6c757d",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 0.8rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "not-allowed",
  },
  resetBtn: {
    background: "transparent",
    color: "#495057",
    border: "1px solid #ced4da",
    borderRadius: "6px",
    padding: "0.55rem 0.9rem",
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  quickAddBtn: {
    background: "#fff",
    color: "#0d6efd",
    border: "1px dashed #0d6efd",
    borderRadius: "6px",
    padding: "0.45rem 0.8rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    padding: "0.75rem 1rem",
    background: "#f8d7da",
    color: "#842029",
    borderRadius: "6px",
    border: "1px solid #f5c2c7",
    fontSize: "0.9rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  placeholder: {
    padding: "2rem",
    textAlign: "center",
    color: "#6c757d",
    fontSize: "0.95rem",
    background: "#fff",
    borderRadius: "8px",
    border: "1px solid #dee2e6",
  },
};
