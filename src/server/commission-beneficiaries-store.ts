import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { z } from "zod";
import type { CommissionBeneficiaryEntity } from "./domain";
import { HttpError } from "./http-error";

const FILE_REL = join("data", "commission-beneficiaries.json");

function filePath(): string {
  return join(process.cwd(), FILE_REL);
}

const rowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const fileSchema = z.array(rowSchema);

export interface CreateCommissionBeneficiaryInput {
  name: string;
  phone?: string;
  email: string;
}

export interface UpdateCommissionBeneficiaryInput {
  name?: string;
  phone?: string | null;
  email?: string;
}

async function readAll(): Promise<CommissionBeneficiaryEntity[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return fileSchema.parse(JSON.parse(raw));
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : "";
    if (code === "ENOENT") return [];
    throw e;
  }
}

async function writeAll(rows: CommissionBeneficiaryEntity[]): Promise<void> {
  const dir = dirname(filePath());
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await rename(tmp, filePath());
}

export async function listCommissionBeneficiaries(): Promise<
  CommissionBeneficiaryEntity[]
> {
  const rows = await readAll();
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function getCommissionBeneficiary(
  id: string,
): Promise<CommissionBeneficiaryEntity> {
  const rows = await readAll();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new HttpError(404, `Commission beneficiary ${id} not found`);
  return row;
}

export async function createCommissionBeneficiary(
  dto: CreateCommissionBeneficiaryInput,
): Promise<CommissionBeneficiaryEntity> {
  const name = dto.name?.trim() ?? "";
  const email = dto.email?.trim() ?? "";
  if (!name) throw new HttpError(400, "name is required");
  if (!email) throw new HttpError(400, "email is required");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) throw new HttpError(400, "email is invalid");
  const now = new Date().toISOString();
  const entity: CommissionBeneficiaryEntity = {
    id: randomUUID(),
    name,
    phone: dto.phone?.trim() || undefined,
    email,
    createdAt: now,
    updatedAt: now,
  };
  const rows = await readAll();
  rows.push(entity);
  await writeAll(rows);
  return entity;
}

export async function updateCommissionBeneficiary(
  id: string,
  dto: UpdateCommissionBeneficiaryInput,
): Promise<CommissionBeneficiaryEntity> {
  const rows = await readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new HttpError(404, `Commission beneficiary ${id} not found`);
  const prev = rows[idx]!;
  const name =
    dto.name !== undefined ? dto.name.trim() : prev.name;
  if (!name) throw new HttpError(400, "name is required");
  const email = dto.email !== undefined ? dto.email.trim() : prev.email;
  if (!email) throw new HttpError(400, "email is required");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) throw new HttpError(400, "email is invalid");
  let phone: string | undefined;
  if (dto.phone === null) phone = undefined;
  else if (dto.phone !== undefined) phone = dto.phone.trim() || undefined;
  else phone = prev.phone;
  const updated: CommissionBeneficiaryEntity = {
    ...prev,
    name,
    email,
    phone,
    updatedAt: new Date().toISOString(),
  };
  rows[idx] = updated;
  await writeAll(rows);
  return updated;
}

export async function deleteCommissionBeneficiary(id: string): Promise<void> {
  const rows = await readAll();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) {
    throw new HttpError(404, `Commission beneficiary ${id} not found`);
  }
  await writeAll(next);
}
