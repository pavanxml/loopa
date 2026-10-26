import { NextRequest } from "next/server";
import { z } from "zod";
import { db,transaction } from "@/lib/db";
import { newId } from "@/lib/id";
import { ok,handleError,ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { blocked } from "@/lib/postAccess";
export async function GET(){
  try{const viewer=await requireUser();const items=db.prepare(`SELECT r.id,u.username,p.displayName,p.avatarUrl,r.createdAt FROM follow_requests r JOIN users u ON u.id=r.requesterId JOIN profiles p ON p.userId=u.id WHERE r.targetId=? AND u.status='active' ORDER BY r.createdAt DESC LIMIT 100`).all(viewer.sub);return ok({items});}catch(error){return handleError(error);}
}
export async function PATCH(request:NextRequest){
  try{const viewer=await requireUser();const body=z.object({id:z.string().uuid(),action:z.enum(["accept","decline"])}).parse(await request.json());
    return transaction(()=>{const row=db.prepare(`SELECT requesterId FROM follow_requests WHERE id=? AND targetId=?`).get(body.id,viewer.sub) as {requesterId:string}|undefined;
      if(!row)throw new ApiError("not_found","Request not found.",404);
      if(body.action==="accept"&&!blocked(viewer.sub,row.requesterId))db.prepare(`INSERT OR IGNORE INTO follows(id,followerId,followingId) VALUES(?,?,?)`).run(newId(),row.requesterId,viewer.sub);
      db.prepare(`DELETE FROM follow_requests WHERE id=?`).run(body.id);return ok({updated:true});});
  }catch(error){return handleError(error);}
}
