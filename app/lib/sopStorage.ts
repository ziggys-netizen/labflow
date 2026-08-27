import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import {
  parseSopFile,
  sopFileClientError,
  sopStoragePath,
  type SopFileRef,
} from "./sopReference";

export async function uploadClinicSopFile(params: {
  clinicId: string;
  testCode: string;
  file: File;
  previousPath?: string | null;
}): Promise<SopFileRef> {
  const clientError = sopFileClientError(params.file);
  if (clientError) throw new Error(clientError);
  const storagePath = sopStoragePath(params.clinicId, params.testCode, params.file.name);
  const fileRef = ref(storage, storagePath);
  const contentType =
    params.file.type ||
    (params.file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await uploadBytes(fileRef, params.file, { contentType });
  if (params.previousPath && params.previousPath !== storagePath) {
    try {
      await deleteObject(ref(storage, params.previousPath));
    } catch (err) {
      console.error(err);
    }
  }
  return {
    storagePath,
    fileName: params.file.name,
    contentType,
    size: params.file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function openClinicSopFile(file: unknown): Promise<void> {
  const parsed = parseSopFile(file);
  if (!parsed) throw new Error("No SOP file is stored for this test.");
  const blob = await getBlob(ref(storage, parsed.storagePath));
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
