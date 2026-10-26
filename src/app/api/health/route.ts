import { db } from "@/lib/db";
import { ok,fail } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(){try{db.prepare("SELECT 1").get();return ok({status:"ready"});}catch{return fail("unavailable","Service is unavailable.",503);}}
