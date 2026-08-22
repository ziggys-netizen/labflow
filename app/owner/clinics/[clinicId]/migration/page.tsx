"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import AppNav from "../../../../lib/AppNav";
import ProtectedRoute from "../../../../lib/ProtectedRoute";
import { useAuth } from "../../../../lib/AuthContext";
import { db } from "../../../../lib/firebase";
import { ownerActingCreateFields } from "../../../../lib/clinicScope";
import { makeActorStamp } from "../../../../lib/identity";
import {
  buildRejectedRowsCsv,
  createAutoMapping,
  DuplicateChoice,
  ExistingInventoryBatchRef,
  ExistingInventoryItemRef,
  ExistingOrderRef,
  ExistingPatientRef,
  ExistingTestRef,
  getValidationSummary,
  isAllowedSpreadsheetFile,
  isReservedTenantHeader,
  isUnassignedLegacyClinicId,
  LEGACY_COLLECTIONS,
  LegacyRecordPreview,
  MappingTarget,
  MAPPING_PREVIEW_ROWS,
  MIGRATION_DATA_LABELS,
  MIGRATION_FIELDS,
  MigrationDataType,
  ParsedSpreadsheet,
  parseSpreadsheet,
  previewLegacyRecord,
  validateImportRows,
  validateMapping,
  ValidatedImportRow,
  ValidationContext,
  ValidationSummary,
} from "../../../../lib/migration";
import { parseSpecimenType } from "../../../../lib/testCatalog";
import { actorFromAuth, safeLogAudit } from "../../../../lib/audit";

const STEPS = [
  "Select Clinic",
  "Choose Data",
  "Upload",
  "Map Columns",
  "Validate",
  "Review",
  "Import",
  "Complete",
] as const;

const BATCH_SIZE = 400;
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";
const SUPPORT_EMAIL_CONFIGURED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPPORT_EMAIL);

interface Clinic {
  id: string;
  name: string;
  address: string;
  active: boolean;
}

interface MigrationHistoryEntry {
  id: string;
  clinicId: string;
  clinicName: string;
  dataType: string;
  fileName: string | null;
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  attentionCount: number;
  skippedCount: number;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  status: "completed" | "partial_failure" | "failed";
  createdAt: string;
  createdByEmail: string | null;
  collectionCounts?: Record<string, number>;
  claimedDocuments?: LegacyRecordPreview[];
}

interface WritePlan {
  collectionName: string;
  id: string;
  mode: "set" | "update";
  data: Record<string, unknown>;
  result: "imported" | "updated";
}

interface ImportResult {
  status: "completed" | "partial_failure" | "failed";
  imported: number;
  updated: number;
  failed: number;
  skipped: number;
  historySaved: boolean;
  message: string;
}

interface CategoryOption {
  id: string;
  dataType?: MigrationDataType;
  title: string;
  description: string;
  availability: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: "patients",
    dataType: "patients",
    title: "Patients",
    description:
      "Register clinic patients with explicit consent, actual identifiers, and duplicate review.",
    availability: "Supported",
  },
  {
    id: "testCatalog",
    dataType: "testCatalog",
    title: "Test catalogue",
    description:
      "Import complete test definitions, parameters, units, reference ranges, and optional prices.",
    availability: "Supported",
  },
  {
    id: "historicalOrders",
    dataType: "historicalOrders",
    title: "Historical orders & results",
    description:
      "Import only rows that resolve to existing clinic patients and test codes with complete audit fields.",
    availability: "Supported with strict validation",
  },
  {
    id: "inventory",
    dataType: "inventory",
    title: "Inventory / reagents",
    description:
      "Import stock items and lots. Lot number and expiry are required on batch rows. Receipt quantity writes a ledger movement; on-hand is never stored as a field.",
    availability: "Supported",
  },
  {
    id: "staff",
    title: "Staff pre-approvals",
    description:
      "Do not import live accounts. Add emails and roles on the clinic staff page; matching Google sign-ins are auto-approved on join.",
    availability: "Use Staff → pre-approvals (email + role). Spreadsheet paste is supported there.",
  },
];

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readParameters(value: unknown): ExistingTestRef["parameters"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const parameter = item as Record<string, unknown>;
    const name = readString(parameter.name);
    if (!name) return [];
    return [
      {
        name,
        unit: readString(parameter.unit),
        referenceRange: readString(parameter.referenceRange),
      },
    ];
  });
}

function readTestCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const code = readString((item as Record<string, unknown>).code);
    return code ? [code] : [];
  });
}

function safeDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "Unknown time" : date.toLocaleString();
}

function historyTypeLabel(value: string) {
  if (value === "assign_existing_records" || value === "claim_unassigned_legacy") {
    return "Claim unassigned legacy records";
  }
  if (value in MIGRATION_DATA_LABELS) {
    return MIGRATION_DATA_LABELS[value as MigrationDataType];
  }
  return value;
}

function itemNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function collectionLabel(collectionName: string) {
  if (collectionName === "patients") return "Patients";
  if (collectionName === "orders") return "Orders";
  if (collectionName === "testCatalog") return "Test catalogue";
  return collectionName;
}

