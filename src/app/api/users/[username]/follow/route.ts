import { NextRequest } from "next/server";
import { db,transaction } from "@/lib/db";
import { newId } from "@/lib/id";
import { ok,handleError,ApiError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { blocked } from "@/lib/postAccess";
import { notifyIfEnabled } from "@/lib/notifications";
export async function POST(_request:NextRequest,{params}:{params:Promise<{username:string}>}){
  try{
    const viewer=await requireUser();const{username}=await params;
    return transaction(()=>{
      const target=db.prepare(`SELECT u.id,p.privacy,p.followPolicy FROM users u JOIN profiles p ON p.userId=u.id WHERE u.username=? AND u.status='active'`).get(username) as {id:string;privacy:string;followPolicy:string}|undefined;
      if(!target||blocked(viewer.sub,target.id))throw new ApiError("not_found","User not found.",404);
      if(target.id===viewer.sub)throw new ApiError("invalid_action","You cannot follow yourself.",400);
      if(db.prepare(`DELETE FROM follows WHERE followerId=? AND followingId=?`).run(viewer.sub,target.id).changes)return ok({following:false,requested:false});
      if(db.prepare(`DELETE FROM follow_requests WHERE requesterId=? AND targetId=?`).run(viewer.sub,target.id).changes)return ok({following:false,requested:false});
      if(target.privacy!=="public"||target.followPolicy==="approval_required"){
        db.prepare(`INSERT INTO follow_requests(id,requesterId,targetId,createdAt) VALUES(?,?,?,?)`).run(newId(),viewer.sub,target.id,new Date().toISOString());
        notifyIfEnabled(target.id,viewer.sub,"follow_request","user",viewer.sub);
        return ok({following:false,requested:true});
      }
      db.prepare(`INSERT INTO follows(id,followerId,followingId) VALUES(?,?,?)`).run(newId(),viewer.sub,target.id);
      notifyIfEnabled(target.id,viewer.sub,"follow","user",viewer.sub);
      return ok({following:true,requested:false});
    });
  }catch(error){return handleError(error);}
}
