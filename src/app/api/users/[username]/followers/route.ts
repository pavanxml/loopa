import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { blocked } from "@/lib/postAccess";
import { ok,handleError,ApiError } from "@/lib/api";
export async function GET(request:NextRequest,{params}:{params:Promise<{username:string}>}){
  try{const{username}=await params;const viewer=await getCurrentUser();const target=db.prepare(`SELECT u.id,p.privacy FROM users u JOIN profiles p ON p.userId=u.id WHERE u.username=? AND u.status='active'`).get(username) as {id:string;privacy:string}|undefined;
    if(!target||(viewer&&blocked(viewer.sub,target.id)))throw new ApiError("not_found","User not found.",404);
    if(target.privacy!=="public"&&target.id!==viewer?.sub&&!db.prepare(`SELECT 1 FROM follows WHERE followerId=? AND followingId=?`).get(viewer?.sub??"",target.id))throw new ApiError("private_profile","This Orbit is private.",403);
    const following=new URL(request.url).searchParams.get("type")==="following";
    const items=db.prepare(`SELECT u.username,p.displayName,p.avatarUrl FROM follows f JOIN users u ON u.id=f.${following?"followingId":"followerId"} JOIN profiles p ON p.userId=u.id WHERE f.${following?"followerId":"followingId"}=? AND u.status='active' ORDER BY f.createdAt DESC LIMIT 100`).all(target.id) as {username:string}[];
    return ok({items});
  }catch(error){return handleError(error);}
}