function SummaryCards({ summary }: { summary: ValidationSummary }) {
  const items = [
    ["Total", summary.total],
    ["Ready", summary.ready],
    ["Duplicates", summary.duplicates],
    ["Attention", summary.attention],
    ["Skipped", summary.skipped],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

function StepTracker({ current }: { current: number }) {
  return (
    <div className="overflow-x-auto pb-2">
      <ol className="flex min-w-[760px] items-center">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  index <= current ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`whitespace-nowrap text-xs ${
                  index === current ? "font-medium text-gray-900" : "text-gray-500"
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={`mx-3 h-px flex-1 ${index < current ? "bg-gray-900" : "bg-gray-200"}`}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

async function commitPlans(
  plans: WritePlan[],
  onProgress: (completed: number) => void
): Promise<{ committed: number; error: string }> {
  let committed = 0;
  for (let index = 0; index < plans.length; index += BATCH_SIZE) {
    const chunk = plans.slice(index, index + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const plan of chunk) {
      const target = doc(db, plan.collectionName, plan.id);
      if (plan.mode === "update") batch.update(target, plan.data);
      else batch.set(target, plan.data);
    }
    try {
      await batch.commit();
      committed += chunk.length;
      onProgress(committed);
    } catch {
      return {
        committed,
        error: "A Firestore batch failed. Earlier completed batches were not rolled back.",
      };
    }
  }
  return { committed, error: "" };
}

function MigrationContent() {
  const params = useParams();
  const rawClinicId = params.clinicId;
  const selectedClinicId = Array.isArray(rawClinicId) ? rawClinicId[0] : rawClinicId;
  const { user, role, username, shift } = useAuth();
  const canAccess = role === "owner";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loadingClinic, setLoadingClinic] = useState(true);
  const [clinicError, setClinicError] = useState("");
  const [history, setHistory] = useState<MigrationHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [step, setStep] = useState(0);
  const [dataType, setDataType] = useState<MigrationDataType | null>(null);
  const [sheet, setSheet] = useState<ParsedSpreadsheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, MappingTarget>>({});
  const [fileInputKey, setFileInputKey] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const [mappingConfirmed, setMappingConfirmed] = useState(false);

  const [validationRows, setValidationRows] = useState<ValidatedImportRow[]>([]);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [showAllProblems, setShowAllProblems] = useState(false);

  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [assignConfirmed, setAssignConfirmed] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignStatus, setAssignStatus] = useState("");
  const [legacyRecords, setLegacyRecords] = useState<LegacyRecordPreview[]>([]);
  const [loadingLegacy, setLoadingLegacy] = useState(true);
  const [legacyError, setLegacyError] = useState("");

  const loadHistory = useCallback(async () => {
    if (!selectedClinicId || !canAccess) return;
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "migrationHistory"),
          where("clinicId", "==", selectedClinicId)
        )
      );
      const entries: MigrationHistoryEntry[] = snapshot.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          clinicId: readString(data.clinicId),
          clinicName: readString(data.clinicName),
          dataType: readString(data.dataType),
          fileName: typeof data.fileName === "string" ? data.fileName : null,
          totalRows: Number(data.totalRows) || 0,
          readyCount: Number(data.readyCount) || 0,
          duplicateCount: Number(data.duplicateCount) || 0,
          attentionCount: Number(data.attentionCount) || 0,
          skippedCount: Number(data.skippedCount) || 0,
          importedCount: Number(data.importedCount) || 0,
          updatedCount: Number(data.updatedCount) || 0,
          failedCount: Number(data.failedCount) || 0,
          status:
            data.status === "partial_failure" || data.status === "failed"
              ? data.status
              : "completed",
          createdAt: readString(data.createdAt),
          createdByEmail:
            typeof data.createdByEmail === "string" ? data.createdByEmail : null,
          collectionCounts:
            typeof data.collectionCounts === "object" && data.collectionCounts !== null
              ? (data.collectionCounts as Record<string, number>)
              : undefined,
          claimedDocuments: Array.isArray(data.claimedDocuments)
            ? (data.claimedDocuments as LegacyRecordPreview[])
            : undefined,
        };
      });
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setHistory(entries);
      setHistoryError("");
    } catch {
      setHistoryError("Migration history could not be loaded.");
    } finally {
      setLoadingHistory(false);
    }
  }, [canAccess, selectedClinicId]);

  const loadLegacyRecords = useCallback(async () => {
    if (!selectedClinicId || !canAccess) {
      setLoadingLegacy(false);
      return;
    }
    setLoadingLegacy(true);
    try {
      const snapshots = await Promise.all(
        LEGACY_COLLECTIONS.map((collectionName) => getDocs(collection(db, collectionName)))
      );
      const records: LegacyRecordPreview[] = [];
      snapshots.forEach((snapshot, index) => {
        const collectionName = LEGACY_COLLECTIONS[index];
        for (const entry of snapshot.docs) {
          const preview = previewLegacyRecord(
            collectionName,
            entry.id,
            entry.data() as Record<string, unknown>
          );
          if (preview) records.push(preview);
        }
      });
      records.sort((a, b) => {
        const byCollection = a.collectionName.localeCompare(b.collectionName);
        if (byCollection !== 0) return byCollection;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      setLegacyRecords(records);
      setLegacyError("");
    } catch {
      setLegacyRecords([]);
      setLegacyError("Unassigned legacy records could not be loaded. The claim control is hidden.");
    } finally {
      setLoadingLegacy(false);
    }
  }, [canAccess, selectedClinicId]);

  useEffect(() => {
    async function loadClinic() {
      if (!canAccess || !selectedClinicId) {
        setLoadingClinic(false);
        return;
      }
      setLoadingClinic(true);
      setClinicError("");
      try {
        const snapshot = await getDoc(doc(db, "clinics", selectedClinicId));
        if (!snapshot.exists()) {
          setClinic(null);
          setClinicError("Clinic not found. Choose a clinic from the owner console.");
          return;
        }
        const data = snapshot.data();
        setClinic({
          id: snapshot.id,
          name: readString(data.name) || "Unnamed clinic",
          address: readString(data.address),
          active: data.active !== false,
        });
      } catch {
        setClinicError("Clinic details could not be loaded.");
      } finally {
        setLoadingClinic(false);
      }
    }
    const timer = window.setTimeout(() => {
      loadClinic();
      loadHistory();
      loadLegacyRecords();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canAccess, loadHistory, loadLegacyRecords, selectedClinicId]);

  const summary = useMemo(() => getValidationSummary(validationRows), [validationRows]);
  const mappingErrors = useMemo(
    () => (dataType ? validateMapping(mapping, dataType) : []),
    [dataType, mapping]
  );

  function clearAfterDataChoice() {
    setSheet(null);
    setFileName("");
    setMapping({});
    setFileInputKey((value) => value + 1);
    setUploadError("");
    setMappingMessage("");
    setMappingConfirmed(false);
    setValidationRows([]);
    setValidationError("");
    setImportConfirmed(false);
    setImportResult(null);
    setProgress({ completed: 0, total: 0 });
  }

  function resetFlow() {
    setDataType(null);
    clearAfterDataChoice();
    setStep(1);
  }

  function selectDataType(nextType: MigrationDataType) {
    setDataType(nextType);
    clearAfterDataChoice();
  }

  async function handleFile(file: File | undefined, extraFiles = 0) {
    if (!file || !dataType) return;
    if (!isAllowedSpreadsheetFile(file.name)) {
      setSheet(null);
      setFileName("");
      setMapping({});
      setMappingConfirmed(false);
      setUploadError("Choose an .xlsx, .xlsm, or .csv file.");
      return;
    }
    setParsing(true);
    setUploadError(
      extraFiles > 0 ? "One file at a time. Only the first file was read." : ""
    );
    setValidationRows([]);
    setImportResult(null);
    setMappingConfirmed(false);
    try {
      const parsed = await parseSpreadsheet(file);
      setSheet(parsed);
      setFileName(file.name);
      setMapping(createAutoMapping(parsed.headers, dataType));
    } catch (error) {
      setSheet(null);
      setFileName("");
      setMapping({});
      setUploadError(error instanceof Error ? error.message : "The spreadsheet could not be read.");
    } finally {
      setParsing(false);
    }
  }

  function changeMapping(header: string, target: MappingTarget) {
    setMapping((previous) => {
      const next = { ...previous };
      if (target !== "ignore") {
        for (const [otherHeader, otherTarget] of Object.entries(next)) {
          if (otherHeader !== header && otherTarget === target) next[otherHeader] = "ignore";
        }
      }
      next[header] = target;
      return next;
    });
    setValidationRows([]);
    setValidationError("");
    setMappingMessage("");
    setMappingConfirmed(false);
  }

  async function loadValidationContext(nextDataType: MigrationDataType) {
    async function scopedDocs(collectionName: string) {
      return getDocs(
        query(collection(db, collectionName), where("clinicId", "==", selectedClinicId))
      );
    }

    const needsPatients = nextDataType === "patients" || nextDataType === "historicalOrders";
    const needsTests = nextDataType === "testCatalog" || nextDataType === "historicalOrders";
    const needsOrders = nextDataType === "historicalOrders";
    const needsInventory = nextDataType === "inventory";
    const [patientSnapshot, testSnapshot, orderSnapshot, itemSnapshot, batchSnapshot] =
      await Promise.all([
        needsPatients ? scopedDocs("patients") : Promise.resolve(null),
        needsTests ? scopedDocs("testCatalog") : Promise.resolve(null),
        needsOrders ? scopedDocs("orders") : Promise.resolve(null),
        needsInventory ? scopedDocs("inventoryItems") : Promise.resolve(null),
        needsInventory ? scopedDocs("inventoryBatches") : Promise.resolve(null),
      ]);

    const existingPatients: ExistingPatientRef[] =
      patientSnapshot?.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          labId: readString(data.labId),
          name: readString(data.name),
          dob: readString(data.dob),
          phone: readString(data.phone),
          nationalId: readString(data.nationalId),
        };
      }) || [];
    const existingTests: ExistingTestRef[] =
      testSnapshot?.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          code: readString(data.code) || entry.id,
          name: readString(data.name),
          parameters: readParameters(data.parameters),
          specimenType: parseSpecimenType(data.specimenType),
        };
      }) || [];
    const existingOrders: ExistingOrderRef[] =
      orderSnapshot?.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          patientId: readString(data.patientId),
          createdAt: readString(data.createdAt),
          testCodes: readTestCodes(data.tests),
        };
      }) || [];

    const existingInventoryItems: ExistingInventoryItemRef[] =
      itemSnapshot?.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          name: readString(data.name),
          catalogueCode: readString(data.catalogueCode),
        };
      }) || [];
    const existingInventoryBatches: ExistingInventoryBatchRef[] =
      batchSnapshot?.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          itemId: readString(data.itemId),
          lotNumber: readString(data.lotNumber),
        };
      }) || [];

    return {
      now: new Date().toISOString(),
      existingPatients,
      existingTests,
      existingOrders,
      existingInventoryItems,
      existingInventoryBatches,
    } satisfies ValidationContext;
  }

  async function runValidation() {
    if (!dataType || !sheet || !selectedClinicId) return;
    const errors = validateMapping(mapping, dataType);
    if (errors.length > 0) {
      setMappingMessage(errors.join(" "));
      return;
    }
    setStep(4);
    setValidating(true);
    setValidationRows([]);
    setValidationError("");
    setImportConfirmed(false);
    try {
      const context = await loadValidationContext(dataType);
      setValidationRows(validateImportRows(dataType, sheet.rows, mapping, context));
    } catch {
      setValidationError(
        "Validation could not load the selected clinic's existing records. No data was written."
      );
    } finally {
      setValidating(false);
    }
  }

  async function handleContinue() {
    if (step === 0) setStep(1);
    else if (step === 1 && dataType) setStep(2);
    else if (step === 2 && sheet) setStep(3);
    else if (step === 3) await runValidation();
    else if (step === 4 && !validating && validationRows.length > 0) setStep(5);
    else if (step === 5 && summary.ready > 0) setStep(6);
  }

  function handleBack() {
    if (validating || importing) return;
    if (step > 0 && step < 7) setStep((value) => value - 1);
  }

  function setDuplicateChoice(rowId: string, choice: DuplicateChoice) {
    setValidationRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, choice } : row))
    );
    setImportConfirmed(false);
  }

  function canContinue() {
    if (step === 0) return Boolean(clinic);
    if (step === 1) return Boolean(dataType);
    if (step === 2) return Boolean(sheet);
    if (step === 3) return mappingErrors.length === 0 && mappingConfirmed;
    if (step === 4) return !validating && validationRows.length > 0;
    if (step === 5) return summary.ready > 0;
    return false;
  }

  function buildWritePlans(): WritePlan[] {
    if (!selectedClinicId) return [];
    const plans: WritePlan[] = [];
    for (const row of validationRows) {
      if (!row.record || row.state === "attention" || row.choice === "skip") continue;

      if (row.record.type === "patients") {
        if (row.choice === "update" && row.duplicate?.existingId) {
          const provided = new Set(row.record.providedFields);
          const updateData: Record<string, unknown> = { clinicId: selectedClinicId };
          for (const [key, value] of Object.entries(row.record.data)) {
            if (key !== "labId" && provided.has(key)) updateData[key] = value;
          }
          plans.push({
            collectionName: "patients",
            id: row.duplicate.existingId,
            mode: "update",
            data: updateData,
            result: "updated",
          });
        } else {
          plans.push({
            collectionName: "patients",
            id: doc(collection(db, "patients")).id,
            mode: "set",
            data: { ...row.record.data, clinicId: selectedClinicId },
            result: "imported",
          });
        }
      }

      if (row.record.type === "testCatalog") {
        if (row.choice === "update" && row.duplicate?.existingId) {
          const updateData: Record<string, unknown> = {
            code: row.record.data.code,
            name: row.record.data.name,
            category: row.record.data.category,
            specimenType: row.record.data.specimenType,
            parameters: row.record.data.parameters,
            clinicId: selectedClinicId,
          };
          if (row.record.providedFields.includes("price")) {
            updateData.price = row.record.data.price;
          }
          plans.push({
            collectionName: "testCatalog",
            id: row.duplicate.existingId,
            mode: "update",
            data: updateData,
            result: "updated",
          });
        } else {
          plans.push({
            collectionName: "testCatalog",
            id: `${selectedClinicId}_${row.record.data.code}`,
            mode: "set",
            data: { ...row.record.data, clinicId: selectedClinicId },
            result: "imported",
          });
        }
      }

      if (row.record.type === "historicalOrders") {
        plans.push({
          collectionName: "orders",
          id: doc(collection(db, "orders")).id,
          mode: "set",
          data: { ...row.record.data, clinicId: selectedClinicId },
          result: "imported",
        });
      }
    }

    const inventoryItemIds = new Map<string, string>();
    const inventoryItemEmitted = new Set<string>();
    for (const row of validationRows) {
      if (row.record?.type !== "inventory" || row.state === "attention" || row.choice === "skip") {
        continue;
      }
      const key = itemNameKey(row.record.data.item.name);
      if (row.record.data.existingItemId) {
        inventoryItemIds.set(key, row.record.data.existingItemId);
      } else if (!inventoryItemIds.has(key)) {
        inventoryItemIds.set(key, doc(collection(db, "inventoryItems")).id);
      }
    }

    for (const row of validationRows) {
      if (row.record?.type !== "inventory" || row.state === "attention" || row.choice === "skip") {
        continue;
      }
      const inventory = row.record.data;
      const key = itemNameKey(inventory.item.name);
      const itemId = inventoryItemIds.get(key);
      if (!itemId) continue;
      const ownerFields = ownerActingCreateFields(role);
      const actor = user ? makeActorStamp(user, username) : null;

      if (!inventoryItemEmitted.has(itemId)) {
        inventoryItemEmitted.add(itemId);
        if (row.choice === "update" && inventory.existingItemId && !inventory.batch) {
          plans.push({
            collectionName: "inventoryItems",
            id: itemId,
            mode: "update",
            data: {
              ...inventory.item,
              clinicId: selectedClinicId,
              updatedAt: new Date().toISOString(),
            },
            result: "updated",
          });
        } else if (!inventory.existingItemId) {
          plans.push({
            collectionName: "inventoryItems",
            id: itemId,
            mode: "set",
            data: {
              ...inventory.item,
              clinicId: selectedClinicId,
              createdAt: new Date().toISOString(),
              createdBy: actor,
              updatedAt: new Date().toISOString(),
              ...ownerFields,
            },
            result: "imported",
          });
        }
      }

      if (row.choice === "update" && inventory.existingItemId && inventory.batch && row.duplicate?.existingId) {
        plans.push({
          collectionName: "inventoryBatches",
          id: row.duplicate.existingId,
          mode: "update",
          data: {
            lotNumber: inventory.batch.lotNumber,
            expiryDate: inventory.batch.expiryDate,
            manufactureDate: inventory.batch.manufactureDate,
            supplier: inventory.batch.supplier || inventory.item.supplier,
            location: inventory.batch.location,
            acceptance: inventory.batch.acceptance,
            clinicId: selectedClinicId,
          },
          result: "updated",
        });
        continue;
      }

      if (inventory.batch) {
        const batchId = doc(collection(db, "inventoryBatches")).id;
        plans.push({
          collectionName: "inventoryBatches",
          id: batchId,
          mode: "set",
          data: {
            clinicId: selectedClinicId,
            itemId,
            itemName: inventory.item.name,
            lotNumber: inventory.batch.lotNumber,
            expiryDate: inventory.batch.expiryDate,
            manufactureDate: inventory.batch.manufactureDate,
            supplier: inventory.batch.supplier || inventory.item.supplier,
            location: inventory.batch.location,
            acceptance: inventory.batch.acceptance,
            createdAt: new Date().toISOString(),
            createdBy: actor,
            ...ownerFields,
          },
          result: "imported",
        });
        if (inventory.quantity && inventory.quantity > 0) {
          plans.push({
            collectionName: "inventoryMovements",
            id: doc(collection(db, "inventoryMovements")).id,
            mode: "set",
            data: {
              clinicId: selectedClinicId,
              itemId,
              itemName: inventory.item.name,
              batchId,
              lotNumber: inventory.batch.lotNumber,
              expiryDate: inventory.batch.expiryDate,
              type: "receipt",
              direction: "in",
              quantity: inventory.quantity,
              packingUnit: inventory.item.packingUnit,
              unitsPerPack: inventory.item.unitsPerPack,
              baseUnit: inventory.item.baseUnit,
              occurredAt: inventory.occurredAt || new Date().toISOString(),
              recordedAt: new Date().toISOString(),
              actor,
              supplier: inventory.batch.supplier || inventory.item.supplier || null,
              deliveryNote: null,
              conditionOnArrival: null,
              department: null,
              issuedTo: null,
              purpose: null,
              destination: null,
              reason: null,
              note: "Spreadsheet import",
              ...ownerFields,
            },
            result: "imported",
          });
        }
      }
    }
    return plans;
  }

  async function saveHistoryReport(
    report: Omit<MigrationHistoryEntry, "id">,
    historyId?: string
  ): Promise<boolean> {
    try {
      const ref = historyId
        ? doc(db, "migrationHistory", historyId)
        : doc(collection(db, "migrationHistory"));
      await setDoc(ref, {
        ...report,
        createdByUid: user?.uid || null,
      });
      return true;
    } catch {
      return false;
    }
  }

  function downloadRejectedRows() {
    if (!sheet) return;
    const csv = buildRejectedRowsCsv(sheet, validationRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rejected-${fileName || "rows"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function startImport() {
    if (
      !user ||
      role !== "owner" ||
      !clinic ||
      !selectedClinicId ||
      !dataType ||
      !fileName ||
      !importConfirmed
    ) {
      return;
    }
    const unsignedPlans = buildWritePlans();
    if (unsignedPlans.length === 0) return;

    const historyId = doc(collection(db, "migrationHistory")).id;
    const startedAt = new Date().toISOString();
    const plans = unsignedPlans.map((plan) => ({
      ...plan,
      data: {
        ...plan.data,
        clinicId: selectedClinicId,
        importedAt: startedAt,
        importedBy: user.uid,
        importSource: fileName,
        migrationHistoryId: historyId,
      },
    }));

    setImporting(true);
    setProgress({ completed: 0, total: plans.length });
    let committed = 0;
    let failureMessage = "";

    try {
      const testCreates = plans.filter(
        (plan) => plan.collectionName === "testCatalog" && plan.mode === "set"
      );
      if (testCreates.length > 0) {
        const existingTargets = await Promise.all(
          testCreates.map((plan) => getDoc(doc(db, plan.collectionName, plan.id)))
        );
        if (existingTargets.some((snapshot) => snapshot.exists())) {
          throw new Error(
            "A target test catalogue document appeared after validation. Revalidate before importing."
          );
        }
      }
      const outcome = await commitPlans(plans, (completed) =>
        setProgress({ completed, total: plans.length })
      );
      committed = outcome.committed;
      failureMessage = outcome.error;
    } catch (error) {
      failureMessage =
        error instanceof Error ? error.message : "The import failed before writes completed.";
    }

    const completedPlans = plans.slice(0, committed);
    const imported = completedPlans.filter((plan) => plan.result === "imported").length;
    const updated = completedPlans.filter((plan) => plan.result === "updated").length;
    const failed = plans.length - committed;
    const status: ImportResult["status"] =
      failed === 0 ? "completed" : committed > 0 ? "partial_failure" : "failed";
    const report: Omit<MigrationHistoryEntry, "id"> = {
      clinicId: clinic.id,
      clinicName: clinic.name,
      dataType,
      fileName,
      totalRows: summary.total,
      readyCount: summary.ready,
      duplicateCount: summary.duplicates,
      attentionCount: summary.attention,
      skippedCount: summary.skipped,
      importedCount: imported,
      updatedCount: updated,
      failedCount: failed,
      status,
      createdAt: startedAt,
      createdByEmail: user.email,
    };
    const historySaved = await saveHistoryReport(report, historyId);

    const importActor = actorFromAuth(user, role, shift);
    if (importActor && committed > 0) {
      await safeLogAudit({
        clinicId: clinic.id,
        actor: importActor,
        action: "import.run",
        targetCollection: "migrationHistory",
        targetId: historyId,
        targetLabel: fileName || clinic.name,
        detail: {
          dataType,
          imported,
          updated,
          failed,
          status,
        },
      });
    }

    setImportResult({
      status,
      imported,
      updated,
      failed,
      skipped: summary.skipped,
      historySaved,
      message:
        status === "completed"
          ? "All selected rows were committed."
          : failureMessage || "The import did not complete.",
    });
    setValidationRows([]);
    setSheet(null);
    setMapping({});
    setImportConfirmed(false);
    setImporting(false);
    setStep(7);
    await loadHistory();
  }

  async function assignExistingRecords() {
    if (!user || role !== "owner" || !clinic || !assignConfirmed || !selectedClinicId) return;
    if (legacyRecords.length === 0) return;
    setAssigning(true);
    setAssignStatus("Re-checking the listed records so clinic-scoped documents are not moved...");
    const confirmed = new Set(
      legacyRecords.map((record) => `${record.collectionName}:${record.id}`)
    );
    const collectionCounts: Record<string, number> = {
      patients: 0,
      orders: 0,
      testCatalog: 0,
    };
    const plans: WritePlan[] = [];
    const claimedDocuments: LegacyRecordPreview[] = [];
    let failureMessage = "";

    try {
      const snapshots = await Promise.all(
        LEGACY_COLLECTIONS.map((collectionName) => getDocs(collection(db, collectionName)))
      );
      snapshots.forEach((snapshot, index) => {
        const collectionName = LEGACY_COLLECTIONS[index];
        for (const entry of snapshot.docs) {
          if (!confirmed.has(`${collectionName}:${entry.id}`)) continue;
          const data = entry.data() as Record<string, unknown>;
          if (!isUnassignedLegacyClinicId(data.clinicId)) continue;
          const preview = previewLegacyRecord(collectionName, entry.id, data);
          if (!preview) continue;
          collectionCounts[collectionName] += 1;
          claimedDocuments.push(preview);
          plans.push({
            collectionName,
            id: entry.id,
            mode: "update",
            data: { clinicId: selectedClinicId },
            result: "updated",
          });
        }
      });
    } catch {
      failureMessage = "Unassigned records could not be re-checked. No claim writes started.";
    }

    let committed = 0;
    if (!failureMessage) {
      if (plans.length === 0) {
        setAssignStatus(
          "None of the listed records are still unassigned. No documents were changed."
        );
        setAssignConfirmed(false);
        setAssigning(false);
        await loadLegacyRecords();
        return;
      }
      setAssignStatus(`Claiming ${plans.length} record${plans.length === 1 ? "" : "s"}...`);
      const outcome = await commitPlans(plans, (completed) =>
        setAssignStatus(`Claimed ${completed} of ${plans.length} records...`)
      );
      committed = outcome.committed;
      failureMessage = outcome.error;
    }

    const failed = plans.length - committed;
    const reportStatus: MigrationHistoryEntry["status"] =
      !failureMessage && failed === 0
        ? "completed"
        : committed > 0
          ? "partial_failure"
          : "failed";
    const historySaved = await saveHistoryReport({
      clinicId: clinic.id,
      clinicName: clinic.name,
      dataType: "claim_unassigned_legacy",
      fileName: null,
      totalRows: plans.length,
      readyCount: plans.length,
      duplicateCount: 0,
      attentionCount: 0,
      skippedCount: legacyRecords.length - plans.length,
      importedCount: 0,
      updatedCount: committed,
      failedCount: failed,
      status: reportStatus,
      createdAt: new Date().toISOString(),
      createdByEmail: user.email,
      collectionCounts,
      claimedDocuments: claimedDocuments.slice(0, committed),
    });

    const claimActor = actorFromAuth(user, role, shift);
    if (claimActor && committed > 0) {
      await safeLogAudit({
        clinicId: clinic.id,
        actor: claimActor,
        action: "legacyRecords.claim",
        targetCollection: "migrationHistory",
        targetId: clinic.id,
        targetLabel: clinic.name,
        detail: {
          claimed: committed,
          failed,
          collectionCounts,
        },
      });
    }

    if (reportStatus === "completed") {
      setAssignStatus(
        `Claim complete. Patients: ${collectionCounts.patients}, orders: ${collectionCounts.orders}, test catalogue: ${collectionCounts.testCatalog}. Document IDs were stored in migration history.${
          historySaved ? "" : " The history report could not be saved."
        }`
      );
    } else {
      setAssignStatus(
        `${failureMessage || "Claim failed."} ${committed} record${
          committed === 1 ? "" : "s"
        } committed; ${failed} not committed.${historySaved ? "" : " The history report could not be saved."}`
      );
    }
    setAssignConfirmed(false);
    setAssigning(false);
    await loadHistory();
    await loadLegacyRecords();
  }

  if (!canAccess) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-gray-900">Migration Center</h1>
          <p className="mb-4 text-gray-600">
            This release keeps data import owner-only because server-side Firestore authorization is
            not yet present.
          </p>
          <Link href="/patients" className="font-medium text-gray-900 underline">
            Go to Patients
          </Link>
        </div>
      </main>
    );
  }

  if (loadingClinic) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="flex min-h-[50vh] items-center justify-center text-gray-600">
          Loading clinic...
        </div>
      </main>
    );
  }

  if (!clinic) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-gray-900">Migration Center</h1>
          <p className="mb-4 text-red-600">{clinicError || "Clinic not found."}</p>
          <Link href="/owner" className="font-medium text-gray-900 underline">
            Back to Owner
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-gray-500">
              <Link href="/owner" className="underline">
                Owner
              </Link>{" "}
              / Clinic onboarding
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">Migration Center</h1>
            <p className="mt-1 text-gray-600">
              Import existing clinic data without uploading spreadsheet files to an external
              service.
            </p>
          </div>
          <button
            type="button"
            onClick={resetFlow}
            disabled={importing}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            + Add Data
          </button>
        </div>

        <section className="mb-6 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-gray-900">{clinic.name}</h2>
              <p className="text-sm text-gray-600">{clinic.address || "No address recorded"}</p>
              <p className="mt-1 font-mono text-xs text-gray-400">ID: {clinic.id}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                clinic.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {clinic.active ? "Active" : "Inactive"}
            </span>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 sm:p-6">
          <StepTracker current={step} />
          <div className="mt-6 border-t border-gray-100 pt-6">
            {step === 0 && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Confirm the clinic</h2>
                <p className="mb-4 text-sm text-gray-600">
                  Every imported document will be stamped with this clinic ID. Spreadsheet clinic,
                  tenant, facility, or organisation ID columns are always ignored and cannot
                  override it.
                </p>
                <div className="rounded-lg bg-gray-50 p-4 text-sm">
                  <p className="font-medium text-gray-900">{clinic.name}</p>
                  <p className="mt-1 font-mono text-gray-600">{clinic.id}</p>
                  <p className="mt-2 text-gray-600">
                    Status: {clinic.active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Choose data</h2>
                <p className="mb-4 text-sm text-gray-600">
                  Supported categories match collections and fields that currently exist in the
                  application.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CATEGORY_OPTIONS.map((option) => {
                    const selected = option.dataType === dataType;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!option.dataType}
                        onClick={() => option.dataType && selectDataType(option.dataType)}
                        className={`rounded-lg border p-4 text-left transition ${
                          selected
                            ? "border-gray-900 bg-gray-50"
                            : option.dataType
                              ? "border-gray-200 hover:border-gray-400"
                              : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-medium text-gray-900">{option.title}</h3>
                          <span className="text-xs text-gray-500">{option.availability}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && dataType && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">
                  Upload {MIGRATION_DATA_LABELS[dataType].toLowerCase()}
                </h2>
                <p className="mb-4 text-sm text-gray-600">
                  Accepts .xlsx, .xlsm, and .csv. One file at a time. Parsing happens in this
                  browser; the file is not sent to LabFlow, Firebase Storage, or another upload
                  service.
                </p>
                <label
                  className={`block cursor-pointer rounded-lg border border-dashed p-6 text-center ${
                    dragActive ? "border-gray-900 bg-gray-50" : "border-gray-300"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    const files = event.dataTransfer.files;
                    handleFile(files[0], Math.max(0, files.length - 1));
                  }}
                >
                  <span className="mb-3 block text-sm font-medium text-gray-900">+ Add data</span>
                  <span className="mb-3 block text-xs text-gray-500">
                    Choose a file or drop one here. Native file dialog, .xlsx .xlsm .csv.
                  </span>
                  <input
                    key={fileInputKey}
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,text/csv"
                    disabled={parsing}
                    onChange={(event) => {
                      const files = event.target.files;
                      handleFile(files?.[0], Math.max(0, (files?.length || 0) - 1));
                    }}
                    className="mx-auto block max-w-full text-sm text-gray-600"
                  />
                </label>
                {parsing && <p className="mt-3 text-sm text-gray-600">Reading spreadsheet...</p>}
                {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
                {sheet && (
                  <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                    Read {sheet.rows.length} data row{sheet.rows.length === 1 ? "" : "s"} from{" "}
                    {sheet.sheetName} in {fileName}.
                  </div>
                )}
              </div>
            )}

            {step === 3 && dataType && sheet && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Map columns</h2>
                <p className="mb-4 text-sm text-gray-600">
                  Confirm each source column against the first five data rows. Fields are pre-filled
                  by column-name matching only — not by AI. Nothing is written until you confirm
                  this mapping and complete Import.
                </p>
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {sheet.headers.map((header) => (
                          <th key={header} className="px-2 py-2 font-medium text-gray-700">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, MAPPING_PREVIEW_ROWS).map((row) => (
                        <tr key={row.rowNumber} className="border-b border-gray-100">
                          {sheet.headers.map((header) => (
                            <td key={header} className="max-w-[12rem] truncate px-2 py-2 text-gray-600">
                              {row.values[header] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-4 font-medium text-gray-700">Spreadsheet column</th>
                        <th className="py-2 pr-4 font-medium text-gray-700">Sample (local only)</th>
                        <th className="py-2 font-medium text-gray-700">System field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.headers.map((header) => {
                        const tenantHeader = isReservedTenantHeader(header);
                        const currentTarget = mapping[header] || "ignore";
                        const usedTargets = new Set(
                          Object.entries(mapping)
                            .filter(
                              ([otherHeader, target]) =>
                                otherHeader !== header && target !== "ignore"
                            )
                            .map(([, target]) => target)
                        );
                        return (
                          <tr key={header} className="border-b border-gray-100">
                            <td className="py-3 pr-4 font-medium text-gray-900">
                              {header}
                              {tenantHeader && (
                                <span className="ml-2 text-xs font-normal text-amber-700">
                                  Tenant column ignored
                                </span>
                              )}
                            </td>
                            <td className="max-w-xs truncate py-3 pr-4 text-gray-500">
                              {sheet.rows
                                .slice(0, MAPPING_PREVIEW_ROWS)
                                .map((row) => row.values[header])
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td className="py-3">
                              <select
                                value={tenantHeader ? "ignore" : currentTarget}
                                disabled={tenantHeader}
                                onChange={(event) =>
                                  changeMapping(header, event.target.value as MappingTarget)
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                              >
                                <option value="ignore">Ignore</option>
                                {MIGRATION_FIELDS[dataType].map((field) => (
                                  <option
                                    key={field.key}
                                    value={field.key}
                                    disabled={usedTargets.has(field.key)}
                                  >
                                    {field.label}
                                    {field.required ? " *" : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-lg bg-gray-50 p-4">
                  <h3 className="text-sm font-medium text-gray-900">Mapped field guidance</h3>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {MIGRATION_FIELDS[dataType]
                      .filter((field) => Object.values(mapping).includes(field.key))
                      .map((field) => (
                        <li key={field.key}>
                          <span className="font-medium">{field.label}:</span> {field.help}
                        </li>
                      ))}
                  </ul>
                </div>
                {mappingErrors.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-sm text-red-600">
                    {mappingErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
                {mappingMessage && <p className="mt-3 text-sm text-red-600">{mappingMessage}</p>}
                <label className="mt-5 flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mappingConfirmed}
                    onChange={(event) => setMappingConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I confirm these column mappings. No records will be written until the Import
                    step.
                  </span>
                </label>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Validate</h2>
                {validating && (
                  <p className="text-sm text-gray-600">
                    Comparing rows with this clinic&apos;s existing records...
                  </p>
                )}
                {validationError && <p className="text-sm text-red-600">{validationError}</p>}
                {!validating && validationRows.length > 0 && (
                  <>
                    <SummaryCards summary={summary} />
                    <p className="mt-3 text-xs text-gray-500">
                      Valid rows are green and will import. Invalid rows are red and will be skipped;
                      they do not abort the rest of the file. Duplicates default to Skip until you
                      opt in to update.
                    </p>
                    {summary.attention > 0 && (
                      <button
                        type="button"
                        onClick={downloadRejectedRows}
                        className="mt-3 text-sm font-medium text-gray-900 underline"
                      >
                        Download rejected rows
                      </button>
                    )}
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-medium text-gray-900">
                          Row preview ({validationRows.length})
                        </h3>
                        {validationRows.length > 50 && (
                          <button
                            type="button"
                            onClick={() => setShowAllProblems((value) => !value)}
                            className="text-sm text-gray-900 underline"
                          >
                            {showAllProblems ? "Show first 50" : "Show all"}
                          </button>
                        )}
                      </div>
                      <div className="max-h-[420px] space-y-2 overflow-y-auto">
                        {(showAllProblems ? validationRows : validationRows.slice(0, 50)).map(
                          (row) => {
                            const tone =
                              row.state === "attention"
                                ? "border-red-200 bg-red-50"
                                : row.state === "duplicate"
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-green-200 bg-green-50";
                            return (
                              <div key={row.id} className={`rounded-lg border p-3 ${tone}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    Spreadsheet row {row.rowNumber}
                                  </p>
                                  <span className="text-xs uppercase tracking-wide text-gray-600">
                                    {row.state === "attention"
                                      ? "invalid"
                                      : row.state === "duplicate"
                                        ? "duplicate"
                                        : "valid"}
                                  </span>
                                </div>
                                {row.state === "ready" && row.issues.length === 0 && (
                                  <p className="mt-1 text-sm text-green-800">Ready to import.</p>
                                )}
                                {[...row.issues, ...(row.duplicate?.reasons || [])].map((message) => (
                                  <p key={message} className="mt-1 text-sm text-red-700">
                                    {message}
                                  </p>
                                ))}
                                {row.warnings.map((message) => (
                                  <p key={message} className="mt-1 text-sm text-amber-800">
                                    {message}
                                  </p>
                                ))}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 5 && dataType && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Review</h2>
                <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                  <p>
                    <span className="font-medium">Clinic:</span> {clinic.name} ({clinic.id})
                  </p>
                  <p>
                    <span className="font-medium">Data:</span>{" "}
                    {MIGRATION_DATA_LABELS[dataType]}
                  </p>
                  <p>
                    <span className="font-medium">File:</span> {fileName}
                  </p>
                </div>
                <SummaryCards summary={summary} />
                {summary.attention > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    {summary.attention} row{summary.attention === 1 ? "" : "s"} with validation
                    errors will be skipped. The rest of the file still imports. Return to Map
                    Columns if the mapping is wrong.
                  </p>
                )}
                {summary.attention > 0 && (
                  <button
                    type="button"
                    onClick={downloadRejectedRows}
                    className="mt-3 text-sm font-medium text-gray-900 underline"
                  >
                    Download rejected rows
                  </button>
                )}
                <div className="mt-5 space-y-3">
                  <h3 className="font-medium text-gray-900">Duplicate choices</h3>
                  {validationRows.filter((row) => row.state === "duplicate").length === 0 && (
                    <p className="text-sm text-gray-600">No duplicates were detected.</p>
                  )}
                  {validationRows
                    .filter((row) => row.state === "duplicate")
                    .map((row) => (
                      <div key={row.id} className="rounded-lg border border-gray-200 p-4">
                        <p className="text-sm font-medium text-gray-900">
                          Spreadsheet row {row.rowNumber}
                        </p>
                        {row.duplicate?.reasons.map((reason) => (
                          <p key={reason} className="mt-1 text-sm text-gray-600">
                            {reason}
                          </p>
                        ))}
                        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Action
                        </label>
                        <select
                          value={row.choice}
                          onChange={(event) =>
                            setDuplicateChoice(row.id, event.target.value as DuplicateChoice)
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="skip">Skip (default)</option>
                          {row.duplicate?.canUpdate && (
                            <option value="update">Update existing</option>
                          )}
                          {row.duplicate?.canImportNew && (
                            <option value="new">Import as new</option>
                          )}
                        </select>
                        {!row.duplicate?.canUpdate && !row.duplicate?.canImportNew && (
                          <p className="mt-2 text-xs text-gray-500">
                            Skip is the only safe action for this duplicate.
                          </p>
                        )}
                        {row.warnings.map((warning) => (
                          <p key={warning} className="mt-2 text-xs text-amber-700">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {step === 6 && dataType && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Import</h2>
                <p className="mb-4 text-sm text-gray-600">
                  No writes occur until you confirm and start this import. Writes are committed in
                  atomic batches of at most {BATCH_SIZE}; an earlier successful batch cannot be
                  rolled back if a later batch fails.
                </p>
                <SummaryCards summary={summary} />
                <label className="mt-5 flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={importConfirmed}
                    disabled={importing}
                    onChange={(event) => setImportConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I confirm the selected clinic, row counts, duplicate actions, and that I am
                    authorized to import this data.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={startImport}
                  disabled={!importConfirmed || importing || summary.ready === 0}
                  className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {importing ? "Importing..." : `Import ${summary.ready} row${summary.ready === 1 ? "" : "s"}`}
                </button>
                {importing && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full bg-gray-900 transition-all"
                        style={{
                          width: `${
                            progress.total > 0
                              ? Math.round((progress.completed / progress.total) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      Committed {progress.completed} of {progress.total} writes
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 7 && importResult && (
              <div>
                <h2 className="mb-2 text-lg font-medium text-gray-900">Import complete</h2>
                <div
                  className={`rounded-lg p-4 ${
                    importResult.status === "completed"
                      ? "bg-green-50 text-green-800"
                      : importResult.status === "partial_failure"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  <p className="font-medium">
                    Status: {importResult.status.replace("_", " ")}
                  </p>
                  <p className="mt-1 text-sm">{importResult.message}</p>
                  <p className="mt-2 text-sm">
                    Imported {importResult.imported} · Updated {importResult.updated} · Failed{" "}
                    {importResult.failed} · Skipped {importResult.skipped}
                  </p>
                  {!importResult.historySaved && (
                    <p className="mt-2 text-sm">
                      The data result above is accurate, but the history report could not be saved.
                    </p>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    + Add Data
                  </button>
                  <Link
                    href="/owner"
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900"
                  >
                    Back to Owner
                  </Link>
                </div>
              </div>
            )}
          </div>

          {step < 6 && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              {step === 0 ? (
                <Link href="/owner" className="text-sm font-medium text-gray-700 underline">
                  Back to Owner
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={validating}
                  className="text-sm font-medium text-gray-700 underline disabled:opacity-50"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleContinue}
                disabled={!canContinue()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {step === 3 && validating
                  ? "Validating..."
                  : step === 5
                    ? "Continue to Import"
                    : "Continue"}
              </button>
            </div>
          )}

          {step === 6 && !importing && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={handleBack}
                className="text-sm font-medium text-gray-700 underline"
              >
                Back
              </button>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-900">Security limitation</h2>
          <p className="mt-2 text-sm text-amber-800">
            Migration is owner-only in this release. The repository has no Firestore security rules,
            so this role check and clinic scoping are enforced by the current browser architecture,
            not by the database. Do not import real patient data until server-side rules are written
            and deployed.
          </p>
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 p-4">
          <h2 className="font-medium text-gray-900">Support</h2>
          {SUPPORT_EMAIL_CONFIGURED ? (
            <>
              <p className="mt-2 text-sm text-gray-600">
                Ask for migration help without attaching patient spreadsheets or patient data.
                LabFlow never sends a file automatically.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
              >
                Contact support
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              Support contact is not configured. Set NEXT_PUBLIC_SUPPORT_EMAIL in the deployment
              environment to enable a contact link.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 p-4">
          <h2 className="font-medium text-gray-900">Migration history</h2>
          <p className="mt-1 text-sm text-gray-600">
            Reports contain aggregate counts and operator details only—never spreadsheet rows or
            patient content.
          </p>
          {loadingHistory && <p className="mt-3 text-sm text-gray-500">Loading history...</p>}
          {historyError && <p className="mt-3 text-sm text-red-600">{historyError}</p>}
          {!loadingHistory && !historyError && history.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No migration reports for this clinic yet.</p>
          )}
          <div className="mt-3 space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {historyTypeLabel(entry.dataType)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {entry.fileName || "No file (legacy claim)"} ·{" "}
                      {safeDateLabel(entry.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      By {entry.createdByEmail || "Unknown user"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      entry.status === "completed"
                        ? "bg-green-50 text-green-700"
                        : entry.status === "partial_failure"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    {entry.status.replace("_", " ")}
                  </span>
                </div>
                    <p className="mt-2 text-xs text-gray-600">
                      Total {entry.totalRows} · Imported {entry.importedCount} · Updated{" "}
                      {entry.updatedCount} · Skipped {entry.skippedCount} · Failed {entry.failedCount}
                      {entry.claimedDocuments && entry.claimedDocuments.length > 0
                        ? ` · ${entry.claimedDocuments.length} document ID${
                            entry.claimedDocuments.length === 1 ? "" : "s"
                          } stored`
                        : ""}
                    </p>
              </div>
            ))}
          </div>
        </section>

        {(loadingLegacy || legacyError || legacyRecords.length > 0 || assignStatus) && (
          <section className="mt-6 rounded-lg border border-gray-300 p-4">
            <h2 className="font-medium text-gray-900">Claim unassigned legacy records</h2>
            {loadingLegacy && (
              <p className="mt-2 text-sm text-gray-600">Checking for unassigned legacy records...</p>
            )}
            {legacyError && <p className="mt-2 text-sm text-red-600">{legacyError}</p>}
            {!loadingLegacy && !legacyError && legacyRecords.length > 0 && (
              <>
                <p className="mt-2 text-sm text-gray-600">
                  One-time repair of pre-multi-tenancy records, not a routine import.
                </p>
                <p className="mt-3 text-sm text-gray-600">
                  Only documents whose clinicId is missing or exactly{" "}
                  <span className="font-mono">&quot;default-clinic&quot;</span> can move to{" "}
                  <span className="font-medium">{clinic.name}</span>. Records that already have a
                  real clinicId are never touched.
                </p>
                <div className="mt-4 max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-3 font-medium text-gray-700">Collection</th>
                        <th className="py-2 pr-3 font-medium text-gray-700">Lab ID</th>
                        <th className="py-2 pr-3 font-medium text-gray-700">Name</th>
                        <th className="py-2 pr-3 font-medium text-gray-700">Created</th>
                        <th className="py-2 font-medium text-gray-700">Current clinicId</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legacyRecords.map((record) => (
                        <tr key={`${record.collectionName}:${record.id}`} className="border-b border-gray-100">
                          <td className="py-2 pr-3 text-gray-700">
                            {collectionLabel(record.collectionName)}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-900">
                            {record.labId || "—"}
                          </td>
                          <td className="py-2 pr-3 text-gray-900">{record.name || "—"}</td>
                          <td className="py-2 pr-3 text-gray-600">
                            {record.createdAt ? safeDateLabel(record.createdAt) : "Unknown date"}
                          </td>
                          <td className="py-2 font-mono text-xs text-gray-500">
                            {record.previousClinicId || "missing"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="mt-4 flex items-start gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={assignConfirmed}
                    disabled={assigning}
                    onChange={(event) => setAssignConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have reviewed the {legacyRecords.length} record
                    {legacyRecords.length === 1 ? "" : "s"} above and confirm claiming them for{" "}
                    {clinic.name}.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={assignExistingRecords}
                  disabled={!assignConfirmed || assigning}
                  className="mt-3 rounded-lg border border-gray-900 px-4 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
                >
                  {assigning ? "Claiming..." : "Claim unassigned legacy records"}
                </button>
              </>
            )}
            {assignStatus && <p className="mt-3 text-sm text-gray-600">{assignStatus}</p>}
          </section>
        )}
      </div>
    </main>
  );
}

export default function ClinicMigrationPage() {
  return (
    <ProtectedRoute require={(role) => role === "owner"}>
      <MigrationContent />
    </ProtectedRoute>
  );
}
