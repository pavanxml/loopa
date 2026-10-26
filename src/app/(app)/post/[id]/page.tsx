"use client";
import { useParams,useRouter } from "next/navigation";
import { useApi,AsyncBoundary } from "@/components/data";
import { PostCard } from "@/components/PostCard";
import { Icon } from "@/components/Icon";
import type { FeedPost } from "@/types/feed";
export default function PostPage(){const{id}=useParams<{id:string}>(),router=useRouter();const{data,error,loading,reload}=useApi<FeedPost>(`/api/posts/${id}`,[id]);return <main className="mx-auto max-w-[560px] px-4 py-6"><button onClick={()=>router.push("/home")} className="mb-4 flex items-center gap-2 text-sm"><Icon name="arrow" className="rotate-180" size={18}/>Back to feed</button><AsyncBoundary loading={loading} error={error} onRetry={reload}>{data&&<PostCard post={data} onHide={()=>router.push("/home")}/>}</AsyncBoundary></main>;}
