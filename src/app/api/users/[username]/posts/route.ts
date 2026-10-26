import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok,handleError,ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { postVisibility,toFeedPosts,type PostRow } from "@/lib/postAccess";
import { cursorPaginationSchema } from "@/lib/validation";
export async function GET(request:NextRequest,{params}:{params:Promise<{username:string}>}){
  try{const{username}=await params;const viewer=await getCurrentUser();
    const author=db.prepare(`SELECT id FROM users WHERE username=? AND status='active'`).get(username) as {id:string}|undefined;
    if(!author)throw new ApiError("not_found","User not found.",404);
    const query=cursorPaginationSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const access=postVisibility(viewer?.sub??null);
    const anchor=query.cursor?db.prepare(`SELECT id,createdAt FROM posts WHERE id=? AND authorId=?`).get(query.cursor,author.id) as {id:string;createdAt:string}|undefined:undefined;
    if(query.cursor&&!anchor)throw new ApiError("invalid_cursor","Invalid page cursor.",400);
    const rows=db.prepare(`SELECT p.* FROM posts p WHERE p.authorId=? AND ${access.sql} ${anchor?"AND (p.createdAt<? OR (p.createdAt=? AND p.id<?))":""} ORDER BY p.createdAt DESC,p.id DESC LIMIT ?`)
      .all(author.id,...access.params,...(anchor?[anchor.createdAt,anchor.createdAt,anchor.id]:[]),query.limit+1) as PostRow[];
    const hasMore=rows.length>query.limit,page=rows.slice(0,query.limit),feed=toFeedPosts(page,viewer?.sub??null);
    return ok({items:page.map((p,i)=>({...p,...feed[i]})),nextCursor:hasMore?page[page.length-1]!.id:null});
  }catch(error){return handleError(error);}
}
