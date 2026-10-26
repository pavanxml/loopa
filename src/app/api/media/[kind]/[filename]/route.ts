import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { postVisibility,blocked } from "@/lib/postAccess";
import { fail,handleError } from "@/lib/api";
export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{kind:string;filename:string}>}){
  try{
    const {kind,filename}=await params;
    if(!/^(image|video)$/.test(kind)||!/^[a-f0-9-]+(?:_thumb)?\.[a-z0-9]+$/.test(filename))return fail("not_found","Media not found.",404);
    const url=`/api/media/${kind}/${filename}`,isThumb=filename.endsWith("_thumb.jpg");
    const key=`${kind}/${filename}`;
    const row=db.prepare(`SELECT * FROM uploads WHERE storageKey=? ${isThumb?"OR storageKey LIKE ?":""}`)
      .get(...(isThumb?[key,`${kind}/${filename.replace("_thumb.jpg","")}.%`]:[key])) as {url:string;userId:string;mimeType:string}|undefined;
    if(!row)return fail("not_found","Media not found.",404);
    const viewer=await getCurrentUser(),uid=viewer?.sub??"";
    let allowed=uid===row.userId;
    if(!allowed){
      const access=postVisibility(uid);
      allowed=!!db.prepare(`SELECT 1 FROM post_media m JOIN posts p ON p.id=m.postId WHERE (m.url=? OR m.thumbnailUrl=?) AND ${access.sql}`).get(url,url,...access.params);
      if(!allowed&&!blocked(uid,row.userId)){
        allowed=!!db.prepare(`SELECT 1 FROM profiles pr JOIN users u ON u.id=pr.userId WHERE pr.avatarUrl=? AND u.status='active'`).get(row.url);
        if(uid&&!allowed)allowed=!!db.prepare(`SELECT 1 FROM moments m JOIN users u ON u.id=m.authorId WHERE m.mediaUrl=? AND julianday(m.expiresAt)>julianday('now') AND u.status='active' AND EXISTS(SELECT 1 FROM follows WHERE followerId=? AND followingId=m.authorId)`).get(row.url,uid);
        if(uid&&!allowed)allowed=!!db.prepare(`SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversationId=m.conversationId WHERE m.mediaUrl=? AND m.deletedAt IS NULL AND cm.userId=?`).get(row.url,uid);
      }
    }
    if(!allowed)return fail("not_found","Media not found.",404);
    const root=path.resolve(process.env.UPLOAD_DIR??".data/uploads"),filePath=path.resolve(root,kind,filename);
    if(!filePath.startsWith(root+path.sep))return fail("not_found","Media not found.",404);
    const buffer=await fs.readFile(filePath).catch(()=>null);
    if(!buffer)return fail("not_found","Media not found.",404);
    const headers={"Content-Type":isThumb?"image/jpeg":row.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes"};
    const range=request.headers.get("range");
    if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${buffer.length}`}});
      const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),buffer.length-1):buffer.length-1;
      if(start>end||start>=buffer.length)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${buffer.length}`}});
      return new Response(new Uint8Array(buffer.subarray(start,end+1)),{status:206,headers:{...headers,"Content-Range":`bytes ${start}-${end}/${buffer.length}`,"Content-Length":String(end-start+1)}});
    }
    return new Response(new Uint8Array(buffer),{headers:{...headers,"Content-Length":String(buffer.length)}});
  }catch(error){return handleError(error);}
}
