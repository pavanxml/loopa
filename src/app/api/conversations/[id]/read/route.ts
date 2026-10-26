import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireConversationAccess } from "@/lib/postAccess";
import { ok,handleError } from "@/lib/api";
import { realtime } from "@/services/realtime";
export async function PATCH(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{const viewer=await requireUser();const{id}=await params;requireConversationAccess(id,viewer.sub);db.prepare(`UPDATE conversation_members SET lastReadAt=datetime('now') WHERE conversationId=? AND userId=?`).run(id,viewer.sub);realtime.publish(id,{type:"read",conversationId:id,userId:viewer.sub});return ok({read:true});}catch(error){return handleError(error);}
}
