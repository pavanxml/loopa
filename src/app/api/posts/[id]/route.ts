import { NextRequest } from "next/server";
import { z } from "zod";
import { db, transaction } from "@/lib/db";
import { ok,handleError,ApiError } from "@/lib/api";
import { getCurrentUser,requireUser } from "@/lib/session";
import { visiblePost,toFeedPosts } from "@/lib/postAccess";
type Context={params:Promise<{id:string}>};
export async function GET(_request:NextRequest,{params}:Context){
  try{const viewer=await getCurrentUser();const {id}=await params;return ok(toFeedPosts([visiblePost(id,viewer?.sub??null)],viewer?.sub??null)[0]);}catch(error){return handleError(error);}
}
export async function PATCH(request:NextRequest,{params}:Context){
  try{const viewer=await requireUser();const{id}=await params;visiblePost(id,viewer.sub);
    const body=z.object({hidden:z.boolean()}).parse(await request.json());
    if(body.hidden)db.prepare(`INSERT OR IGNORE INTO hidden_posts(userId,postId) VALUES(?,?)`).run(viewer.sub,id);
    else db.prepare(`DELETE FROM hidden_posts WHERE userId=? AND postId=?`).run(viewer.sub,id);
    return ok({hidden:body.hidden});
  }catch(error){return handleError(error);}
}
export async function DELETE(_request:NextRequest,{params}:Context){
  try{const viewer=await requireUser();const{id}=await params;const post=visiblePost(id,viewer.sub);
    if(post.authorId!==viewer.sub)throw new ApiError("forbidden","You can only delete your own posts.",403);
    transaction(()=>{db.prepare(`UPDATE posts SET deletedAt=? WHERE id=?`).run(new Date().toISOString(),id);db.prepare(`DELETE FROM posts_fts WHERE postId=?`).run(id);});
    return ok({deleted:true});
  }catch(error){return handleError(error);}
}
